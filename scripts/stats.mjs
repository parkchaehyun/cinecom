// Usage analytics: compares app-made reservations against total cafe reservations.
// Usage: node scripts/stats.mjs
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

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

console.log("\n=== 씨네꼼 상영실 예약 통계 (App Usage & Adoption) ===");

// 1. Overall all-time summary
const allTimeAppRes = await client.query("select count(*) as count, min(created_at) as earliest from app_reservations");
const allTimePostsRes = await client.query("select count(*) as count, min(write_ts) as earliest, max(write_ts) as latest from posts where is_reservation = true");

const appCountAll = Number(allTimeAppRes.rows[0].count);
const postsCountInDb = Number(allTimePostsRes.rows[0].count);

console.log(`\n[전체 현황 (All Time / DB Retention Window)]`);
console.log(`- 앱을 통한 총 예약 수: ${appCountAll}건 (기록 시작: ${allTimeAppRes.rows[0].earliest ? new Date(allTimeAppRes.rows[0].earliest).toLocaleDateString("ko-KR") : "없음"})`);
console.log(`- DB 보유 카페 예약글 수: ${postsCountInDb}건 (최근 90일 보유 창내)`);

// 2. Window comparisons: 7 days, 30 days, 90 days
console.log(`\n[기간별 예약 점유율 (App Share vs. Total Cafe Reservations)]`);

const windows = [
  { label: "최근 7일", days: 7 },
  { label: "최근 30일", days: 30 },
  { label: "최근 90일", days: 90 },
];

for (const w of windows) {
  const interval = `${w.days} days`;

  // Total cafe reservations in window
  const cafeQ = await client.query(
    `select count(*) as total, count(distinct writer_nick) as unique_writers
     from posts
     where is_reservation = true and write_ts >= now() - interval '${interval}'`,
  );
  const totalCafe = Number(cafeQ.rows[0].total);
  const uniqueCafeWriters = Number(cafeQ.rows[0].unique_writers);

  // App reservations in window
  const appQ = await client.query(
    `select count(*) as total
     from app_reservations
     where created_at >= now() - interval '${interval}'`,
  );
  const totalApp = Number(appQ.rows[0].total);

  // Unique app bookers in window (joined with posts to get writer_nick without storing personal data)
  const appWritersQ = await client.query(
    `select count(distinct p.writer_nick) as unique_bookers
     from app_reservations a
     join posts p on a.article_id = p.article_id
     where a.created_at >= now() - interval '${interval}'`,
  );
  const uniqueAppBookers = Number(appWritersQ.rows[0].unique_bookers);

  const pct = totalCafe > 0 ? ((totalApp / totalCafe) * 100).toFixed(1) : "0.0";
  const userPct = uniqueCafeWriters > 0 ? ((uniqueAppBookers / uniqueCafeWriters) * 100).toFixed(1) : "0.0";

  console.log(`\n* ${w.label} (${interval}):`);
  console.log(`  - 예약 건수: 앱 ${totalApp}건 / 카페 전체 ${totalCafe}건 (앱 점유율: ${pct}%)`);
  console.log(`  - 예약자 수: 앱 ${uniqueAppBookers}명 / 카페 전체 ${uniqueCafeWriters}명 (앱 이용률: ${userPct}%)`);
}

// 3. Room breakdown for app bookings
const roomQ = await client.query(
  `select room, count(*) as count from app_reservations group by room order by count desc`,
);
if (roomQ.rows.length > 0) {
  console.log(`\n[상영실별 앱 예약 분포]`);
  for (const r of roomQ.rows) {
    console.log(`  - ${r.room}: ${r.count}건`);
  }
}

console.log("\n========================================================\n");

await client.end();
