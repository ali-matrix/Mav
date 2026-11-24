import { MongoClient, type ClientSession, type Db, type Document } from "mongodb";
import {
  SEARCH_EXACT_INDEX_NAME, SEARCH_INDEX_NAME, SEARCH_INDEX_VERSION,
} from "@/lib/searchIndex";

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
  assignments: AssignmentDoc[]; maintenance: MaintenanceDoc[]; searchGrams?: string[];
  assignmentSearchGrams?: string[]; searchExactTerms?: string[]; assignmentSearchExactTerms?: string[];
  searchAscii?: boolean; assignmentSearchAscii?: boolean; searchHasLongField?: boolean;
  assignmentSearchHasLongField?: boolean;
  searchIndexVersion?: number; searchRevision?: number;
};
export type SyncRunDoc = Document & {
  _id: number; source: string; startedAt: string; finishedAt: string; status: "success" | "error";
  added: number; updated: number; markedLeft: number; error: string | null;
};

const uri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/";
const databaseName = process.env.MONGODB_DB ?? "mav_asset_ims";
const globals = globalThis as typeof globalThis & {
  __assetMongoClient?: MongoClient;
  __assetMongoDb?: Promise<Db>;
  __assetMongoSupportsTransactions?: boolean;
};

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

  const searchIndexState = await database.collection<Document & { _id: string }>("appMeta").findOne({
    _id: "assetSearch", ready: true, version: SEARCH_INDEX_VERSION,
  });
  if (searchIndexState) {
    await assets.createIndex(
      { searchGrams: 1, searchAscii: 1, _id: 1 },
      {
        name: SEARCH_INDEX_NAME,
        partialFilterExpression: { searchIndexVersion: SEARCH_INDEX_VERSION },
        collation: { locale: "en", strength: 2 },
      },
    );
    await assets.createIndex(
      { searchExactTerms: 1, searchAscii: 1, _id: 1 },
      {
        name: SEARCH_EXACT_INDEX_NAME,
        partialFilterExpression: { searchIndexVersion: SEARCH_INDEX_VERSION },
        collation: { locale: "en", strength: 2 },
      },
    );
    await assets.createIndex(
      { searchGrams: 1, searchAscii: 1, _id: 1 },
      {
        name: "asset_search_long_text_ngrams_v4",
        partialFilterExpression: {
          searchIndexVersion: SEARCH_INDEX_VERSION, searchHasLongField: true,
        },
        collation: { locale: "en", strength: 2 },
      },
    );
    await assets.createIndex(
      { assignmentSearchGrams: 1, assignmentSearchAscii: 1, searchIndexVersion: 1, _id: 1 },
      {
        name: "asset_assignment_search_ngrams_assigned_v4",
        partialFilterExpression: {
          searchIndexVersion: SEARCH_INDEX_VERSION, "assignments.0": { $exists: true },
        },
        collation: { locale: "en", strength: 2 },
      },
    );
    await assets.createIndex(
      { assignmentSearchExactTerms: 1, assignmentSearchAscii: 1, _id: 1 },
      {
        name: "asset_assignment_search_exact_terms_v4",
        partialFilterExpression: {
          searchIndexVersion: SEARCH_INDEX_VERSION, "assignments.0": { $exists: true },
        },
        collation: { locale: "en", strength: 2 },
      },
    );
  }
  const dashboardSummaryState = await database.collection<Document & { _id: string }>("appMeta").findOne({
    _id: "dashboardSummary", ready: true, version: 2,
  });
  if (searchIndexState && dashboardSummaryState) {
    const activity = database.collection("dashboardActivity");
    await Promise.all([
      activity.createIndex({ activityAt: -1, id: -1 }, { name: "dashboard_activity_recent" }),
      activity.createIndex({ assignedAt: -1, id: -1 }, { name: "dashboard_activity_assigned" }),
      activity.createIndex({ returnedAt: -1, id: -1 }, { name: "dashboard_activity_returned" }),
      activity.createIndex({ employeeId: 1, returnedAt: 1 }, { name: "dashboard_activity_employee_state" }),
      activity.createIndex(
        { searchGrams: 1, searchAscii: 1, assignedAt: -1, id: -1 },
        { name: "dashboard_activity_search_assigned_v4", collation: { locale: "en", strength: 2 } },
      ),
      activity.createIndex(
        { searchExactTerms: 1, searchAscii: 1, assignedAt: -1, id: -1 },
        { name: "dashboard_activity_search_exact_v4", collation: { locale: "en", strength: 2 } },
      ),
      activity.createIndex(
        { searchGrams: 1, searchAscii: 1, assignedAt: -1, id: -1 },
        {
          name: "dashboard_activity_long_text_ngrams_v4",
          partialFilterExpression: { searchHasLongField: true },
          collation: { locale: "en", strength: 2 },
        },
      ),
      activity.createIndex(
        { assignedAt: -1, id: -1 },
        { name: "dashboard_activity_assigned_ci", collation: { locale: "en", strength: 2 } },
      ),
      activity.createIndex(
        { returnedAt: -1, id: -1 },
        { name: "dashboard_activity_returned_ci", collation: { locale: "en", strength: 2 } },
      ),
    ]);
  }

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
    const topology = await client.db("admin").command({ hello: 1 });
    globals.__assetMongoClient = client;
    globals.__assetMongoSupportsTransactions = Boolean(topology.setName || topology.msg === "isdbgrid");
    await initialize(database);
    return database;
  } catch (error) {
    await client.close();
    delete globals.__assetMongoClient;
    delete globals.__assetMongoSupportsTransactions;
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

export function supportsMultiDocumentTransactions() {
  return globals.__assetMongoSupportsTransactions ?? false;
}

export async function withTransactionIfSupported<T>(
  work: (session?: ClientSession) => Promise<T>,
): Promise<T> {
  const client = globals.__assetMongoClient;
  if (!client || !supportsMultiDocumentTransactions()) return work();

  const session = client.startSession();
  try {
    return session.withTransaction(
      () => work(session),
      { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } },
    );
  } finally {
    await session.endSession();
  }
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
