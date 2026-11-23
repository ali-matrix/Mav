import { db, nameKey, type CategoryDoc } from "@/lib/db";
import { dbError, fail, ok } from "@/lib/http";
import { readCategory, removeCategory } from "@/lib/categories";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return fail(400, "That isn't a valid record.");
  const p = await readCategory(await req.json().catch(() => null), id);
  if ("error" in p) return fail(400, p.error);
  try {
    const database = await db();
    const result = await database.collection<CategoryDoc>("categories").updateOne(
      { _id: id }, { $set: { name: p.name, nameKey: nameKey(p.name), parentId: p.parentId } },
    );
    return result.matchedCount ? ok({ ok: true }) : fail(404, "That kind no longer exists.");
  } catch (e) {
    return dbError(e, "kind");
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return fail(400, "That isn't a valid record.");
  const result = await removeCategory(id);
  return "error" in result ? fail(result.status, result.error) : ok(result);
}