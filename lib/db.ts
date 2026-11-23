import { MongoClient, type Db, type Document } from "mongodb";

export type CounterDoc = Document & { _id: string; value: number };
export type CategoryDoc = Document & {
  _id: number; name: string; nameKey: string; parentId: number | null; createdAt: string;
};
export type RefDoc = Document & {
  _id: number; name: string; nameKey: string; isActive: boolean; createdAt: string;
};
export type EmployeeDoc = Document & {
  _id: number; erpId: number; code: string; name: string; designation: string; positionTitle: string | null;
  department: string; division: string | null; email: string | null; phone: string | null; intercomExt: string | null;
  joiningDate: string | null; managerErpId: number | null; managerName: string | null;
  managerDesignation: string | null; managerActive: number | null; status: "active" | "left"; seenAt: string | null;
  searchText: string; createdAt: string; updatedAt: string;
};
export type StatusHistoryDoc = {
  id: number; fromStatus: string | null; toStatus: string; note: string; changedAt: string;
};
export type AssignmentDoc = {
  id: number; employeeId: number; assignedAt: string; returnedAt: string | null; note: string;
};
export type MaintenanceDoc = {
  id: number; startedAt: string; endedAt: string | null; details: string; cost: number | null;
};
export type AssetDoc = Document & {
  _id: number; assetTag: string; name: string; categoryId: number; brand: string; model: string; serialNumber: string;
  serialKey?: string; locationId: number | null; assignedEmployeeId: number | null; purchaseCost: number | null;
  purchaseDate: string | null; warrantyStart: string | null; warrantyExpiry: string | null; status: string;
  remarks: string; createdAt: string; updatedAt: string; statusHistory: StatusHistoryDoc[];
  assignments: AssignmentDoc[]; maintenance: MaintenanceDoc[];
};
export type SyncRunDoc = Document & {
  _id: number; source: string; startedAt: string; finishedAt: string; status: "success" | "error";
  added: number; updated: number; markedLeft: number; error: string | null;
};

const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
const databaseName = process.env.MONGODB_DB ?? "mav_asset_ims";
const globals = globalThis as typeof globalThis & { __assetMongoDb?: Promise<Db> };

const SEED: Record<string, string[]> = {
  Computers: ["Laptop", "Desktop", "Server"],
  Peripherals: ["Monitor", "Keyboard", "Mouse", "Printer", "Scanner"],
  Network: ["Switch", "Router", "Access Point", "Firewall"],
  Mobile: ["Phone", "Tablet"],
};

async function initialize(database: Db) {
  const categories = database.collection<CategoryDoc>("categories");
  const employees = database.collection<EmployeeDoc>("employees");
  const assets = database.collection<AssetDoc>("assets");
  const departments = database.collection<RefDoc>("departments");
  const locations = database.collection<RefDoc>("locations");
  const syncRuns = database.collection<SyncRunDoc>("syncRuns");

  await Promise.all([
    categories.createIndex({ parentId: 1, nameKey: 1 }, { unique: true }),
    categories.createIndex({ parentId: 1 }),
    departments.createIndex({ nameKey: 1 }, { unique: true }),
    locations.createIndex({ nameKey: 1 }, { unique: true }),
    employees.createIndex({ erpId: 1 }, { unique: true }),
    employees.createIndex({ status: 1, nameKey: 1 }),
    employees.createIndex({ status: 1, name: 1, _id: 1 }),
    employees.createIndex({ departmentKey: 1, status: 1 }),
    employees.createIndex({ designationKey: 1, status: 1 }),
    employees.createIndex({ code: 1 }),
    employees.createIndex({ joiningDate: 1 }),
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
    syncRuns.createIndex({ source: 1, _id: -1 }),
  ]);

  if (await categories.estimatedDocumentCount() === 0) {
    const records: CategoryDoc[] = [];
    let id = 0;
    for (const [parentName, children] of Object.entries(SEED)) {
      const parentId = ++id;
      records.push({
        _id: parentId, name: parentName, nameKey: parentName.toLowerCase(), parentId: null, createdAt: new Date().toISOString(),
      });
      for (const name of children) {
        records.push({ _id: ++id, name, nameKey: name.toLowerCase(), parentId, createdAt: new Date().toISOString() });
      }
    }
    await categories.insertMany(records);
    await database.collection<CounterDoc>("counters").updateOne(
      { _id: "categories" }, { $max: { value: id } }, { upsert: true },
    );
  }
}

async function connect() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const database = client.db(databaseName);
    await database.command({ ping: 1 });
    await initialize(database);
    return database;
  } catch (error) {
    await client.close();
    throw error;
  }
}

export function db(): Promise<Db> {
  if (!globals.__assetMongoDb) {
    const connection = connect();
    globals.__assetMongoDb = connection;
    void connection.catch(() => {
      if (globals.__assetMongoDb === connection) delete globals.__assetMongoDb;
    });
  }
  return globals.__assetMongoDb;
}

export async function nextId(database: Db, sequence: string): Promise<number> {
  const counter = await database.collection<CounterDoc>("counters").findOneAndUpdate(
    { _id: sequence },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  if (!counter) throw new Error(`Could not allocate an id for ${sequence}.`);
  return counter.value;
}

export const nameKey = (name: string) => name.trim().toLowerCase();
export const dbTimestamp = () => new Date().toISOString().slice(0, 19).replace("T", " ");
