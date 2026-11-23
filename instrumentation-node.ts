import { db } from "./lib/db";

void db().catch((error: unknown) => {
  console.error("MongoDB startup warm-up failed:", error);
});
