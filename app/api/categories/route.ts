import { db } from "@/lib/db";
import { dbError, fail, ok } from "@/lib/http";
import { readCategory } from "@/lib/categories";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = db().prepare("SELECT id, name, parent_id FROM categories ORDER BY name").all();
  return ok({ rows });
}

export async function POST(req: Request) {
  const p = readCategory(await req.json().catch(() => null));
  if ("error" in p) return fail(400, p.error);
  try {
    const info = db().prepare("INSERT INTO categories (name, parent_id) VALUES (?, ?)").run(p.name, p.parentId);
    return ok({ id: Number(info.lastInsertRowid) }, 201);
  } catch (e) {
    return dbError(e, "kind");
  }
}
