import { listAssignments } from "@/lib/assignments";
import { fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const employeeId = params.get("employeeId");
  if (employeeId !== null && !/^[1-9]\d*$/.test(employeeId)) {
    return fail(400, "A valid employee ID is required.");
  }
  return ok(await listAssignments(params));
}