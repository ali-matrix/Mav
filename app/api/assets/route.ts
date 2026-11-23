import { createAsset, listAssets } from "@/lib/assets";
import { dbError, fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return ok(await listAssets(new URL(req.url).searchParams));
}

export async function POST(req: Request) {
  try {
    const r = await createAsset(await req.json().catch(() => null));
    return "error" in r ? fail(r.status, r.error) : ok(r, 201);
  } catch (e) {
    return dbError(e, "asset");
  }
}