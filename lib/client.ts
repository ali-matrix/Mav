// Browser-side helper: send a change to the API and get back either ok or a plain-words error.
export type SendResult = { ok: true } | { ok: false; error: string };

export async function send(method: "POST" | "PUT" | "PATCH" | "DELETE", url: string, body?: unknown): Promise<SendResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: data?.error ?? "Something went wrong. Please try again." };
  } catch {
    return { ok: false, error: "Couldn't reach the app. Check that it is still running." };
  }
}