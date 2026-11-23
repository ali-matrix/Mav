import { completeMaintenance, startMaintenance } from "@/lib/assets";
import { dbError, fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

async function idOf(ctx: Ctx) {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) ? id : null;
}

export async function POST(req: Request, ctx: Ctx) {
  const id = await idOf(ctx);
  if (id === null) return fail(400, "That isn't a valid asset.");
  try {
    const r = await startMaintenance(id, await req.json().catch(() => null));
    return "error" in r ? fail(r.status, r.error) : ok(r);
  } catch (e) {
    return dbError(e, "maintenance");
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const id = await idOf(ctx);
  if (id === null) return fail(400, "That isn't a valid asset.");
  try {
    const r = await completeMaintenance(id, await req.json().catch(() => null));
    return "error" in r ? fail(r.status, r.error) : ok(r);
  } catch (e) {
    return dbError(e, "maintenance");
  }
}
