// Rules for a category: a name, and optionally ONE main kind above it (two levels only).
import { db } from "@/lib/db";

export function readCategory(body: unknown, selfId?: number): { name: string; parentId: number | null } | { error: string } {
  const b = (body ?? {}) as { name?: unknown; parent_id?: unknown };
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { error: "Please enter a name." };
  if (name.length > 80) return { error: "The name is too long (80 letters at most)." };

  let parentId: number | null = null;
  if (b.parent_id !== null && b.parent_id !== undefined && b.parent_id !== "") {
    parentId = Number(b.parent_id);
    if (!Number.isInteger(parentId)) return { error: "Please pick a valid main kind." };
    if (parentId === selfId) return { error: "A kind can't sit under itself." };
    const parent = db().prepare("SELECT parent_id FROM categories WHERE id = ?").get(parentId) as { parent_id: number | null } | undefined;
    if (!parent) return { error: "That main kind no longer exists." };
    if (parent.parent_id !== null) return { error: "Kinds go only one level deep: pick a main kind, not a sub-kind." };
    if (selfId !== undefined) {
      const kids = db().prepare("SELECT COUNT(*) AS n FROM categories WHERE parent_id = ?").get(selfId) as { n: number };
      if (kids.n > 0) return { error: "This kind has sub-kinds, so it can't be placed under another kind." };
    }
  }
  return { name, parentId };
}