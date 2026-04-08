/**
 * run_april8_pitchers.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Step 1: Run mlbScoreRefresh for April 8 to populate probable pitchers from
 *         MLB Stats API (awayStartingPitcher / homeStartingPitcher in games table).
 * Step 2: Also run RotoWire lineup scraper as a secondary source to fill any gaps.
 * Step 3: Verify all 15 games have both pitchers confirmed.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "dotenv/config";
import { refreshMlbScores } from "./server/mlbScoreRefresh.js";
import { scrapeRotowireLineupsTomorrow, upsertLineupsToDB } from "./server/rotowireLineupScraper.js";
import { getDb } from "./server/db.js";
import { games } from "./drizzle/schema.js";
import { eq, and } from "drizzle-orm";

const DATE = "2026-04-08";
const TAG = `[PitcherSeed][${DATE}]`;

console.log(`\n${"═".repeat(70)}`);
console.log(`${TAG} STEP 1 — MLB Stats API probable pitchers refresh`);
console.log(`${"═".repeat(70)}`);

const scoreResult = await refreshMlbScores(DATE);
console.log(`${TAG} [OK] Score refresh: updated=${scoreResult.updated} errors=${scoreResult.errors}`);

console.log(`\n${"═".repeat(70)}`);
console.log(`${TAG} STEP 2 — RotoWire lineup scraper (secondary source)`);
console.log(`${"═".repeat(70)}`);

try {
  const rotoResult = await scrapeRotowireLineupsTomorrow();
  console.log(`${TAG} [OK] RotoWire scraped: ${rotoResult.games.length} games`);
  if (rotoResult.games.length > 0) {
    const upsertResult = await upsertLineupsToDB(rotoResult.games, DATE);
    console.log(`${TAG} [OK] RotoWire upserted: saved=${upsertResult.saved} skipped=${upsertResult.skipped} errors=${upsertResult.errors}`);
  }
} catch (err) {
  console.warn(`${TAG} [WARN] RotoWire scrape failed: ${err instanceof Error ? err.message : String(err)}`);
}

console.log(`\n${"═".repeat(70)}`);
console.log(`${TAG} STEP 3 — Verify pitcher coverage`);
console.log(`${"═".repeat(70)}`);

const db = await getDb();
const rows = await db.select({
  away: games.awayTeam,
  home: games.homeTeam,
  awayP: games.awayStartingPitcher,
  homeP: games.homeStartingPitcher,
  awayML: games.awayML,
  bookTotal: games.bookTotal,
}).from(games).where(and(eq(games.gameDate, DATE), eq(games.sport, "MLB")));

let confirmed = 0;
let missing = 0;
for (const r of rows) {
  const hasBoth = r.awayP && r.homeP;
  if (hasBoth) confirmed++;
  else missing++;
  const status = hasBoth ? "✅" : "❌";
  console.log(`  ${status} ${r.away}@${r.home}: away="${r.awayP ?? "NULL"}" | home="${r.homeP ?? "NULL"}" | ML=${r.awayML ?? "null"} TOT=${r.bookTotal ?? "null"}`);
}

console.log(`\n${TAG} [SUMMARY] ${confirmed}/${rows.length} games have both starters confirmed`);
if (missing > 0) {
  console.warn(`${TAG} [WARN] ${missing} games still missing starters — model will skip them`);
}

process.exit(0);
