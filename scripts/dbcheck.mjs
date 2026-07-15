// Read-only connectivity check for SUPABASE_DB_URL (no schema changes).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = fileURLToPath(new URL("..", import.meta.url));
const env = {};
for (const line of readFileSync(root + ".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !m[1].startsWith("#")) env[m[1]] = m[2];
}
if (!env.SUPABASE_DB_URL) {
  console.error("SUPABASE_DB_URL is empty");
  process.exit(1);
}

const client = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const v = await client.query("select version()");
  const t = await client.query(
    "select table_name from information_schema.tables where table_schema='public' order by 1",
  );
  console.log("CONNECTED:", v.rows[0].version.split(" ").slice(0, 2).join(" "));
  console.log("public tables:", t.rows.map((r) => r.table_name).join(", ") || "(none yet)");
  await client.end();
} catch (e) {
  console.error("FAILED:", e.message);
  process.exit(1);
}
