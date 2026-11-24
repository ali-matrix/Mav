"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarList, Card, ColumnChart, DataTable, KpiCard, KpiGrid, PageHeader, Ring, StateView, StatusBadge,
  SyncStamp, type Column, type Tone,
} from "@metis/ui";
import { cachedFetch } from "@/lib/client";
import { PageExportContext } from "@/components/PageExportContext";
import { downloadHtmlReport, formatReportDateTime, type ReportSection } from "@/lib/htmlReport";

type Totals = {
  total: number; inUse: number; inStore: number; maintenance: number; warrantyExpiring: number; value: number;
};
type Count = { key: string; count: number };
type CategoryCost = { key: string; value: number };
type RecentAssignment = {
  id: number; assetId: number; assignedAt: string; returnedAt: string | null; note: string;
  tag: string; asset: string; employee: string; employeeCode: string; department: string; category: string;
};
type Dashboard = {
  totals: Totals; categories: Count[]; categoryCosts: CategoryCost[]; departments: Count[];
  recentAssignments: RecentAssignment[];
};

function dashboardReportSections(data: Dashboard): ReportSection[] {
  const t = data.totals;
  const number = (value: number) => new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 }).format(value);
  return [
    { title: "Dashboard summary", headers: ["Metric", "Value"], rows: [
      ["Total assets", number(t.total)],
      ["In use", number(t.inUse)],
      ["In store", number(t.inStore)],
      ["Under maintenance", number(t.maintenance)],
      ["Warranty expiring within 30 days", number(t.warrantyExpiring)],
      ["Total asset value", `PKR ${number(t.value)}`],
    ] },
    { title: "Asset count by main category", headers: ["Main category", "Asset count"],
      rows: data.categories.map((row) => [row.key, number(row.count)]) },
    { title: "Asset cost by main category", headers: ["Main category", "Purchase cost"],
      rows: data.categoryCosts.map((row) => [row.key, `PKR ${number(row.value)}`]) },
    { title: "Assets by department", headers: ["Department", "Asset count"],
      rows: data.departments.map((row) => [row.key, number(row.count)]) },
    { title: "Recent assignment activity — latest 10 (assets)",
      headers: ["Assignment ID", "Asset ID", "Asset tag", "Asset name", "Category", "Activity"],
      rows: data.recentAssignments.map((row) => [
        row.id, row.assetId, row.tag, row.asset, row.category,
        row.returnedAt ? "Returned" : "Currently assigned",
      ]) },
    { title: "Recent assignment activity — employees & dates",
      headers: ["Assignment ID", "Employee", "Employee code", "Department", "Assigned date", "Returned date", "Note"],
      rows: data.recentAssignments.map((row) => [
        row.id, row.employee, row.employeeCode, row.department,
        formatReportDateTime(row.assignedAt), formatReportDateTime(row.returnedAt), row.note,
      ]) },
  ];
}

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
const costPalette: Tone[] = ["brand", "ok", "warn", "info", "fair", "neutral", "severe"];
const mainCategoryTones: Record<string, Tone> = {
  computers: "brand",
  mobile: "ok",
  peripherals: "warn",
  network: "info",
};

export default function DashboardPage() {
  const router = useRouter();
  const registerPageExport = useContext(PageExportContext);
  const [data, setData] = useState<Dashboard | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    cachedFetch("/api/dashboard", { cache: "no-store", signal: ac.signal })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("load failed")))
      .then((d: Dashboard) => { setData(d); setLoadedAt(new Date()); setFailed(false); })
      .catch((e: Error) => { if (e.name !== "AbortError") setFailed(true); });
    return () => ac.abort();
  }, []);

  const exportReport = useCallback(() => {
    if (!data) return;
    downloadHtmlReport("Mav Assets — Dashboard report", dashboardReportSections(data), "mav-dashboard-report");
  }, [data]);

  useEffect(() => {
    if (!registerPageExport) return;
    registerPageExport(data ? exportReport : null);
    return () => registerPageExport(null);
  }, [data, exportReport, registerPageExport]);

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
        <PageHeader title="Overview" description="Where every IT asset stands today" />
        <div className="mx-section"><Card><StateView kind="error" title="Couldn't load dashboard data" /></Card></div>
      </>
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Overview" description="Where every IT asset stands today" />
        <div className="mx-section"><Card><StateView kind="loading" /></Card></div>
      </>
    );
  }

  const t = data.totals;
  const categoryCostTotal = data.categoryCosts.reduce((sum, c) => sum + c.value, 0);
  const categoryCostParts = data.categoryCosts.map((c, i) => ({
    key: c.key,
    label: c.key,
    value: c.value,
    display: compactNumber(c.value),
    tone: mainCategoryTones[c.key.trim().toLowerCase()] ?? costPalette[i % costPalette.length],
  }));

  return (
    <>
      <PageHeader
        title="Overview"
        description="Where every IT asset stands today"
        aside={<SyncStamp state="live" at={loadedAt} />}
      />
      <div className="mx-section" style={{ display: "grid", gap: "var(--mx-4)" }}>
        <KpiGrid min={170}>
          <KpiCard label="Total assets" value={compactNumber(t.total)} foot="Registered assets" figureTone="brand"
            onClick={() => router.push("/assets")} />
          <KpiCard label="In use" value={compactNumber(t.inUse)} foot="Assigned to employees" tone="ok"
            figureTone="ok"
            share={{ pct: t.total ? t.inUse * 100 / t.total : 0, label: `${t.total ? Math.round(t.inUse * 100 / t.total) : 0}% of assets`, tone: "ok" }}
            onClick={() => router.push("/assets?status=In+Use")} />
          <KpiCard label="In store" value={compactNumber(t.inStore)} foot="Available for assignment" tone="neutral"
            figureTone="info"
            data={{ "data-kpi": "in-store" }}
            share={{ pct: t.total ? t.inStore * 100 / t.total : 0, label: `${t.total ? Math.round(t.inStore * 100 / t.total) : 0}% of assets`, tone: "neutral" }}
            onClick={() => router.push("/assets?status=In+Store")} />
          <KpiCard label="Under maintenance" value={compactNumber(t.maintenance)} foot="Currently in service" tone="warn"
            figureTone="warn"
            onClick={() => router.push("/assets?status=Under+Maintenance")} />
          <KpiCard label="Warranty expiring" value={compactNumber(t.warrantyExpiring)} foot="Within the next 30 days" tone="warn"
            figureTone="warn"
            onClick={() => router.push("/assets?warranty=soon")} />
          <KpiCard
            label="Total asset value"
            value={compactNumber(t.value)}
            unit="PKR"
            foot="Registered purchase cost"
            figureTone="ok"
            data={{ "data-currency": "pkr", "data-kpi": "asset-value" }}
          />
        </KpiGrid>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--mx-4)" }}
          className="dashboard-charts">
          <Card title="Asset by Cost" sub="Purchase cost by main category">
            {data.categoryCosts.length
              ? <Ring
                  parts={categoryCostParts}
                  center={compactNumber(categoryCostTotal)}
                  caption="Total cost"
                  label="Asset by Cost"
                />
              : <StateView kind="empty" title="No category cost data" />}
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
