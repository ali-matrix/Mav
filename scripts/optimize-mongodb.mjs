import { existsSync } from "node:fs";
import { MongoClient } from "mongodb";
import {
  assetSearchGrams, assetSearchExactTerms, assetSearchHasLongField,
  assignmentSearchGrams, assignmentSearchExactTerms, assignmentSearchHasLongField,
  assetSearchTextIsAscii, assignmentSearchTextIsAscii,
  SEARCH_EXACT_INDEX_NAME, SEARCH_INDEX_NAME, SEARCH_INDEX_VERSION,
} from "../lib/searchIndexCore.mjs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const databaseName = process.env.MONGODB_DB ?? "mav_asset_ims";
const client = new MongoClient(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/?replicaSet=rs0");
const batchSize = 1_000;
const previousSearchIndexNames = [
  "asset_search_grams_v1", "asset_search_trigrams_v2", "asset_search_ngrams_v3",
  "asset_search_exact_terms_v4", "asset_assignment_search_exact_terms_v4",
  "asset_assignment_search_ngrams_assigned_v3", "asset_assignment_search_ngrams_assigned_v4",
  "asset_search_long_text_ngrams_v4",
];

if (process.env.MAV_DB_MAINTENANCE !== "1") {
  throw new Error("Set MAV_DB_MAINTENANCE=1 after pausing application writes before running this migration.");
}

function searchRevisionFilter(asset) {
  return asset.searchRevision === undefined
    ? { searchRevision: { $exists: false } }
    : { searchRevision: asset.searchRevision };
}

async function backfillSearchGrams(database) {
  const assets = database.collection("assets");
  await Promise.all([
    database.collection("appMeta").updateOne(
      { _id: "assetSearch" },
      { $set: { ready: false, version: SEARCH_INDEX_VERSION, updatedAt: new Date().toISOString() } },
      { upsert: true },
    ),
    database.collection("appMeta").updateOne(
      { _id: "dashboardSummary" },
      { $set: { ready: false, version: 2, updatedAt: new Date().toISOString() } },
      { upsert: true },
    ),
  ]);
  const indexNames = (await assets.listIndexes().toArray()).map((index) => index.name);
  for (const indexName of [
    ...previousSearchIndexNames, SEARCH_INDEX_NAME,
    "asset_assignment_search_ngrams_v3", "asset_assignment_search_ngrams_assigned_v3",
  ]) {
    if (indexNames.includes(indexName)) await assets.dropIndex(indexName);
  }
  let remaining;
  let pass = 0;
  do {
    pass++;
    let batch = [];
    let scanned = 0;
    const cursor = assets.find(
      { searchIndexVersion: { $ne: SEARCH_INDEX_VERSION } },
      {
        projection: {
          _id: 1, assetTag: 1, name: 1, brand: 1, model: 1, serialNumber: 1, remarks: 1,
          assignments: 1, searchRevision: 1,
        },
        batchSize,
      },
    );
    for await (const asset of cursor) {
      batch.push({
        updateOne: {
          filter: { _id: asset._id, ...searchRevisionFilter(asset) },
          update: {
            $set: {
              searchGrams: assetSearchGrams(asset),
              searchExactTerms: assetSearchExactTerms(asset),
              searchHasLongField: assetSearchHasLongField(asset),
              searchAscii: assetSearchTextIsAscii(asset),
              assignmentSearchGrams: assignmentSearchGrams(asset),
              assignmentSearchExactTerms: assignmentSearchExactTerms(asset),
              assignmentSearchHasLongField: assignmentSearchHasLongField(asset),
              assignmentSearchAscii: assignmentSearchTextIsAscii(asset),
              searchIndexVersion: SEARCH_INDEX_VERSION,
              searchRevision: asset.searchRevision ?? 0,
            },
          },
        },
      });
      if (batch.length === batchSize) {
        await assets.bulkWrite(batch, { ordered: false });
        scanned += batch.length;
        batch = [];
        if (scanned % 100_000 === 0) console.log(`Search index pass ${pass}: ${scanned} records`);
      }
    }
    if (batch.length) {
      await assets.bulkWrite(batch, { ordered: false });
      scanned += batch.length;
    }
    remaining = await assets.countDocuments({ searchIndexVersion: { $ne: SEARCH_INDEX_VERSION } });
    console.log(`Search index pass ${pass} complete; ${remaining} records remain.`);
  } while (remaining > 0);

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
  const categoryIds = await database.collection("categories").distinct("_id");
  const invalidCategoryRefs = await assets.countDocuments({ categoryId: { $nin: categoryIds } });
  await database.collection("appMeta").updateOne(
    { _id: "assetSearch" },
    { $set: {
      ready: true, version: SEARCH_INDEX_VERSION, categoryRefsValid: invalidCategoryRefs === 0,
      updatedAt: new Date().toISOString(),
    } },
    { upsert: true },
  );
}

async function rebuildDashboardSummary(database) {
  const assets = database.collection("assets");
  const metrics = database.collection("dashboardMetrics");
  const activity = database.collection("dashboardActivity");
  const activityIndexNames = (await activity.listIndexes().toArray()).map((index) => index.name);
  for (const indexName of [
    "dashboard_activity_search_assigned_v3", "dashboard_activity_search_assigned_v4",
    "dashboard_activity_search_exact_v4", "dashboard_activity_assigned_ci",
    "dashboard_activity_returned_ci", "dashboard_activity_long_text_ngrams_v4",
  ]) {
    if (activityIndexNames.includes(indexName)) await activity.dropIndex(indexName);
  }
  await database.collection("appMeta").updateOne(
    { _id: "dashboardSummary" },
    { $set: { ready: false, version: 2, updatedAt: new Date().toISOString() } },
    { upsert: true },
  );
  await Promise.all([metrics.deleteMany({}), activity.deleteMany({})]);

  await assets.aggregate([
    { $match: { status: { $ne: "Disposed" } } },
    { $group: {
      _id: { categoryId: "$categoryId", employeeId: { $ifNull: ["$assignedEmployeeId", null] } },
      total: { $sum: 1 },
      inUse: { $sum: { $cond: [{ $eq: ["$status", "In Use"] }, 1, 0] } },
      inStore: { $sum: { $cond: [{ $eq: ["$status", "In Store"] }, 1, 0] } },
      maintenance: { $sum: { $cond: [{ $eq: ["$status", "Under Maintenance"] }, 1, 0] } },
      value: { $sum: { $ifNull: ["$purchaseCost", 0] } },
    } },
    { $project: {
      _id: { $concat: [
        { $toString: "$_id.categoryId" }, ":",
        { $ifNull: [{ $toString: "$_id.employeeId" }, "null"] },
      ] },
      categoryId: "$_id.categoryId", employeeId: "$_id.employeeId",
      total: 1, inUse: 1, inStore: 1, maintenance: 1, value: 1,
    } },
    { $merge: { into: "dashboardMetrics", on: "_id", whenMatched: "replace", whenNotMatched: "insert" } },
  ], { allowDiskUse: true }).toArray();

  await assets.aggregate([
    { $match: { "assignments.0": { $exists: true } } },
    { $project: { _id: 1, assetTag: 1, name: 1, categoryId: 1, assignments: 1 } },
    { $unwind: "$assignments" },
    { $project: {
      _id: "$assignments.id", id: "$assignments.id", assetId: "$_id",
      employeeId: "$assignments.employeeId", categoryId: 1,
      assetTag: 1, assetName: "$name",
      assignedAt: "$assignments.assignedAt", returnedAt: "$assignments.returnedAt",
      note: "$assignments.note",
      activityAt: { $ifNull: ["$assignments.returnedAt", "$assignments.assignedAt"] },
    } },
    { $merge: { into: "dashboardActivity", on: "_id", whenMatched: "replace", whenNotMatched: "insert" } },
  ], { allowDiskUse: true }).toArray();

  const activityCursor = activity.find({}, {
    projection: { _id: 1, assetTag: 1, assetName: 1, note: 1 }, batchSize,
  });
  let activityBatch = [];
  let indexedActivities = 0;
  for await (const row of activityCursor) {
    const searchAsset = { assetTag: row.assetTag, name: row.assetName, assignments: [{ note: row.note }] };
    activityBatch.push({
      updateOne: {
        filter: { _id: row._id },
        update: { $set: {
          searchGrams: assignmentSearchGrams(searchAsset),
          searchExactTerms: assignmentSearchExactTerms(searchAsset),
          searchAscii: assignmentSearchTextIsAscii(searchAsset),
          searchHasLongField: assignmentSearchHasLongField(searchAsset),
        } },
      },
    });
    if (activityBatch.length === batchSize) {
      await activity.bulkWrite(activityBatch, { ordered: false });
      indexedActivities += activityBatch.length;
      activityBatch = [];
    }
  }
  if (activityBatch.length) {
    await activity.bulkWrite(activityBatch, { ordered: false });
    indexedActivities += activityBatch.length;
  }
  console.log(`Indexed search text for ${indexedActivities} dashboard activity records.`);

  const incompleteActivities = await activity.countDocuments({ $or: [
    { assetTag: { $exists: false } }, { assetName: { $exists: false } },
    { searchGrams: { $exists: false } }, { searchAscii: { $exists: false } },
    { searchExactTerms: { $exists: false } }, { searchHasLongField: { $exists: false } },
  ] });
  if (incompleteActivities) {
    throw new Error(`Dashboard activity search metadata is incomplete for ${incompleteActivities} records.`);
  }

  await activity.createIndex({ activityAt: -1, id: -1 }, { name: "dashboard_activity_recent" });
  await activity.createIndex({ assignedAt: -1, id: -1 }, { name: "dashboard_activity_assigned" });
  await activity.createIndex({ returnedAt: -1, id: -1 }, { name: "dashboard_activity_returned" });
  await activity.createIndex(
    { assignedAt: -1, id: -1 },
    { name: "dashboard_activity_assigned_ci", collation: { locale: "en", strength: 2 } },
  );
  await activity.createIndex(
    { returnedAt: -1, id: -1 },
    { name: "dashboard_activity_returned_ci", collation: { locale: "en", strength: 2 } },
  );
  await activity.createIndex(
    { employeeId: 1, returnedAt: 1 }, { name: "dashboard_activity_employee_state" },
  );
  await activity.createIndex(
    { searchGrams: 1, searchAscii: 1, assignedAt: -1, id: -1 },
    { name: "dashboard_activity_search_assigned_v4", collation: { locale: "en", strength: 2 } },
  );
  await activity.createIndex(
    { searchExactTerms: 1, searchAscii: 1, assignedAt: -1, id: -1 },
    { name: "dashboard_activity_search_exact_v4", collation: { locale: "en", strength: 2 } },
  );
  await activity.createIndex(
    { searchGrams: 1, searchAscii: 1, assignedAt: -1, id: -1 },
    {
      name: "dashboard_activity_long_text_ngrams_v4",
      partialFilterExpression: { searchHasLongField: true },
      collation: { locale: "en", strength: 2 },
    },
  );
  const [totals] = await metrics.aggregate([
    { $group: {
      _id: null, total: { $sum: "$total" }, inUse: { $sum: "$inUse" },
      inStore: { $sum: "$inStore" }, maintenance: { $sum: "$maintenance" }, value: { $sum: "$value" },
    } },
  ]).toArray();
  await database.collection("appMeta").updateOne(
    { _id: "dashboardSummary" },
    { $set: { ready: true, version: 2, updatedAt: new Date().toISOString() } },
    { upsert: true },
  );
  return totals ?? { total: 0, inUse: 0, inStore: 0, maintenance: 0, value: 0 };
}

try {
  await client.connect();
  const database = client.db(databaseName);
  const topology = await client.db("admin").command({ hello: 1 });
  if (!topology.setName && topology.msg !== "isdbgrid") {
    throw new Error("Live dashboard summaries require a MongoDB replica set or sharded cluster.");
  }
  const startedAt = Date.now();
  await backfillSearchGrams(database);
  const totals = await rebuildDashboardSummary(database);
  console.log(JSON.stringify({
    database: databaseName,
    replicaSet: topology.setName ?? "sharded",
    assetCount: await database.collection("assets").countDocuments({}),
    searchIndex: SEARCH_INDEX_NAME,
    dashboardMetrics: totals,
    activityRecords: await database.collection("dashboardActivity").countDocuments({}),
    elapsedSeconds: +((Date.now() - startedAt) / 1000).toFixed(1),
  }, null, 2));
} finally {
  await client.close();
}
