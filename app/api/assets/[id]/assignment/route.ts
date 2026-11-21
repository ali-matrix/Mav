import { assignAsset, returnAsset } from "@/lib/assets";
import { dbError, fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

async function idOf(ctx: Ctx) {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) ? id : null;
}

// Give the asset to an employee (or transfer it to another one).
export async function POST(req: Request, ctx: Ctx) {
  const id = await idOf(ctx);
  if (id === null) return fail(400, "That isn't a valid asset.");
  try {
    const r = assignAsset(id, await req.json().catch(() => null));
    return "error" in r ? fail(r.status, r.error) : ok(r);
  } catch (e) {
    return dbError(e, "asset");
  }
}

// Take the asset back.
export async function DELETE(_req: Request, ctx: Ctx) {
  const id = await idOf(ctx);
  if (id === null) return fail(400, "That isn't a valid asset.");
  try {
    const r = returnAsset(id);
    return "error" in r ? fail(r.status, r.error) : ok(r);
  } catch (e) {
    return dbError(e, "asset");
  }
}