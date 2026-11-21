"use client";
// One page for a simple list (departments, locations): table, add, edit, remove.
import { useCallback, useEffect, useState } from "react";
import { Button, Card, DataTable, Drawer, PageHeader, StateView, StatusBadge, Switch, useConfirm, type Column } from "@metis/ui";
import { send } from "@/lib/client";

type Row = { id: number; name: string; is_active: boolean };

export default function RefPage({ title, description, endpoint, noun }: {
  title: string; description: string; endpoint: string; noun: string;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<Row | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as { rows: Row[] };
      setRows(data.rows);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  const columns: Column<Row>[] = [
    { key: "name", label: "Name", render: (r) => <span style={{ fontWeight: 500 }}>{r.name}</span> },
    {
      key: "status", label: "Status", width: 130,
      render: (r) => <StatusBadge tone={r.is_active ? "ok" : "neutral"}>{r.is_active ? "Active" : "Inactive"}</StatusBadge>,
    },
  ];

  return (
    <>
      <PageHeader
        title={title} description={description}
        aside={<Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Add {noun}</Button>}
      />
      <div className="mx-section">
        <Card flush>
          {failed && rows === null ? (
            <StateView kind="error" title={`Couldn't load the ${noun} list`} action={<Button onClick={() => void load()}>Try again</Button>}>
              Check that the app is still running, then try again.
            </StateView>
          ) : rows === null ? (
            <StateView kind="loading" />
          ) : (
            <DataTable
              columns={columns} rows={rows} rowKey={(r) => String(r.id)} onRow={(r) => setEditing(r)}
              caption={title}
              empty={<StateView kind="empty" title={`No ${noun}s yet`}>Add the first {noun} to get started.</StateView>}
            />
          )}
        </Card>
      </div>

      {editing && (
        <Editor
          row={editing === "new" ? null : editing} noun={noun} endpoint={endpoint}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
    </>
  );
}

function Editor({ row, noun, endpoint, onClose, onSaved }: {
  row: Row | null; noun: string; endpoint: string; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(row?.name ?? "");
  const [active, setActive] = useState(row?.is_active ?? true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ask, dialog] = useConfirm();

  async function save() {
    if (!name.trim()) { setError("Please enter a name."); return; }
    setBusy(true); setError("");
    const res = row
      ? await send("PUT", `${endpoint}/${row.id}`, { name, is_active: active })
      : await send("POST", endpoint, { name, is_active: active });
    setBusy(false);
    if (res.ok) onSaved(); else setError(res.error);
  }

  async function remove() {
    if (!row) return;
    const yes = await ask({
      title: `Remove this ${noun}?`,
      body: `“${row.name}” will be removed. This can't be undone.`,
      ok: "Remove", danger: true,
    });
    if (!yes) return;
    setBusy(true); setError("");
    const res = await send("DELETE", `${endpoint}/${row.id}`);
    setBusy(false);
    if (res.ok) onSaved(); else setError(res.error);
  }

  return (
    <>
      <Drawer title={row ? `Edit ${noun}` : `Add ${noun}`} sub={row?.name} onClose={onClose} width={420}>
        <div style={{ display: "grid", gap: "var(--mx-5)" }}>
          <label className="mx-field">
            <span>Name</span>
            <input
              className="mx-input" value={name} maxLength={80} aria-invalid={error ? true : undefined}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
            />
          </label>
          <Switch checked={active} onChange={setActive} label={active ? "Active" : "Inactive"} />
          {error && <p role="alert" style={{ margin: 0, color: "var(--mx-danger)", fontSize: "var(--mx-fs-body)" }}>{error}</p>}
          <div style={{ display: "flex", gap: "var(--mx-2)", flexWrap: "wrap" }}>
            <Button variant="primary" onClick={() => void save()} disabled={busy}>{row ? "Save changes" : `Add ${noun}`}</Button>
            <Button onClick={onClose}>Cancel</Button>
            {row && <Button variant="ghost" onClick={() => void remove()} disabled={busy}>Remove</Button>}
          </div>
        </div>
      </Drawer>
      {dialog}
    </>
  );
}