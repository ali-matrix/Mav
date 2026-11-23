// Small helpers so every API route answers the same way.
import { NextResponse } from "next/server";

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

/** Turn a database error into a plain-words answer (never a raw error). */
export function dbError(e: unknown, what: string) {
  const err = (e ?? {}) as { code?: number; message?: string };
  if (err.code === 11000) {
    return fail(409, `A ${what} with that name already exists.`);
  }
  console.error(e);
  return fail(500, "Something went wrong on our side. Please try again.");
}