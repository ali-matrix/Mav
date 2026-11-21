// Everything about assets: reading, adding, changing, assigning, removing. The rules live here, not in the API routes.
// An asset has no department of its own: its department is the department of the employee who holds it.
import { db } from "@/lib/db";
import { ASSIGNABLE, LOCKED_STATUSES, STATUSES, manualStatuses, type Status } from "@/lib/assetStatus";

type Fail = { error: string; status: number };
const bad = (error: string, status = 400): Fail => ({ error, status });
type Param = string | number | null;

function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN");
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

// ---------- reading what the form sends ----------

type AssetInput = {
  name: string; categoryId: number; brand: string; model: string; serial: string;
  cost: number | null; purchaseDate: string | null; warrantyStart: string | null; warrantyExpiry: string | null;
  status: Status; description: string;
};

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** null = left empty, undefined = not a real date. */
function date(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? undefined : v;
}

function parseAsset(body: unknown, current?: { status: Status; held: boolean }): { value: AssetInput } | Fail {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = text(b.name, 120);
  if (!name) return bad("Please enter the asset's name.");

  const categoryId = Number(b.categoryId);
  const cat = Number.isInteger(categoryId)
    ? (db().prepare(
        "SELECT c.id, (SELECT COUNT(*) FROM categories k WHERE k.parent_id = c.id) AS kids FROM categories c WHERE c.id = ?",
      ).get(categoryId) as { id: number; kids: number } | undefined)
    : undefined;
  if (!cat) return bad("Please choose a category.");
  if (cat.kids > 0) return bad("Please choose a specific kind (for example Laptop), not a main kind.");

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

const COLS = [
  "name", "category_id", "brand", "model", "serial_number", "purchase_cost", "purchase_date",
  "warranty_start", "warranty_expiry", "status", "remarks",
];
const values = (v: AssetInput): Param[] => [
  v.name, v.categoryId, v.brand, v.model, v.serial, v.cost, v.purchaseDate, v.warrantyStart,
  v.warrantyExpiry, v.status, v.description,
];

const serialTaken = (serial: string, exceptId: number) =>
  !!db().prepare("SELECT 1 FROM assets WHERE serial_number = ? COLLATE NOCASE AND id <> ?").get(serial, exceptId);

// ---------- asset tags: LAP-0001, LAP-0002 … ----------

const prefixFor = (categoryName: string) => (categoryName.replace(/[^A-Za-z0-9]/g, "").toUpperCase() + "XXX").slice(0, 3);

function nextTag(prefix: string): string {
  const d = db();
  for (;;) {
    d.prepare(
      "INSERT INTO asset_tag_counters (prefix, last_number) VALUES (?, 1) ON CONFLICT(prefix) DO UPDATE SET last_number = last_number + 1",
    ).run(prefix);
    const n = (d.prepare("SELECT last_number AS n FROM asset_tag_counters WHERE prefix = ?").get(prefix) as { n: number }).n;
    const tag = `${prefix}-${String(n).padStart(4, "0")}`;
    if (!d.prepare("SELECT 1 FROM assets WHERE asset_tag = ?").get(tag)) return tag;
  }
}

// ---------- add, change, remove ----------

export function createAsset(body: unknown): { id: number; tag: string } | Fail {
  const p = parseAsset(body);
  if ("error" in p) return p;
  const v = p.value;
  if (v.serial && serialTaken(v.serial, 0)) return bad("An asset with this serial number is already registered.", 409);
  return tx(() => {
    const catName = (db().prepare("SELECT name FROM categories WHERE id = ?").get(v.categoryId) as { name: string }).name;
    const tag = nextTag(prefixFor(catName));
    const info = db()
      .prepare(`INSERT INTO assets (asset_tag, ${COLS.join(", ")}) VALUES (${Array(COLS.length + 1).fill("?").join(", ")})`)
      .run(tag, ...values(v));
    const id = Number(info.lastInsertRowid);
    db().prepare("INSERT INTO asset_status_history (asset_id, from_status, to_status, note) VALUES (?, NULL, ?, 'Added')").run(id, v.status);
    return { id, tag };
  });
}

export function updateAsset(id: number, body: unknown): { ok: true } | Fail {
  const cur = db().prepare("SELECT status, assigned_employee_id AS emp FROM assets WHERE id = ?").get(id) as
    | { status: Status; emp: number | null } | undefined;
  if (!cur) return bad("That asset no longer exists.", 404);
  const p = parseAsset(body, { status: cur.status, held: cur.emp !== null });
  if ("error" in p) return p;
  const v = p.value;
  if (v.serial && serialTaken(v.serial, id)) return bad("An asset with this serial number is already registered.", 409);
  tx(() => {
    db().prepare(`UPDATE assets SET ${COLS.map((c) => `${c} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`).run(...values(v), id);
    if (v.status !== cur.status) {
      db().prepare("INSERT INTO asset_status_history (asset_id, from_status, to_status, note) VALUES (?, ?, ?, 'Changed on the asset form')").run(id, cur.status, v.status);
    }
  });
  return { ok: true };
}

/** Only a mistaken entry can be removed: just its "Added" line, never held by anyone. */
function removable(id: number, status: Status, heldBy: number | null): boolean {
  if (LOCKED_STATUSES.includes(status) || heldBy !== null || status === "Under Maintenance") return false;
  const h = (db().prepare("SELECT COUNT(*) AS n FROM asset_status_history WHERE asset_id = ?").get(id) as { n: number }).n;
  const s = (db().prepare("SELECT COUNT(*) AS n FROM asset_assignments WHERE asset_id = ?").get(id) as { n: number }).n;
  return h <= 1 && s === 0;
}

export function removeAsset(id: number): { ok: true } | Fail {
  const a = db().prepare("SELECT status, assigned_employee_id AS emp FROM assets WHERE id = ?").get(id) as
    | { status: Status; emp: number | null } | undefined;
  if (!a) return bad("That asset no longer exists.", 404);
  if (!removable(id, a.status, a.emp)) {
    return bad("This asset has history, so it can't be removed. Record it as disposed instead.", 409);
  }
  tx(() => {
    db().prepare("DELETE FROM asset_status_history WHERE asset_id = ?").run(id);
    db().prepare("DELETE FROM assets WHERE id = ?").run(id);
  });
  return { ok: true };
}

// ---------- giving an asset to an employee, transferring, taking it back ----------

/** Assign to an employee. If someone already holds it, this is a transfer to the new person. */
export function assignAsset(id: number, body: unknown): { ok: true } | Fail {
  const b = (body ?? {}) as { employeeId?: unknown; note?: unknown };
  const employeeId = Number(b.employeeId);
  if (!Number.isInteger(employeeId)) return bad("Please choose an employee.");
  const note = text(b.note, 200);

  const a = db().prepare("SELECT status, assigned_employee_id AS emp FROM assets WHERE id = ?").get(id) as
    | { status: Status; emp: number | null } | undefined;
  if (!a) return bad("That asset no longer exists.", 404);
  if (!ASSIGNABLE.includes(a.status)) {
    return bad(
      a.status === "Under Maintenance"
        ? "This asset is under maintenance. Finish that first, then assign it."
        : `An asset that is "${a.status}" can't be assigned.`,
      409,
    );
  }
  const e = db().prepare("SELECT name, code, status FROM employees WHERE id = ?").get(employeeId) as
    | { name: string; code: string; status: string } | undefined;
  if (!e) return bad("That employee no longer exists.", 404);
  if (e.status !== "active") return bad(`${e.name} has left the company, so no asset can be assigned to them.`, 409);
  if (a.emp === employeeId) return bad(`This asset is already with ${e.name}.`, 409);

  tx(() => {
    const d = db();
    d.prepare("UPDATE asset_assignments SET returned_at = datetime('now') WHERE asset_id = ? AND returned_at IS NULL").run(id);
    d.prepare("INSERT INTO asset_assignments (asset_id, employee_id, note) VALUES (?, ?, ?)").run(id, employeeId, note);
    d.prepare("UPDATE assets SET assigned_employee_id = ?, status = 'In Use', updated_at = datetime('now') WHERE id = ?").run(employeeId, id);
    if (a.status !== "In Use") {
      d.prepare("INSERT INTO asset_status_history (asset_id, from_status, to_status, note) VALUES (?, ?, 'In Use', ?)")
        .run(id, a.status, `Assigned to ${e.name} (${e.code})`);
    }
  });
  return { ok: true };
}

/** Take the asset back from whoever holds it. */
export function returnAsset(id: number): { ok: true } | Fail {
  const a = db().prepare(
    "SELECT a.status, a.assigned_employee_id AS emp, e.name, e.code FROM assets a LEFT JOIN employees e ON e.id = a.assigned_employee_id WHERE a.id = ?",
  ).get(id) as { status: Status; emp: number | null; name: string | null; code: string | null } | undefined;
  if (!a) return bad("That asset no longer exists.", 404);
  if (a.emp === null) return bad("Nobody holds this asset right now.", 409);

  const next: Status = a.status === "In Use" ? "In Store" : a.status; // under maintenance stays under maintenance
  tx(() => {
    const d = db();
    d.prepare("UPDATE asset_assignments SET returned_at = datetime('now') WHERE asset_id = ? AND returned_at IS NULL").run(id);
    d.prepare("UPDATE assets SET assigned_employee_id = NULL, status = ?, updated_at = datetime('now') WHERE id = ?").run(next, id);
    if (next !== a.status) {
      d.prepare("INSERT INTO asset_status_history (asset_id, from_status, to_status, note) VALUES (?, ?, ?, ?)")
        .run(id, a.status, next, `Returned by ${a.name} (${a.code})`);
    }
  });
  return { ok: true };
}

// ---------- maintenance: assignment stays intact until maintenance is complete ----------

export function startMaintenance(id: number, body: unknown): { ok: true } | Fail {
  const a = db().prepare("SELECT status FROM assets WHERE id = ?").get(id) as { status: Status } | undefined;
  if (!a) return bad("That asset no longer exists.", 404);
  if (a.status === "Under Maintenance") return bad("This asset is already under maintenance.", 409);
  if (LOCKED_STATUSES.includes(a.status)) return bad(`An asset that is "${a.status}" can't be sent to maintenance.`, 409);

  const active = db().prepare("SELECT id FROM asset_maintenance WHERE asset_id = ? AND ended_at IS NULL").get(id);
  if (active) return bad("This asset already has active maintenance.", 409);

  const b = (body ?? {}) as Record<string, unknown>;
  const details = text(b.details, 2000);
  let cost: number | null = null;
  if (b.cost !== null && b.cost !== undefined && b.cost !== "") {
    cost = Number(b.cost);
    if (!Number.isFinite(cost) || cost < 0 || cost > 1e10) return bad("Maintenance cost must be a number, zero or more.");
  }

  tx(() => {
    const d = db();
    d.prepare("UPDATE assets SET status = 'Under Maintenance', updated_at = datetime('now') WHERE id = ?").run(id);
    d.prepare(
      "INSERT INTO asset_maintenance (asset_id, started_at, details, cost) VALUES (?, datetime('now'), ?, ?)",
    ).run(id, details, cost);
    d.prepare("INSERT INTO asset_status_history (asset_id, from_status, to_status, note) VALUES (?, ?, 'Under Maintenance', ?)")
      .run(id, a.status, details ? `Maintenance started · ${details}` : "Maintenance started");
  });
  return { ok: true };
}

export function completeMaintenance(id: number, body: unknown): { ok: true } | Fail {
  const a = db().prepare(
    "SELECT status, assigned_employee_id AS emp FROM assets WHERE id = ?",
  ).get(id) as { status: Status; emp: number | null } | undefined;
  if (!a) return bad("That asset no longer exists.", 404);
  if (a.status !== "Under Maintenance") return bad("This asset is not under maintenance.", 409);

  const m = db().prepare(
    "SELECT id, details, cost FROM asset_maintenance WHERE asset_id = ? AND ended_at IS NULL ORDER BY id DESC",
  ).get(id) as { id: number; details: string; cost: number | null } | undefined;
  if (!m) return bad("Active maintenance record not found.", 409);

  const b = (body ?? {}) as Record<string, unknown>;
  const details = text(b.details, 2000) || m.details;
  let cost: number | null = m.cost;
  if (b.cost !== null && b.cost !== undefined && b.cost !== "") {
    cost = Number(b.cost);
    if (!Number.isFinite(cost) || cost < 0 || cost > 1e10) return bad("Maintenance cost must be a number, zero or more.");
  }
  const next: Status = a.emp !== null ? "In Use" : "In Store";

  tx(() => {
    const d = db();
    d.prepare("UPDATE asset_maintenance SET ended_at = datetime('now'), details = ?, cost = ? WHERE id = ?")
      .run(details, cost, m.id);
    d.prepare("UPDATE assets SET status = ?, updated_at = datetime('now') WHERE id = ?").run(next, id);
    d.prepare("INSERT INTO asset_status_history (asset_id, from_status, to_status, note) VALUES (?, 'Under Maintenance', ?, ?)")
      .run(id, next, details ? `Maintenance completed · ${details}` : "Maintenance completed");
  });
  return { ok: true };
}

// ---------- reading one asset ----------

type Full = {
  id: number; asset_tag: string; name: string; category_id: number; brand: string; model: string; serial_number: string;
  purchase_cost: number | null; purchase_date: string | null; warranty_start: string | null;
  warranty_expiry: string | null; status: Status; remarks: string; assigned_employee_id: number | null;
  category_name: string; parent_name: string | null;
  employee_name: string | null; employee_code: string | null; employee_department: string | null;
};

export function getAsset(id: number) {
  const a = db().prepare(
    `SELECT a.*, c.name AS category_name, p.name AS parent_name,
            e.name AS employee_name, e.code AS employee_code, e.department AS employee_department
     FROM assets a
     JOIN categories c ON c.id = a.category_id
     LEFT JOIN categories p ON p.id = c.parent_id
     LEFT JOIN employees e ON e.id = a.assigned_employee_id
     WHERE a.id = ?`,
  ).get(id) as unknown as Full | undefined;
  if (!a) return bad("That asset no longer exists.", 404);

  const history = db().prepare(
    "SELECT from_status, to_status, note, changed_at FROM asset_status_history WHERE asset_id = ? ORDER BY id DESC",
  ).all(id) as unknown as { from_status: string | null; to_status: string; note: string; changed_at: string }[];

  const assignments = db().prepare(
    `SELECT s.assigned_at, s.returned_at, s.note, e.name, e.code
     FROM asset_assignments s JOIN employees e ON e.id = s.employee_id
     WHERE s.asset_id = ? ORDER BY s.id DESC`,
  ).all(id) as unknown as { assigned_at: string; returned_at: string | null; note: string; name: string; code: string }[];

  const maintenance = db().prepare(
    "SELECT started_at, ended_at, details, cost FROM asset_maintenance WHERE asset_id = ? ORDER BY id DESC",
  ).all(id) as unknown as { started_at: string; ended_at: string | null; details: string; cost: number | null }[];

  return {
    asset: {
      id: a.id, tag: a.asset_tag, name: a.name, categoryId: a.category_id, category: a.category_name,
      categoryPath: a.parent_name ? `${a.parent_name} › ${a.category_name}` : a.category_name,
      brand: a.brand, model: a.model, serial: a.serial_number,
      employee: a.assigned_employee_id !== null
        ? { id: a.assigned_employee_id, name: a.employee_name ?? "", code: a.employee_code ?? "", department: a.employee_department ?? "" }
        : null,
      cost: a.purchase_cost, purchaseDate: a.purchase_date, warrantyStart: a.warranty_start, warrantyExpiry: a.warranty_expiry,
      status: a.status, description: a.remarks,
    },
    history: history.map((h) => ({ from: h.from_status, to: h.to_status, note: h.note, at: h.changed_at })),
    assignments: assignments.map((s) => ({ name: s.name, code: s.code, at: s.assigned_at, returnedAt: s.returned_at, note: s.note })),
    maintenance: maintenance.map((m) => ({
      startedAt: m.started_at, endedAt: m.ended_at, details: m.details, cost: m.cost,
    })),
    canRemove: removable(a.id, a.status, a.assigned_employee_id),
  };
}

// ---------- the list: one page at a time ----------

const FROM = `FROM assets a
  JOIN categories c ON c.id = a.category_id
  LEFT JOIN employees e ON e.id = a.assigned_employee_id`;

// Everything a person might type in the search box, joined into one piece of text.
const SEARCH_TEXT = `(a.asset_tag || ' ' || a.name || ' ' || a.brand || ' ' || a.model || ' ' || a.serial_number || ' ' ||
  a.remarks || ' ' || c.name || ' ' || COALESCE(e.name, '') || ' ' || COALESCE(e.code, '') || ' ' || COALESCE(e.department, ''))`;

// Only these can be sorted on (nothing from the browser is pasted into SQL).
const SORTS: Record<string, string> = {
  added: "a.id", tag: "a.asset_tag COLLATE NOCASE", name: "a.name COLLATE NOCASE", category: "c.name COLLATE NOCASE",
  status: "a.status", department: "e.department COLLATE NOCASE", warranty: "a.warranty_expiry", cost: "a.purchase_cost",
};

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

export function assetOptions() {
  return {
    statuses: [...STATUSES],
    categories: db().prepare(
      "SELECT c.id, c.name, p.name AS parent_name FROM categories c LEFT JOIN categories p ON p.id = c.parent_id ORDER BY c.name",
    ).all(),
  };
}

export function listAssets(p: URLSearchParams) {
  const q = (p.get("q") ?? "").trim().toLowerCase().slice(0, 100);
  const pageSize = Math.min(100, Math.max(1, parseInt(p.get("pageSize") ?? "25", 10) || 25));
  const sortKey = SORTS[p.get("sort") ?? ""] ? (p.get("sort") as string) : "added";
  const dir = p.get("dir") === "asc" ? "ASC" : "DESC";

  const where: string[] = [];
  const params: Param[] = [];

  const status = p.get("status") ?? "";
  if ((STATUSES as readonly string[]).includes(status)) { where.push("a.status = ?"); params.push(status); }

  // The department of whoever holds the asset.
  const department = (p.get("department") ?? "").trim();
  if (department) { where.push("e.department = ? COLLATE NOCASE"); params.push(department); }

  // A main kind (Computers) also covers its sub-kinds (Laptop, Desktop …).
  const category = parseInt(p.get("category") ?? "", 10);
  if (Number.isInteger(category)) {
    where.push("a.category_id IN (SELECT id FROM categories WHERE id = ? OR parent_id = ?)");
    params.push(category, category);
  }

  const warranty = p.get("warranty");
  const now = new Date();
  if (warranty === "soon") {
    where.push("a.warranty_expiry >= ? AND a.warranty_expiry <= ? AND a.status <> 'Disposed'");
    params.push(ymd(now), ymd(new Date(now.getTime() + 30 * 86_400_000)));
  } else if (warranty === "expired") {
    where.push("a.warranty_expiry < ? AND a.status <> 'Disposed'");
    params.push(ymd(now));
  }

  // Every word typed must appear somewhere in the asset's searchable text.
  for (const term of q.split(/\s+/).filter(Boolean)) {
    where.push(`${SEARCH_TEXT} LIKE ? ESCAPE '\\'`);
    params.push(`%${escapeLike(term)}%`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = (db().prepare(`SELECT COUNT(*) AS n ${FROM} ${clause}`).get(...params) as { n: number }).n;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, parseInt(p.get("page") ?? "1", 10) || 1));

  const rows = db().prepare(
    `SELECT a.id, a.asset_tag, a.name, c.name AS category_name, e.department AS department_name, e.name AS employee_name,
            a.status, a.warranty_expiry
     ${FROM} ${clause}
     ORDER BY ${SORTS[sortKey]} ${dir}, a.id DESC
     LIMIT ? OFFSET ?`,
  ).all(...params, pageSize, (page - 1) * pageSize) as unknown as {
    id: number; asset_tag: string; name: string; category_name: string; department_name: string | null;
    employee_name: string | null; status: Status; warranty_expiry: string | null;
  }[];

  return {
    total, page, pages, pageSize,
    rows: rows.map((r) => ({
      id: r.id, tag: r.asset_tag, name: r.name, category: r.category_name, department: r.department_name || null,
      employee: r.employee_name, status: r.status, warrantyExpiry: r.warranty_expiry,
    })),
  };
}