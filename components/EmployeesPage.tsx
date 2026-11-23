"use client";
// Employees: people from the ERP. Server-side pages, one search box, filters, and a sync button.
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Banner, Button, Card, DataTable, FilterChips, PageHeader, SearchField, Segmented, Select, StateView, StatusBadge, SyncStamp,
  type Column,
} from "@metis/ui";
import CenteredModal from "@/components/CenteredModal";
import { PageExportContext } from "@/components/PageExportContext";
import { downloadHtmlReport, fetchAllPages, formatReportDateTime, type ReportSection } from "@/lib/htmlReport";
import { cachedFetch, send } from "@/lib/client";

type Employee = {
  id: number; code: string; name: string; designation: string; positionTitle: string | null; department: string;
  division: string | null; email: string | null; phone: string | null; intercom: string | null; joined: string | null;
  status: "active" | "left"; manager: { name: string; designation: string | null; active: boolean } | null;
};
type List = { rows: Employee[]; total: number; page: number; pages: number; pageSize: number };
type AssignedAsset = {
  id: number; tag: string; name: string; category: string; department: string | null;
  status: string; warrantyExpiry: string | null;
};
type AssetList = { rows: AssignedAsset[]; pages: number };
type EmployeeAssignment = {
  id: number; assetId: number; tag: string; asset: string; category: string; employeeName: string;
  employeeCode: string; department: string; employeeLeft: boolean; assignedAt: string;
  returnedAt: string | null; note: string;
};
type AssignmentList = { rows: EmployeeAssignment[]; pages: number };
type Facets = { departments: { name: string; count: number }[]; designations: { name: string; count: number }[]; total: number; active: number; left: number };
type Sync = {
  running: boolean; nextAllowedAt: string | null;
  last: { finished_at: string; status: "success" | "error"; added: number; updated: number; marked_left: number; error: string | null } | null;
};
type StatusFilter = "active" | "left" | "all";
type SortKey = "name" | "designation" | "department" | "joined";

const PAGE_SIZE = 25;
const day = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const assetColumns: Column<AssignedAsset>[] = [
  {
    key: "asset", label: "Asset", render: (asset) => (
      <div>
        <span style={{ fontWeight: 500 }}>{asset.name}</span>
        <div style={{ color: "var(--mx-text-3)", fontSize: "var(--mx-fs-meta)" }}>{asset.tag}</div>
      </div>
    ),
  },
  { key: "category", label: "Category", render: (asset) => asset.category },
  {
    key: "status", label: "Status",
    render: (asset) => <StatusBadge tone={asset.status === "Under Maintenance" ? "warn" : asset.status === "In Use" ? "ok" : "neutral"}>{asset.status}</StatusBadge>,
  },
];

export default function EmployeesPage() {
  const router = useRouter();
  const registerPageExport = useContext(PageExportContext);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [data, setData] = useState<List | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [sync, setSync] = useState<Sync | null>(null);
  const [syncError, setSyncError] = useState("");
  const [open, setOpen] = useState<Employee | null>(null);
  const seenFinish = useRef<string | null | undefined>(undefined);

  const exportReport = useCallback(async () => {
    const employees = await fetchAllPages<Employee>("/api/employees", { status: "all", sort: "name", dir: "asc" });
    downloadHtmlReport("Employee register", [
      {
        title: `Employee details (${employees.length})`,
        headers: ["Employee ID", "Code", "Name", "Designation", "Position", "Department", "Division", "Joined", "Status"],
        rows: employees.map((employee) => [
          employee.id, employee.code, employee.name, employee.designation || "—", employee.positionTitle || "—",
          employee.department || "—", employee.division || "—", day(employee.joined),
          employee.status === "active" ? "Active" : "Left",
        ]),
      },
      {
        title: "Contact & manager",
        headers: ["Employee ID", "Code", "Email", "Phone", "Intercom", "Manager", "Manager designation", "Manager status"],
        rows: employees.map((employee) => [
          employee.id, employee.code, employee.email || "—", employee.phone || "—", employee.intercom || "—",
          employee.manager?.name ?? "—", employee.manager?.designation || "—",
          employee.manager ? employee.manager.active ? "Active" : "Left" : "—",
        ]),
      },
    ], "mav-employee-register");
  }, []);

  useEffect(() => {
    if (!registerPageExport) return;
    registerPageExport(exportReport);
    return () => registerPageExport(null);
  }, [exportReport, registerPageExport]);

  // Search waits 0.3 s after the last key, so we don't ask the server for every letter.
  useEffect(() => {
    const t = setTimeout(() => { setQ(input.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [input]);

  // The page of people. A newer request cancels the older one.
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    const p = new URLSearchParams({
      q, department, designation, status, sort: sort.key, dir: sort.dir, page: String(page), pageSize: String(PAGE_SIZE),
    });
    cachedFetch(`/api/employees?${p}`, { cache: "no-store", signal: ac.signal })
      .then((r) => { if (!r.ok) throw new Error("load failed"); return r.json() as Promise<List>; })
      .then((d) => { setData(d); setFailed(false); setLoading(false); })
      .catch((e: Error) => { if (e.name !== "AbortError") { setFailed(true); setLoading(false); } });
    return () => ac.abort();
  }, [q, department, designation, status, sort, page, reloadKey]);

  const loadFacets = useCallback(async () => {
    try {
      const r = await cachedFetch("/api/employees/facets", { cache: "no-store" });
      if (r.ok) setFacets((await r.json()) as Facets);
    } catch { /* the filter lists just stay as they were */ }
  }, []);
  const loadSync = useCallback(async () => {
    try {
      const r = await cachedFetch("/api/employees/sync", { cache: "no-store" });
      if (r.ok) setSync((await r.json()) as Sync);
    } catch { /* keep the last known state */ }
  }, []);
  useEffect(() => { void loadFacets(); void loadSync(); }, [loadFacets, loadSync]);

  // While a sync runs, ask every 2 s whether it is done.
  useEffect(() => {
    if (!sync?.running) return;
    const t = setInterval(() => void loadSync(), 2000);
    return () => clearInterval(t);
  }, [sync?.running, loadSync]);

  // When a sync has finished, refresh the list and the filter lists.
  useEffect(() => {
    if (!sync) return;
    const finished = sync.last?.finished_at ?? null;
    if (seenFinish.current !== undefined && seenFinish.current !== finished) { setReloadKey((k) => k + 1); void loadFacets(); }
    seenFinish.current = finished;
  }, [sync, loadFacets]);

  async function startSync() {
    setSyncError("");
    const res = await send("POST", "/api/employees/sync");
    if (!res.ok) setSyncError(res.error);
    await loadSync();
  }

  const pick = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  const clearAll = () => { setInput(""); setQ(""); setDepartment(""); setDesignation(""); setStatus("active"); setPage(1); };
  const filtered = !!(q || department || designation || status !== "active");
  const chips = [
    ...(department ? [{ key: "d", label: department, onRemove: () => pick(setDepartment)("") }] : []),
    ...(designation ? [{ key: "g", label: designation, onRemove: () => pick(setDesignation)("") }] : []),
    ...(status !== "active" ? [{ key: "s", label: status === "left" ? "Left" : "Active and left", onRemove: () => pick(setStatus)("active") }] : []),
  ];

  const toggleSort = (key: string) => {
    setSort((s) => (s.key === key ? { key: s.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: key as SortKey, dir: "asc" }));
    setPage(1);
  };

  const columns: Column<Employee>[] = [
    {
      key: "name", label: "Name", sortable: true,
      render: (r) => (
        <div>
          <span style={{ fontWeight: 500 }}>{r.name}</span>{" "}
          {r.status === "left" && <StatusBadge tone="neutral">Left</StatusBadge>}
          <div style={{ color: "var(--mx-text-3)", fontSize: "var(--mx-fs-meta)" }}>{r.code}</div>
        </div>
      ),
    },
    { key: "designation", label: "Designation", sortable: true, render: (r) => r.designation || "—" },
    { key: "department", label: "Department", sortable: true, render: (r) => r.department || "—" },
    { key: "email", label: "Email", render: (r) => r.email ?? <span style={{ color: "var(--mx-text-3)" }}>—</span> },
    { key: "joined", label: "Joined", sortable: true, render: (r) => day(r.joined) },
  ];

  const last = sync?.last ?? null;
  const ageH = last ? (Date.now() - new Date(last.finished_at).getTime()) / 3_600_000 : 0;
  const syncState = last?.status === "error" ? "stopped" : ageH > 26 ? "delayed" : "live";
  const noPeopleYet = !!facets && facets.total === 0 && !filtered;

  return (
    <>
      <PageHeader
        title="Employees" description="People who use assets, kept in step with the ERP"
        aside={
          <>
            <div style={{ flex: "1 1 260px", minWidth: 220, maxWidth: 360 }}>
              <SearchField value={input} onChange={setInput} label="Search employees" placeholder="Name, code, email or department…" />
            </div>
            <Select label="Department" value={department} onChange={pick(setDepartment)} hideLabel
              options={[{ key: "", label: "All departments" }, ...(facets?.departments ?? []).map((d) => ({ key: d.name, label: `${d.name} (${d.count})` }))]} />
            <Select label="Designation" value={designation} onChange={pick(setDesignation)} hideLabel
              options={[{ key: "", label: "All designations" }, ...(facets?.designations ?? []).map((d) => ({ key: d.name, label: `${d.name} (${d.count})` }))]} />
            <Segmented<StatusFilter> label="Show" value={status} onChange={pick(setStatus)}
              options={[{ key: "active", label: "Active" }, { key: "left", label: "Left" }, { key: "all", label: "All" }]} />
            <Button icon="refresh" onClick={() => void startSync()} disabled={!!sync?.running}>{sync?.running ? "Syncing…" : "Sync from ERP"}</Button>
            {last ? <SyncStamp state={syncState} at={last.finished_at} label="Last synced" /> : sync && <span style={{ color: "var(--mx-text-3)", fontSize: "var(--mx-fs-meta)" }}>Not synced yet</span>}
          </>
        }
      />

      <div className="mx-section" style={{ display: "grid", gap: "var(--mx-3)" }}>
        {syncError && <Banner tone="danger" icon="alert">{syncError}</Banner>}
        {last?.status === "error" && <Banner tone="danger" icon="alert">The last sync didn&apos;t work: {last.error}</Banner>}
        {last?.status === "success" && !sync?.running && (
          <p style={{ margin: 0, color: "var(--mx-text-3)", fontSize: "var(--mx-fs-meta)" }}>
            Last sync: {last.added} added, {last.updated} refreshed, {last.marked_left} marked as left.
          </p>
        )}
        <FilterChips chips={chips} onClear={clearAll} />

        <Card flush>
          {failed && !data ? (
            <StateView kind="error" title="Couldn't load the employees" action={<Button onClick={() => setReloadKey((k) => k + 1)}>Try again</Button>}>
              Check that the app is still running, then try again.
            </StateView>
          ) : !data ? (
            <StateView kind="loading" />
          ) : noPeopleYet ? (
            <StateView kind="empty" title="No employees yet"
              action={<Button variant="primary" icon="refresh" onClick={() => void startSync()} disabled={!!sync?.running}>{sync?.running ? "Syncing…" : "Sync from ERP"}</Button>}>
              Bring in everyone from the ERP to get started.
            </StateView>
          ) : (
            <div aria-busy={loading} style={{ opacity: loading ? 0.6 : 1 }}>
              <DataTable
                columns={columns} rows={data.rows} rowKey={(r) => String(r.id)} onRow={setOpen} caption="Employees"
                sort={sort} onSort={toggleSort} minWidth={720}
                empty={<StateView kind="no-results" title="No one matches"
                  action={<Button onClick={clearAll}>Clear filters</Button>}>Try fewer words or remove a filter.</StateView>}
              />
              <Pager data={data} onPage={setPage} />
            </div>
          )}
        </Card>
      </div>

      {open && (
        <Detail
          e={open}
          onClose={() => setOpen(null)}
          onAssetClick={(id) => router.push(`/assets?open=${id}`)}
        />
      )}
    </>
  );
}

function Pager({ data, onPage }: { data: List; onPage: (p: number) => void }) {
  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.total, data.page * data.pageSize);
  return (
    <div className="mx-pager">
      <p>Showing {from}–{to} of {data.total} {data.total === 1 ? "person" : "people"}</p>
      {data.pages > 1 && (
        <div>
          <Button size="sm" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>Previous</Button>
          <span style={{ alignSelf: "center", padding: "0 var(--mx-2)", fontSize: "var(--mx-fs-meta)", color: "var(--mx-text-2)" }}>
            Page {data.page} of {data.pages}
          </span>
          <Button size="sm" disabled={data.page >= data.pages} onClick={() => onPage(data.page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

function Detail({ e, onClose, onAssetClick }: {
  e: Employee; onClose: () => void; onAssetClick: (id: number) => void;
}) {
  const link = { color: "var(--mx-accent-text)" };
  const [assets, setAssets] = useState<AssignedAsset[] | null>(null);
  const [assetsFailed, setAssetsFailed] = useState(false);
  const [assetsReload, setAssetsReload] = useState(0);
  const [exportingHistory, setExportingHistory] = useState(false);
  const [historyExportError, setHistoryExportError] = useState("");
  const exportController = useRef<AbortController | null>(null);
  const rows: [string, React.ReactNode][] = [
    ["Department", e.department],
    ["Division", e.division],
    ["Position", e.positionTitle],
    ["Email", e.email && <a href={`mailto:${e.email}`} style={link}>{e.email}</a>],
    ["Phone", e.phone],
    ["Intercom", e.intercom],
    ["Joined", e.joined ? day(e.joined) : null],
    ["Reports to", e.manager && `${e.manager.name}${e.manager.designation ? `, ${e.manager.designation}` : ""}${e.manager.active ? "" : " (has left)"}`],
    ["Status", e.status === "active" ? "Active" : "Left the company"],
  ];

  useEffect(() => () => exportController.current?.abort(), []);

  useEffect(() => {
    const ac = new AbortController();
    let live = true;
    setAssets(null);
    setAssetsFailed(false);
    void (async () => {
      const all: AssignedAsset[] = [];
      let page = 1;
      let pages = 1;
      do {
        const params = new URLSearchParams({
          employeeId: String(e.id), page: String(page), pageSize: "100", sort: "added", dir: "desc",
        });
        const response = await cachedFetch(`/api/assets?${params}`, { cache: "no-store", signal: ac.signal });
        if (!response.ok) throw new Error("load failed");
        const result = await response.json() as AssetList;
        all.push(...result.rows);
        pages = result.pages;
        page += 1;
      } while (page <= pages);
      if (live) setAssets(all);
    })().catch((error: Error) => {
      if (live && error.name !== "AbortError") setAssetsFailed(true);
    });
    return () => {
      live = false;
      ac.abort();
    };
  }, [e.id, assetsReload]);

  async function exportAssignmentHistory() {
    const controller = new AbortController();
    exportController.current?.abort();
    exportController.current = controller;
    setExportingHistory(true);
    setHistoryExportError("");
    try {
      const history: EmployeeAssignment[] = [];
      let page = 1;
      let pages = 1;
      do {
        const params = new URLSearchParams({
          employeeId: String(e.id), page: String(page), pageSize: "100", sort: "assigned", dir: "desc",
        });
        const response = await cachedFetch(`/api/assignments?${params}`, {
          cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("The assignment history request failed.");
        const result = await response.json() as AssignmentList;
        history.push(...result.rows);
        pages = result.pages;
        page += 1;
      } while (page <= pages);

      if (controller.signal.aborted) return;
      const sections: ReportSection[] = [
        { title: "Employee details", headers: ["Field", "Value"], rows: [
          ["Employee", e.name], ["Employee code", e.code], ["Department", e.department],
          ["Generated at", new Date().toLocaleString("en-GB")],
        ] },
        { title: `Asset activity (${history.length})`,
          headers: ["Assignment ID", "Asset ID", "Asset tag", "Asset name", "Category", "Assignment status"],
          rows: history.map((entry) => [
            entry.id, entry.assetId, entry.tag, entry.asset, entry.category,
            entry.returnedAt ? "Returned" : "Currently assigned",
          ]) },
        { title: "Employee & dates",
          headers: ["Assignment ID", "Employee name", "Employee code", "Department", "Assigned date",
            "Returned date", "Employee status", "Note"],
          rows: history.map((entry) => [
            entry.id, entry.employeeName, entry.employeeCode, entry.department, formatReportDateTime(entry.assignedAt),
            formatReportDateTime(entry.returnedAt), entry.employeeLeft ? "Left company" : "Active", entry.note || "—",
          ]) },
      ];
      const employeeCode = e.code.replace(/[^A-Za-z0-9_-]/g, "_");
      downloadHtmlReport(`Assignment history — ${e.name}`, sections, `mav-employee-${employeeCode}-assignment-history`);
    } catch (error) {
      if (!controller.signal.aborted) {
        setHistoryExportError(error instanceof Error
          ? `Couldn't export assignment history: ${error.message}`
          : "Couldn't export assignment history. Please try again.");
      }
    } finally {
      if (!controller.signal.aborted) setExportingHistory(false);
      if (exportController.current === controller) exportController.current = null;
    }
  }

  return (
    <CenteredModal title={e.name} sub={`${e.code}${e.designation ? ` · ${e.designation}` : ""}`} onClose={onClose} width={760}
      headerActions={
        <Button size="sm" onClick={() => void exportAssignmentHistory()} disabled={exportingHistory}
          aria-label="Export employee assignment history">
          {exportingHistory ? "Preparing…" : "Export history"}
        </Button>
      }>
      <div style={{ display: "grid", gap: "var(--mx-6)" }}>
        <section style={{ display: "grid", gap: "var(--mx-3)" }}>
          <h3 style={{ margin: 0, fontSize: "var(--mx-fs-body)", fontWeight: 600 }}>General information</h3>
          <dl style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "var(--mx-3) var(--mx-4)", margin: 0, fontSize: "var(--mx-fs-body)" }}>
            {rows.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt style={{ color: "var(--mx-text-3)" }}>{k}</dt>
                <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section style={{ display: "grid", gap: "var(--mx-3)" }}>
          <h3 style={{ margin: 0, fontSize: "var(--mx-fs-body)", fontWeight: 600 }}>
            Currently assigned assets{assets ? ` (${assets.length})` : ""}
          </h3>
          {assetsFailed ? (
            <StateView kind="error" title="Couldn't load assigned assets"
              action={<Button onClick={() => setAssetsReload((key) => key + 1)}>Try again</Button>} />
          ) : assets === null ? (
            <StateView kind="loading" />
          ) : assets.length ? (
            <DataTable
              columns={assetColumns}
              rows={assets}
              rowKey={(asset) => String(asset.id)}
              onRow={(asset) => onAssetClick(asset.id)}
              caption={`Assets assigned to ${e.name}`}
              minWidth={480}
            />
          ) : (
            <StateView kind="empty" title="No assets currently assigned" />
          )}
        </section>

        <section style={{ display: "grid", gap: "var(--mx-3)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--mx-3)", flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: "var(--mx-1)" }}>
              <h3 style={{ margin: 0, fontSize: "var(--mx-fs-body)", fontWeight: 600 }}>Assignment history</h3>
              <p style={{ margin: 0, color: "var(--mx-text-3)", fontSize: "var(--mx-fs-meta)" }}>
                Includes all assignments, including returned assets.
              </p>
            </div>
          </div>
          {historyExportError && <p role="alert" style={{ margin: 0, color: "var(--mx-danger)", fontSize: "var(--mx-fs-body)" }}>{historyExportError}</p>}
        </section>
      </div>
    </CenteredModal>
  );
}