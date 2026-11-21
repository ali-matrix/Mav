import { dashboardData } from "@/lib/dashboard";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok(dashboardData());
}
