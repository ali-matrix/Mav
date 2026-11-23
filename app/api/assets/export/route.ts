import { exportAssets } from "@/lib/assets";
import { dbError, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await exportAssets());
  } catch (error) {
    return dbError(error, "asset export");
  }
}
