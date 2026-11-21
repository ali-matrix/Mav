// Reading assignments: every time an asset was given to an employee (and whether it is still with them).
import { db } from "@/lib/db";

type Param = string | number | null;

const FROM = `FROM asset_assignments s
  JOIN assets a ON a.id = s.asset_id
  JOIN categories c ON c.id = a.category_id
  JOIN employees e ON e.id = s.employee_id`;

// Everything a person might type in the search box, joined into one piece of text.
const SEARCH_TEXT = `(a.asset_tag || ' ' || a.name || ' ' || c.name || ' ' || e.name || ' ' || e.code || ' ' || e.department || ' ' || s.note)`;

// Only these can be sorted on (nothing from the browser is pasted into SQL).
const SORTS: Record<string, string> = {
  assigned: "s.assigned_at",
  returned: "s.returned_at",
  asset: "a.asset_tag COLLATE NOCASE",
  employee: "e.name COLLATE NOCASE",
  department: "e.department COLLATE NOCASE",
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

export function listAssignments(p: URLSearchParams) {
  const q = (p.get("q") ?? "").trim().toLowerCase().slice(0, 100);
  const pageSize = Math.min(100, Math.max(1, parseInt(p.get("pageSize") ?? "25", 10) || 25));
  const sortKey = SORTS[p.get("sort") ?? ""] ? (p.get("sort") as string) : "assigned";
  const dir = p.get("dir") === "asc" ? "ASC" : "DESC";

  const where: string[] = [];
  const params: Param[] = [];

  const state = p.get("state") ?? "all"; // all | current | returned
  if (state === "current") where.push("s.returned_at IS NULL");
  else if (state === "returned") where.push("s.returned_at IS NOT NULL");

  // Assets still held by people who have since left the company.
  if (p.get("left") === "1") where.push("s.returned_at IS NULL AND e.status = 'left'");

  const department = (p.get("department") ?? "").trim();
  if (department) { where.push("e.department = ? COLLATE NOCASE"); params.push(department); }

  // A main kind (Computers) also covers its sub-kinds (Laptop, Desktop …).
  const category = parseInt(p.get("category") ?? "", 10);
  if (Number.isInteger(category)) {
    where.push("a.category_id IN (SELECT id FROM categories WHERE id = ? OR parent_id = ?)");
    params.push(category, category);
  }

  // Every word typed must appear somewhere in the searchable text.
  for (const term of q.split(/\s+/).filter(Boolean)) {
    where.push(`${SEARCH_TEXT} LIKE ? ESCAPE '\\'`);
    params.push(`%${escapeLike(term)}%`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = (db().prepare(`SELECT COUNT(*) AS n ${FROM} ${clause}`).get(...params) as { n: number }).n;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, parseInt(p.get("page") ?? "1", 10) || 1));

  const rows = db().prepare(
    `SELECT s.id, s.asset_id, a.asset_tag, a.name AS asset_name, c.name AS category_name,
            e.name AS employee_name, e.code AS employee_code, e.department, e.status AS employee_status,
            s.assigned_at, s.returned_at, s.note
     ${FROM} ${clause}
     ORDER BY ${SORTS[sortKey]} ${dir}, s.id DESC
     LIMIT ? OFFSET ?`,
  ).all(...params, pageSize, (page - 1) * pageSize) as unknown as {
    id: number; asset_id: number; asset_tag: string; asset_name: string; category_name: string; employee_name: string;
    employee_code: string; department: string; employee_status: string; assigned_at: string; returned_at: string | null; note: string;
  }[];

  return {
    total, page, pages, pageSize,
    rows: rows.map((r) => ({
      id: r.id, assetId: r.asset_id, tag: r.asset_tag, asset: r.asset_name, category: r.category_name,
      employeeName: r.employee_name, employeeCode: r.employee_code, department: r.department,
      employeeLeft: r.employee_status === "left", assignedAt: r.assigned_at, returnedAt: r.returned_at, note: r.note,
    })),
  };
}

/** The three counts shown on the page: still held, given back, and held by people who have left. */
export function assignmentSummary() {
  const r = db().prepare(
    `SELECT COALESCE(SUM(s.returned_at IS NULL), 0) AS current_n,
            COALESCE(SUM(s.returned_at IS NOT NULL), 0) AS returned_n,
            COALESCE(SUM(s.returned_at IS NULL AND e.status = 'left'), 0) AS left_n
     FROM asset_assignments s JOIN employees e ON e.id = s.employee_id`,
  ).get() as { current_n: number; returned_n: number; left_n: number };
  return { current: r.current_n, returned: r.returned_n, withLeft: r.left_n };
}