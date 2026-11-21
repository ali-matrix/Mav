// Reading employees: one page at a time, filtered and searched in the database.
import { db } from "@/lib/db";

const PAGE_MAX = 100;
// Only these columns can be sorted on (so nothing from the browser is ever pasted into SQL).
const SORTS: Record<string, string> = {
  name: "name COLLATE NOCASE",
  code: "code",
  department: "department COLLATE NOCASE",
  designation: "designation COLLATE NOCASE",
  joined: "joining_date",
};

type Row = {
  id: number; code: string; name: string; designation: string; position_title: string | null; department: string;
  division: string | null; email: string | null; phone: string | null; intercom_ext: string | null; joining_date: string | null;
  manager_name: string | null; manager_designation: string | null; manager_active: number | null; status: "active" | "left";
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

export function listEmployees(p: URLSearchParams) {
  const q = (p.get("q") ?? "").trim().toLowerCase().slice(0, 100);
  const department = p.get("department") ?? "";
  const designation = p.get("designation") ?? "";
  const status = p.get("status") ?? "active"; // active | left | all
  const pageSize = Math.min(PAGE_MAX, Math.max(1, parseInt(p.get("pageSize") ?? "25", 10) || 25));
  const sortKey = SORTS[p.get("sort") ?? ""] ? (p.get("sort") as string) : "name";
  const dir = p.get("dir") === "desc" ? "DESC" : "ASC";

  const where: string[] = [];
  const params: (string | number)[] = [];
  if (status === "active" || status === "left") { where.push("status = ?"); params.push(status); }
  if (department) { where.push("department = ?"); params.push(department); }
  if (designation) { where.push("designation = ?"); params.push(designation); }
  // Every word typed must appear somewhere in the person's searchable text.
  for (const term of q.split(/\s+/).filter(Boolean)) {
    where.push("search_text LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(term)}%`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = (db().prepare(`SELECT COUNT(*) AS n FROM employees ${clause}`).get(...params) as { n: number }).n;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, parseInt(p.get("page") ?? "1", 10) || 1));

  const rows = db().prepare(
    `SELECT id, code, name, designation, position_title, department, division, email, phone, intercom_ext, joining_date,
            manager_name, manager_designation, manager_active, status
     FROM employees ${clause}
     ORDER BY ${SORTS[sortKey]} ${dir}, id
     LIMIT ? OFFSET ?`,
  ).all(...params, pageSize, (page - 1) * pageSize) as unknown as Row[];

  return {
    total, page, pages, pageSize,
    rows: rows.map((r) => ({
      id: r.id, code: r.code, name: r.name, designation: r.designation, positionTitle: r.position_title,
      department: r.department, division: r.division, email: r.email, phone: r.phone, intercom: r.intercom_ext,
      joined: r.joining_date, status: r.status,
      manager: r.manager_name ? { name: r.manager_name, designation: r.manager_designation, active: r.manager_active !== 0 } : null,
    })),
  };
}

/** The choices for the filter lists, and the overall counts. */
export function employeeFacets() {
  const d = db();
  const list = (col: "department" | "designation") =>
    d.prepare(
      `SELECT ${col} AS name, SUM(status = 'active') AS count FROM employees WHERE ${col} <> '' GROUP BY ${col} ORDER BY ${col} COLLATE NOCASE`,
    ).all() as unknown as { name: string; count: number }[];
  const t = d.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(status = 'active'), 0) AS active FROM employees").get() as { total: number; active: number };
  return { departments: list("department"), designations: list("designation"), total: t.total, active: t.active, left: t.total - t.active };
}