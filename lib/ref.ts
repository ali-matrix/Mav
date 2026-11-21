// Shared API logic for the two simple lists: departments and locations (name + active).
import { db } from "@/lib/db";
import { dbError, fail, ok } from "@/lib/http";

type Table = "departments" | "locations";
const NOUN: Record<Table, string> = { departments: "department", locations: "location" };
type Row = { id: number; name: string; is_active: number };
type Ctx = { params: Promise<{ id: string }> };

function parse(body: unknown): { name: string; active: number } | { error: string } {
  const b = (body ?? {}) as { name?: unknown; is_active?: unknown };
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { error: "Please enter a name." };
  if (name.length > 80) return { error: "The name is too long (80 letters at most)." };
  return { name, active: b.is_active === false ? 0 : 1 };
}

export function listAndCreate(table: Table) {
  return {
    async GET() {
      const rows = db().prepare(`SELECT id, name, is_active FROM ${table} ORDER BY name`).all() as Row[];
      return ok({ rows: rows.map((r) => ({ id: r.id, name: r.name, is_active: r.is_active === 1 })) });
    },
    async POST(req: Request) {
      const p = parse(await req.json().catch(() => null));
      if ("error" in p) return fail(400, p.error);
      try {
        const info = db().prepare(`INSERT INTO ${table} (name, is_active) VALUES (?, ?)`).run(p.name, p.active);
        return ok({ id: Number(info.lastInsertRowid) }, 201);
      } catch (e) {
        return dbError(e, NOUN[table]);
      }
    },
  };
}

export function updateAndRemove(table: Table) {
  return {
    async PUT(req: Request, ctx: Ctx) {
      const id = Number((await ctx.params).id);
      if (!Number.isInteger(id)) return fail(400, "That isn't a valid record.");
      const p = parse(await req.json().catch(() => null));
      if ("error" in p) return fail(400, p.error);
      try {
        const info = db().prepare(`UPDATE ${table} SET name = ?, is_active = ? WHERE id = ?`).run(p.name, p.active, id);
        return info.changes ? ok({ ok: true }) : fail(404, `That ${NOUN[table]} no longer exists.`);
      } catch (e) {
        return dbError(e, NOUN[table]);
      }
    },
    async DELETE(_req: Request, ctx: Ctx) {
      const id = Number((await ctx.params).id);
      if (!Number.isInteger(id)) return fail(400, "That isn't a valid record.");
      try {
        const info = db().prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
        return info.changes ? ok({ ok: true }) : fail(404, `That ${NOUN[table]} no longer exists.`);
      } catch (e) {
        return dbError(e, NOUN[table]);
      }
    },
  };
}