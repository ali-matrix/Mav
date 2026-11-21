import { listAssignments } from "@/lib/assignments";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return ok(listAssignments(new URL(req.url).searchParams));
}