// Every name exported from src/index.ts must have its own heading or mention in README.md.
// node check.mjs  → exit 1 listing what is undocumented.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const idx = readFileSync(new URL("./src/index.ts", import.meta.url), "utf8");
const readme = readFileSync(new URL("./README.md", import.meta.url), "utf8");
const names = [...idx.matchAll(/export\s*\{([^}]*)\}/g)].flatMap((m) => m[1].split(","))
  .map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()).filter(Boolean);
const word = (n) => new RegExp(`(^|[^A-Za-z0-9_])${n}([^A-Za-z0-9_]|$)`);
const missing = names.filter((n) => !word(n).test(readme));
if (missing.length) { console.error(`Not in README.md: ${missing.join(", ")}`); process.exit(1); }
console.log(`@metis/ui: ${names.length} exports, all documented.`);

// The marks are drawn once, in marks/*.svg; everything built from them must still match.
execFileSync(process.execPath, [new URL("./scripts/build-marks.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "--check"], { stdio: "inherit" });
