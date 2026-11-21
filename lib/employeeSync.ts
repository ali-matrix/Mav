// Pulls the staff list from the ERP into the employees table. Safe to run again and again:
// the ERP's employeeId is the key, so people are updated, never duplicated.
// People who disappear from the ERP are marked "left", never deleted (their asset history stays).
import { db } from "@/lib/db";
import { ErpError, fetchStaff, type ErpPerson } from "@/lib/erp";

const SOURCE = "erp-staff";
const COOLDOWN_MS = 5 * 60 * 1000; // the ERP refreshes hourly and refuses too many calls
const g = globalThis as unknown as { __erpSyncRunning?: boolean };

type Last = { started_at: string; finished_at: string; status: "success" | "error"; added: number; updated: number; marked_left: number; error: string | null };
export type SyncStatus = { running: boolean; last: Last | null; nextAllowedAt: string | null };

export function syncStatus(): SyncStatus {
  const last = (db().prepare(
    "SELECT started_at, finished_at, status, added, updated, marked_left, error FROM sync_runs WHERE source = ? ORDER BY id DESC LIMIT 1",
  ).get(SOURCE) as unknown as Last | undefined) ?? null;
  let nextAllowedAt: string | null = null;
  if (last?.status === "success") {
    const t = new Date(last.finished_at).getTime() + COOLDOWN_MS;
    if (t > Date.now()) nextAllowedAt = new Date(t).toISOString();
  }
  return { running: !!g.__erpSyncRunning, last, nextAllowedAt };
}

/** Starts a sync in the background and returns at once. */
export function startSync(): { ok: true } | { ok: false; status: number; error: string } {
  if (g.__erpSyncRunning) return { ok: false, status: 409, error: "A sync is already running." };
  const s = syncStatus();
  if (s.nextAllowedAt) {
    const mins = Math.max(1, Math.ceil((new Date(s.nextAllowedAt).getTime() - Date.now()) / 60000));
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
    const r = apply(staff, startedAt);
    record(startedAt, "success", r.added, r.updated, r.left, null);
  } catch (e) {
    if (!(e instanceof ErpError)) console.error(e);
    record(startedAt, "error", 0, 0, 0, e instanceof ErpError ? e.message : "Something went wrong while saving the staff list.");
  } finally {
    g.__erpSyncRunning = false;
  }
}

function record(startedAt: string, status: "success" | "error", added: number, updated: number, left: number, error: string | null) {
  db().prepare(
    "INSERT INTO sync_runs (source, started_at, finished_at, status, added, updated, marked_left, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(SOURCE, startedAt, new Date().toISOString(), status, added, updated, left, error);
}

function apply(staff: ErpPerson[], runStamp: string) {
  const d = db();
  const activeBefore = (d.prepare("SELECT COUNT(*) AS n FROM employees WHERE status = 'active'").get() as { n: number }).n;
  // Guard: a broken or partial ERP answer must never wipe out our people.
  if (staff.length === 0) throw new ErpError("The ERP returned no staff, so nothing was changed.");
  if (activeBefore >= 20 && staff.length < activeBefore * 0.5) {
    throw new ErpError(`The ERP returned only ${staff.length} people (we have ${activeBefore}), so nothing was changed. Try again later.`);
  }

  const existing = new Set((d.prepare("SELECT erp_id FROM employees").all() as { erp_id: number }[]).map((r) => r.erp_id));
  const upsert = d.prepare(`
    INSERT INTO employees (erp_id, code, name, designation, position_title, department, division, email, phone, intercom_ext,
      joining_date, manager_erp_id, manager_name, manager_designation, manager_active, status, seen_at, search_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(erp_id) DO UPDATE SET
      code = excluded.code, name = excluded.name, designation = excluded.designation, position_title = excluded.position_title,
      department = excluded.department, division = excluded.division, email = excluded.email, phone = excluded.phone,
      intercom_ext = excluded.intercom_ext, joining_date = excluded.joining_date, manager_erp_id = excluded.manager_erp_id,
      manager_name = excluded.manager_name, manager_designation = excluded.manager_designation,
      manager_active = excluded.manager_active, status = 'active', seen_at = excluded.seen_at,
      search_text = excluded.search_text, updated_at = datetime('now')`);
  const addDepartment = d.prepare("INSERT OR IGNORE INTO departments (name) VALUES (?)");

  let added = 0, updated = 0, left = 0;
  d.exec("BEGIN");
  try {
    for (const p of staff) {
      const m = p.reportingManager ?? null;
      const name = p.name.trim();
      const code = (p.employeeCode ?? "").trim();
      const designation = (p.designation ?? "").trim();
      const department = (p.department ?? "").trim();
      if (department) addDepartment.run(department);
      const email = p.officialEmail?.trim() || null;
      const searchText = [name, code, designation, p.positionTitle, department, email].filter(Boolean).join(" ").toLowerCase();
      upsert.run(
        p.employeeId, code, name, designation, p.positionTitle ?? null, department, p.division ?? null, email,
        p.officialPhone ?? null, p.intercomExt ?? null, p.joiningDate ?? null,
        m?.employeeId ?? null, m?.name ?? null, m?.designation ?? null, m ? (m.active === false ? 0 : 1) : null,
        runStamp, searchText,
      );
      if (existing.has(p.employeeId)) updated++; else added++;
    }
    left = Number(d.prepare("UPDATE employees SET status = 'left', updated_at = datetime('now') WHERE status = 'active' AND seen_at IS NOT ?").run(runStamp).changes);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  return { added, updated, left };
}