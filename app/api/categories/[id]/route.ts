import { db } from "@/lib/db";
import { dbError, fail, ok } from "@/lib/http";
import { readCategory } from "@/lib/categories";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return fail(400, "That isn't a valid record.");
  const p = readCategory(await req.json().catch(() => null), id);
  if ("error" in p) return fail(400, p.error);
  try {
    const info = db().prepare("UPDATE categories SET name = ?, parent_id = ? WHERE id = ?").run(p.name, p.parentId, id);
    return info.changes ? ok({ ok: true }) : fail(404, "That kind no longer exists.");
  } catch (e) {
    return dbError(e, "kind");
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return fail(400, "That isn't a valid record.");
  try {
    const info = db().prepare("DELETE FROM categories WHERE id = ?").run(id);
    return info.changes ? ok({ ok: true }) : fail(404, "That kind no longer exists.");
  } catch (e) {
    return dbError(e, "kind");
  }
}