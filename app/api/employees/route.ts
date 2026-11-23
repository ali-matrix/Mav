import { listEmployees } from "@/lib/employees";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return ok(await listEmployees(new URL(req.url).searchParams));
}