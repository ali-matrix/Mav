import { existsSync } from "node:fs";
import { MongoClient } from "mongodb";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const DATABASE_NAME = "mav_asset_ims_loadtest";
const ASSET_COUNT = 1_000_000;
const EMPLOYEE_COUNT = 368;
const ASSIGNABLE_EMPLOYEES = 340;
const ASSIGNMENT_COUNT = Math.floor(ASSET_COUNT / 3);
const BATCH_SIZE = 2_000;
const MONGODB_URI = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/?replicaSet=rs0";

const categorySeed = {
  Computers: ["Laptop", "Desktop", "Server"],
  Peripherals: ["Monitor", "Keyboard", "Mouse", "Printer", "Scanner"],
  Network: ["Switch", "Router", "Access Point", "Firewall"],
  Mobile: ["Phone", "Tablet"],
};
const departments = [
  "Engineering", "Finance", "IT", "Operations", "Human Resources", "Stores",
  "Design", "Quality", "Sales", "Logistics", "Security", "Administration",
];
const locations = [
  "Head Office", "Factory A", "Factory B", "Warehouse", "Design Studio",
  "IT Store", "Branch Office", "Maintenance Room",
];
const now = new Date();
const timestamp = now.toISOString().slice(0, 19).replace("T", " ");

function daysAgo(days) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function makeCategories() {
  const rows = [];
  let id = 0;
  for (const [parentName, childNames] of Object.entries(categorySeed)) {
    const parentId = ++id;
    rows.push({
      _id: parentId, name: parentName, nameKey: parentName.toLowerCase(),
      parentId: null, createdAt: timestamp,
    });
    for (const name of childNames) {
      rows.push({ _id: ++id, name, nameKey: name.toLowerCase(), parentId, createdAt: timestamp });
    }
  }
  return rows;
}

function makeEmployees() {
  return Array.from({ length: EMPLOYEE_COUNT }, (_, index) => {
    const id = index + 1;
    const name = `Test Employee ${String(id).padStart(3, "0")}`;
    const department = departments[index % departments.length];
    const designation = ["Analyst", "Specialist", "Coordinator", "Technician"][index % 4];
    const code = `TEST-${String(id).padStart(4, "0")}`;
    const status = id > ASSIGNABLE_EMPLOYEES ? "left" : "active";
    return {
      _id: id,
      erpId: 9_000_000 + id,
      code,
      name,
      nameKey: name.toLowerCase(),
      designation,
      designationKey: designation.toLowerCase(),
      positionTitle: designation,
      department,
      departmentKey: department.toLowerCase(),
      division: `Test Division ${(index % 4) + 1}`,
      email: `test.employee.${id}@example.invalid`,
      phone: `+9200000${String(id).padStart(6, "0")}`,
      intercomExt: String(10_000 + id),
      joiningDate: daysAgo(365 + (id % 2_000)),
      managerErpId: null,
      managerName: null,
      managerDesignation: null,
      managerActive: null,
      status,
      seenAt: timestamp,
      searchText: `${name} ${code} ${designation} ${department}`.toLowerCase(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
}

function assetIndexes(assets) {
  return Promise.all([
    assets.createIndex({ assetTag: 1 }, { unique: true }),
    assets.createIndex({ serialKey: 1 }, { unique: true, sparse: true }),
    assets.createIndex({ status: 1, _id: 1 }),
    assets.createIndex({ status: 1, _id: 1 }, {
      name: "status_ci_id", collation: { locale: "en", strength: 2 },
    }),
    assets.createIndex({ categoryId: 1, _id: 1 }),
    assets.createIndex({ locationId: 1, _id: 1 }),
    assets.createIndex({ assignedEmployeeId: 1, _id: 1 }),
    assets.createIndex({ warrantyExpiry: 1 }),
    assets.createIndex({ "assignments.employeeId": 1 }),
  ]);
}

function makeAsset(id, leaves, assignmentId) {
  const category = leaves[(id - 1) % leaves.length];
  const assigned = id % 3 === 0;
  const state = id % 100;
  const status = assigned ? "In Use"
    : state < 4 ? "Under Maintenance"
      : state < 6 ? "Insurance Claim"
        : state < 9 ? "Disposed"
          : "In Store";
  const employeeId = assigned ? ((id * 13) % ASSIGNABLE_EMPLOYEES) + 1 : null;
  const assignedAt = `${daysAgo(id % 1_800)} 09:00:00`;
  const warrantyExpiry = daysAgo((id % 2_400) - 600);
  const history = [{
    id,
    fromStatus: null,
    toStatus: "In Store",
    note: "Synthetic load-test asset added",
    changedAt: timestamp,
  }];
  const assignments = [];
  const maintenance = [];

  if (assigned) {
    history.push({
      id: ASSET_COUNT + assignmentId,
      fromStatus: "In Store",
      toStatus: "In Use",
      note: `Assigned to test employee ${employeeId}`,
      changedAt: assignedAt,
    });
    assignments.push({
      id: assignmentId,
      employeeId,
      assignedAt,
      returnedAt: null,
      note: "Synthetic load-test assignment",
    });
  } else if (status !== "In Store") {
    history.push({
      id: ASSET_COUNT + ASSIGNMENT_COUNT + id,
      fromStatus: "In Store",
      toStatus: status,
      note: "Synthetic load-test status",
      changedAt: timestamp,
    });
  }

  if (status === "Under Maintenance") {
    maintenance.push({
      id,
      startedAt: timestamp,
      endedAt: null,
      details: "Synthetic load-test maintenance record",
      cost: id % 50_000,
    });
  }

  const serialNumber = `TEST-SERIAL-${String(id).padStart(7, "0")}`;
  return {
    _id: id,
    assetTag: `${category.prefix}-${String(id).padStart(7, "0")}`,
    name: `${["Dell", "HP", "Lenovo", "Apple", "Cisco"][id % 5]} ${category.name} ${String(id).padStart(7, "0")}`,
    categoryId: category.id,
    brand: ["Dell", "HP", "Lenovo", "Apple", "Cisco"][id % 5],
    model: `Test Model ${id % 100}`,
    serialNumber,
    serialKey: serialNumber.toLowerCase(),
    locationId: ((id - 1) % locations.length) + 1,
    assignedEmployeeId: employeeId,
    purchaseCost: 10_000 + (id % 490_000),
    purchaseDate: daysAgo(30 + (id % 2_000)),
    warrantyStart: daysAgo(30 + (id % 2_000)),
    warrantyExpiry,
    status,
    remarks: "Synthetic asset generated for isolated load testing.",
    createdAt: timestamp,
    updatedAt: timestamp,
    statusHistory: history,
    assignments,
    maintenance,
  };
}

async function main() {
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  try {
    await client.connect();
    const database = client.db(DATABASE_NAME);
    const existing = await database.listCollections({}, { nameOnly: true }).toArray();
    if (existing.length > 0) {
      throw new Error(
        `Refusing to seed ${DATABASE_NAME}: it already has collections (${existing.map((item) => item.name).join(", ")}). No data was changed.`,
      );
    }

    console.log(`Seeding isolated database "${DATABASE_NAME}".`);
    const categories = database.collection("categories");
    const employeeCollection = database.collection("employees");
    const departmentCollection = database.collection("departments");
    const locationCollection = database.collection("locations");
    const assets = database.collection("assets");
    const counters = database.collection("counters");

    const categoryRows = makeCategories();
    const leaves = categoryRows
      .filter((category) => category.parentId !== null)
      .map((category) => ({
        id: category._id,
        name: category.name,
        prefix: (category.name.replace(/[^A-Za-z0-9]/g, "").toUpperCase() + "XXX").slice(0, 3),
      }));
    const employeeRows = makeEmployees();

    await Promise.all([
      categories.createIndex({ parentId: 1, nameKey: 1 }, { unique: true }),
      categories.createIndex({ parentId: 1 }),
      employeeCollection.createIndex({ erpId: 1 }, { unique: true }),
      employeeCollection.createIndex({ status: 1, nameKey: 1 }),
      employeeCollection.createIndex({ status: 1, name: 1, _id: 1 }),
      employeeCollection.createIndex({ departmentKey: 1, status: 1 }),
      employeeCollection.createIndex({ designationKey: 1, status: 1 }),
      employeeCollection.createIndex({ code: 1 }),
      employeeCollection.createIndex({ joiningDate: 1 }),
      departmentCollection.createIndex({ nameKey: 1 }, { unique: true }),
      locationCollection.createIndex({ nameKey: 1 }, { unique: true }),
      assetIndexes(assets),
    ]);

    await categories.insertMany(categoryRows);
    await employeeCollection.insertMany(employeeRows);
    await departmentCollection.insertMany(departments.map((name, index) => ({
      _id: index + 1, name, nameKey: name.toLowerCase(), isActive: true, createdAt: timestamp,
    })));
    await locationCollection.insertMany(locations.map((name, index) => ({
      _id: index + 1, name, nameKey: name.toLowerCase(), isActive: true, createdAt: timestamp,
    })));

    await counters.insertMany([
      { _id: "categories", value: categoryRows.length },
      { _id: "employees", value: EMPLOYEE_COUNT },
      { _id: "assets", value: ASSET_COUNT },
      { _id: "assignments", value: ASSIGNMENT_COUNT },
      { _id: "statusHistory", value: ASSET_COUNT + ASSIGNMENT_COUNT + ASSET_COUNT },
      { _id: "maintenance", value: ASSET_COUNT },
      { _id: "departments", value: departments.length },
      { _id: "locations", value: locations.length },
    ]);

    let assignmentId = 0;
    for (let start = 1; start <= ASSET_COUNT; start += BATCH_SIZE) {
      const end = Math.min(ASSET_COUNT, start + BATCH_SIZE - 1);
      const batch = [];
      for (let id = start; id <= end; id++) {
        if (id % 3 === 0) assignmentId++;
        batch.push(makeAsset(id, leaves, assignmentId));
      }
      await assets.insertMany(batch, { ordered: true });
      if (end % 100_000 === 0 || end === ASSET_COUNT) {
        console.log(`Inserted ${end.toLocaleString()} / ${ASSET_COUNT.toLocaleString()} assets.`);
      }
    }

    const [assetTotal, employeeTotal] = await Promise.all([
      assets.countDocuments(),
      employeeCollection.countDocuments(),
    ]);
    if (assetTotal !== ASSET_COUNT || employeeTotal !== EMPLOYEE_COUNT) {
      throw new Error(`Seed verification failed: found ${assetTotal} assets and ${employeeTotal} employees.`);
    }
    console.log(`Verified ${assetTotal.toLocaleString()} assets and ${employeeTotal} employees in "${DATABASE_NAME}".`);
    console.log("To run the app against this data, set MONGODB_DB=mav_asset_ims_loadtest before starting Next.js.");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("Load-test seeding failed:", error.message);
  process.exitCode = 1;
});
