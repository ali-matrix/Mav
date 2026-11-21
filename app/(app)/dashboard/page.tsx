"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarList, Card, ColumnChart, DataTable, KpiCard, KpiGrid, PageHeader, Ring, StateView, StatusBadge,
  SyncStamp, type Column,
} from "@metis/ui";

type Totals = {
  total: number; inUse: number; inStore: number; maintenance: number; warrantyExpiring: number; value: number;
};
type Count = { key: string; count: number };
type RecentAssignment = {
  id: number; assetId: number; assignedAt: string; returnedAt: string | null; note: string;
  tag: string; asset: string; employee: string; employeeCode: string; department: string; category: string;
};
type Dashboard = { totals: Totals; status: Count[]; categories: Count[]; departments: Count[]; recentAssignments: RecentAssignment[] };

const compactNumber = (n: number) => {
  const absolute = Math.abs(n);
  if (absolute < 1000) return n.toLocaleString("en-PK", { maximumFractionDigits: 2 });
  const groups: [number, string][] = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
  const [divisor, suffix] = groups.find(([value]) => absolute >= value) ?? [1, ""];
  const scaled = n / divisor;
  const decimals = Number.isInteger(scaled) ? 0 : scaled >= 100 ? 1 : 2;
  const formatted = decimals === 0
    ? scaled.toFixed(0)
    : scaled.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
  return `${formatted}${suffix}`;
};
const stamp = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleString("en-GB", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/dashboard", { cache: "no-store", signal: ac.signal })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("load failed")))
      .then((d: Dashboard) => { setData(d); setLoadedAt(new Date()); setFailed(false); })
      .catch((e: Error) => { if (e.name !== "AbortError") setFailed(true); });
    return () => ac.abort();
  }, []);

  const recentColumns: Column<RecentAssignment>[] = [
    {
      key: "asset", label: "Asset",
      render: (r) => (
        <div><b>{r.asset}</b><div style={{ color: "var(--mx-text-3)", fontSize: "var(--mx-fs-meta)" }}>{r.tag} · {r.category}</div></div>
      ),
    },
    { key: "employee", label: "Employee", render: (r) => (
      <div>{r.employee}<div style={{ color: "var(--mx-text-3)", fontSize: "var(--mx-fs-meta)" }}>{r.employeeCode}</div></div>
    ) },
    { key: "department", label: "Department", render: (r) => r.department },
    { key: "activity", label: "Activity", render: (r) => (
      <StatusBadge tone={r.returnedAt ? "neutral" : "ok"}>{r.returnedAt ? "Returned" : "Assigned"}</StatusBadge>
    ) },
    { key: "date", label: "Date", render: (r) => stamp(r.returnedAt ?? r.assignedAt) },
  ];

  if (failed) {
    return (
      <>
        <PageHeader title="Dashboard" description="Where every IT asset stands today" />
        <div className="mx-section"><Card><StateView kind="error" title="Couldn't load dashboard data" /></Card></div>
      </>
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Dashboard" description="Where every IT asset stands today" />
        <div className="mx-section"><Card><StateView kind="loading" /></Card></div>
      </>
    );
  }

  const t = data.totals;
  const statusParts = data.status.map((s) => ({
    key: s.key,
    label: s.key,
    value: s.count,
    display: String(s.count),
    tone: s.key === "In Use" ? "ok" as const
      : s.key === "Under Maintenance" ? "warn" as const
      : s.key === "Disposed" ? "neutral" as const
      : "neutral" as const,
  }));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Where every IT asset stands today"
        aside={<SyncStamp state="live" at={loadedAt} />}
      />
      <div className="mx-section" style={{ display: "grid", gap: "var(--mx-4)" }}>
        <KpiGrid min={170}>
          <KpiCard label="Total assets" value={compactNumber(t.total)} foot="Registered assets" figureTone="ink"
            onClick={() => router.push("/assets")} />
          <KpiCard label="In use" value={compactNumber(t.inUse)} foot="Assigned to employees" tone="ok"
            share={{ pct: t.total ? t.inUse * 100 / t.total : 0, label: `${t.total ? Math.round(t.inUse * 100 / t.total) : 0}% of assets`, tone: "ok" }}
            onClick={() => router.push("/assets?status=In+Use")} />
          <KpiCard label="In store" value={compactNumber(t.inStore)} foot="Available for assignment" tone="neutral"
            share={{ pct: t.total ? t.inStore * 100 / t.total : 0, label: `${t.total ? Math.round(t.inStore * 100 / t.total) : 0}% of assets`, tone: "neutral" }}
            onClick={() => router.push("/assets?status=In+Store")} />
          <KpiCard label="Under maintenance" value={compactNumber(t.maintenance)} foot="Currently in service" tone="warn"
            status={t.maintenance ? { tone: "warn", word: "Attention" } : undefined}
            onClick={() => router.push("/assets?status=Under+Maintenance")} />
          <KpiCard label="Warranty expiring" value={compactNumber(t.warrantyExpiring)} foot="Within the next 30 days" tone="warn"
            status={t.warrantyExpiring ? { tone: "warn", word: "Upcoming" } : undefined}
            onClick={() => router.push("/assets?warranty=soon")} />
          <KpiCard
            label={<><span>Total asset value</span><span className="dashboard-currency">PKR</span></>}
            value={compactNumber(t.value)}
            foot="Registered purchase cost"
            figureTone="ink"
          />
        </KpiGrid>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--mx-4)" }}
          className="dashboard-charts">
          <Card title="Assets by status" sub="Current distribution">
            {statusParts.length
              ? <Ring parts={statusParts} center={t.total} caption="Total assets" label="Assets by status" />
              : <StateView kind="empty" title="No asset status data" />}
          </Card>
          <Card title="Assets by category" sub="Registered assets by category">
            {data.categories.length
              ? <div className="dashboard-category-chart">
                  <div style={{ minWidth: data.categories.length > 6 ? `${data.categories.length * 92}px` : "100%" }}>
                    <ColumnChart
                      bars={data.categories.map((c) => ({ key: c.key, label: c.key, value: c.count,
                        onClick: () => router.push("/assets"), note: `${c.key}: ${c.count} assets` }))}
                      height={220}
                      summary="Bar chart of asset counts by category"
                    />
                  </div>
                </div>
              : <StateView kind="empty" title="No category data" />}
          </Card>
          <Card title="Assets by department" sub="Assigned assets, plus unassigned">
            {data.departments.length
              ? <div className="dashboard-department-list">
                  <BarList rows={data.departments.map((d) => ({
                    key: d.key, label: d.key, value: d.count, display: d.count,
                    tone: d.key === "Unassigned" ? "neutral" : "brand",
                  }))} />
                </div>
              : <StateView kind="empty" title="No department data" />}
          </Card>
        </div>

        <Card title="Recent assignments" sub="Latest assignments and returns"
          actions={<span style={{ color: "var(--mx-text-3)", fontSize: "var(--mx-fs-meta)" }}>Latest 10</span>}>
          {data.recentAssignments.length
            ? <div className="dashboard-recent-table">
                <DataTable
                  columns={recentColumns}
                  rows={data.recentAssignments}
                  rowKey={(r) => String(r.id)}
                  onRow={(r) => router.push(`/assets?open=${r.assetId}`)}
                  caption="Recent assignments"
                  minWidth={700}
                />
              </div>
            : <StateView kind="empty" title="No assignment activity">Assignments and returns will appear here.</StateView>}
        </Card>
      </div>
    </>
  );
}
