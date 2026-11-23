import { db, dbTimestamp, nextId, nameKey, type EmployeeDoc, type RefDoc, type SyncRunDoc } from "@/lib/db";
import { ErpError, fetchStaff, type ErpPerson } from "@/lib/erp";

const SOURCE = "erp-staff";
const COOLDOWN_MS = 5 * 60 * 1000;
const g = globalThis as typeof globalThis & { __erpSyncRunning?: boolean };

type Last = {
  started_at: string; finished_at: string; status: "success" | "error";
  added: number; updated: number; marked_left: number; error: string | null;
};
export type SyncStatus = { running: boolean; last: Last | null; nextAllowedAt: string | null };

export async function syncStatus(): Promise<SyncStatus> {
  const database = await db();
  const row = await database.collection<SyncRunDoc>("syncRuns").findOne({ source: SOURCE }, { sort: { _id: -1 } });
  const last: Last | null = row ? {
    started_at: row.startedAt, finished_at: row.finishedAt, status: row.status,
    added: row.added, updated: row.updated, marked_left: row.markedLeft, error: row.error,
  } : null;
  let nextAllowedAt: string | null = null;
  if (last?.status === "success") {
    const time = new Date(last.finished_at).getTime() + COOLDOWN_MS;
    if (time > Date.now()) nextAllowedAt = new Date(time).toISOString();
  }
  return { running: !!g.__erpSyncRunning, last, nextAllowedAt };
}

export async function startSync(): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (g.__erpSyncRunning) return { ok: false, status: 409, error: "A sync is already running." };
  const status = await syncStatus();
  if (status.nextAllowedAt) {
    const mins = Math.max(1, Math.ceil((new Date(status.nextAllowedAt).getTime() - Date.now()) / 60000));
    return { ok: false, status: 429, error: `The ERP was synced a moment ago. Please try again in about ${mins} minute${mins === 1 ? "" : "s"}.` };
  }
  g.__erpSyncRunning = true;
  void run();
  return { ok: true };
}

async function run() {
  const startedAt = new Date().toISOString();
  try {
    const staff = await fetchStaff();
    const result = await apply(staff, startedAt);
    await record(startedAt, "success", result.added, result.updated, result.left, null);
  } catch (error) {
    if (!(error instanceof ErpError)) console.error(error);
    try {
      await record(
        startedAt, "error", 0, 0, 0,
        error instanceof ErpError ? error.message : "Something went wrong while saving the staff list.",
      );
    } catch (recordError) {
      console.error(recordError);
    }
  } finally {
    g.__erpSyncRunning = false;
  }
}

async function record(
  startedAt: string, status: "success" | "error", added: number, updated: number, left: number, error: string | null,
) {
  const database = await db();
  await database.collection<SyncRunDoc>("syncRuns").insertOne({
    _id: await nextId(database, "syncRuns"), source: SOURCE, startedAt, finishedAt: new Date().toISOString(),
    status, added, updated, markedLeft: left, error,
  });
}

async function apply(staff: ErpPerson[], runStamp: string) {
  const database = await db();
  const employees = database.collection<EmployeeDoc>("employees");
  const activeBefore = await employees.countDocuments({ status: "active" });
  if (staff.length === 0) throw new ErpError("The ERP returned no staff, so nothing was changed.");
  if (activeBefore >= 20 && staff.length < activeBefore * 0.5) {
    throw new ErpError(`The ERP returned only ${staff.length} people (we have ${activeBefore}), so nothing was changed. Try again later.`);
  }

  const existingRows = await employees.find({}, { projection: { _id: 1, erpId: 1 } }).toArray();
  const existing = new Map(existingRows.map((row) => [row.erpId, row._id]));
  let added = 0, updated = 0;
  for (const person of staff) {
    const manager = person.reportingManager ?? null;
    const name = person.name.trim();
    const code = (person.employeeCode ?? "").trim();
    const designation = (person.designation ?? "").trim();
    const department = (person.department ?? "").trim();
    const email = person.officialEmail?.trim() || null;
    const searchText = [name, code, designation, person.positionTitle, department, email].filter(Boolean).join(" ").toLowerCase();
    if (department) {
      const key = nameKey(department);
      await database.collection<RefDoc>("departments").updateOne(
        { nameKey: key },
        { $setOnInsert: {
          _id: await nextId(database, "departments"), name: department, nameKey: key,
          isActive: true, createdAt: dbTimestamp(),
        } },
        { upsert: true },
      );
    }

    const id = existing.get(person.employeeId) ?? await nextId(database, "employees");
    const fields = {
      code, name, nameKey: nameKey(name), designation, designationKey: nameKey(designation),
      positionTitle: person.positionTitle ?? null, department, departmentKey: nameKey(department),
      division: person.division ?? null, email, phone: person.officialPhone ?? null,
      intercomExt: person.intercomExt ?? null, joiningDate: person.joiningDate ?? null,
      managerErpId: manager?.employeeId ?? null, managerName: manager?.name ?? null,
      managerDesignation: manager?.designation ?? null, managerActive: manager ? (manager.active === false ? 0 : 1) : null,
      status: "active" as const, seenAt: runStamp, searchText, updatedAt: dbTimestamp(),
    };
    await employees.updateOne(
      { erpId: person.employeeId },
      { $set: fields, $setOnInsert: { _id: id, erpId: person.employeeId, createdAt: dbTimestamp() } },
      { upsert: true },
    );
    if (existing.has(person.employeeId)) updated++; else added++;
  }

  const result = await employees.updateMany(
    { status: "active", seenAt: { $ne: runStamp } },
    { $set: { status: "left", updatedAt: dbTimestamp() } },
  );
  return { added, updated, left: result.modifiedCount };
}
