import {
  db, supportsMultiDocumentTransactions, type AssetDoc, type CategoryDoc, type EmployeeDoc,
} from "@/lib/db";
import type { AnyBulkWriteOperation, ClientSession, Db, Document } from "mongodb";
import {
  assignmentSearchGrams, assignmentSearchExactTerms, assignmentSearchHasLongField,
  assignmentSearchTextIsAscii,
} from "@/lib/searchIndex";

type SummaryBucket = Document & {
  _id: { categoryId: number; employeeId: number | null };
  total: number; inUse: number; inStore: number; maintenance: number; value: number; warrantyExpiring: number;
};
type RecentAssignment = Document & {
  id: number; assetId: number; assignedAt: string; returnedAt: string | null; note: string; tag: string; asset: string;
  employee: string; employeeCode: string; department: string; category: string;
};
type DashboardMetric = Document & {
  _id: string; categoryId: number; employeeId: number | null;
  total: number; inUse: number; inStore: number; maintenance: number; value: number;
};
type DashboardActivity = Document & {
  _id: number; id: number; assetId: number; employeeId: number; categoryId: number;
  assignedAt: string; returnedAt: string | null; note: string; activityAt: string;
  assetTag: string; assetName: string; searchGrams: string[]; searchExactTerms: string[];
  searchAscii: boolean; searchHasLongField: boolean;
};

function metricContribution(asset: AssetDoc | null) {
  if (!asset || asset.status === "Disposed") return null;
  return {
    categoryId: asset.categoryId,
    employeeId: asset.assignedEmployeeId ?? null,
    total: 1,
    inUse: asset.status === "In Use" ? 1 : 0,
    inStore: asset.status === "In Store" ? 1 : 0,
    maintenance: asset.status === "Under Maintenance" ? 1 : 0,
    value: asset.purchaseCost ?? 0,
  };
}

export async function dashboardSummaryReady(database: Db, session?: ClientSession) {
  if (!supportsMultiDocumentTransactions()) return false;
  return !!(await database.collection<Document & { _id: string }>("appMeta").findOne(
    { _id: "dashboardSummary", ready: true, version: 2 },
    { projection: { _id: 1 }, ...(session ? { session } : {}) },
  ));
}

export async function applyDashboardMetricChange(
  database: Db,
  before: AssetDoc | null,
  after: AssetDoc | null,
  session: ClientSession,
) {
  const changes = new Map<string, {
    categoryId: number; employeeId: number | null;
    total: number; inUse: number; inStore: number; maintenance: number; value: number;
  }>();
  const accumulate = (asset: AssetDoc | null, direction: 1 | -1) => {
    const contribution = metricContribution(asset);
    if (!contribution) return;
    const key = `${contribution.categoryId}:${contribution.employeeId ?? "null"}`;
    const change = changes.get(key) ?? {
      categoryId: contribution.categoryId, employeeId: contribution.employeeId,
      total: 0, inUse: 0, inStore: 0, maintenance: 0, value: 0,
    };
    change.total += direction * contribution.total;
    change.inUse += direction * contribution.inUse;
    change.inStore += direction * contribution.inStore;
    change.maintenance += direction * contribution.maintenance;
    change.value += direction * contribution.value;
    changes.set(key, change);
  };
  accumulate(before, -1);
  accumulate(after, 1);

  const metrics = database.collection<DashboardMetric>("dashboardMetrics");
  for (const [key, change] of changes) {
    const { categoryId, employeeId, ...increments } = change;
    if (!Object.values(increments).some((value) => value !== 0)) continue;
    await metrics.updateOne(
      { _id: key },
      { $setOnInsert: { categoryId, employeeId }, $inc: increments },
      { upsert: true, session },
    );
    const updated = await metrics.findOne({ _id: key }, { session });
    if (!updated) throw new Error(`Dashboard summary bucket ${key} disappeared during its update.`);
    if (updated.total < 0 || updated.inUse < 0 || updated.inStore < 0 || updated.maintenance < 0) {
      throw new Error(`Dashboard summary would become negative for bucket ${key}.`);
    }
    if (updated.total === 0 && updated.inUse === 0 && updated.inStore === 0 && updated.maintenance === 0) {
      if (updated.value !== 0) await metrics.updateOne({ _id: key }, { $set: { value: 0 } }, { session });
      await metrics.deleteOne(
        { _id: key, total: 0, inUse: 0, inStore: 0, maintenance: 0, value: 0 },
        { session },
      );
    }
  }
}

export async function closeDashboardActivity(
  database: Db,
  assignments: AssetDoc["assignments"],
  returnedAt: string,
  session: ClientSession,
) {
  const ids = assignments.filter((assignment) => assignment.returnedAt === null).map((assignment) => assignment.id);
  if (!ids.length) return;
  const result = await database.collection<DashboardActivity>("dashboardActivity").updateMany(
    { _id: { $in: ids } },
    { $set: { returnedAt, activityAt: returnedAt } },
    { session },
  );
  if (result.matchedCount !== ids.length) {
    throw new Error("Dashboard assignment activity is out of sync with the asset history.");
  }
}

export async function addDashboardActivity(
  database: Db,
  asset: Pick<AssetDoc, "_id" | "assetTag" | "name" | "categoryId">,
  assignment: AssetDoc["assignments"][number],
  session: ClientSession,
) {
  const searchAsset = {
    assetTag: asset.assetTag, name: asset.name, assignments: [assignment],
  };
  await database.collection<DashboardActivity>("dashboardActivity").insertOne({
    _id: assignment.id, id: assignment.id, assetId: asset._id, employeeId: assignment.employeeId,
    categoryId: asset.categoryId, assetTag: asset.assetTag, assetName: asset.name,
    assignedAt: assignment.assignedAt, returnedAt: assignment.returnedAt, note: assignment.note,
    activityAt: assignment.returnedAt ?? assignment.assignedAt,
    searchGrams: assignmentSearchGrams(searchAsset),
    searchExactTerms: assignmentSearchExactTerms(searchAsset),
    searchAscii: assignmentSearchTextIsAscii(searchAsset),
    searchHasLongField: assignmentSearchHasLongField(searchAsset),
  }, { session });
}

export async function updateDashboardAssetActivitySearch(
  database: Db,
  asset: Pick<AssetDoc, "_id" | "assetTag" | "name" | "categoryId">,
  session: ClientSession,
) {
  const activity = database.collection<DashboardActivity>("dashboardActivity");
  const cursor = activity.find(
    { assetId: asset._id },
    { projection: { _id: 1, note: 1 }, session },
  );
  let batch: AnyBulkWriteOperation<DashboardActivity>[] = [];
  for await (const row of cursor) {
    const searchAsset = {
      assetTag: asset.assetTag, name: asset.name, assignments: [{ note: row.note }],
    };
    batch.push({
      updateOne: {
        filter: { _id: row._id, assetId: asset._id },
        update: { $set: {
          categoryId: asset.categoryId, assetTag: asset.assetTag, assetName: asset.name,
          searchGrams: assignmentSearchGrams(searchAsset),
          searchExactTerms: assignmentSearchExactTerms(searchAsset),
          searchAscii: assignmentSearchTextIsAscii(searchAsset),
          searchHasLongField: assignmentSearchHasLongField(searchAsset),
        } },
      },
    });
    if (batch.length === 500) {
      await activity.bulkWrite(batch, { ordered: false, session });
      batch = [];
    }
  }
  if (batch.length) await activity.bulkWrite(batch, { ordered: false, session });
}

export async function dashboardData() {
  const database = await db();
  const assets = database.collection<AssetDoc>("assets");
  const now = new Date();
  const ymd = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const warrantyStart = ymd(now);
  const warrantyEnd = ymd(new Date(now.getTime() + 30 * 86_400_000));
  const active = { $ne: ["$status", "Disposed"] };
  const summaryReady = await dashboardSummaryReady(database);
  const summaryPromise = summaryReady
    ? database.collection<DashboardMetric>("dashboardMetrics").find({}).toArray().then((rows) =>
      rows.map((row): SummaryBucket => ({
        _id: { categoryId: row.categoryId, employeeId: row.employeeId },
        total: row.total, inUse: row.inUse, inStore: row.inStore, maintenance: row.maintenance,
        value: row.value, warrantyExpiring: 0,
      })),
    )
    : assets.aggregate<SummaryBucket>([
      { $project: {
        categoryId: 1, assignedEmployeeId: 1, status: 1, purchaseCost: 1, warrantyExpiry: 1,
      } },
      { $group: {
        _id: { categoryId: "$categoryId", employeeId: "$assignedEmployeeId" },
        total: { $sum: { $cond: [active, 1, 0] } },
        inUse: { $sum: { $cond: [{ $eq: ["$status", "In Use"] }, 1, 0] } },
        inStore: { $sum: { $cond: [{ $eq: ["$status", "In Store"] }, 1, 0] } },
        maintenance: { $sum: { $cond: [{ $eq: ["$status", "Under Maintenance"] }, 1, 0] } },
        value: { $sum: { $cond: [active, { $ifNull: ["$purchaseCost", 0] }, 0] } },
        warrantyExpiring: { $sum: { $cond: [{ $and: [
          active,
          { $gte: ["$warrantyExpiry", warrantyStart] },
          { $lte: ["$warrantyExpiry", warrantyEnd] },
        ] }, 1, 0] } },
      } },
    ]).toArray();
  const recentPromise = summaryReady
    ? database.collection<DashboardActivity>("dashboardActivity").aggregate<RecentAssignment>([
      { $sort: { activityAt: -1, id: -1 } },
      { $limit: 10 },
      { $lookup: { from: "assets", localField: "assetId", foreignField: "_id", as: "assetRecord" } },
      { $unwind: "$assetRecord" },
      { $lookup: { from: "employees", localField: "employeeId", foreignField: "_id", as: "employeeRecord" } },
      { $unwind: "$employeeRecord" },
      { $lookup: { from: "categories", localField: "assetRecord.categoryId", foreignField: "_id", as: "categoryRecord" } },
      { $unwind: "$categoryRecord" },
      { $project: {
        _id: 0, id: 1, assetId: 1, assignedAt: 1, returnedAt: 1, note: 1,
        tag: "$assetRecord.assetTag", asset: "$assetRecord.name",
        employee: "$employeeRecord.name", employeeCode: "$employeeRecord.code",
        department: { $cond: [{ $eq: ["$employeeRecord.department", ""] }, "Unassigned", "$employeeRecord.department"] },
        category: "$categoryRecord.name",
      } },
    ]).toArray()
    : assets.aggregate<RecentAssignment>([
      { $match: { "assignments.0": { $exists: true } } },
      { $project: { _id: 1, assetTag: 1, name: 1, categoryId: 1, assignments: 1 } },
      { $unwind: "$assignments" },
      { $addFields: { activityAt: { $ifNull: ["$assignments.returnedAt", "$assignments.assignedAt"] } } },
      { $sort: { activityAt: -1, "assignments.id": -1 } },
      { $limit: 10 },
      { $lookup: { from: "employees", localField: "assignments.employeeId", foreignField: "_id", as: "employeeRecord" } },
      { $unwind: "$employeeRecord" },
      { $lookup: { from: "categories", localField: "categoryId", foreignField: "_id", as: "categoryRecord" } },
      { $unwind: "$categoryRecord" },
      { $project: {
        _id: 0, id: "$assignments.id", assetId: "$_id", assignedAt: "$assignments.assignedAt",
        returnedAt: "$assignments.returnedAt", note: "$assignments.note", tag: "$assetTag", asset: "$name",
        employee: "$employeeRecord.name", employeeCode: "$employeeRecord.code",
        department: { $cond: [{ $eq: ["$employeeRecord.department", ""] }, "Unassigned", "$employeeRecord.department"] },
        category: "$categoryRecord.name",
      } },
    ]).toArray();
  const [summary, recentAssignments, categoryDocs, employeeDocs, warrantyExpiring] = await Promise.all([
    summaryPromise,
    recentPromise,
    database.collection<CategoryDoc>("categories").find({}, { projection: { _id: 1, name: 1, parentId: 1 } }).toArray(),
    database.collection<EmployeeDoc>("employees").find({}, { projection: { _id: 1, department: 1 } }).toArray(),
    summaryReady
      ? assets.countDocuments({
        status: { $ne: "Disposed" }, warrantyExpiry: { $gte: warrantyStart, $lte: warrantyEnd },
      })
      : Promise.resolve(0),
  ]);

  const categoryById = new Map(categoryDocs.map((category) => [category._id, category]));
  const employeeById = new Map(employeeDocs.map((employee) => [employee._id, employee]));
  const categoryTotals = new Map<string, { key: string; count: number; cost: number }>();
  const departmentTotals = new Map<string, { key: string; count: number }>();
  const totals = { total: 0, inUse: 0, inStore: 0, maintenance: 0, warrantyExpiring: 0, value: 0 };

  for (const row of summary) {
    totals.total += row.total;
    totals.inUse += row.inUse;
    totals.inStore += row.inStore;
    totals.maintenance += row.maintenance;
    totals.warrantyExpiring += row.warrantyExpiring;
    totals.value += row.value;

    if (row.total === 0) continue;

    const category = categoryById.get(row._id.categoryId);
    if (category) {
      const key = category.parentId === null
        ? category.name
        : categoryById.get(category.parentId)?.name ?? category.name;
      const total = categoryTotals.get(key) ?? { key, count: 0, cost: 0 };
      total.count += row.total;
      total.cost += row.value;
      categoryTotals.set(key, total);
    }
    const employee = row._id.employeeId === null ? null : employeeById.get(row._id.employeeId);
    const key = employee?.department || "Unassigned";
    const normalized = key.toLocaleLowerCase("en");
    const total = departmentTotals.get(normalized) ?? { key, count: 0 };
    total.count += row.total;
    departmentTotals.set(normalized, total);
  }
  if (summaryReady) totals.warrantyExpiring = warrantyExpiring;

  const categoryRows = [...categoryTotals.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const categoryCosts = categoryRows.map(({ key, cost }) => ({ key, value: cost }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));

  return {
    totals,
    categories: categoryRows.map(({ key, count }) => ({ key, count })),
    categoryCosts,
    departments: [...departmentTotals.values()]
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
    recentAssignments,
  };
}
