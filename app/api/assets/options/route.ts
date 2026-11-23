import { assetOptions } from "@/lib/assets";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok(await assetOptions());
}
