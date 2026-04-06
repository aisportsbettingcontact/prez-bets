/**
 * run_april5_full_pipeline.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Full April 5, 2026 pipeline:
 *   1. Re-run MLBAIModel.py for all 16 games (F5 + NRFI + HR Props now in engine)
 *   2. Scrape F5 + NRFI odds from Action Network (FanDuel NJ)
 *   3. Scrape HR Props from Action Network (Consensus)
 *   4. Log final DB state for all 16 games
 *
 * [INPUT]  gameDate = 2026-04-05
 * [OUTPUT] All 16 games updated with F5/NRFI model + book odds + HR props
 */

import { runMlbModelForDate } from "./server/mlbModelRunner";
import { scrapeAndStoreF5Nrfi } from "./server/mlbF5NrfiScraper";
import { scrapeHrPropsForDate } from "./server/mlbHrPropsScraper";
import * as mysql2 from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const TAG = "[PIPELINE-APR5]";
const DATE = "2026-04-05";

async function main() {
  console.log(`\n${TAG} ============================================================`);
  console.log(`${TAG} [INPUT]  gameDate=${DATE}`);
  console.log(`${TAG} [STEP 1] Re-running MLBAIModel.py for all 16 games`);
  console.log(`${TAG} ============================================================\n`);

  // ── STEP 1: Re-run MLB model ─────────────────────────────────────────────
  try {
    const modelResult = await runMlbModelForDate(DATE);
    console.log(`${TAG} [STATE]  Model run complete`);
    console.log(`${TAG} [OUTPUT] modeled=${modelResult.written} skipped=${modelResult.skipped} errors=${modelResult.errors}`);
    if (modelResult.errors > 0) {
      console.error(`${TAG} [VERIFY] WARN — ${modelResult.errors} model errors`);
    } else {
      console.log(`${TAG} [VERIFY] PASS — 0 model errors`);
    }
  } catch (err) {
    console.error(`${TAG} [FATAL] Model run failed: ${err}`);
    process.exit(1);
  }

  // ── STEP 2: Scrape F5 + NRFI odds ───────────────────────────────────────
  console.log(`\n${TAG} [STEP 2] Scraping F5 + NRFI odds from Action Network (FanDuel NJ)`);
  try {
    const f5Result = await scrapeAndStoreF5Nrfi(DATE);
    console.log(`${TAG} [OUTPUT] F5/NRFI odds: processed=${f5Result.processed} matched=${f5Result.matched} unmatched=${f5Result.unmatched.length} errors=${f5Result.errors.length}`);
    if (f5Result.errors.length > 0) {
      console.error(`${TAG} [VERIFY] WARN — ${f5Result.errors.length} F5/NRFI scrape errors`);
    } else {
      console.log(`${TAG} [VERIFY] PASS — 0 F5/NRFI errors`);
    }
  } catch (err) {
    console.error(`${TAG} [FATAL] F5/NRFI scrape failed: ${err}`);
    // Non-fatal — continue
  }

  // ── STEP 3: Scrape HR Props ──────────────────────────────────────────────
  console.log(`\n${TAG} [STEP 3] Scraping HR Props from Action Network (Consensus)`);
  try {
    const hrResult = await scrapeHrPropsForDate(DATE);
    console.log(`${TAG} [OUTPUT] HR Props: inserted=${hrResult.inserted} updated=${hrResult.updated} skipped=${hrResult.skipped} errors=${hrResult.errors}`);
    if (hrResult.errors > 0) {
      console.error(`${TAG} [VERIFY] WARN — ${hrResult.errors} HR Props scrape errors`);
    } else {
      console.log(`${TAG} [VERIFY] PASS — 0 HR Props errors`);
    }
  } catch (err) {
    console.error(`${TAG} [FATAL] HR Props scrape failed: ${err}`);
    // Non-fatal — continue
  }

  // ── STEP 4: Final DB audit ───────────────────────────────────────────────
  console.log(`\n${TAG} [STEP 4] Final DB audit for ${DATE}`);
  const conn = await mysql2.createConnection(process.env.DATABASE_URL!);
  const [rows] = await conn.execute<mysql2.RowDataPacket[]>(`
    SELECT
      id,
      CONCAT(awayTeam, '@', homeTeam) AS matchup,
      gameNumber,
      modelRunAt IS NOT NULL AS hasModel,
      modelF5AwayScore IS NOT NULL AS hasF5Model,
      modelPNrfi IS NOT NULL AS hasNrfiModel,
      f5AwayML IS NOT NULL AS hasF5BookOdds,
      nrfiOverOdds IS NOT NULL AS hasNrfiBookOdds,
      (SELECT COUNT(*) FROM mlb_hr_props WHERE gameId = games.id) AS hrPropsCount
    FROM games
    WHERE gameDate = '2026-04-05' AND sport = 'MLB'
    ORDER BY id
  `);
  await conn.end();

  let allGood = true;
  console.log(`\n${TAG} ── Per-Game Status ──────────────────────────────────────`);
  for (const r of rows) {
    const flags = [
      r.hasModel ? "MODEL✓" : "MODEL✗",
      r.hasF5Model ? "F5-MODEL✓" : "F5-MODEL✗",
      r.hasNrfiModel ? "NRFI-MODEL✓" : "NRFI-MODEL✗",
      r.hasF5BookOdds ? "F5-ODDS✓" : "F5-ODDS✗",
      r.hasNrfiBookOdds ? "NRFI-ODDS✓" : "NRFI-ODDS✗",
      `HR-PROPS=${r.hrPropsCount}`,
    ].join(" | ");
    const g = r.gameNumber > 1 ? ` (G${r.gameNumber})` : "";
    console.log(`${TAG}   id:${r.id} ${r.matchup}${g} — ${flags}`);
    if (!r.hasModel) allGood = false;
  }

  console.log(`\n${TAG} ── Summary ──────────────────────────────────────────────`);
  console.log(`${TAG} Total games: ${rows.length}`);
  console.log(`${TAG} [VERIFY] ${allGood ? "PASS" : "WARN"} — ${allGood ? "all models present" : "some models missing"}`);
  console.log(`${TAG} ============================================================\n`);
}

main().catch((err) => {
  console.error(`${TAG} [FATAL] Unhandled error: ${err}`);
  process.exit(1);
});
