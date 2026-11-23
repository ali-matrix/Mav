import { db, dbTimestamp, nameKey, nextId, type CategoryDoc } from "@/lib/db";
import { dbError, fail, ok } from "@/lib/http";
import { readCategory } from "@/lib/categories";

export const dynamic = "force-dynamic";

export async function GET() {
  const database = await db();
  const rows = await database.collection<CategoryDoc>("categories").find().sort({ name: 1 })
    .collation({ locale: "en", strength: 2 }).toArray();
  return ok({ rows: rows.map((row) => ({ id: row._id, name: row.name, parent_id: row.parentId })) });
}

export async function POST(req: Request) {
  const p = await readCategory(await req.json().catch(() => null));
  if ("error" in p) return fail(400, p.error);
  try {
    const database = await db();
    const id = await nextId(database, "categories");
    await database.collection<CategoryDoc>("categories").insertOne({
      _id: id, name: p.name, nameKey: nameKey(p.name), parentId: p.parentId, createdAt: dbTimestamp(),
    });
    return ok({ id }, 201);
  } catch (e) {
    return dbError(e, "kind");
  }
}
