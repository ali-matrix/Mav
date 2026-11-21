"use client";
// Kinds of assets: main kinds (Computers) with sub-kinds under them (Laptop, Desktop).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, DataTable, Drawer, PageHeader, Select, StateView, useConfirm, type Column } from "@metis/ui";
import { send } from "@/lib/client";

type Cat = { id: number; name: string; parent_id: number | null };
type Line = Cat & { parentName: string | null };

export default function CategoriesPage() {
  const [cats, setCats] = useState<Cat[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<Cat | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/categories", { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      setCats(((await res.json()) as { rows: Cat[] }).rows);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Main kinds first (A→Z), each followed by its own sub-kinds.
  const lines = useMemo<Line[]>(() => {
    if (!cats) return [];
    const tops = cats.filter((c) => c.parent_id === null);
    return tops.flatMap((t) => [
      { ...t, parentName: null },
      ...cats.filter((c) => c.parent_id === t.id).map((c) => ({ ...c, parentName: t.name })),
    ]);
  }, [cats]);

  const columns: Column<Line>[] = [
    {
      key: "name", label: "Name",
      render: (r) => (
        <span style={{ fontWeight: r.parent_id === null ? 600 : 400, paddingLeft: r.parent_id === null ? 0 : "var(--mx-6)" }}>{r.name}</span>
      ),
    },
    {
      key: "parent", label: "Belongs to", width: 200,
      render: (r) => <span style={{ color: "var(--mx-text-3)" }}>{r.parentName ?? "Main kind"}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Categories" description="Kinds of assets and their sub-kinds"
        aside={<Button variant="primary" icon="plus" onClick={() => setEditing("new")}>Add category</Button>}
      />
      <div className="mx-section">
        <Card flush>
          {failed && cats === null ? (
            <StateView kind="error" title="Couldn't load the categories" action={<Button onClick={() => void load()}>Try again</Button>}>
              Check that the app is still running, then try again.
            </StateView>
          ) : cats === null ? (
            <StateView kind="loading" />
          ) : (
            <DataTable
              columns={columns} rows={lines} rowKey={(r) => String(r.id)} onRow={(r) => setEditing(r)} caption="Categories"
              empty={<StateView kind="empty" title="No categories yet">Add a main kind such as Computers, then sub-kinds under it.</StateView>}
            />
          )}
        </Card>
      </div>

      {editing && cats && (
        <Editor
          cat={editing === "new" ? null : editing} cats={cats}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
    </>
  );
}

function Editor({ cat, cats, onClose, onSaved }: { cat: Cat | null; cats: Cat[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(cat?.name ?? "");
  const [parent, setParent] = useState(cat?.parent_id ? String(cat.parent_id) : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ask, dialog] = useConfirm();

  // A kind that already has sub-kinds must stay a main kind (two levels only).
  const hasKids = !!cat && cats.some((c) => c.parent_id === cat.id);
  const options = [
    { key: "", label: "None: this is a main kind" },
    ...(hasKids ? [] : cats.filter((c) => c.parent_id === null && c.id !== cat?.id).map((c) => ({ key: String(c.id), label: c.name }))),
  ];

  async function save() {
    if (!name.trim()) { setError("Please enter a name."); return; }
    setBusy(true); setError("");
    const body = { name, parent_id: parent === "" ? null : Number(parent) };
    const res = cat ? await send("PUT", `/api/categories/${cat.id}`, body) : await send("POST", "/api/categories", body);
    setBusy(false);
    if (res.ok) onSaved(); else setError(res.error);
  }

  async function remove() {
    if (!cat) return;
    const yes = await ask({ title: "Remove this category?", body: `“${cat.name}” will be removed. This can't be undone.`, ok: "Remove", danger: true });
    if (!yes) return;
    setBusy(true); setError("");
    const res = await send("DELETE", `/api/categories/${cat.id}`);
    setBusy(false);
    if (res.ok) onSaved(); else setError(res.error);
  }

  return (
    <>
      <Drawer title={cat ? "Edit category" : "Add category"} sub={cat?.name} onClose={onClose} width={420}>
        <div style={{ display: "grid", gap: "var(--mx-5)" }}>
          <label className="mx-field">
            <span>Name</span>
            <input
              className="mx-input" value={name} maxLength={80} aria-invalid={error ? true : undefined}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
            />
          </label>
          <Select label="Belongs to" value={parent} options={options} onChange={setParent} />
          {hasKids && (
            <p style={{ margin: 0, color: "var(--mx-text-3)", fontSize: "var(--mx-fs-meta)" }}>
              This kind has sub-kinds under it, so it stays a main kind.
            </p>
          )}
          {error && <p role="alert" style={{ margin: 0, color: "var(--mx-danger)", fontSize: "var(--mx-fs-body)" }}>{error}</p>}
          <div style={{ display: "flex", gap: "var(--mx-2)", flexWrap: "wrap" }}>
            <Button variant="primary" onClick={() => void save()} disabled={busy}>{cat ? "Save changes" : "Add category"}</Button>
            <Button onClick={onClose}>Cancel</Button>
            {cat && <Button variant="ghost" onClick={() => void remove()} disabled={busy}>Remove</Button>}
          </div>
        </div>
      </Drawer>
      {dialog}
    </>
  );
}