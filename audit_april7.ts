/**
 * AUDIT: April 7, 2026 — MLB + NHL game state
 * [INPUT] DB games for 2026-04-07
 * [OUTPUT] Per-sport counts, odds coverage, model coverage, publish status
 */
import "dotenv/config";
import { getDb } from "./server/db";
import { games } from "./drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

const DATE = "2026-04-07";

async function audit() {
  const db = await getDb();
  if (!db) { console.error("[FAIL] No DB connection"); process.exit(1); }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`[INPUT] Auditing DB for date: ${DATE}`);
  console.log(`${"=".repeat(70)}\n`);

  // ── MLB ──────────────────────────────────────────────────────────────────
  const mlbGames = await db.select().from(games).where(
    and(eq(games.gameDate, DATE), eq(games.sport, "MLB"))
  );

  console.log(`[STEP] MLB Games for ${DATE}`);
  console.log(`[STATE] Total MLB games in DB: ${mlbGames.length}`);

  let mlbOddsCount = 0, mlbModelCount = 0, mlbPublishedCount = 0;
  let mlbF5Count = 0, mlbNrfiCount = 0;

  for (const g of mlbGames) {
    const hasOdds = g.awayML !== null && g.homeML !== null && g.total !== null;
    const hasModel = g.modelAwayWinPct !== null;
    const hasF5 = g.f5AwayML !== null;
    const hasNrfi = g.nrfiOverOdds !== null;
    if (hasOdds) mlbOddsCount++;
    if (hasModel) mlbModelCount++;
    if (g.publishedToFeed) mlbPublishedCount++;
    if (hasF5) mlbF5Count++;
    if (hasNrfi) mlbNrfiCount++;
    console.log(
      `  [OUTPUT] ${g.awayTeam}@${g.homeTeam} | odds=${hasOdds?"✅":"❌"} model=${hasModel?"✅":"❌"} f5=${hasF5?"✅":"❌"} nrfi=${hasNrfi?"✅":"❌"} pub=${g.publishedToFeed?"✅":"❌"} | ML=${g.awayML}/${g.homeML} total=${g.total} spread=${g.awaySpread}`
    );
  }

  console.log(`\n[VERIFY] MLB Summary:`);
  console.log(`  Games in DB:    ${mlbGames.length} (expected 15)`);
  console.log(`  With odds:      ${mlbOddsCount}/${mlbGames.length}`);
  console.log(`  With model:     ${mlbModelCount}/${mlbGames.length}`);
  console.log(`  With F5 odds:   ${mlbF5Count}/${mlbGames.length}`);
  console.log(`  With NRFI odds: ${mlbNrfiCount}/${mlbGames.length}`);
  console.log(`  Published:      ${mlbPublishedCount}/${mlbGames.length}`);

  // ── NHL ──────────────────────────────────────────────────────────────────
  const nhlGames = await db.select().from(games).where(
    and(eq(games.gameDate, DATE), eq(games.sport, "NHL"))
  );

  console.log(`\n[STEP] NHL Games for ${DATE}`);
  console.log(`[STATE] Total NHL games in DB: ${nhlGames.length}`);

  let nhlOddsCount = 0, nhlModelCount = 0, nhlPublishedCount = 0;

  for (const g of nhlGames) {
    const hasOdds = g.awayML !== null && g.homeML !== null && g.total !== null;
    const hasModel = g.modelAwayWinPct !== null;
    if (hasOdds) nhlOddsCount++;
    if (hasModel) nhlModelCount++;
    if (g.publishedToFeed) nhlPublishedCount++;
    console.log(
      `  [OUTPUT] ${g.awayTeam}@${g.homeTeam} | odds=${hasOdds?"✅":"❌"} model=${hasModel?"✅":"❌"} pub=${g.publishedToFeed?"✅":"❌"} | ML=${g.awayML}/${g.homeML} total=${g.total} puckLine=${g.awaySpread}`
    );
  }

  console.log(`\n[VERIFY] NHL Summary:`);
  console.log(`  Games in DB:    ${nhlGames.length} (expected 11)`);
  console.log(`  With odds:      ${nhlOddsCount}/${nhlGames.length}`);
  console.log(`  With model:     ${nhlModelCount}/${nhlGames.length}`);
  console.log(`  Published:      ${nhlPublishedCount}/${nhlGames.length}`);

  // ── K-Props ───────────────────────────────────────────────────────────────
  const [kSeeded] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM mlb_strikeout_props WHERE game_date = ${DATE}`
  ) as any[];
  const [kModeled] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM mlb_strikeout_props WHERE game_date = ${DATE} AND k_proj IS NOT NULL`
  ) as any[];

  // ── HR Props ──────────────────────────────────────────────────────────────
  const [hrSeeded] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM mlb_hr_props WHERE game_date = ${DATE}`
  ) as any[];
  const [hrModeled] = await db.execute(
    sql`SELECT COUNT(*) as cnt FROM mlb_hr_props WHERE game_date = ${DATE} AND model_p_hr IS NOT NULL`
  ) as any[];

  console.log(`\n[VERIFY] MLB Props Summary:`);
  console.log(`  K-Props seeded:   ${Number(kSeeded[0]?.cnt ?? 0)}`);
  console.log(`  K-Props modeled:  ${Number(kModeled[0]?.cnt ?? 0)}`);
  console.log(`  HR Props seeded:  ${Number(hrSeeded[0]?.cnt ?? 0)}`);
  console.log(`  HR Props modeled: ${Number(hrModeled[0]?.cnt ?? 0)}`);

  console.log(`\n${"=".repeat(70)}`);
  console.log(`[OUTPUT] AUDIT COMPLETE`);
  console.log(`${"=".repeat(70)}\n`);

  process.exit(0);
}

audit().catch((e) => { console.error("[FAIL]", e); process.exit(1); });
