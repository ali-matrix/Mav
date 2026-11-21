// A one-off check that the ERP (Metis HRMS) staff API answers. It only reads and prints; it saves nothing.
// Run:  node --env-file=.env.local scripts/test-erp.mjs
import crypto from "node:crypto";

const { ERP_URL, ERP_KEY_ID, ERP_SECRET } = process.env;
if (!ERP_URL || !ERP_KEY_ID || !ERP_SECRET) {
  console.error("Missing ERP_URL, ERP_KEY_ID or ERP_SECRET. Check the .env.local file.");
  process.exit(1);
}

const PATH = new URL(ERP_URL).pathname;
const query = ""; // everyone
const ts = String(Math.floor(Date.now() / 1000));
const nonce = crypto.randomBytes(18).toString("base64url");
const text = ["METIS-HMAC-SHA256", "GET", PATH, query, ts, nonce, crypto.createHash("sha256").update("").digest("hex")].join("\n");
const signature = crypto.createHmac("sha256", ERP_SECRET).update(text).digest("hex");

const HELP = {
  401: "Key ID or secret is wrong, or this computer's clock is more than 5 minutes off.",
  403: "The firewall refused the request (the User-Agent header is needed).",
  400: "The ERP says a parameter is unknown.",
  429: "Too many calls. Wait 15 minutes.",
  503: "The ERP service is off or has not synced yet. Try later.",
};

let res;
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
  });
} catch (e) {
  console.error("Could not reach the ERP:", e.cause?.code ?? e.message);
  process.exit(1);
}

if (!res.ok) {
  console.error(`ERP answered ${res.status}. ${HELP[res.status] ?? ""}`);
  console.error((await res.text()).slice(0, 300));
  process.exit(1);
}

const data = await res.json();
const staff = data.staff ?? [];
const count = (f) => staff.filter(f).length;

console.log("OK. Staff returned:", data.count, "| list length:", staff.length);
console.log("ERP last read HRMS at:", data.dataHeld?.updatedAt, "| organizations:", data.dataHeld?.organizations);
console.log("Distinct departments:", new Set(staff.map((p) => p.department)).size);
console.log("Duplicate employeeIds:", staff.length - new Set(staff.map((p) => p.employeeId)).size);
console.log("Missing name:", count((p) => !p.name), "| missing code:", count((p) => !p.employeeCode),
  "| missing email:", count((p) => !p.officialEmail), "| missing phone:", count((p) => !p.officialPhone));
console.log("\nFirst 3 people:");
for (const p of staff.slice(0, 3)) {
  console.log(" ", p.employeeCode, "|", p.name, "|", p.designation, "|", p.department, "|", p.officialEmail ?? "-");
}