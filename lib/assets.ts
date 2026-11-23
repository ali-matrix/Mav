import { db, dbTimestamp, nextId, type AssetDoc, type AssignmentDoc, type CategoryDoc, type EmployeeDoc, type MaintenanceDoc, type StatusHistoryDoc } from "@/lib/db";
import { ASSIGNABLE, LOCKED_STATUSES, STATUSES, manualStatuses, type Status } from "@/lib/assetStatus";
import type { Document } from "mongodb";

type Fail = { error: string; status: number };
const bad = (error: string, status = 400): Fail => ({ error, status });
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function date(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const parsed = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== v ? undefined : v;
}

type AssetInput = {
  name: string; categoryId: number; brand: string; model: string; serial: string;
  cost: number | null; purchaseDate: string | null; warrantyStart: string | null; warrantyExpiry: string | null;
  status: Status; description: string;
};

async function parseAsset(body: unknown, current?: { status: Status; held: boolean }): Promise<{ value: AssetInput } | Fail> {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = text(b.name, 120);
  if (!name) return bad("Please enter the asset's name.");

  const categoryId = Number(b.categoryId);
  const database = await db();
  const cat = Number.isInteger(categoryId)
    ? await database.collection<CategoryDoc>("categories").findOne({ _id: categoryId })
    : null;
  if (!cat) return bad("Please choose a category.");
  if (await database.collection<CategoryDoc>("categories").countDocuments({ parentId: categoryId })) {
    return bad("Please choose a specific kind (for example Laptop), not a main kind.");
  }

  let cost: number | null = null;
  if (b.cost !== null && b.cost !== undefined && b.cost !== "") {
    cost = Number(b.cost);
    if (!Number.isFinite(cost) || cost < 0 || cost > 1e10) return bad("The purchase cost must be a number, zero or more.");
  }

  const purchaseDate = date(b.purchaseDate);
  const warrantyStart = date(b.warrantyStart);
  const warrantyExpiry = date(b.warrantyExpiry);
  if (purchaseDate === undefined || warrantyStart === undefined || warrantyExpiry === undefined) {
    return bad("Please pick the dates from the date picker.");
  }
  if (warrantyStart && warrantyExpiry && warrantyExpiry < warrantyStart) return bad("The warranty can't end before it starts.");

  const status = (b.status ?? current?.status ?? "In Store") as Status;
  if (!STATUSES.includes(status)) return bad("Please choose a valid status.");
  if (current && LOCKED_STATUSES.includes(current.status)) {
    if (status !== current.status) return bad(`This asset is "${current.status}", so its status can't be changed here.`);
  } else if (status !== current?.status && !manualStatuses(current?.held ?? false).includes(status)) {
    return bad(
      LOCKED_STATUSES.includes(status)
        ? `"${status}" is set from its own page (Insurance or Disposal), not here.`
        : status === "In Use"
          ? "An asset becomes In Use when you assign it to an employee."
          : "Someone holds this asset. Take it back first to put it in store.",
    );
  }

  return {
    value: {
      name, categoryId, cost, purchaseDate, warrantyStart, warrantyExpiry, status,
      brand: text(b.brand, 80), model: text(b.model, 80), serial: text(b.serial, 80), description: text(b.description, 2000),
    },
  };
}

const serialKey = (serial: string) => serial.trim().toLowerCase();
async function serialTaken(serial: string, exceptId: number) {
  if (!serial) return false;
  const database = await db();
  return !!(await database.collection<AssetDoc>("assets").findOne({ serialKey: serialKey(serial), _id: { $ne: exceptId } }, { projection: { _id: 1 } }));
}

const prefixFor = (categoryName: string) => (categoryName.replace(/[^A-Za-z0-9]/g, "").toUpperCase() + "XXX").slice(0, 3);

async function nextTag(prefix: string): Promise<string> {
  const database = await db();
  const assets = database.collection<AssetDoc>("assets");
  for (;;) {
    const n = await nextId(database, `tag:${prefix}`);
    const tag = `${prefix}-${String(n).padStart(4, "0")}`;
    if (!await assets.findOne({ assetTag: tag }, { projection: { _id: 1 } })) return tag;
  }
}

export async function createAsset(body: unknown): Promise<{ id: number; tag: string } | Fail> {
  const p = await parseAsset(body);
  if ("error" in p) return p;
  const v = p.value;
  if (v.serial && await serialTaken(v.serial, 0)) return bad("An asset with this serial number is already registered.", 409);

  const database = await db();
  const categories = database.collection<CategoryDoc>("categories");
  const category = await categories.findOne({ _id: v.categoryId }, { projection: { name: 1 } });
  if (!category) return bad("Please choose a category.");
  const id = await nextId(database, "assets");
  const now = dbTimestamp();
  const history: StatusHistoryDoc = {
    id: await nextId(database, "statusHistory"), fromStatus: null, toStatus: v.status, note: "Added", changedAt: now,
  };
  const asset: AssetDoc = {
    _id: id, assetTag: await nextTag(prefixFor(category.name)), name: v.name, categoryId: v.categoryId,
    brand: v.brand, model: v.model, serialNumber: v.serial, ...(v.serial ? { serialKey: serialKey(v.serial) } : {}),
    locationId: null, assignedEmployeeId: null, purchaseCost: v.cost, purchaseDate: v.purchaseDate,
    warrantyStart: v.warrantyStart, warrantyExpiry: v.warrantyExpiry, status: v.status, remarks: v.description,
    createdAt: now, updatedAt: now, statusHistory: [history], assignments: [], maintenance: [],
  };
  await database.collection<AssetDoc>("assets").insertOne(asset);
  return { id, tag: asset.assetTag };
}

export async function updateAsset(id: number, body: unknown): Promise<{ ok: true } | Fail> {
  const database = await db();
  const assets = database.collection<AssetDoc>("assets");
  const currentAsset = await assets.findOne({ _id: id });
  if (!currentAsset) return bad("That asset no longer exists.", 404);
  const p = await parseAsset(body, { status: currentAsset.status as Status, held: currentAsset.assignedEmployeeId !== null });
  if ("error" in p) return p;
  const v = p.value;
  if (v.serial && await serialTaken(v.serial, id)) return bad("An asset with this serial number is already registered.", 409);
  const statusHistory = [...currentAsset.statusHistory];
  if (v.status !== currentAsset.status) {
    statusHistory.push({
      id: await nextId(database, "statusHistory"), fromStatus: currentAsset.status, toStatus: v.status,
      note: "Changed on the asset form", changedAt: dbTimestamp(),
    });
  }
  const fields: Document = {
    name: v.name, categoryId: v.categoryId, brand: v.brand, model: v.model, serialNumber: v.serial,
    purchaseCost: v.cost, purchaseDate: v.purchaseDate, warrantyStart: v.warrantyStart, warrantyExpiry: v.warrantyExpiry,
    status: v.status, remarks: v.description, updatedAt: dbTimestamp(), statusHistory,
  };
  const update: Document = { $set: fields };
  if (v.serial) fields.serialKey = serialKey(v.serial);
  else update.$unset = { serialKey: "" };
  await assets.updateOne({ _id: id }, update);
  return { ok: true };
}

function removable(asset: AssetDoc): boolean {
  return !LOCKED_STATUSES.includes(asset.status as Status)
    && asset.assignedEmployeeId === null
    && asset.status !== "Under Maintenance"
    && asset.statusHistory.length <= 1
    && asset.assignments.length === 0;
}

export async function removeAsset(id: number): Promise<{ ok: true } | Fail> {
  const database = await db();
  const assets = database.collection<AssetDoc>("assets");
  const asset = await assets.findOne({ _id: id });
  if (!asset) return bad("That asset no longer exists.", 404);
  if (!removable(asset)) return bad("This asset has history, so it can't be removed. Record it as disposed instead.", 409);
  await assets.deleteOne({ _id: id });
  return { ok: true };
}

export async function assignAsset(id: number, body: unknown): Promise<{ ok: true } | Fail> {
  const b = (body ?? {}) as { employeeId?: unknown; note?: unknown };
  const employeeId = Number(b.employeeId);
  if (!Number.isInteger(employeeId)) return bad("Please choose an employee.");
  const note = text(b.note, 200);
  const database = await db();
  const assets = database.collection<AssetDoc>("assets");
  const asset = await assets.findOne({ _id: id });
  if (!asset) return bad("That asset no longer exists.", 404);
  if (!ASSIGNABLE.includes(asset.status as Status)) {
    return bad(
      asset.status === "Under Maintenance"
        ? "This asset is under maintenance. Finish that first, then assign it."
        : `An asset that is "${asset.status}" can't be assigned.`,
      409,
    );
  }
  const employee = await database.collection<EmployeeDoc>("employees").findOne({ _id: employeeId });
  if (!employee) return bad("That employee no longer exists.", 404);
  if (employee.status !== "active") return bad(`${employee.name} has left the company, so no asset can be assigned to them.`, 409);
  if (asset.assignedEmployeeId === employeeId) return bad(`This asset is already with ${employee.name}.`, 409);

  const now = dbTimestamp();
  const assignments = asset.assignments.map((entry) => entry.returnedAt === null ? { ...entry, returnedAt: now } : entry);
  const assignment: AssignmentDoc = {
    id: await nextId(database, "assignments"), employeeId, assignedAt: now, returnedAt: null, note,
  };
  assignments.push(assignment);
  const statusHistory = [...asset.statusHistory];
  if (asset.status !== "In Use") {
    statusHistory.push({
      id: await nextId(database, "statusHistory"), fromStatus: asset.status, toStatus: "In Use",
      note: `Assigned to ${employee.name} (${employee.code})`, changedAt: now,
    });
  }
  const result = await assets.updateOne(
    { _id: id, status: asset.status, assignedEmployeeId: asset.assignedEmployeeId },
    { $set: { assignments, statusHistory, assignedEmployeeId: employeeId, status: "In Use", updatedAt: now } },
  );
  if (!result.modifiedCount) return bad("This asset changed while you were assigning it. Please try again.", 409);
  return { ok: true };
}

export async function returnAsset(id: number): Promise<{ ok: true } | Fail> {
  const database = await db();
  const assets = database.collection<AssetDoc>("assets");
  const asset = await assets.findOne({ _id: id });
  if (!asset) return bad("That asset no longer exists.", 404);
  if (asset.assignedEmployeeId === null) return bad("Nobody holds this asset right now.", 409);
  const employee = await database.collection<EmployeeDoc>("employees").findOne(
    { _id: asset.assignedEmployeeId }, { projection: { name: 1, code: 1 } },
  );
  const next: Status = asset.status === "In Use" ? "In Store" : asset.status as Status;
  const now = dbTimestamp();
  const assignments = asset.assignments.map((entry) => entry.returnedAt === null ? { ...entry, returnedAt: now } : entry);
  const statusHistory = [...asset.statusHistory];
  if (next !== asset.status) {
    statusHistory.push({
      id: await nextId(database, "statusHistory"), fromStatus: asset.status, toStatus: next,
      note: `Returned by ${employee?.name ?? ""} (${employee?.code ?? ""})`, changedAt: now,
    });
  }
  const result = await assets.updateOne(
    { _id: id, status: asset.status, assignedEmployeeId: asset.assignedEmployeeId },
    { $set: { assignments, statusHistory, assignedEmployeeId: null, status: next, updatedAt: now } },
  );
  if (!result.modifiedCount) return bad("This asset changed while you were returning it. Please try again.", 409);
  return { ok: true };
}

export async function startMaintenance(id: number, body: unknown): Promise<{ ok: true } | Fail> {
  const database = await db();
  const assets = database.collection<AssetDoc>("assets");
  const asset = await assets.findOne({ _id: id });
  if (!asset) return bad("That asset no longer exists.", 404);
  if (asset.status === "Under Maintenance") return bad("This asset is already under maintenance.", 409);
  if (LOCKED_STATUSES.includes(asset.status as Status)) return bad(`An asset that is "${asset.status}" can't be sent to maintenance.`, 409);

  const b = (body ?? {}) as Record<string, unknown>;
  const details = text(b.details, 2000);
  let cost: number | null = null;
  if (b.cost !== null && b.cost !== undefined && b.cost !== "") {
    cost = Number(b.cost);
    if (!Number.isFinite(cost) || cost < 0 || cost > 1e10) return bad("Maintenance cost must be a number, zero or more.");
  }

  const now = dbTimestamp();
  const maintenance: MaintenanceDoc = {
    id: await nextId(database, "maintenance"), startedAt: now, endedAt: null, details, cost,
  };
  const statusHistory = [...asset.statusHistory, {
    id: await nextId(database, "statusHistory"), fromStatus: asset.status, toStatus: "Under Maintenance",
    note: details ? `Maintenance started · ${details}` : "Maintenance started", changedAt: now,
  }];
  const maintenanceHistory = [...asset.maintenance, maintenance];
  const result = await assets.updateOne(
    { _id: id, status: asset.status },
    { $set: { status: "Under Maintenance", updatedAt: now, statusHistory, maintenance: maintenanceHistory } },
  );
  if (!result.modifiedCount) return bad("This asset changed while maintenance was starting. Please try again.", 409);
  return { ok: true };
}

export async function completeMaintenance(id: number, body: unknown): Promise<{ ok: true } | Fail> {
  const database = await db();
  const assets = database.collection<AssetDoc>("assets");
  const asset = await assets.findOne({ _id: id });
  if (!asset) return bad("That asset no longer exists.", 404);
  if (asset.status !== "Under Maintenance") return bad("This asset is not under maintenance.", 409);
  const active = [...asset.maintenance].reverse().find((entry) => entry.endedAt === null);
  if (!active) return bad("Active maintenance record not found.", 409);

  const b = (body ?? {}) as Record<string, unknown>;
  const details = text(b.details, 2000) || active.details;
  let cost: number | null = active.cost;
  if (b.cost !== null && b.cost !== undefined && b.cost !== "") {
    cost = Number(b.cost);
    if (!Number.isFinite(cost) || cost < 0 || cost > 1e10) return bad("Maintenance cost must be a number, zero or more.");
  }
  const next: Status = asset.assignedEmployeeId !== null ? "In Use" : "In Store";
  const now = dbTimestamp();
  const maintenance = asset.maintenance.map((entry) => entry.id === active.id
    ? { ...entry, endedAt: now, details, cost }
    : entry);
  const statusHistory = [...asset.statusHistory, {
    id: await nextId(database, "statusHistory"), fromStatus: "Under Maintenance", toStatus: next,
    note: details ? `Maintenance completed · ${details}` : "Maintenance completed", changedAt: now,
  }];
  const result = await assets.updateOne(
    { _id: id, status: "Under Maintenance" },
    { $set: { maintenance, statusHistory, status: next, updatedAt: now } },
  );
  if (!result.modifiedCount) return bad("This asset changed while maintenance was finishing. Please try again.", 409);
  return { ok: true };
}

export async function getAsset(id: number) {
  const database = await db();
  const asset = await database.collection<AssetDoc>("assets").findOne({ _id: id });
  if (!asset) return bad("That asset no longer exists.", 404);
  const categories = database.collection<CategoryDoc>("categories");
  const category = await categories.findOne({ _id: asset.categoryId });
  const parent = category?.parentId ? await categories.findOne({ _id: category.parentId }, { projection: { name: 1 } }) : null;
  const employee = asset.assignedEmployeeId !== null
    ? await database.collection<EmployeeDoc>("employees").findOne({ _id: asset.assignedEmployeeId })
    : null;
  const assignmentEmployeeIds = [...new Set(asset.assignments.map((entry) => entry.employeeId))];
  const assignmentEmployees = assignmentEmployeeIds.length
    ? await database.collection<EmployeeDoc>("employees").find({ _id: { $in: assignmentEmployeeIds } }).toArray()
    : [];
  const employees = new Map(assignmentEmployees.map((entry) => [entry._id, entry]));

  return {
    asset: {
      id: asset._id, tag: asset.assetTag, name: asset.name, categoryId: asset.categoryId, category: category?.name ?? "",
      categoryPath: parent ? `${parent.name} › ${category?.name ?? ""}` : category?.name ?? "",
      brand: asset.brand, model: asset.model, serial: asset.serialNumber,
      employee: employee
        ? { id: employee._id, name: employee.name, code: employee.code, department: employee.department }
        : null,
      cost: asset.purchaseCost, purchaseDate: asset.purchaseDate, warrantyStart: asset.warrantyStart,
      warrantyExpiry: asset.warrantyExpiry, status: asset.status, description: asset.remarks,
    },
    history: [...asset.statusHistory].sort((a, b) => b.id - a.id).map((entry) => ({
      from: entry.fromStatus, to: entry.toStatus, note: entry.note, at: entry.changedAt,
    })),
    assignments: [...asset.assignments].sort((a, b) => b.id - a.id).map((entry) => {
      const assignedEmployee = employees.get(entry.employeeId);
      return {
        name: assignedEmployee?.name ?? "", code: assignedEmployee?.code ?? "", at: entry.assignedAt,
        returnedAt: entry.returnedAt, note: entry.note,
      };
    }),
    maintenance: [...asset.maintenance].sort((a, b) => b.id - a.id).map((entry) => ({
      startedAt: entry.startedAt, endedAt: entry.endedAt, details: entry.details, cost: entry.cost,
    })),
    canRemove: removable(asset),
  };
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function assetOptions() {
  const database = await db();
  const categories = await database.collection<CategoryDoc>("categories").find().sort({ name: 1 }).toArray();
  const byId = new Map(categories.map((category) => [category._id, category]));
  return {
    statuses: [...STATUSES],
    categories: categories.map((category) => ({
      id: category._id, name: category.name, parent_name: category.parentId === null ? null : byId.get(category.parentId)?.name ?? null,
    })),
  };
}

export async function exportAssets() {
  const database = await db();
  return database.collection<AssetDoc>("assets").aggregate<Document>([
    { $lookup: { from: "categories", localField: "categoryId", foreignField: "_id", as: "category" } },
    { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "categories", localField: "category.parentId", foreignField: "_id", as: "parent" } },
    { $unwind: { path: "$parent", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "employees", localField: "assignedEmployeeId", foreignField: "_id", as: "employee" } },
    { $unwind: { path: "$employee", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "locations", localField: "locationId", foreignField: "_id", as: "location" } },
    { $unwind: { path: "$location", preserveNullAndEmptyArrays: true } },
    { $project: {
      _id: 0, id: "$_id", tag: "$assetTag", name: 1,
      mainCategory: { $ifNull: ["$parent.name", "$category.name"] }, category: "$category.name",
      brand: 1, model: 1, serial: "$serialNumber", status: 1, cost: "$purchaseCost",
      purchaseDate: 1, warrantyStart: 1, warrantyExpiry: 1, description: "$remarks",
      employee: "$employee.name", employeeCode: "$employee.code", department: "$employee.department",
      location: "$location.name", assignmentCount: { $size: { $ifNull: ["$assignments", []] } },
      maintenanceCount: { $size: { $ifNull: ["$maintenance", []] } }, createdAt: 1, updatedAt: 1,
    } },
    { $sort: { id: 1 } },
  ]).toArray();
}

type AssetListRow = Document & {
  _id: number; assetTag: string; name: string; categoryName: string; departmentName?: string; employeeName?: string;
  status: Status; warrantyExpiry: string | null;
};

export async function listAssets(p: URLSearchParams) {
  const database = await db();
  const q = (p.get("q") ?? "").trim().toLowerCase().slice(0, 100);
  const pageSize = Math.min(100, Math.max(1, parseInt(p.get("pageSize") ?? "25", 10) || 25));
  const sortNames: Record<string, string> = {
    added: "_id", tag: "assetTag", name: "name", category: "category.name", status: "status",
    department: "employee.department", warranty: "warrantyExpiry", cost: "purchaseCost",
  };
  const sortKey = sortNames[p.get("sort") ?? ""] ? (p.get("sort") as string) : "added";
  const direction = p.get("dir") === "asc" ? 1 : -1;
  const assetConditions: Document[] = [];
  const joinedConditions: Document[] = [];

  const employeeId = Number(p.get("employeeId"));
  if (Number.isInteger(employeeId) && employeeId > 0) assetConditions.push({ assignedEmployeeId: employeeId });

  const status = p.get("status") ?? "";
  if ((STATUSES as readonly string[]).includes(status)) assetConditions.push({ status });

  const department = (p.get("department") ?? "").trim();
  if (department) joinedConditions.push({ "employee.department": { $regex: `^${escapeRegex(department)}$`, $options: "i" } });

  const category = parseInt(p.get("category") ?? "", 10);
  if (Number.isInteger(category)) {
    const categoryRows = await database.collection<CategoryDoc>("categories")
      .find({ $or: [{ _id: category }, { parentId: category }] }, { projection: { _id: 1 } }).toArray();
    assetConditions.push({ categoryId: { $in: categoryRows.map((entry) => entry._id) } });
  }

  const warranty = p.get("warranty");
  const now = new Date();
  if (warranty === "soon") {
    assetConditions.push({ warrantyExpiry: { $gte: ymd(now), $lte: ymd(new Date(now.getTime() + 30 * 86_400_000)) } });
    assetConditions.push({ status: { $ne: "Disposed" } });
  } else if (warranty === "expired") {
    assetConditions.push({ warrantyExpiry: { $lt: ymd(now) } }, { status: { $ne: "Disposed" } });
  }
  for (const term of q.split(/\s+/).filter(Boolean)) {
    const regex = { $regex: escapeRegex(term), $options: "i" };
    joinedConditions.push({
      $or: [
        { assetTag: regex }, { name: regex }, { brand: regex }, { model: regex }, { serialNumber: regex },
        { remarks: regex }, { "category.name": regex }, { "employee.name": regex }, { "employee.code": regex },
        { "employee.department": regex },
      ],
    });
  }

  const assets = database.collection<AssetDoc>("assets");
  const collation = { locale: "en", strength: 2 as const };
  const lookups: Document[] = [
    { $lookup: { from: "categories", localField: "categoryId", foreignField: "_id", as: "category" } },
    { $unwind: "$category" },
    { $lookup: { from: "employees", localField: "assignedEmployeeId", foreignField: "_id", as: "employee" } },
    { $unwind: { path: "$employee", preserveNullAndEmptyArrays: true } },
  ];
  const projection: Document = { $project: {
    _id: 1, assetTag: 1, name: 1, categoryName: "$category.name", departmentName: "$employee.department",
    employeeName: "$employee.name", status: 1, warrantyExpiry: 1,
  } };
  const mapRows = (rows: AssetListRow[]) => rows.map((row) => ({
    id: row._id, tag: row.assetTag, name: row.name, category: row.categoryName,
    department: row.departmentName || null, employee: row.employeeName ?? null, status: row.status,
    warrantyExpiry: row.warrantyExpiry,
  }));

  if (sortKey === "added" && joinedConditions.length === 0) {
    const filter: Document = assetConditions.length ? { $and: assetConditions } : {};
    const queryOptions = assetConditions.some((condition) => "status" in condition) ? { collation } : undefined;
    const requestedPage = Math.max(1, parseInt(p.get("page") ?? "1", 10) || 1);
    const readPage = (page: number) => assets.aggregate<AssetListRow>([
      { $match: filter },
      { $sort: { _id: direction } },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
      ...lookups,
      projection,
    ], queryOptions).toArray();
    const [count, requestedRows] = await Promise.all([
      assets.aggregate<Document>([
        { $match: filter },
        { $lookup: { from: "categories", localField: "categoryId", foreignField: "_id", as: "category" } },
        { $unwind: "$category" },
        { $count: "total" },
      ], queryOptions).next(),
      readPage(requestedPage),
    ]);
    const total = count?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(pages, requestedPage);
    const rows = page === requestedPage ? requestedRows : await readPage(page);
    return { total, page, pages, pageSize, rows: mapRows(rows) };
  }

  const conditions = [...assetConditions, ...joinedConditions];
  const filteredLookups = [
    ...lookups,
    ...(conditions.length ? [{ $match: { $and: conditions } }] : []),
  ];
  const count = await assets.aggregate<Document>([...filteredLookups, { $count: "total" }], { collation }).next();
  const total = count?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, parseInt(p.get("page") ?? "1", 10) || 1));
  const rows = await assets.aggregate<AssetListRow>([
    ...filteredLookups,
    { $sort: { [sortNames[sortKey]]: direction, _id: -1 } },
    { $skip: (page - 1) * pageSize },
    { $limit: pageSize },
    projection,
  ], { collation }).toArray();

  return { total, page, pages, pageSize, rows: mapRows(rows) };
}
