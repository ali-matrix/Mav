// Browser-side API helpers: briefly reuse successful reads and report write failures in plain words.
export type SendResult = { ok: true } | { ok: false; error: string };

const GET_CACHE_MS = 2_000;
const getCache = new Map<string, { response: Response; expiresAt: number }>();

export async function cachedFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET") return fetch(url, init);
  if (init?.signal?.aborted) throw new DOMException("The request was aborted.", "AbortError");

  const now = Date.now();
  for (const [key, entry] of getCache) {
    if (entry.expiresAt <= now) getCache.delete(key);
  }
  const cached = getCache.get(url);
  if (cached) return cached.response.clone();

  const response = await fetch(url, init);
  if (response.ok) getCache.set(url, { response: response.clone(), expiresAt: Date.now() + GET_CACHE_MS });
  return response;
}

export async function send(method: "POST" | "PUT" | "PATCH" | "DELETE", url: string, body?: unknown): Promise<SendResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.ok) {
      getCache.clear();
      return { ok: true };
    }
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: data?.error ?? "Something went wrong. Please try again." };
  } catch {
    return { ok: false, error: "Couldn't reach the app. Check that it is still running." };
  }
}