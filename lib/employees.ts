import { db, type EmployeeDoc } from "@/lib/db";
import type { Document } from "mongodb";

const PAGE_MAX = 100;
const SORTS: Record<string, string> = {
  name: "name", code: "code", department: "department", designation: "designation", joined: "joiningDate",
};
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listEmployees(p: URLSearchParams) {
  const database = await db();
  const q = (p.get("q") ?? "").trim().toLowerCase().slice(0, 100);
  const department = p.get("department") ?? "";
  const designation = p.get("designation") ?? "";
  const status = p.get("status") ?? "active";
  const pageSize = Math.min(PAGE_MAX, Math.max(1, parseInt(p.get("pageSize") ?? "25", 10) || 25));
  const sortKey = SORTS[p.get("sort") ?? ""] ? (p.get("sort") as string) : "name";
  const direction = p.get("dir") === "desc" ? -1 : 1;
  const filter: Document = {};
  if (status === "active" || status === "left") filter.status = status;
  if (department) filter.department = department;
  if (designation) filter.designation = designation;
  const terms = q.split(/\s+/).filter(Boolean);
  if (terms.length) {
    filter.$and = terms.map((term) => ({ searchText: { $regex: escapeRegex(term), $options: "i" } }));
  }

  const employees = database.collection<EmployeeDoc>("employees");
  const total = await employees.countDocuments(filter);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, parseInt(p.get("page") ?? "1", 10) || 1));
  const rows = await employees.find(filter).sort({ [SORTS[sortKey]]: direction, _id: 1 })
    .skip((page - 1) * pageSize).limit(pageSize).toArray();

  return {
    total, page, pages, pageSize,
    rows: rows.map((row) => ({
      id: row._id, code: row.code, name: row.name, designation: row.designation, positionTitle: row.positionTitle,
      department: row.department, division: row.division, email: row.email, phone: row.phone, intercom: row.intercomExt,
      joined: row.joiningDate, status: row.status,
      manager: row.managerName ? {
        name: row.managerName, designation: row.managerDesignation, active: row.managerActive !== 0,
      } : null,
    })),
  };
}

type Facet = Document & { name: string; count: number };
async function facet(field: "department" | "designation") {
  const database = await db();
  return database.collection<EmployeeDoc>("employees").aggregate<Facet>([
    { $match: { [field]: { $ne: "" } } },
    { $group: { _id: `$${field}`, name: { $first: `$${field}` }, count: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } } } },
    { $sort: { name: 1 } },
  ], { collation: { locale: "en", strength: 2 } }).toArray();
}

export async function employeeFacets() {
  const database = await db();
  const employees = database.collection<EmployeeDoc>("employees");
  const [departments, designations, total, active] = await Promise.all([
    facet("department"),
    facet("designation"),
    employees.countDocuments(),
    employees.countDocuments({ status: "active" }),
  ]);
  return {
    departments: departments.map(({ name, count }) => ({ name, count })),
    designations: designations.map(({ name, count }) => ({ name, count })),
    total, active, left: total - active,
  };
}
