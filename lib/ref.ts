import { db, dbTimestamp, nameKey, nextId, type RefDoc } from "@/lib/db";
import { dbError, fail, ok } from "@/lib/http";

type Table = "departments" | "locations";
const NOUN: Record<Table, string> = { departments: "department", locations: "location" };
type Ctx = { params: Promise<{ id: string }> };

function parse(body: unknown): { name: string; active: boolean } | { error: string } {
  const b = (body ?? {}) as { name?: unknown; is_active?: unknown };
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { error: "Please enter a name." };
  if (name.length > 80) return { error: "The name is too long (80 letters at most)." };
  return { name, active: b.is_active !== false };
}

export function listAndCreate(table: Table) {
  return {
    async GET() {
      const database = await db();
      const rows = await database.collection<RefDoc>(table).find().sort({ name: 1 })
        .collation({ locale: "en", strength: 2 }).toArray();
      return ok({ rows: rows.map((row) => ({ id: row._id, name: row.name, is_active: row.isActive })) });
    },
    async POST(req: Request) {
      const p = parse(await req.json().catch(() => null));
      if ("error" in p) return fail(400, p.error);
      try {
        const database = await db();
        const id = await nextId(database, table);
        await database.collection<RefDoc>(table).insertOne({
          _id: id, name: p.name, nameKey: nameKey(p.name), isActive: p.active, createdAt: dbTimestamp(),
        });
        return ok({ id }, 201);
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
        const database = await db();
        const result = await database.collection<RefDoc>(table).updateOne(
          { _id: id },
          { $set: { name: p.name, nameKey: nameKey(p.name), isActive: p.active } },
        );
        return result.matchedCount ? ok({ ok: true }) : fail(404, `That ${NOUN[table]} no longer exists.`);
      } catch (e) {
        return dbError(e, NOUN[table]);
      }
    },
    async DELETE(_req: Request, ctx: Ctx) {
      const id = Number((await ctx.params).id);
      if (!Number.isInteger(id)) return fail(400, "That isn't a valid record.");
      try {
        const database = await db();
        if (table === "locations" && await database.collection("assets").findOne({ locationId: id }, { projection: { _id: 1 } })) {
          return fail(409, "This location is still in use (by assets, people or sub-kinds), so it can't be removed. Move or remove what uses it first.");
        }
        const result = await database.collection<RefDoc>(table).deleteOne({ _id: id });
        return result.deletedCount ? ok({ ok: true }) : fail(404, `That ${NOUN[table]} no longer exists.`);
      } catch (e) {
        return dbError(e, NOUN[table]);
      }
    },
  };
}
