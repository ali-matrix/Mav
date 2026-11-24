import { db, type AssetDoc, type CategoryDoc, type EmployeeDoc } from "@/lib/db";
import { assetSearchIndexReady, indexedSubstringMatch, SEARCH_INDEX_VERSION } from "@/lib/searchIndex";
import { dashboardSummaryReady } from "@/lib/dashboard";
import type { Document } from "mongodb";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const regex = (value: string) => ({ $regex: escapeRegex(value), $options: "i" });

type AssignmentRow = Document & {
  id: number; assetId: number; tag: string; asset: string; category: string; employeeName: string;
  employeeCode: string; department: string; employeeStatus: "active" | "left"; assignedAt: string;
  returnedAt: string | null; note: string;
};
type SortedAssignmentRow = Document & {
  id: number; assetId: number; tag: string; asset: string; categoryId: number; employeeId: number;
  assignedAt: string; returnedAt: string | null; note: string;
};
type ActivityAssignmentRow = Document & {
  id: number; assetId: number; tag: string; asset: string; category: string; employeeName: string;
  employeeCode: string; department: string; employeeStatus: "active" | "left"; assignedAt: string;
  returnedAt: string | null; note: string;
};

async function listDashboardActivityAssignments(database: Awaited<ReturnType<typeof db>>, p: URLSearchParams) {
  const sortNames: Record<string, string> = {
    assigned: "assignedAt", returned: "returnedAt", asset: "assetTag",
    employee: "employee.name", department: "employee.department",
  };
  const requestedSort = p.get("sort") ?? "assigned";
  const sortKey = sortNames[requestedSort] ? requestedSort : "assigned";

  const pageSize = Math.min(100, Math.max(1, parseInt(p.get("pageSize") ?? "25", 10) || 25));
  const direction = p.get("dir") === "asc" ? 1 : -1;
  const filters: Document[] = [];
  const employeeId = p.has("employeeId") ? Number(p.get("employeeId")) : null;
  if (employeeId !== null) filters.push({ employeeId });

  const state = p.get("state") ?? "all";
  if (state === "current") filters.push({ returnedAt: null });
  else if (state === "returned") filters.push({ returnedAt: { $ne: null } });
  if (p.get("left") === "1") filters.push({ returnedAt: null });

  const department = (p.get("department") ?? "").trim();
  const employeeFilter: Document = {};
  if (p.get("left") === "1") employeeFilter.status = "left";
  if (department) employeeFilter.department = { $regex: `^${escapeRegex(department)}$`, $options: "i" };
  if (Object.keys(employeeFilter).length) {
    const employeeRows = await database.collection<EmployeeDoc>("employees").find(
      employeeFilter, { projection: { _id: 1 } },
    ).toArray();
    filters.push({ employeeId: { $in: employeeRows.map((employee) => employee._id) } });
  }

  const category = parseInt(p.get("category") ?? "", 10);
  if (Number.isInteger(category)) {
    const categoryRows = await database.collection<CategoryDoc>("categories")
      .find({ $or: [{ _id: category }, { parentId: category }] }, { projection: { _id: 1 } }).toArray();
    filters.push({ categoryId: { $in: categoryRows.map((entry) => entry._id) } });
  }

  const terms = (p.get("q") ?? "").trim().toLowerCase().slice(0, 100).split(/\s+/).filter(Boolean);
  const searchPrefilters: Document[] = [];
  if (terms.length) {
    const searchIndexReady = await assetSearchIndexReady(database);
    const employeeSearch = terms.flatMap((term) => {
      const search = regex(term);
      return [{ name: search }, { code: search }, { department: search }];
    });
    const categorySearch = terms.map((term) => ({ name: regex(term) }));
    const [employeeMatches, categoryMatches] = await Promise.all([
      database.collection<EmployeeDoc>("employees")
        .find({ $or: employeeSearch }, { projection: { _id: 1, name: 1, code: 1, department: 1 } }).toArray(),
      database.collection<CategoryDoc>("categories")
        .find({ $or: categorySearch }, { projection: { _id: 1, name: 1 } }).toArray(),
    ]);

    for (const term of terms) {
      const search = regex(term);
      const textMatch: Document = { $or: [
        { $expr: { $regexMatch: {
          input: { $concat: [
            { $ifNull: ["$assetTag", ""] }, "\n", { $ifNull: ["$assetName", ""] },
          ] },
          regex: escapeRegex(term),
          options: "i",
        } } },
        { note: search },
      ] };
      const indexedTextMatch = searchIndexReady
        ? indexedSubstringMatch(
          "searchGrams", "searchAscii", "searchExactTerms", "searchHasLongField", term, textMatch,
        )
        : textMatch;
      const matches = new RegExp(escapeRegex(term), "i");
      const employeeIds = employeeMatches
        .filter((employee) => matches.test(employee.name) || matches.test(employee.code) || matches.test(employee.department))
        .map((employee) => employee._id);
      const categoryIds = categoryMatches
        .filter((entry) => matches.test(entry.name))
        .map((entry) => entry._id);
      const candidates: Document[] = Array.isArray(indexedTextMatch.$or)
        ? indexedTextMatch.$or
        : [indexedTextMatch];
      if (employeeIds.length) candidates.push({ employeeId: { $in: employeeIds } });
      if (categoryIds.length) candidates.push({ categoryId: { $in: categoryIds } });
      searchPrefilters.push({ $or: candidates });
    }
  }

  const collation = { locale: "en", strength: 2 as const };
  const useCollation = terms.length > 0 || sortKey === "asset";
  const aggregateOptions = useCollation ? { collation } : {};
  const conditions = [...filters, ...searchPrefilters];
  const query = conditions.length ? { $and: conditions } : {};
  const activity = database.collection("dashboardActivity");
  const countOptions = terms.length
    ? { collation }
    : conditions.length ? {} : { hint: "_id_" };
  const total = await activity.countDocuments(query, countOptions);
  const pageNumber = Math.max(1, parseInt(p.get("page") ?? "1", 10) || 1);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, pageNumber);
  const employeeSort = sortKey === "employee" || sortKey === "department";
  if (employeeSort) {
    const [grouped, employeeRows, categoryRows] = await Promise.all([
      activity.aggregate<Document & {
        _id: { employeeId: number; categoryId: number }; count: number;
      }>([
        { $match: query },
        { $group: { _id: { employeeId: "$employeeId", categoryId: "$categoryId" }, count: { $sum: 1 } } },
      ], aggregateOptions).toArray(),
      database.collection<EmployeeDoc>("employees").find(
        employeeId === null ? {} : { _id: employeeId },
        { projection: { _id: 1, name: 1, code: 1, department: 1, status: 1 } },
      ).toArray(),
      database.collection<CategoryDoc>("categories")
        .find({}, { projection: { _id: 1, name: 1 } }).toArray(),
    ]);
    const employeeById = new Map(employeeRows.map((employee) => [employee._id, employee]));
    const categoryById = new Map(categoryRows.map((entry) => [entry._id, entry]));
    const categoryIds = categoryRows.map((entry) => entry._id);
    const countByEmployee = new Map<number, number>();
    for (const row of grouped) {
      if (!employeeById.has(row._id.employeeId) || !categoryById.has(row._id.categoryId)) continue;
      countByEmployee.set(
        row._id.employeeId,
        (countByEmployee.get(row._id.employeeId) ?? 0) + row.count,
      );
    }
    const sortGroups = new Map<string, { value: string; employeeIds: number[]; count: number }>();
    for (const employee of employeeRows) {
      const count = countByEmployee.get(employee._id) ?? 0;
      if (count === 0) continue;
      const value = sortKey === "employee" ? employee.name : employee.department;
      const key = value.toLocaleLowerCase("en");
      const group = sortGroups.get(key) ?? { value, employeeIds: [], count: 0 };
      group.employeeIds.push(employee._id);
      group.count += count;
      sortGroups.set(key, group);
    }
    const orderedGroups = [...sortGroups.values()].sort(
      (a, b) => direction * a.value.localeCompare(b.value, "en", { sensitivity: "base" }),
    );
    let remainingSkip = (page - 1) * pageSize;
    let remainingTake = pageSize;
    const slices: { employeeIds: number[]; skip: number; take: number }[] = [];
    for (const group of orderedGroups) {
      if (remainingTake === 0) break;
      if (remainingSkip >= group.count) {
        remainingSkip -= group.count;
        continue;
      }
      const take = Math.min(remainingTake, group.count - remainingSkip);
      slices.push({ employeeIds: group.employeeIds, skip: remainingSkip, take });
      remainingTake -= take;
      remainingSkip = 0;
    }
    const buckets = await Promise.all(slices.map((slice) => activity.aggregate<SortedAssignmentRow>([
      { $match: { $and: [
        ...conditions,
        { categoryId: { $in: categoryIds } },
        { employeeId: { $in: slice.employeeIds } },
      ] } },
      { $sort: { _id: -1 } },
      { $skip: slice.skip },
      { $limit: slice.take },
      { $project: {
        id: "$_id", assetId: 1, tag: "$assetTag", asset: "$assetName", categoryId: 1,
        employeeId: 1, assignedAt: 1, returnedAt: 1, note: 1,
      } },
    ], aggregateOptions).toArray()));
    return {
      total, page, pages, pageSize,
      rows: buckets.flatMap((bucket) => bucket.map((row) => {
        const employee = employeeById.get(row.employeeId);
        return {
          id: row.id, assetId: row.assetId, tag: row.tag, asset: row.asset,
          category: categoryById.get(row.categoryId)?.name ?? "",
          employeeName: employee?.name ?? "", employeeCode: employee?.code ?? "",
          department: employee?.department ?? "", employeeLeft: employee?.status === "left",
          assignedAt: row.assignedAt, returnedAt: row.returnedAt, note: row.note,
        };
      })),
    };
  }
  if (!total) return { total, page, pages, pageSize, rows: [] };
  const dateSortField = sortKey === "assigned" ? "assignedAt" : sortKey === "returned" ? "returnedAt" : null;
  const orderedPageIndex = dateSortField && total >= 5_000
    ? `dashboard_activity_${sortKey}${terms.length ? "_ci" : ""}`
    : null;
  const rows = await activity.aggregate<ActivityAssignmentRow>([
    { $match: query },
    { $sort: { [sortNames[sortKey]]: direction, id: -1 } },
    { $skip: (page - 1) * pageSize },
    { $limit: pageSize },
    { $lookup: { from: "employees", localField: "employeeId", foreignField: "_id", as: "employee" } },
    { $unwind: "$employee" },
    { $lookup: { from: "categories", localField: "categoryId", foreignField: "_id", as: "category" } },
    { $unwind: "$category" },
    { $project: {
      id: 1, assetId: 1, tag: "$assetTag", asset: "$assetName", category: "$category.name",
      employeeName: "$employee.name", employeeCode: "$employee.code", department: "$employee.department",
      employeeStatus: "$employee.status", assignedAt: 1, returnedAt: 1, note: 1,
    } },
  ], {
    ...aggregateOptions,
    ...(orderedPageIndex ? { hint: orderedPageIndex } : {}),
  }).toArray();

  return {
    total, page, pages, pageSize,
    rows: rows.map((row) => ({
      id: row.id, assetId: row.assetId, tag: row.tag, asset: row.asset, category: row.category,
      employeeName: row.employeeName, employeeCode: row.employeeCode, department: row.department,
      employeeLeft: row.employeeStatus === "left", assignedAt: row.assignedAt,
      returnedAt: row.returnedAt, note: row.note,
    })),
  };
}

export async function listAssignments(p: URLSearchParams) {
  const database = await db();
  if (await dashboardSummaryReady(database)) {
    return listDashboardActivityAssignments(database, p);
  }
  const pageSize = Math.min(100, Math.max(1, parseInt(p.get("pageSize") ?? "25", 10) || 25));
  const q = (p.get("q") ?? "").trim().toLowerCase().slice(0, 100);
  const sortNames: Record<string, string> = {
    assigned: "assignments.assignedAt", returned: "assignments.returnedAt", asset: "asset.assetTag",
    employee: "employee.name", department: "employee.department",
  };
  const sortKey = sortNames[p.get("sort") ?? ""] ? (p.get("sort") as string) : "assigned";
  const direction = p.get("dir") === "asc" ? 1 : -1;
  const assetConditions: Document[] = [];
  const assignmentConditions: Document[] = [];
  const searchPrefilters: Document[] = [];
  assetConditions.push({ "assignments.0": { $exists: true } });
  const employeeId = p.has("employeeId") ? Number(p.get("employeeId")) : null;
  if (employeeId !== null) {
    assetConditions.push({ "assignments.employeeId": employeeId });
    assignmentConditions.push({ "assignments.employeeId": employeeId });
  }

  const state = p.get("state") ?? "all";
  if (state === "current") {
    assetConditions.push({ "assignments.returnedAt": null });
    assignmentConditions.push({ "assignments.returnedAt": null });
  } else if (state === "returned") {
    assetConditions.push({ "assignments.returnedAt": { $ne: null } });
    assignmentConditions.push({ "assignments.returnedAt": { $ne: null } });
  }
  const department = (p.get("department") ?? "").trim();
  const employeeFilter: Document = {};
  if (p.get("left") === "1") employeeFilter.status = "left";
  if (department) employeeFilter.department = { $regex: `^${escapeRegex(department)}$`, $options: "i" };
  if (Object.keys(employeeFilter).length) {
    const employeeRows = await database.collection<EmployeeDoc>("employees").find(
      employeeFilter, { projection: { _id: 1 } },
    ).toArray();
    const matchingEmployeeIds = employeeRows.map((employee) => employee._id);
    assetConditions.push({ "assignments.employeeId": { $in: matchingEmployeeIds } });
    assignmentConditions.push({ "assignments.employeeId": { $in: matchingEmployeeIds } });
  }
  if (p.get("left") === "1") {
    assetConditions.push({ "assignments.returnedAt": null });
    assignmentConditions.push({ "assignments.returnedAt": null });
  }

  const category = parseInt(p.get("category") ?? "", 10);
  if (Number.isInteger(category)) {
    const categoryRows = await database.collection<CategoryDoc>("categories")
      .find({ $or: [{ _id: category }, { parentId: category }] }, { projection: { _id: 1 } }).toArray();
    assetConditions.push({ categoryId: { $in: categoryRows.map((entry) => entry._id) } });
  }

  const terms = q.split(/\s+/).filter(Boolean);
  if (terms.length) {
    const searchIndexReady = await assetSearchIndexReady(database);
    if (searchIndexReady) assetConditions.push({ searchIndexVersion: SEARCH_INDEX_VERSION });
    const employeeSearch = terms.flatMap((term) => {
      const search = regex(term);
      return [{ name: search }, { code: search }, { department: search }];
    });
    const categorySearch = terms.map((term) => ({ name: regex(term) }));
    const [employeeMatches, categoryMatches] = await Promise.all([
      database.collection<EmployeeDoc>("employees")
        .find({ $or: employeeSearch }, { projection: { _id: 1, name: 1, code: 1, department: 1 } }).toArray(),
      database.collection<CategoryDoc>("categories")
        .find({ $or: categorySearch }, { projection: { _id: 1, name: 1 } }).toArray(),
    ]);

    for (const term of terms) {
      const search = regex(term);
      const assetNameMatch: Document = { $expr: { $regexMatch: {
        input: { $concat: [
          { $ifNull: ["$assetTag", ""] }, "\n", { $ifNull: ["$name", ""] },
        ] },
        regex: escapeRegex(term),
        options: "i",
      } } };
      const assetTextMatch: Document = { $expr: { $regexMatch: {
        input: { $concat: [
          { $ifNull: ["$assetTag", ""] }, "\n", { $ifNull: ["$name", ""] }, "\n",
          { $reduce: {
            input: { $ifNull: ["$assignments", []] },
            initialValue: "",
            in: { $concat: ["$$value", "\n", { $ifNull: ["$$this.note", ""] }] },
          } },
        ] },
        regex: escapeRegex(term),
        options: "i",
      } } };
      const indexedAssetTextMatch = searchIndexReady
        ? indexedSubstringMatch(
          "assignmentSearchGrams", "assignmentSearchAscii",
          "assignmentSearchExactTerms", "assignmentSearchHasLongField", term, assetTextMatch,
        )
        : assetTextMatch;
      const matches = new RegExp(escapeRegex(term), "i");
      const employeeIds = employeeMatches
        .filter((employee) => matches.test(employee.name) || matches.test(employee.code) || matches.test(employee.department))
        .map((employee) => employee._id);
      const categoryIds = categoryMatches.filter((category) => matches.test(category.name)).map((category) => category._id);
      const candidates: Document[] = [indexedAssetTextMatch];
      if (employeeIds.length) candidates.push({ "assignments.employeeId": { $in: employeeIds } });
      if (categoryIds.length) candidates.push({ categoryId: { $in: categoryIds } });
      searchPrefilters.push({ $or: candidates });
      const assignmentMatches: Document[] = [assetNameMatch, { "assignments.note": search }];
      if (employeeIds.length) assignmentMatches.push({ "assignments.employeeId": { $in: employeeIds } });
      if (categoryIds.length) assignmentMatches.push({ categoryId: { $in: categoryIds } });
      assignmentConditions.push({ $or: assignmentMatches });
    }
  }

  const assignmentStages: Document[] = [
    ...([...assetConditions, ...searchPrefilters].length
      ? [{ $match: { $and: [...assetConditions, ...searchPrefilters] } }]
      : []),
    { $unwind: "$assignments" },
    ...(assignmentConditions.length ? [{ $match: { $and: assignmentConditions } }] : []),
  ];
  const lookups: Document[] = [
    { $lookup: { from: "employees", localField: "assignments.employeeId", foreignField: "_id", as: "employee" } },
    { $unwind: "$employee" },
    { $lookup: { from: "categories", localField: "categoryId", foreignField: "_id", as: "category" } },
    { $unwind: "$category" },
    { $addFields: { asset: { assetTag: "$assetTag", name: "$name", categoryId: "$categoryId" } } },
  ];
  const assets = database.collection<AssetDoc>("assets");
  const collation = { locale: "en", strength: 2 as const };
  if (sortKey === "employee" || sortKey === "department") {
    const [employeeRows, categoryRows] = await Promise.all([
      database.collection<EmployeeDoc>("employees").find(
        employeeId === null ? {} : { _id: employeeId },
        { projection: { _id: 1, name: 1, code: 1, department: 1, status: 1 } },
      ).toArray(),
      database.collection<CategoryDoc>("categories").find({}, { projection: { _id: 1, name: 1 } }).toArray(),
    ]);
    const employeeById = new Map(employeeRows.map((employee) => [employee._id, employee]));
    const categoryById = new Map(categoryRows.map((category) => [category._id, category]));
    const employeeIds = employeeRows.map((employee) => employee._id);
    const categoryIds = categoryRows.map((category) => category._id);
    const grouped = await assets.aggregate<Document & {
      _id: { employeeId: number; categoryId: number }; count: number;
    }>([
      ...([...assetConditions, ...searchPrefilters].length
        ? [{ $match: { $and: [...assetConditions, ...searchPrefilters] } }]
        : []),
      { $unwind: "$assignments" },
      ...(assignmentConditions.length ? [{ $match: { $and: assignmentConditions } }] : []),
      { $group: {
        _id: { employeeId: "$assignments.employeeId", categoryId: "$categoryId" },
        count: { $sum: 1 },
      } },
    ], { collation }).toArray();
    const total = grouped.reduce((sum, row) => sum + row.count, 0);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(pages, Math.max(1, parseInt(p.get("page") ?? "1", 10) || 1));
    const countByEmployee = new Map<number, number>();
    for (const row of grouped) {
      if (!employeeById.has(row._id.employeeId) || !categoryById.has(row._id.categoryId)) continue;
      countByEmployee.set(
        row._id.employeeId,
        (countByEmployee.get(row._id.employeeId) ?? 0) + row.count,
      );
    }
    const sortGroups = new Map<string, { value: string; employeeIds: number[]; count: number }>();
    for (const employee of employeeRows) {
      const count = countByEmployee.get(employee._id) ?? 0;
      if (count === 0) continue;
      const value = sortKey === "employee" ? employee.name : employee.department;
      const key = value.toLocaleLowerCase("en");
      const group = sortGroups.get(key) ?? { value, employeeIds: [], count: 0 };
      group.employeeIds.push(employee._id);
      group.count += count;
      sortGroups.set(key, group);
    }
    const orderedGroups = [...sortGroups.values()].sort((a, b) => direction * a.value.localeCompare(b.value, "en", { sensitivity: "base" }));
    let remainingSkip = (page - 1) * pageSize;
    let remainingTake = pageSize;
    const slices: { employeeIds: number[]; skip: number; take: number }[] = [];
    for (const group of orderedGroups) {
      if (remainingTake === 0) break;
      if (remainingSkip >= group.count) {
        remainingSkip -= group.count;
        continue;
      }
      const take = Math.min(remainingTake, group.count - remainingSkip);
      slices.push({ employeeIds: group.employeeIds, skip: remainingSkip, take });
      remainingTake -= take;
      remainingSkip = 0;
    }
    const buckets = await Promise.all(slices.map((slice) => assets.aggregate<SortedAssignmentRow>([
      { $match: { $and: [
        ...assetConditions,
        ...searchPrefilters,
        { categoryId: { $in: categoryIds } },
        { "assignments.employeeId": { $in: slice.employeeIds } },
      ] } },
      { $unwind: "$assignments" },
      ...(assignmentConditions.length ? [{ $match: { $and: assignmentConditions } }] : []),
      { $match: { "assignments.employeeId": { $in: slice.employeeIds } } },
      { $sort: { "assignments.id": -1 } },
      { $skip: slice.skip },
      { $limit: slice.take },
      { $project: {
        id: "$assignments.id", assetId: "$_id", tag: "$assetTag", asset: "$name", categoryId: 1,
        employeeId: "$assignments.employeeId", assignedAt: "$assignments.assignedAt",
        returnedAt: "$assignments.returnedAt", note: "$assignments.note",
      } },
    ], { collation }).toArray()));
    const rows = buckets.flatMap((bucket) => bucket.map((row) => {
      const employee = employeeById.get(row.employeeId);
      return {
        id: row.id, assetId: row.assetId, tag: row.tag, asset: row.asset,
        category: categoryById.get(row.categoryId)?.name ?? "",
        employeeName: employee?.name ?? "", employeeCode: employee?.code ?? "",
        department: employee?.department ?? "", employeeLeft: employee?.status === "left",
        assignedAt: row.assignedAt, returnedAt: row.returnedAt, note: row.note,
      };
    }));
    return { total, page, pages, pageSize, rows };
  }

  const countStages = [
    ...assignmentStages,
    { $count: "total" },
  ];
  const count = await assets.aggregate<Document>(countStages, { collation }).next();
  const total = count?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, parseInt(p.get("page") ?? "1", 10) || 1));
  const earlySortNames: Record<string, string> = {
    assigned: "assignments.assignedAt", returned: "assignments.returnedAt", asset: "assetTag",
  };
  const sortBeforeLookup = !!earlySortNames[sortKey];
  const rows = await assets.aggregate<AssignmentRow>([
    ...assignmentStages,
    ...(sortBeforeLookup ? [
      { $sort: { [earlySortNames[sortKey]]: direction, "assignments.id": -1 } },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
    ] : []),
    ...lookups,
    ...(!sortBeforeLookup ? [
      { $sort: { [sortNames[sortKey]]: direction, "assignments.id": -1 } },
      { $skip: (page - 1) * pageSize },
      { $limit: pageSize },
    ] : []),
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
  const employees = await database.collection<EmployeeDoc>("employees")
    .find({}, { projection: { _id: 1, status: 1 } }).toArray();
  const employeeIds = employees.map((employee) => employee._id);
  const leftEmployeeIds = employees.filter((employee) => employee.status === "left").map((employee) => employee._id);
  if (employeeIds.length === 0) return { current: 0, returned: 0, withLeft: 0 };

  if (await dashboardSummaryReady(database)) {
    const activity = database.collection("dashboardActivity");
    const [current, returned, withLeft] = await Promise.all([
      activity.countDocuments({ employeeId: { $in: employeeIds }, returnedAt: null }),
      activity.countDocuments({ employeeId: { $in: employeeIds }, returnedAt: { $ne: null } }),
      leftEmployeeIds.length
        ? activity.countDocuments({ employeeId: { $in: leftEmployeeIds }, returnedAt: null })
        : Promise.resolve(0),
    ]);
    return { current, returned, withLeft };
  }

  const [result] = await database.collection<AssetDoc>("assets").aggregate<Document>([
    { $match: { "assignments.employeeId": { $in: employeeIds } } },
    { $unwind: "$assignments" },
    { $match: { "assignments.employeeId": { $in: employeeIds } } },
    { $group: {
      _id: null,
      current: { $sum: { $cond: [{ $eq: ["$assignments.returnedAt", null] }, 1, 0] } },
      returned: { $sum: { $cond: [{ $ne: ["$assignments.returnedAt", null] }, 1, 0] } },
      withLeft: { $sum: { $cond: [{ $and: [
        { $eq: ["$assignments.returnedAt", null] },
        { $in: ["$assignments.employeeId", leftEmployeeIds] },
      ] }, 1, 0] } },
    } },
  ]).toArray();
  return { current: result?.current ?? 0, returned: result?.returned ?? 0, withLeft: result?.withLeft ?? 0 };
}
