// Small helpers so every API route answers the same way.
import { NextResponse } from "next/server";

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

/** Turn a database error into a plain-words answer (never a raw error). */
export function dbError(e: unknown, what: string) {
  const err = (e ?? {}) as { errcode?: number; message?: string };
  const msg = err.message ?? "";
  // 2067 / 1555 = a UNIQUE / PRIMARY KEY rule broken; 787 = a FOREIGN KEY rule broken.
  if (err.errcode === 2067 || err.errcode === 1555 || msg.includes("UNIQUE constraint failed")) {
    return fail(409, `A ${what} with that name already exists.`);
  }
  if (err.errcode === 787 || msg.includes("FOREIGN KEY constraint failed")) {
    return fail(409, `This ${what} is still in use (by assets, people or sub-kinds), so it can't be removed. Move or remove what uses it first.`);
  }
  console.error(e);
  return fail(500, "Something went wrong on our side. Please try again.");
}