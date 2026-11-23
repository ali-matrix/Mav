import { db, type AssetDoc } from "@/lib/db";
import type { Document } from "mongodb";

type CountRow = Document & { key: string; count: number };
type CategoryRow = Document & { key: string; count: number; cost: number };
type Totals = Document & { total: number; inUse: number; inStore: number; maintenance: number; value: number };

export async function dashboardData() {
  const database = await db();
  const assets = database.collection<AssetDoc>("assets");
  const active = { status: { $ne: "Disposed" } };
  const now = new Date();
  const ymd = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const [totalsRow, categoryRows, departments, warrantyExpiring, recentAssignments] = await Promise.all([
    assets.aggregate<Totals>([
      { $match: active },
      { $group: {
        _id: null,
        total: { $sum: 1 },
        inUse: { $sum: { $cond: [{ $eq: ["$status", "In Use"] }, 1, 0] } },
        inStore: { $sum: { $cond: [{ $eq: ["$status", "In Store"] }, 1, 0] } },
        maintenance: { $sum: { $cond: [{ $eq: ["$status", "Under Maintenance"] }, 1, 0] } },
        value: { $sum: { $ifNull: ["$purchaseCost", 0] } },
      } },
    ]).next(),
    assets.aggregate<CategoryRow>([
      { $match: active },
      { $lookup: { from: "categories", localField: "categoryId", foreignField: "_id", as: "category" } },
      { $unwind: "$category" },
      { $lookup: { from: "categories", localField: "category.parentId", foreignField: "_id", as: "parent" } },
      { $unwind: { path: "$parent", preserveNullAndEmptyArrays: true } },
      { $group: {
        _id: { $ifNull: ["$parent.name", "$category.name"] },
        count: { $sum: 1 },
        cost: { $sum: { $ifNull: ["$purchaseCost", 0] } },
      } },
      { $project: { _id: 0, key: "$_id", count: 1, cost: 1 } },
      { $sort: { count: -1, key: 1 } },
    ], { collation: { locale: "en", strength: 2 } }).toArray(),
    assets.aggregate<CountRow>([
      { $match: active },
      { $lookup: { from: "employees", localField: "assignedEmployeeId", foreignField: "_id", as: "employee" } },
      { $unwind: { path: "$employee", preserveNullAndEmptyArrays: true } },
      { $group: {
        _id: { $cond: [{ $eq: [{ $ifNull: ["$employee.department", ""] }, ""] }, "Unassigned", "$employee.department"] },
        count: { $sum: 1 },
      } },
      { $project: { _id: 0, key: "$_id", count: 1 } },
      { $sort: { count: -1, key: 1 } },
    ], { collation: { locale: "en", strength: 2 } }).toArray(),
    assets.countDocuments({
      status: { $ne: "Disposed" },
      warrantyExpiry: { $gte: ymd(now), $lte: ymd(new Date(now.getTime() + 30 * 86_400_000)) },
    }),
    assets.aggregate<Document & {
      id: number; assetId: number; assignedAt: string; returnedAt: string | null; note: string; tag: string; asset: string;
      employee: string; employeeCode: string; department: string; category: string;
    }>([
      { $unwind: "$assignments" },
      { $lookup: { from: "employees", localField: "assignments.employeeId", foreignField: "_id", as: "employeeRecord" } },
      { $unwind: "$employeeRecord" },
      { $lookup: { from: "categories", localField: "categoryId", foreignField: "_id", as: "categoryRecord" } },
      { $unwind: "$categoryRecord" },
      { $addFields: { activityAt: { $ifNull: ["$assignments.returnedAt", "$assignments.assignedAt"] } } },
      { $sort: { activityAt: -1, "assignments.id": -1 } },
      { $limit: 10 },
      { $project: {
        _id: 0, id: "$assignments.id", assetId: "$_id", assignedAt: "$assignments.assignedAt",
        returnedAt: "$assignments.returnedAt", note: "$assignments.note", tag: "$assetTag", asset: "$name",
        employee: "$employeeRecord.name", employeeCode: "$employeeRecord.code",
        department: { $cond: [{ $eq: ["$employeeRecord.department", ""] }, "Unassigned", "$employeeRecord.department"] },
        category: "$categoryRecord.name",
      } },
    ]).toArray(),
  ]);

  return {
    totals: {
      total: totalsRow?.total ?? 0, inUse: totalsRow?.inUse ?? 0, inStore: totalsRow?.inStore ?? 0,
      maintenance: totalsRow?.maintenance ?? 0, warrantyExpiring, value: totalsRow?.value ?? 0,
    },
    categories: categoryRows.map(({ key, count }) => ({ key, count })),
    categoryCosts: categoryRows.map(({ key, cost }) => ({ key, value: cost }))
      .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key)),
    departments, recentAssignments,
  };
}
