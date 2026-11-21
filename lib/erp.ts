// Talks to the ERP (Metis HRMS) staff API. Runs on the server only: the secret never reaches the browser.
// If the ERP ever changes its answer, this is the only file that needs to change.
import crypto from "node:crypto";

export type ErpPerson = {
  employeeId: number;
  employeeCode?: string | null;
  name: string;
  designation?: string | null;
  positionTitle?: string | null;
  department?: string | null;
  division?: string | null;
  officialEmail?: string | null;
  officialPhone?: string | null;
  intercomExt?: string | null;
  joiningDate?: string | null;
  reportingManager?: { employeeId: number; name: string; designation?: string | null; active?: boolean } | null;
};

/** An error whose message is safe to show to a person. */
export class ErpError extends Error {}

const HELP: Record<number, string> = {
  401: "The ERP refused the key. The key ID or secret in .env.local is wrong, or this computer's clock is more than 5 minutes off.",
  403: "The ERP firewall refused the request.",
  400: "The ERP doesn't accept this request.",
  429: "The ERP says we asked too often. Wait 15 minutes and try again.",
  503: "The ERP service is switched off or hasn't synced yet. Try again later.",
};

export async function fetchStaff(): Promise<ErpPerson[]> {
  const { ERP_URL, ERP_KEY_ID, ERP_SECRET } = process.env;
  if (!ERP_URL || !ERP_KEY_ID || !ERP_SECRET) {
    throw new ErpError("The ERP link isn't set up yet. Check the .env.local file, then restart the app.");
  }
  let path: string;
  try { path = new URL(ERP_URL).pathname; } catch { throw new ErpError("ERP_URL in .env.local isn't a valid address."); }

  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(18).toString("base64url");
  const text = ["METIS-HMAC-SHA256", "GET", path, "", ts, nonce, crypto.createHash("sha256").update("").digest("hex")].join("\n");
  const signature = crypto.createHmac("sha256", ERP_SECRET).update(text).digest("hex");

  let res: Response;
  try {
    res = await fetch(ERP_URL, {
      headers: {
        "X-Metis-Key-Id": ERP_KEY_ID,
        "X-Metis-Timestamp": ts,
        "X-Metis-Nonce": nonce,
        "X-Metis-Signature": signature,
        "User-Agent": "MG-Asset-IMS/1.0",
      },
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
  } catch {
    throw new ErpError("Couldn't reach the ERP. Check the internet connection and try again.");
  }
  if (!res.ok) throw new ErpError(HELP[res.status] ?? `The ERP answered with error ${res.status}.`);

  const data = (await res.json().catch(() => null)) as { staff?: unknown } | null;
  if (!data || !Array.isArray(data.staff)) throw new ErpError("The ERP's answer wasn't in the expected shape.");
  return (data.staff as ErpPerson[]).filter(
    (p) => p && Number.isInteger(p.employeeId) && typeof p.name === "string" && p.name.trim() !== "",
  );
}