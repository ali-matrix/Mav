import { db } from "@/lib/db";

type CountRow = { key: string; count: number };

export function dashboardData() {
  const d = db();

  const totals = d.prepare(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(status = 'In Use'), 0) AS in_use,
       COALESCE(SUM(status = 'In Store'), 0) AS in_store,
       COALESCE(SUM(status = 'Under Maintenance'), 0) AS maintenance,
       COALESCE(SUM(purchase_cost), 0) AS value
     FROM assets
     WHERE status <> 'Disposed'`,
  ).get() as {
    total: number; in_use: number; in_store: number; maintenance: number; value: number;
  };

  const statusRows = d.prepare(
    `SELECT status AS key, COUNT(*) AS count FROM assets
     WHERE status <> 'Disposed' GROUP BY status ORDER BY count DESC`,
  ).all() as CountRow[];

  const categoryRows = d.prepare(
    `SELECT COALESCE(p.name, c.name) AS key, COUNT(*) AS count
     FROM assets a
     JOIN categories c ON c.id = a.category_id
     LEFT JOIN categories p ON p.id = c.parent_id
     WHERE a.status <> 'Disposed'
     GROUP BY COALESCE(p.name, c.name)
     ORDER BY count DESC, key ASC
     `,
  ).all() as CountRow[];

  const departmentRows = d.prepare(
    `SELECT COALESCE(e.department, 'Unassigned') AS key, COUNT(*) AS count
     FROM assets a
     LEFT JOIN employees e ON e.id = a.assigned_employee_id
     WHERE a.status <> 'Disposed'
     GROUP BY COALESCE(e.department, 'Unassigned')
     ORDER BY count DESC, key ASC
     `,
  ).all() as CountRow[];

  const now = new Date();
  const ymd = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const today = ymd(now);
  const soon = ymd(new Date(now.getTime() + 30 * 86_400_000));

  const warrantyExpiring = d.prepare(
    `SELECT COUNT(*) AS count FROM assets
     WHERE status <> 'Disposed'
       AND warranty_expiry IS NOT NULL
       AND warranty_expiry >= ? AND warranty_expiry <= ?`,
  ).get(today, soon) as { count: number };

  const recentAssignments = d.prepare(
    `SELECT s.id, s.asset_id AS assetId, s.assigned_at AS assignedAt,
            s.returned_at AS returnedAt, s.note,
            a.asset_tag AS tag, a.name AS asset,
            e.name AS employee, e.code AS employeeCode,
            COALESCE(e.department, 'Unassigned') AS department,
            c.name AS category
     FROM asset_assignments s
     JOIN assets a ON a.id = s.asset_id
     JOIN employees e ON e.id = s.employee_id
     JOIN categories c ON c.id = a.category_id
     ORDER BY COALESCE(s.returned_at, s.assigned_at) DESC, s.id DESC
     LIMIT 10`,
  ).all() as Array<{
    id: number; assetId: number; assignedAt: string; returnedAt: string | null; note: string;
    tag: string; asset: string; employee: string; employeeCode: string;
    department: string; category: string;
  }>;

  return {
    totals: {
      total: totals.total,
      inUse: totals.in_use,
      inStore: totals.in_store,
      maintenance: totals.maintenance,
      warrantyExpiring: warrantyExpiring.count,
      value: totals.value,
    },
    status: statusRows,
    categories: categoryRows,
    departments: departmentRows,
    recentAssignments,
  };
}
