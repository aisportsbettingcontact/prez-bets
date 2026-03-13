/**
 * NHL DB Upsert Test Runner
 *
 * Directly calls the NHL refresh pipeline (scrape + schedule + DB upsert)
 * and verifies the results in the database.
 *
 * Run: pnpm tsx test_nhl_db_upsert_runner.ts
 */
import "dotenv/config";
import { runVsinRefresh } from "./server/vsinAutoRefresh";
import { listGamesByDate } from "./server/db";

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  NHL DB Upsert Test — Live Pipeline Execution");
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log("[TEST] Triggering full VSiN refresh (NCAAM + NBA + NHL)...");
  console.log("[TEST] This will take 30-90 seconds (3 sports × scrape + schedule API)...\n");

  const result = await runVsinRefresh();
  if (!result) {
    console.error("[TEST] ✘ Refresh returned null — check server logs for errors");
    process.exit(1);
  }

  console.log("\n═══ Refresh Result ═══");
  console.log(`  NCAAM: ${result.updated} updated, ${result.inserted} inserted, ${result.ncaaInserted} NCAA-only`);
  console.log(`  NBA:   ${result.nbaUpdated} updated, ${result.nbaInserted} inserted, ${result.nbaScheduleInserted} schedule-only`);
  console.log(`  NHL:   ${result.nhlUpdated} updated, ${result.nhlInserted} inserted, ${result.nhlScheduleInserted} schedule-only`);
  console.log(`  Total NHL VSiN games processed: ${result.nhlTotal}`);
  console.log(`  Refresh completed at: ${result.refreshedAt}\n`);

  // Query DB for today's NHL games
  const today = new Date().toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2");

  console.log(`[TEST] Querying DB for NHL games on ${today}...`);
  const nhlGames = await listGamesByDate(today, "NHL");
  console.log(`[TEST] Found ${nhlGames.length} NHL games in DB for today\n`);

  if (nhlGames.length === 0) {
    console.warn("[TEST] ⚠ No NHL games in DB — check if VSiN scrape returned data");
    console.warn("[TEST] Possible causes: VSiN page behind paywall, no games today, slug mismatch");
  } else {
    console.log("═══ Per-Game DB Verification ═══\n");
    for (const g of nhlGames) {
      const hasOdds = g.awayBookSpread !== null || g.awayML !== null;
      const hasSplits = g.spreadAwayBetsPct !== null;
      const hasStartTime = g.startTimeEst && g.startTimeEst !== "TBD";
      const statusIcon = (hasOdds && hasSplits && hasStartTime) ? "✔" : "⚠";
      console.log(
        `  ${statusIcon} ${g.awayTeam} @ ${g.homeTeam} | ${g.startTimeEst} ET | ` +
        `spread=${g.awayBookSpread ?? "?"} | total=${g.bookTotal ?? "?"} | ` +
        `awayML=${g.awayML ?? "?"} | spreadBets=${g.spreadAwayBetsPct ?? "?"}% | ` +
        `status=${g.gameStatus ?? "upcoming"} | score=${g.awayScore ?? "?"}-${g.homeScore ?? "?"}`
      );
    }
    console.log();

    // Validation
    const withOdds = nhlGames.filter(g => g.awayBookSpread !== null || g.awayML !== null).length;
    const withSplits = nhlGames.filter(g => g.spreadAwayBetsPct !== null).length;
    const withStartTime = nhlGames.filter(g => g.startTimeEst && g.startTimeEst !== "TBD").length;
    const withScores = nhlGames.filter(g => g.awayScore !== null && g.homeScore !== null).length;

    console.log("═══ DB Validation Summary ═══\n");
    console.log(`  Total NHL games in DB: ${nhlGames.length}`);
    console.log(`  With odds (spread/ML): ${withOdds}/${nhlGames.length} ${withOdds === nhlGames.length ? "✔" : "⚠ some missing"}`);
    console.log(`  With betting splits:   ${withSplits}/${nhlGames.length} ${withSplits === nhlGames.length ? "✔" : "⚠ some missing"}`);
    console.log(`  With start time:       ${withStartTime}/${nhlGames.length} ${withStartTime === nhlGames.length ? "✔" : "⚠ some TBD"}`);
    console.log(`  With live/final scores: ${withScores}/${nhlGames.length} (expected for games in progress/finished)`);

    const allGood = withOdds === nhlGames.length && withSplits === nhlGames.length;
    console.log(`\n  Overall: ${allGood ? "✔ ALL CHECKS PASSED" : "⚠ SOME CHECKS FAILED — review above"}`);
  }

  console.log(`\n[TEST] Completed at: ${new Date().toISOString()}`);
}

main().catch(err => {
  console.error("[TEST] FATAL:", err);
  process.exit(1);
});
