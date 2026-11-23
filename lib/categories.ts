import { db, type AssetDoc, type CategoryDoc } from "@/lib/db";

type Fail = { error: string; status: number };

export async function readCategory(body: unknown, selfId?: number): Promise<{ name: string; parentId: number | null } | { error: string }> {
  const b = (body ?? {}) as { name?: unknown; parent_id?: unknown };
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { error: "Please enter a name." };
  if (name.length > 80) return { error: "The name is too long (80 letters at most)." };

  let parentId: number | null = null;
  if (b.parent_id !== null && b.parent_id !== undefined && b.parent_id !== "") {
    parentId = Number(b.parent_id);
    if (!Number.isInteger(parentId)) return { error: "Please pick a valid main kind." };
    if (parentId === selfId) return { error: "A kind can't sit under itself." };
    const database = await db();
    const parent = await database.collection<CategoryDoc>("categories").findOne({ _id: parentId });
    if (!parent) return { error: "That main kind no longer exists." };
    if (parent.parentId !== null) return { error: "Kinds go only one level deep: pick a main kind, not a sub-kind." };
    if (selfId !== undefined && await database.collection<CategoryDoc>("categories").countDocuments({ parentId: selfId })) {
      return { error: "This kind has sub-kinds, so it can't be placed under another kind." };
    }
  }
  return { name, parentId };
}

export async function removeCategory(id: number): Promise<{ ok: true } | Fail> {
  const database = await db();
  const categories = database.collection<CategoryDoc>("categories");
  if (!await categories.findOne({ _id: id }, { projection: { _id: 1 } })) {
    return { error: "That kind no longer exists.", status: 404 };
  }
  const hasChildren = await categories.findOne({ parentId: id }, { projection: { _id: 1 } });
  const hasAssets = await database.collection<AssetDoc>("assets").findOne({ categoryId: id }, { projection: { _id: 1 } });
  if (hasChildren || hasAssets) {
    return { error: "This kind is still in use (by assets, people or sub-kinds), so it can't be removed. Move or remove what uses it first.", status: 409 };
  }
  await categories.deleteOne({ _id: id });
  return { ok: true };
}
