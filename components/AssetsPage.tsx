"use client";
// Assets: the register. Server-side pages, search, filters, a detail drawer (assign, transfer, return, history), add/edit form.
// An asset has no department of its own: it shows the department of the employee who holds it.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Button, Card, DataTable, Drawer, FilterChips, PageHeader, SearchField, Select, StateView, StatusBadge, useConfirm,
  type Column,
} from "@metis/ui";
import { send } from "@/lib/client";
import { ASSIGNABLE, LOCKED_STATUSES, STATUSES, STATUS_TONE, manualStatuses, type Status } from "@/lib/assetStatus";

type Cat = { id: number; name: string; parent_id: number | null };
type Dept = { id: number; name: string; is_active: boolean };
type Row = { id: number; tag: string; name: string; category: string; department: string | null; employee: string | null; status: Status; warrantyExpiry: string | null };
type List = { rows: Row[]; total: number; page: number; pages: number; pageSize: number };
type Full = {
  id: number; tag: string; name: string; categoryId: number; category: string; categoryPath: string; brand: string; model: string;
  serial: string; employee: { id: number; name: string; code: string; department: string } | null;
  cost: number | null; purchaseDate: string | null; warrantyStart: string | null; warrantyExpiry: string | null; status: Status; description: string;
};
type Hist = { from: string | null; to: string; note: string; at: string };
type Assign = { name: string; code: string; at: string; returnedAt: string | null; note: string };
type Maintenance = { startedAt: string; endedAt: string | null; details: string; cost: number | null };
type DetailData = { asset: Full; history: Hist[]; assignments: Assign[]; maintenance: Maintenance[]; canRemove: boolean };
type Emp = { id: number; name: string; code: string; designation: string; department: string };
type View = null | { kind: "new" } | { kind: "detail"; id: number } | { kind: "edit"; asset: Full };

const PAGE_SIZE = 25;
const day = (s: string | null) => (s ? new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const stamp = (s: string) => new Date(s.replace(" ", "T") + "Z").toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const pkr = (n: number | null) => (n === null ? "—" : "PKR " + n.toLocaleString("en-PK", { maximumFractionDigits: 2 }));

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function warrantyState(date: string): "expired" | "soon" | "" {
  const now = new Date();
  return date < ymd(now) ? "expired" : date <= ymd(new Date(now.getTime() + 30 * 86_400_000)) ? "soon" : "";
}

/** Choices for a filter: a main kind (covers its sub-kinds), then each sub-kind under it. */
function categoryFilterOptions(cats: Cat[]) {
  const out = [{ key: "", label: "All categories" }];
  for (const t of cats.filter((c) => c.parent_id === null)) {
    out.push({ key: String(t.id), label: `${t.name} (all)` });
    for (const k of cats.filter((c) => c.parent_id === t.id)) out.push({ key: String(k.id), label: `${t.name} › ${k.name}` });
  }
  return out;
}
/** Choices for the form: only specific kinds (a main kind with no sub-kinds counts as specific). */
function categoryFormOptions(cats: Cat[]) {
  const out = [{ key: "", label: "Choose a category" }];
  for (const t of cats.filter((c) => c.parent_id === null)) {
    const kids = cats.filter((c) => c.parent_id === t.id);
    if (kids.length === 0) out.push({ key: String(t.id), label: t.name });
    for (const k of kids) out.push({ key: String(k.id), label: `${t.name} › ${k.name}` });
  }
  return out;
}

export default function AssetsPage({ initialQuery, openId }: { initialQuery: string; openId?: number }) {
  const [input, setInput] = useState(initialQuery);
  const [q, setQ] = useState(initialQuery);
  const [category, setCategory] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [warranty, setWarranty] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "added", dir: "desc" });
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [data, setData] = useState<List | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [cats, setCats] = useState<Cat[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [view, setView] = useState<View>(openId ? { kind: "detail", id: openId } : null);
  const [ask, dialog] = useConfirm();
  const [rowAssignment, setRowAssignment] = useState<Row | null>(null);
  const [pickedEmployee, setPickedEmployee] = useState<Emp | null>(null);
  const [assignmentNote, setAssignmentNote] = useState("");
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");

  // The top search box sends people here with ?q=…
  useEffect(() => { setInput(initialQuery); }, [initialQuery]);

  // Search waits 0.3 s after the last key.
  useEffect(() => {
    const t = setTimeout(() => { setQ(input.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [input]);

  // Choices for the filters and the form.
  useEffect(() => {
    void (async () => {
      try {
        const [c, d] = await Promise.all([fetch("/api/categories", { cache: "no-store" }), fetch("/api/departments", { cache: "no-store" })]);
        if (c.ok) setCats(((await c.json()) as { rows: Cat[] }).rows);
        if (d.ok) setDepts(((await d.json()) as { rows: Dept[] }).rows);
      } catch { /* the lists stay empty */ }
    })();
  }, []);

  // The page of assets. A newer request cancels the older one.
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    const p = new URLSearchParams({ q, category, department, status, warranty, sort: sort.key, dir: sort.dir, page: String(page), pageSize: String(PAGE_SIZE) });
    fetch(`/api/assets?${p}`, { cache: "no-store", signal: ac.signal })
      .then((r) => { if (!r.ok) throw new Error("load failed"); return r.json() as Promise<List>; })
      .then((d) => { setData(d); setFailed(false); setLoading(false); })
      .catch((e: Error) => { if (e.name !== "AbortError") { setFailed(true); setLoading(false); } });
    return () => ac.abort();
  }, [q, category, department, status, warranty, sort, page, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  const pick = (set: (v: string) => void) => (v: string) => { set(v); setPage(1); };
  const clearAll = () => { setInput(""); setQ(""); setCategory(""); setDepartment(""); setStatus(""); setWarranty(""); setPage(1); };
  const filtered = !!(q || category || department || status || warranty);

  const catOptions = categoryFilterOptions(cats);
  // The department filter shows assets held by people of that department (the name is the choice).
  const deptOptions = [{ key: "", label: "All departments" }, ...depts.map((d) => ({ key: d.name, label: d.name }))];
  const warrantyOptions = [{ key: "", label: "Any warranty" }, { key: "soon", label: "Ending in 30 days" }, { key: "expired", label: "Expired" }];
  const chips = [
    ...(category ? [{ key: "c", label: catOptions.find((o) => o.key === category)?.label ?? "Category", onRemove: () => pick(setCategory)("") }] : []),
    ...(department ? [{ key: "d", label: department, onRemove: () => pick(setDepartment)("") }] : []),
    ...(status ? [{ key: "s", label: status, onRemove: () => pick(setStatus)("") }] : []),
    ...(warranty ? [{ key: "w", label: warrantyOptions.find((o) => o.key === warranty)?.label ?? "Warranty", onRemove: () => pick(setWarranty)("") }] : []),
  ];

  const toggleSort = (key: string) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
    setPage(1);
  };

  async function openEdit(r: Row) {
    const response = await fetch(`/api/assets/${r.id}`, { cache: "no-store" });
    if (!response.ok) return;
    const detail = (await response.json()) as DetailData;
    setView({ kind: "edit", asset: detail.asset });
  }

  async function removeRow(r: Row) {
    if (r.employee || r.status === "Under Maintenance") {
      await ask({
        title: "Cannot delete this asset",
        body: r.status === "Under Maintenance"
          ? `${r.tag} is under maintenance and cannot be deleted.`
          : `${r.tag} is assigned to ${r.employee} and cannot be deleted. Take it back first.`,
        ok: "Close",
      });
      return;
    }
    const yes = await ask({
      title: "Delete this asset?",
      body: `${r.tag} “${r.name}” will only be deleted if it has no history or assignment.`,
      ok: "Delete",
      danger: true,
    });
    if (!yes) return;
    const result = await send("DELETE", `/api/assets/${r.id}`);
    if (result.ok) reload();
  }

  function closeRowAssignment() {
    setRowAssignment(null);
    setPickedEmployee(null);
    setAssignmentNote("");
    setAssignmentError("");
  }

  async function confirmRowAssignment() {
    if (!rowAssignment) return;
    if (!pickedEmployee) return;
    setAssignmentBusy(true);
    setAssignmentError("");
    const result = await send("POST", `/api/assets/${rowAssignment.id}/assignment`, {
      employeeId: pickedEmployee.id,
      note: assignmentNote,
    });
    setAssignmentBusy(false);
    if (result.ok) { closeRowAssignment(); reload(); }
    else setAssignmentError(result.error);
  }

  async function takeBackRow(r: Row) {
    setAssignmentBusy(true);
    setAssignmentError("");
    const result = await send("DELETE", `/api/assets/${r.id}/assignment`);
    setAssignmentBusy(false);
    if (result.ok) { closeRowAssignment(); reload(); }
    else setAssignmentError(result.error);
  }

  const columns: Column<Row>[] = [
    {
      key: "tag", label: "Asset", sortable: true,
      render: (r) => (
        <div>
          <span style={{ fontWeight: 500 }}>{r.name}</span>
          <div style={{ color: "var(--mx-text-3)", fontSize: "var(--mx-fs-meta)" }}>{r.tag}{r.employee ? ` · ${r.employee}` : ""}</div>
        </div>
      ),
    },
    { key: "category", label: "Category", sortable: true, render: (r) => r.category },
    { key: "department", label: "Department", sortable: true, render: (r) => r.department ?? <span style={{ color: "var(--mx-text-3)" }}>—</span> },
    { key: "status", label: "Status", sortable: true, render: (r) => <StatusBadge tone={STATUS_TONE[r.status]}>{r.status}</StatusBadge> },
    {
      key: "warranty", label: "Warranty ends", sortable: true,
      render: (r) => {
        if (!r.warrantyExpiry) return <span style={{ color: "var(--mx-text-3)" }}>—</span>;
        const w = r.status === "Disposed" ? "" : warrantyState(r.warrantyExpiry);
        return (
          <span>
            {day(r.warrantyExpiry)}{" "}
            {w && <StatusBadge tone={w === "expired" ? "danger" : "warn"}>{w === "expired" ? "Expired" : "Ends soon"}</StatusBadge>}
          </span>
        );
      },
    },
    {
      key: "actions", label: "Actions",
      render: (r) => (
        <div style={{ display: "flex", gap: "var(--mx-2)", justifyContent: "flex-end" }}
          onClick={(e) => e.stopPropagation()}>
          {r.status === "In Use" ? (
            <Button size="sm" onClick={() => setRowAssignment(r)}>Take back</Button>
          ) : ASSIGNABLE.includes(r.status) ? (
            <Button size="sm" variant="primary" onClick={() => setRowAssignment(r)}>Assign</Button>
          ) : null}
          <Button size="sm" onClick={() => void openEdit(r)}>Edit</Button>
          {r.employee || r.status === "Under Maintenance" ? null : (
            <Button size="sm" variant="ghost" onClick={() => void removeRow(r)}>Delete</Button>
          )}
        </div>
      ),
    },
  ];

  const addButton = <Button variant="primary" icon="plus" onClick={() => setView({ kind: "new" })}>Add asset</Button>;

  return (
    <>
      <PageHeader
        title="Assets" description="Every laptop, desktop and device we own"
        aside={
          <>
            <div style={{ flex: "1 1 260px", minWidth: 220, maxWidth: 360 }}>
              <SearchField value={input} onChange={setInput} label="Search assets" placeholder="Tag, name, serial, brand, employee…" />
            </div>
            <Select label="Category" hideLabel value={category} onChange={pick(setCategory)} options={catOptions} />
            <Select label="Department" hideLabel value={department} onChange={pick(setDepartment)} options={deptOptions} />
            <Select label="Status" hideLabel value={status} onChange={pick(setStatus)}
              options={[{ key: "", label: "All statuses" }, ...STATUSES.map((s) => ({ key: s as string, label: s as string }))]} />
            <Select label="Warranty" hideLabel value={warranty} onChange={pick(setWarranty)} options={warrantyOptions} />
            {addButton}
          </>
        }
      />

      <div className="mx-section" style={{ display: "grid", gap: "var(--mx-3)" }}>
        <FilterChips chips={chips} onClear={clearAll} />
        <Card flush>
          {failed && !data ? (
            <StateView kind="error" title="Couldn't load the assets" action={<Button onClick={reload}>Try again</Button>}>
              Check that the app is still running, then try again.
            </StateView>
          ) : !data ? (
            <StateView kind="loading" />
          ) : data.total === 0 && !filtered ? (
            <StateView kind="empty" title="No assets yet" action={addButton}>
              Add the first asset. Its tag (like LAP-0001) is made for you.
            </StateView>
          ) : (
            <div aria-busy={loading} style={{ opacity: loading ? 0.6 : 1 }}>
              <DataTable
                columns={columns} rows={data.rows} rowKey={(r) => String(r.id)} caption="Assets" minWidth={760}
                onRow={(r) => setView({ kind: "detail", id: r.id })} sort={sort} onSort={toggleSort}
                empty={<StateView kind="no-results" title="No assets match" action={<Button onClick={clearAll}>Clear filters</Button>}>Try fewer words or remove a filter.</StateView>}
              />
              <Pager data={data} onPage={setPage} />
            </div>
          )}
        </Card>
      </div>

      {view?.kind === "detail" && (
        <Detail id={view.id} onClose={() => setView(null)} onEdit={(a) => setView({ kind: "edit", asset: a })}
          onChanged={reload} onRemoved={() => { setView(null); reload(); }} />
      )}
      {(view?.kind === "new" || view?.kind === "edit") && (
        <Editor asset={view.kind === "edit" ? view.asset : null} cats={cats}
          onClose={() => setView(view.kind === "edit" ? { kind: "detail", id: view.asset.id } : null)}
          onSaved={() => { setView(null); reload(); }} />
      )}
      {rowAssignment && (
        <>
          <div className="mx-scrim" onClick={closeRowAssignment} />
          <div className="mx-root mx-confirm assignment-modal" role="dialog" aria-modal="true"
            aria-label={rowAssignment.employee ? "Take back or transfer asset" : "Assign asset"}>
            <h2>{rowAssignment.employee ? "Take back or transfer" : "Assign asset"}</h2>
            {rowAssignment.employee ? (
              <p>Currently held by <b>{rowAssignment.employee}</b>.</p>
            ) : (
              <p>Choose an active employee to assign <b>{rowAssignment.tag}</b>.</p>
            )}
            {rowAssignment.employee && (
              <div>
                <Button variant="primary" onClick={() => void takeBackRow(rowAssignment)} disabled={assignmentBusy}>Take back</Button>
              </div>
            )}
            {ASSIGNABLE.includes(rowAssignment.status) && (
              <>
                {rowAssignment.employee && <p>Or transfer to another employee:</p>}
                <EmployeePicker onPick={setPickedEmployee} />
              </>
            )}
            {pickedEmployee && (
              <>
                <p><b>{pickedEmployee.name}</b> ({pickedEmployee.code}{pickedEmployee.department ? `, ${pickedEmployee.department}` : ""})</p>
                <label className="mx-field">
                  <span>Note (optional)</span>
                  <input className="mx-input" value={assignmentNote} maxLength={200}
                    onChange={(e) => setAssignmentNote(e.target.value)} />
                </label>
              </>
            )}
            {assignmentError && <p role="alert" style={{ color: "var(--mx-danger)" }}>{assignmentError}</p>}
            <div className="mx-confirm-actions">
              <button className="mx-btn" onClick={closeRowAssignment} disabled={assignmentBusy}>Cancel</button>
              {pickedEmployee && (
                <button className="mx-btn" data-variant="primary" onClick={() => void confirmRowAssignment()} disabled={assignmentBusy}>
                  {rowAssignment.employee ? "Transfer" : "Assign"}
                </button>
              )}
            </div>
          </div>
        </>
      )}
      {dialog}
    </>
  );
}

function Pager({ data, onPage }: { data: List; onPage: (p: number) => void }) {
  const from = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const to = Math.min(data.total, data.page * data.pageSize);
  return (
    <div className="mx-pager">
      <p>Showing {from}–{to} of {data.total} {data.total === 1 ? "asset" : "assets"}</p>
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

// ---------------------------------------------------------------- finding an employee

/** Type a name, code or department; pick one of the matches (active employees only). */
function EmployeePicker({ onPick }: { onPick: (e: Emp) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Emp[]>([]);
  const [busy, setBusy] = useState(false);
  const term = q.trim();

  useEffect(() => {
    if (term.length < 2) { setRows([]); return; }
    const ac = new AbortController();
    const t = setTimeout(() => {
      setBusy(true);
      const p = new URLSearchParams({ q: term, status: "active", pageSize: "8", sort: "name", dir: "asc" });
      fetch(`/api/employees?${p}`, { cache: "no-store", signal: ac.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
        .then((d: { rows: Emp[] }) => { setRows(d.rows); setBusy(false); })
        .catch((e: Error) => { if (e.name !== "AbortError") setBusy(false); });
    }, 300);
    return () => { clearTimeout(t); ac.abort(); };
  }, [term]);

  return (
    <div className="employee-picker">
      <label className="mx-field">
        <span>Find the employee</span>
        <input className="mx-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name, code or department…" />
      </label>
      {rows.map((e) => (
        <Button key={e.id} onClick={() => onPick(e)}>{e.name} · {e.code}{e.department ? ` · ${e.department}` : ""}</Button>
      ))}
      {term.length >= 2 && !busy && rows.length === 0 && (
        <p style={{ margin: 0, color: "var(--mx-text-3)", fontSize: "var(--mx-fs-meta)" }}>No active employee matches.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- detail

function Section({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== false);
  if (!shown.length) return null;
  return (
    <section style={{ display: "grid", gap: "var(--mx-3)" }}>
      <h3 style={{ margin: 0, fontSize: "var(--mx-fs-body)", fontWeight: 600 }}>{title}</h3>
      <dl style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: "var(--mx-3) var(--mx-4)", margin: 0, fontSize: "var(--mx-fs-body)" }}>
        {shown.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <dt style={{ color: "var(--mx-text-3)" }}>{k}</dt>
            <dd style={{ margin: 0, overflowWrap: "anywhere" }}>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Detail({ id, onClose, onEdit, onChanged, onRemoved }: {
  id: number; onClose: () => void; onEdit: (a: Full) => void; onChanged: () => void; onRemoved: () => void;
}) {
  const [d, setD] = useState<DetailData | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [maintenanceDetails, setMaintenanceDetails] = useState("");
  const [maintenanceCost, setMaintenanceCost] = useState("");
  const [ask, dialog] = useConfirm();

  useEffect(() => {
    let live = true;
    fetch(`/api/assets/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((x: DetailData) => { if (live) setD(x); })
      .catch(() => { if (live) setError("Couldn't load this asset."); });
    return () => { live = false; };
  }, [id, refresh]);

  const changed = () => { setRefresh((k) => k + 1); onChanged(); };

  function openMaintenance() {
    if (!d) return;
    if (d.asset.status === "Under Maintenance") {
      const active = d.maintenance.find((m) => m.endedAt === null);
      void confirmCompleteMaintenance(active);
      return;
    }
    setMaintenanceDetails("");
    setMaintenanceCost("");
    setMaintenanceOpen(true);
  }

  async function confirmCompleteMaintenance(active: Maintenance | undefined) {
    const details = active?.details || "No maintenance details recorded.";
    const cost = active?.cost === null || active?.cost === undefined ? "No cost recorded." : pkr(active.cost);
    const yes = await ask({
      title: "Complete maintenance?",
      body: `${d?.asset.tag} — ${d?.asset.name}\n\nDetails: ${details}\nCost: ${cost}`,
      ok: "Complete",
    });
    if (!yes) return;
    setBusy(true);
    setError("");
    const result = await send("PATCH", `/api/assets/${id}/maintenance`, {});
    setBusy(false);
    if (result.ok) changed();
    else setError(result.error);
  }

  async function submitMaintenance() {
    if (!d) return;
    setBusy(true);
    setError("");
    const result = await send("POST", `/api/assets/${id}/maintenance`, {
      details: maintenanceDetails,
      cost: maintenanceCost,
    });
    setBusy(false);
    if (result.ok) {
      setMaintenanceOpen(false);
      changed();
    } else {
      setError(result.error);
    }
  }

  function exportHistory() {
    if (!d) return;
    const rows: (string | number)[][] = [["Type", "From", "To", "Date", "Details", "Cost"]];
    d.history.forEach((h) => rows.push(["Status", h.from ?? "", h.to, h.at, h.note, ""]));
    d.assignments.forEach((s) => rows.push([
      "Assignment", "", s.name, s.at, s.returnedAt ? `Returned ${s.returnedAt}` : "Currently assigned",
      s.note,
    ]));
    d.maintenance.forEach((m) => rows.push([
      "Maintenance", "", m.endedAt ? "Completed" : "Active",
      m.startedAt, m.details, m.cost ?? "",
    ]));
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${d.asset.tag}-history.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function remove() {
    if (!d) return;
    const yes = await ask({ title: "Remove this asset?", body: `${d.asset.tag} “${d.asset.name}” was added by mistake and will be removed. This can't be undone.`, ok: "Remove", danger: true });
    if (!yes) return;
    setBusy(true); setError("");
    const res = await send("DELETE", `/api/assets/${id}`);
    setBusy(false);
    if (res.ok) onRemoved(); else setError(res.error);
  }

  const a = d?.asset;

  return (
    <>
      <Drawer title={a ? a.name : "Asset"} sub={a ? `${a.tag} · ${a.categoryPath}` : undefined} onClose={onClose} width={520}>
        {!a ? (
          error ? <p role="alert" style={{ color: "var(--mx-danger)" }}>{error}</p> : <StateView kind="loading" />
        ) : (
          <div style={{ display: "grid", gap: "var(--mx-6)" }}>
            <div style={{ display: "flex", gap: "var(--mx-2)", flexWrap: "wrap", alignItems: "center" }}>
              <StatusBadge tone={STATUS_TONE[a.status]}>{a.status}</StatusBadge>
              <Button onClick={() => onEdit(a)}>Edit</Button>
              <Button variant="ghost" onClick={exportHistory}>Export history</Button>
              <Button variant={a.status === "Under Maintenance" ? "primary" : "ghost"}
                onClick={openMaintenance} disabled={busy}>
                {a.status === "Under Maintenance" ? "Complete maintenance" : "Add maintenance"}
              </Button>
              {d?.canRemove && <Button variant="ghost" onClick={() => void remove()} disabled={busy}>Remove</Button>}
            </div>
            {a.status === "Under Maintenance" && (
              <p style={{ margin: 0, color: "var(--mx-text-3)", fontSize: "var(--mx-fs-meta)" }}>
                This asset is under maintenance. It can be assigned once that is finished.
              </p>
            )}
            {error && <p role="alert" style={{ margin: 0, color: "var(--mx-danger)", fontSize: "var(--mx-fs-body)" }}>{error}</p>}

            {maintenanceOpen && (
              <div style={{ display: "grid", gap: "var(--mx-4)", padding: "var(--mx-4)", border: "1px solid var(--mx-border)", borderRadius: "var(--mx-r-panel)", background: "var(--mx-surface-2)" }}>
                <h3 style={{ margin: 0, fontSize: "var(--mx-fs-body)", fontWeight: 600 }}>
                  Add maintenance
                </h3>
                <label className="mx-field">
                  <span>Maintenance details</span>
                  <textarea className="mx-input asset-description" rows={5} maxLength={2000} value={maintenanceDetails}
                    onChange={(e) => setMaintenanceDetails(e.target.value)} />
                </label>
                <label className="mx-field">
                  <span>Maintenance cost (PKR)</span>
                  <input className="mx-input" type="number" min={0} step="any" value={maintenanceCost}
                    onChange={(e) => setMaintenanceCost(e.target.value)} />
                </label>
                <div style={{ display: "flex", gap: "var(--mx-2)", flexWrap: "wrap" }}>
                  <Button variant="primary" onClick={() => void submitMaintenance()} disabled={busy}>
                    Send to maintenance
                  </Button>
                  <Button variant="ghost" onClick={() => setMaintenanceOpen(false)} disabled={busy}>Cancel</Button>
                </div>
              </div>
            )}

            <Section title="General" rows={[
              ["Assigned to", a.employee ? `${a.employee.name} (${a.employee.code})` : null],
              ["Department", a.employee?.department || null],
              ["Brand", a.brand], ["Model", a.model], ["Serial number", a.serial],
              ["Description", a.description ? <span style={{ whiteSpace: "pre-wrap" }}>{a.description}</span> : null],
            ]} />
            <Section title="Purchase & warranty" rows={[
              ["Cost", a.cost === null ? null : pkr(a.cost)], ["Purchased", a.purchaseDate ? day(a.purchaseDate) : null],
              ["Warranty starts", a.warrantyStart ? day(a.warrantyStart) : null], ["Warranty ends", a.warrantyExpiry ? day(a.warrantyExpiry) : null],
            ]} />

            {d!.assignments.length > 0 && (
              <section style={{ display: "grid", gap: "var(--mx-3)" }}>
                <h3 style={{ margin: 0, fontSize: "var(--mx-fs-body)", fontWeight: 600 }}>Who has had it</h3>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "var(--mx-3)", fontSize: "var(--mx-fs-body)" }}>
                  {d!.assignments.map((s, i) => (
                    <li key={i}>
                      <div>{s.name} ({s.code})</div>
                      <div style={{ color: "var(--mx-text-3)", fontSize: "var(--mx-fs-meta)" }}>
                        {s.returnedAt ? `${stamp(s.at)} → ${stamp(s.returnedAt)}` : `Since ${stamp(s.at)}`}{s.note ? ` · ${s.note}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {d!.maintenance.length > 0 && (
              <section style={{ display: "grid", gap: "var(--mx-3)" }}>
                <h3 style={{ margin: 0, fontSize: "var(--mx-fs-body)", fontWeight: 600 }}>Maintenance history</h3>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "var(--mx-3)", fontSize: "var(--mx-fs-body)" }}>
                  {d!.maintenance.map((m, i) => (
                    <li key={i}>
                      <div>{m.endedAt ? "Completed" : "Under maintenance"}</div>
                      <div style={{ color: "var(--mx-text-3)", fontSize: "var(--mx-fs-meta)" }}>
                        {stamp(m.startedAt)}{m.endedAt ? ` → ${stamp(m.endedAt)}` : ""}
                        {m.details ? ` · ${m.details}` : ""}
                        {m.cost !== null ? ` · ${pkr(m.cost)}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section style={{ display: "grid", gap: "var(--mx-3)" }}>
              <h3 style={{ margin: 0, fontSize: "var(--mx-fs-body)", fontWeight: 600 }}>Status history</h3>
              <div style={{
                maxHeight: 220,
                overflowY: "auto",
                paddingRight: "var(--mx-2)",
                border: "1px solid var(--mx-border)",
                borderRadius: "var(--mx-r-panel)",
                background: "var(--mx-surface-2)",
                padding: "var(--mx-3)",
              }}>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "var(--mx-3)", fontSize: "var(--mx-fs-body)" }}>
                  {d!.history.map((h, i) => (
                    <li key={i}>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--mx-2)", flexWrap: "wrap" }}>
                        {h.from && <><StatusBadge tone="neutral">{h.from}</StatusBadge><span style={{ color: "var(--mx-text-3)" }}>→</span></>}
                        <StatusBadge tone={STATUS_TONE[h.to as Status] ?? "neutral"}>{h.to}</StatusBadge>
                      </div>
                      <div style={{ color: "var(--mx-text-3)", fontSize: "var(--mx-fs-meta)" }}>{stamp(h.at)}{h.note ? ` · ${h.note}` : ""}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>
        )}
      </Drawer>
      {dialog}
    </>
  );
}

// ---------------------------------------------------------------- add / edit form (no employee, no department here)

function Field({ label, value, onChange, type = "text", placeholder, max }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; max?: number;
}) {
  return (
    <label className="mx-field">
      <span>{label}</span>
      <input className="mx-input" type={type} value={value} placeholder={placeholder} maxLength={max}
        step={type === "number" ? "any" : undefined} min={type === "number" ? 0 : undefined}
        onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--mx-4)" } as const;
const heading = { margin: 0, fontSize: "var(--mx-fs-body)", fontWeight: 600 } as const;

function Editor({ asset, cats, onClose, onSaved }: { asset: Full | null; cats: Cat[]; onClose: () => void; onSaved: () => void }) {
  const a = asset;
  const [f, setF] = useState({
    name: a?.name ?? "", category: a ? String(a.categoryId) : "", brand: a?.brand ?? "", model: a?.model ?? "", serial: a?.serial ?? "",
    cost: a?.cost !== null && a?.cost !== undefined ? String(a.cost) : "",
    purchaseDate: a?.purchaseDate ?? "", warrantyStart: a?.warrantyStart ?? "", warrantyExpiry: a?.warrantyExpiry ?? "",
    status: (a?.status ?? "In Store") as string, description: a?.description ?? "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const locked = !!a && LOCKED_STATUSES.includes(a.status);
  const allowed = manualStatuses(!!a?.employee);
  const statusChoices: string[] = a && !allowed.includes(a.status) ? [a.status, ...allowed] : allowed;

  async function save() {
    if (!f.name.trim()) { setError("Please enter the asset's name."); return; }
    if (!f.category) { setError("Please choose a category."); return; }
    setBusy(true); setError("");
    const body = {
      name: f.name, categoryId: Number(f.category), brand: f.brand, model: f.model, serial: f.serial,
      cost: f.cost === "" ? null : Number(f.cost),
      purchaseDate: f.purchaseDate, warrantyStart: f.warrantyStart, warrantyExpiry: f.warrantyExpiry,
      status: f.status, description: f.description,
    };
    const res = a ? await send("PUT", `/api/assets/${a.id}`, body) : await send("POST", "/api/assets", body);
    setBusy(false);
    if (res.ok) onSaved(); else setError(res.error);
  }

  return (
    <Drawer title={a ? "Edit asset" : "Add asset"} sub={a?.tag} onClose={onClose} width={560}>
      <div style={{ display: "grid", gap: "var(--mx-6)" }}>
        <section style={{ display: "grid", gap: "var(--mx-4)" }}>
          <h3 style={heading}>Basics</h3>
          <Field label="Name" value={f.name} onChange={set("name")} max={120} placeholder="e.g. Dell Latitude 5440" />
          <Select label="Category" value={f.category} onChange={set("category")} options={categoryFormOptions(cats)} />
          <div style={grid}>
            <Field label="Brand" value={f.brand} onChange={set("brand")} max={80} />
            <Field label="Model" value={f.model} onChange={set("model")} max={80} />
            <Field label="Serial number" value={f.serial} onChange={set("serial")} max={80} />
          </div>
          {locked ? (
            <p style={{ margin: 0, color: "var(--mx-text-2)", fontSize: "var(--mx-fs-body)" }}>
              Status: <b>{a!.status}</b>. It is changed from its own page, not here.
            </p>
          ) : (
            <Select label="Status" value={f.status} onChange={set("status")}
              options={statusChoices.map((s) => ({ key: s, label: s }))} />
          )}
          <label className="mx-field">
            <span>Description</span>
            <textarea className="mx-input asset-description" rows={5} maxLength={2000} value={f.description}
              placeholder="Anything worth knowing: specs (for example i7, 16 GB RAM, 512 GB SSD), IP address, condition, accessories…"
              onChange={(e) => set("description")(e.target.value)} />
          </label>
        </section>

        <section style={{ display: "grid", gap: "var(--mx-4)" }}>
          <h3 style={heading}>Purchase & warranty</h3>
          <div style={grid}>
            <Field label="Purchase cost (PKR)" type="number" value={f.cost} onChange={set("cost")} />
            <Field label="Purchase date" type="date" value={f.purchaseDate} onChange={set("purchaseDate")} />
            <Field label="Warranty starts" type="date" value={f.warrantyStart} onChange={set("warrantyStart")} />
            <Field label="Warranty ends" type="date" value={f.warrantyExpiry} onChange={set("warrantyExpiry")} />
          </div>
        </section>

        {error && <p role="alert" style={{ margin: 0, color: "var(--mx-danger)", fontSize: "var(--mx-fs-body)" }}>{error}</p>}
        <div style={{ display: "flex", gap: "var(--mx-2)", flexWrap: "wrap" }}>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>{a ? "Save changes" : "Add asset"}</Button>
          <Button onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Drawer>
  );
}