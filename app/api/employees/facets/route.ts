import { employeeFacets } from "@/lib/employees";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok(employeeFacets());
}