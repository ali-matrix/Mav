import { db, type AssetDoc, type CategoryDoc, type EmployeeDoc } from "@/lib/db";
import type { Document } from "mongodb";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const regex = (value: string) => ({ $regex: escapeRegex(value), $options: "i" });

type AssignmentRow = Document & {
  id: number; assetId: number; tag: string; asset: string; category: string; employeeName: string;
  employeeCode: string; department: string; employeeStatus: "active" | "left"; assignedAt: string;
  returnedAt: string | null; note: string;
};

export async function listAssignments(p: URLSearchParams) {
  const database = await db();
  const pageSize = Math.min(100, Math.max(1, parseInt(p.get("pageSize") ?? "25", 10) || 25));
  const q = (p.get("q") ?? "").trim().toLowerCase().slice(0, 100);
  const sortNames: Record<string, string> = {
    assigned: "assignments.assignedAt", returned: "assignments.returnedAt", asset: "asset.assetTag",
    employee: "employee.name", department: "employee.department",
  };
  const sortKey = sortNames[p.get("sort") ?? ""] ? (p.get("sort") as string) : "assigned";
  const direction = p.get("dir") === "asc" ? 1 : -1;
  const conditions: Document[] = [];
  const employeeId = p.has("employeeId") ? Number(p.get("employeeId")) : null;

  const state = p.get("state") ?? "all";
  if (state === "current") conditions.push({ "assignments.returnedAt": null });
  else if (state === "returned") conditions.push({ "assignments.returnedAt": { $ne: null } });
  if (p.get("left") === "1") {
    conditions.push({ "assignments.returnedAt": null }, { "employee.status": "left" });
  }

  const department = (p.get("department") ?? "").trim();
  if (department) conditions.push({ "employee.department": { $regex: `^${escapeRegex(department)}$`, $options: "i" } });

  const category = parseInt(p.get("category") ?? "", 10);
  if (Number.isInteger(category)) {
    const categoryRows = await database.collection<CategoryDoc>("categories")
      .find({ $or: [{ _id: category }, { parentId: category }] }, { projection: { _id: 1 } }).toArray();
    conditions.push({ "asset.categoryId": { $in: categoryRows.map((entry) => entry._id) } });
  }

  for (const term of q.split(/\s+/).filter(Boolean)) {
    const search = regex(term);
    conditions.push({
      $or: [
        { "asset.assetTag": search }, { "asset.name": search }, { "category.name": search },
        { "employee.name": search }, { "employee.code": search }, { "employee.department": search },
        { "assignments.note": search },
      ],
    });
  }

  const lookups: Document[] = [
    ...(employeeId === null ? [] : [{ $match: { "assignments.employeeId": employeeId } }]),
    { $unwind: "$assignments" },
    ...(employeeId === null ? [] : [{ $match: { "assignments.employeeId": employeeId } }]),
    { $lookup: { from: "employees", localField: "assignments.employeeId", foreignField: "_id", as: "employee" } },
    { $unwind: "$employee" },
    { $lookup: { from: "categories", localField: "categoryId", foreignField: "_id", as: "category" } },
    { $unwind: "$category" },
    { $addFields: { asset: { assetTag: "$assetTag", name: "$name", categoryId: "$categoryId" } } },
    ...(conditions.length ? [{ $match: { $and: conditions } }] : []),
  ];
  const assets = database.collection<AssetDoc>("assets");
  const collation = { locale: "en", strength: 2 as const };
  const count = await assets.aggregate<Document>([...lookups, { $count: "total" }], { collation }).next();
  const total = count?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, parseInt(p.get("page") ?? "1", 10) || 1));
  const rows = await assets.aggregate<AssignmentRow>([
    ...lookups,
    { $sort: { [sortNames[sortKey]]: direction, "assignments.id": -1 } },
    { $skip: (page - 1) * pageSize },
    { $limit: pageSize },
    { $project: {
      id: "$assignments.id", assetId: "$_id", tag: "$assetTag", asset: "$name", category: "$category.name",
      employeeName: "$employee.name", employeeCode: "$employee.code", department: "$employee.department",
      employeeStatus: "$employee.status", assignedAt: "$assignments.assignedAt",
      returnedAt: "$assignments.returnedAt", note: "$assignments.note",
    } },
  ], { collation }).toArray();

  return {
    total, page, pages, pageSize,
    rows: rows.map((row) => ({
      id: row.id, assetId: row.assetId, tag: row.tag, asset: row.asset, category: row.category,
      employeeName: row.employeeName, employeeCode: row.employeeCode, department: row.department,
      employeeLeft: row.employeeStatus === "left", assignedAt: row.assignedAt, returnedAt: row.returnedAt, note: row.note,
    })),
  };
}

export async function assignmentSummary() {
  const database = await db();
  const [result] = await database.collection<AssetDoc>("assets").aggregate<Document>([
    { $unwind: "$assignments" },
    { $lookup: { from: "employees", localField: "assignments.employeeId", foreignField: "_id", as: "employee" } },
    { $unwind: "$employee" },
    { $group: {
      _id: null,
      current: { $sum: { $cond: [{ $eq: ["$assignments.returnedAt", null] }, 1, 0] } },
      returned: { $sum: { $cond: [{ $ne: ["$assignments.returnedAt", null] }, 1, 0] } },
      withLeft: { $sum: { $cond: [{ $and: [{ $eq: ["$assignments.returnedAt", null] }, { $eq: ["$employee.status", "left"] }] }, 1, 0] } },
    } },
  ]).toArray();
  return { current: result?.current ?? 0, returned: result?.returned ?? 0, withLeft: result?.withLeft ?? 0 };
}
