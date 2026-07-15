// One-off migration runner: applies supabase/schema.sql via SUPABASE_DB_URL.
// Usage: node scripts/migrate.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !m[1].startsWith("#")) env[m[1]] = m[2];
  }
  return env;
}

const root = fileURLToPath(new URL("..", import.meta.url));
const env = loadEnv(root + ".env.local");
const connectionString = env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("SUPABASE_DB_URL is empty in .env.local");
  process.exit(1);
}
const sql = readFileSync(root + "supabase/schema.sql", "utf8");

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(sql);
const { rows } = await client.query(
  "select table_name from information_schema.tables where table_schema='public' order by table_name",
);
await client.end();
console.log("public tables:", rows.map((r) => r.table_name).join(", ") || "(none)");
console.log("schema applied ✓");
