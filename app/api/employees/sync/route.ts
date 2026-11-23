import { fail, ok } from "@/lib/http";
import { startSync, syncStatus } from "@/lib/employeeSync";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok(await syncStatus());
}

export async function POST() {
  const r = await startSync();
  return r.ok ? ok({ started: true }, 202) : fail(r.status, r.error);
}