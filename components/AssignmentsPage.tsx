"use client";
// Assignments: every time an asset was given to an employee, and whether it is still with them.
import { useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Banner, Button, Card, DataTable, FilterChips, PageHeader, SearchField, Segmented, Select, StateView, StatusBadge,
  useConfirm, type Column,
} from "@metis/ui";
import CenteredModal from "@/components/CenteredModal";
import { PageExportContext } from "@/components/PageExportContext";
import { downloadHtmlReport, fetchAllPages } from "@/lib/htmlReport";
import { cachedFetch, send } from "@/lib/client";

type Cat = { id: number; name: string; parent_id: number | null };
type Dept = { id: number; name: string };
type Row = {
  id: number; assetId: number; tag: string; asset: string; category: string; employeeName: string; employeeCode: string;
  department: string; employeeLeft: boolean; assignedAt: string; returnedAt: string | null; note: string;
};
type List = { rows: Row[]; total: number; page: number; pages: number; pageSize: number };
type Summary = { current: number; returned: number; withLeft: number };
type State = "all" | "current" | "returned";

const PAGE_SIZE = 25;
const when = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const whenDay = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Choices for the category filter: a main kind (covers its sub-kinds), then each sub-kind under it. */
function categoryFilterOptions(cats: Cat[]) {
  const out = [{ key: "", label: "All categories" }];
  for (const t of cats.filter((c) => c.parent_id === null)) {
    out.push({ key: String(t.id), label: `${t.name} (all)` });
    for (const k of cats.filter((c) => c.parent_id === t.id)) out.push({ key: String(k.id), label: `${t.name} › ${k.name}` });
  }
  return out;
}

export default function AssignmentsPage() {
  const router = useRouter();
  const registerPageExport = useContext(PageExportContext);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [state, setState] = useState<State>("all");
  const [leftOnly, setLeftOnly] = useState(false);
  const [department, setDepartment] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "assigned", dir: "desc" });
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [data, setData] = useState<List | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [open, setOpen] = useState<Row | null>(null);

  const exportReport = useCallback(async () => {
    const assignments = await fetchAllPages<Row>("/api/assignments", { state: "all", sort: "assigned", dir: "desc" });
    downloadHtmlReport("Assignment history", [
      {
        title: `Assignment details (${assignments.length})`,
        headers: ["Assignment ID", "Asset ID", "Asset tag", "Asset name", "Category", "Assignment status", "Assigned to"],
        rows: assignments.map((row) => [
          row.id, row.assetId, row.tag, row.asset, row.category,
          row.returnedAt ? "Returned" : "Currently assigned", row.employeeName,
        ]),
      },
    ], "mav-assignment-history");
  }, []);

  useEffect(() => {
    if (!registerPageExport) return;
    registerPageExport(exportReport);
    return () => registerPageExport(null);
  }, [exportReport, registerPageExport]);

  // Search waits 0.3 s after the last key.
  useEffect(() => {
    const t = setTimeout(() => { setQ(input.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [input]);

  // Choices for the filters.
  useEffect(() => {
    void (async () => {
      try {
        const [c, d] = await Promise.all([cachedFetch("/api/categories", { cache: "no-store" }), cachedFetch("/api/departments", { cache: "no-store" })]);
        if (c.ok) setCats(((await c.json()) as { rows: Cat[] }).rows);
        if (d.ok) setDepts(((await d.json()) as { rows: Dept[] }).rows);
      } catch { /* the lists stay empty */ }
    })();
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const r = await cachedFetch("/api/assignments/summary", { cache: "no-store" });
      if (r.ok) setSummary((await r.json()) as Summary);
    } catch { /* keep what we had */ }
  }, []);
  useEffect(() => { void loadSummary(); }, [loadSummary]);

  // The page of assignments. A newer request cancels the older one.
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    const p = new URLSearchParams({
      q, state, left: leftOnly ? "1" : "", department, category, sort: sort.key, dir: sort.dir, page: String(page), pageSize: String(PAGE_SIZE),
    });
    cachedFetch(`/api/assignments?${p}`, { cache: "no-store", signal: ac.signal })
      .then((r) => { if (!r.ok) throw new Error("load failed"); return r.json() as Promise<List>; })
      .then((d) => { setData(d); setFailed(false); setLoading(false); })
      .catch((e: Error) => { if (e.name !== "AbortError") { setFailed(true); setLoading(false); } });
    return () => ac.abort();
  }, [q, state, leftOnly, department, category, sort, page, reloadKey]);

  const reload = useCallback(() => { setReloadKey((k) => k + 1); void loadSummary(); }, [loadSummary]);
  const pick = (set: (v: string) => void) => (v: string) => { set(v); setPage(1); };
  const clearAll = () => { setInput(""); setQ(""); setState("all"); setLeftOnly(false); setDepartment(""); setCategory(""); setPage(1); };
  const filtered = !!(q || state !== "all" || leftOnly || department || category);

  const catOptions = categoryFilterOptions(cats);
  const deptOptions = [{ key: "", label: "All departments" }, ...depts.map((d) => ({ key: d.name, label: d.name }))];
  const chips = [
    ...(leftOnly ? [{ key: "l", label: "Held by people who left", onRemove: () => { setLeftOnly(false); setPage(1); } }] : []),
    ...(department ? [{ key: "d", label: department, onRemove: () => pick(setDepartment)("") }] : []),
    ...(category ? [{ key: "c", label: catOptions.find((o) => o.key === category)?.label ?? "Category", onRemove: () => pick(setCategory)("") }] : []),
  ];

  const toggleSort = (key: string) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(1);
  };

  const columns: Column<Row>[] = [
    {
      key: "asset", label: "Asset", sortable: true,
      render: (r) => (
        <div>
          <span style={{ fontWeight: 500 }}>{r.asset}</span>
          <div style={{ color: "var(--mx-text-3)", fontSize: "var(--mx-fs-meta)" }}>{r.tag} · {r.category}</div>
        </div>
      ),
    },
    {
      key: "employee", label: "Employee", sortable: true,
      render: (r) => (
        <div>
          <span style={{ fontWeight: 500 }}>{r.employeeName}</span>{" "}
          {r.employeeLeft && !r.returnedAt && <StatusBadge tone="danger">Left company</StatusBadge>}
          <div style={{ color: "var(--mx-text-3)", fontSize: "var(--mx-fs-meta)" }}>{r.employeeCode}</div>
        </div>
      ),
    },
    { key: "department", label: "Department", sortable: true, render: (r) => r.department || <span style={{ color: "var(--mx-text-3)" }}>—</span> },
    { key: "assigned", label: "Assigned", sortable: true, render: (r) => whenDay(r.assignedAt) },
    {
      key: "returned", label: "Returned", sortable: true,
      render: (r) => (r.returnedAt ? whenDay(r.returnedAt) : <StatusBadge tone="ok">Current</StatusBadge>),
    },
  ];

  return (
    <>
      <PageHeader
        title="Assignments" description="Who has what, and who had it before"
        aside={
          <>
            <div style={{ flex: "1 1 260px", minWidth: 220, maxWidth: 360 }}>
              <SearchField value={input} onChange={setInput} label="Search assignments" placeholder="Asset tag, asset, employee, department…" />
            </div>
            <Select label="Department" hideLabel value={department} onChange={pick(setDepartment)} options={deptOptions} />
            <Select label="Category" hideLabel value={category} onChange={pick(setCategory)} options={catOptions} />
            <Segmented<State> label="Show" value={state} onChange={(v) => { setState(v); setPage(1); }}
              options={[{ key: "all", label: "All" }, { key: "current", label: "Current" }, { key: "returned", label: "Returned" }]} />
          </>
        }
      />

      <div className="mx-section" style={{ display: "grid", gap: "var(--mx-3)" }}>
        {summary && summary.withLeft > 0 && !leftOnly && (
          <Banner tone="warn" icon="alert">
            <div style={{ display: "flex", gap: "var(--mx-3)", flexWrap: "wrap", alignItems: "center" }}>
              <span>
                {summary.withLeft} {summary.withLeft === 1 ? "asset is" : "assets are"} with people who have left the company. Take {summary.withLeft === 1 ? "it" : "them"} back.
              </span>
              <Button size="sm" onClick={() => { setLeftOnly(true); setState("current"); setPage(1); }}>Show them</Button>
            </div>
          </Banner>
        )}
        <FilterChips chips={chips} onClear={clearAll} />

        <Card flush>
          {failed && !data ? (
            <StateView kind="error" title="Couldn't load the assignments" action={<Button onClick={reload}>Try again</Button>}>
              Check that the app is still running, then try again.
            </StateView>
          ) : !data ? (
            <StateView kind="loading" />
          ) : data.total === 0 && !filtered ? (
            <StateView kind="empty" title="No assignments yet" action={<Button variant="primary" onClick={() => router.push("/assets")}>Go to Assets</Button>}>
              Open an asset and choose Assign to employee. Every assignment will be listed here.
            </StateView>
          ) : (
            <div aria-busy={loading} style={{ opacity: loading ? 0.6 : 1 }}>
              <DataTable
                columns={columns} rows={data.rows} rowKey={(r) => String(r.id)} caption="Assignments" minWidth={760}
                onRow={setOpen} sort={sort} onSort={toggleSort}
                empty={<StateView kind="no-results" title="No assignments match" action={<Button onClick={clearAll}>Clear filters</Button>}>Try fewer words or remove a filter.</StateView>}
              />
              <Pager data={data} onPage={setPage} />
            </div>
          )}
        </Card>
      </div>

      {open && (
        <Detail row={open} onClose={() => setOpen(null)}
          onOpenAsset={() => router.push(`/assets?open=${open.assetId}`)}
          onTakenBack={() => { setOpen(null); reload(); }} />
      )}
    </>
  );
}

function Pager({ data, onPage }: { data: List; onPage: (p: number) => void }) {
  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.total, data.page * data.pageSize);
  return (
    <div className="mx-pager">
      <p>Showing {from}–{to} of {data.total} {data.total === 1 ? "assignment" : "assignments"}</p>
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

function Detail({ row, onClose, onOpenAsset, onTakenBack }: { row: Row; onClose: () => void; onOpenAsset: () => void; onTakenBack: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ask, dialog] = useConfirm();
  const current = !row.returnedAt;

  async function takeBack() {
    const yes = await ask({ title: "Take this asset back?", body: `${row.tag} will be taken back from ${row.employeeName}.`, ok: "Take back" });
    if (!yes) return;
    setBusy(true); setError("");
    const res = await send("DELETE", `/api/assets/${row.assetId}/assignment`);
    setBusy(false);
    if (res.ok) onTakenBack(); else setError(res.error);
  }

  const rows: [string, string | null][] = [
    ["Asset", `${row.asset} (${row.tag})`],
    ["Category", row.category],
    ["Employee", `${row.employeeName} (${row.employeeCode})${row.employeeLeft ? ", has left the company" : ""}`],
    ["Department", row.department || null],
    ["Assigned", when(row.assignedAt)],
    ["Returned", row.returnedAt ? when(row.returnedAt) : null],
    ["Note", row.note || null],
  ];

  return (
    <>
      <CenteredModal title={row.asset} sub={`${row.tag} → ${row.employeeName}`} onClose={onClose} width={560}>
        <div style={{ display: "grid", gap: "var(--mx-6)" }}>
          <div style={{ display: "flex", gap: "var(--mx-2)", flexWrap: "wrap", alignItems: "center" }}>
            <StatusBadge tone={current ? "ok" : "neutral"}>{current ? "Current" : "Returned"}</StatusBadge>
            <Button variant="primary" onClick={onOpenAsset}>Open asset</Button>
            {current && <Button onClick={() => void takeBack()} disabled={busy}>Take back</Button>}
          </div>
          {error && <p role="alert" style={{ margin: 0, color: "var(--mx-danger)", fontSize: "var(--mx-fs-body)" }}>{error}</p>}
          <dl style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "var(--mx-3) var(--mx-4)", margin: 0, fontSize: "var(--mx-fs-body)" }}>
            {rows.filter(([, v]) => v).map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt style={{ color: "var(--mx-text-3)" }}>{k}</dt>
                <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </CenteredModal>
      {dialog}
    </>
  );
}