/**
 * NHL DB Upsert Test
 *
 * Directly calls the NHL refresh pipeline (scrape + schedule + DB upsert)
 * and verifies the results in the database.
 *
 * Uses tsx to run TypeScript directly.
 */
import { execSync } from "child_process";

// Write a TypeScript runner
import * as fs from "fs";

const tsScript = `
import "dotenv/config";
import { runVsinRefresh } from "./server/vsinAutoRefresh";
import { listGamesByDate } from "./server/db";

async function main() {
  console.log("═══ NHL DB Upsert Test ═══");
  console.log("Triggering full VSiN refresh (NCAAM + NBA + NHL)...");
  console.log("This will take 30-60 seconds...");
  console.log();

  const result = await runVsinRefresh();
  if (!result) {
    console.error("✘ Refresh returned null — check server logs for errors");
    process.exit(1);
  }

  console.log("\\n═══ Refresh Result ═══");
  console.log(\`  NCAAM: \${result.updated} updated, \${result.inserted} inserted, \${result.ncaaInserted} NCAA-only\`);
  console.log(\`  NBA:   \${result.nbaUpdated} updated, \${result.nbaInserted} inserted, \${result.nbaScheduleInserted} schedule-only\`);
  console.log(\`  NHL:   \${result.nhlUpdated} updated, \${result.nhlInserted} inserted, \${result.nhlScheduleInserted} schedule-only\`);
  console.log(\`  Total NHL VSiN games processed: \${result.nhlTotal}\`);
  console.log();

  // Query DB for today's NHL games
  const today = new Date().toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).replace(/(\\d+)\\/(\\d+)\\/(\\d+)/, "$3-$1-$2");

  console.log(\`  Querying DB for NHL games on \${today}...\`);
  const nhlGames = await listGamesByDate(today, "NHL");
  console.log(\`  Found \${nhlGames.length} NHL games in DB for today\`);
  console.log();

  if (nhlGames.length === 0) {
    console.warn("  ⚠ No NHL games in DB — check if VSiN scrape returned data");
  } else {
    for (const g of nhlGames) {
      const hasOdds = g.awayBookSpread !== null || g.awayML !== null;
      const hasSplits = g.spreadAwayBetsPct !== null;
      console.log(
        \`  \${g.awayTeam} @ \${g.homeTeam} | \${g.startTimeEst} ET | \` +
        \`spread=\${g.awayBookSpread ?? "?"}/\${g.homeBookSpread ?? "?"} | \` +
        \`total=\${g.bookTotal ?? "?"} | \` +
        \`awayML=\${g.awayML ?? "?"} | \` +
        \`spreadBets=\${g.spreadAwayBetsPct ?? "?"}% | \` +
        \`status=\${g.gameStatus ?? "upcoming"} | \` +
        \`score=\${g.awayScore ?? "?"}-\${g.homeScore ?? "?"} | \` +
        \`odds=\${hasOdds ? "✔" : "✘"} splits=\${hasSplits ? "✔" : "✘"}\`
      );
    }
    console.log();

    // Validation
    const withOdds = nhlGames.filter(g => g.awayBookSpread !== null || g.awayML !== null).length;
    const withSplits = nhlGames.filter(g => g.spreadAwayBetsPct !== null).length;
    const withStartTime = nhlGames.filter(g => g.startTimeEst && g.startTimeEst !== "TBD").length;

    console.log("  ═══ DB Validation ═══");
    console.log(\`  Total NHL games: \${nhlGames.length}\`);
    console.log(\`  With odds: \${withOdds}/\${nhlGames.length} \${withOdds === nhlGames.length ? "✔" : "⚠"}\`);
    console.log(\`  With splits: \${withSplits}/\${nhlGames.length} \${withSplits === nhlGames.length ? "✔" : "⚠"}\`);
    console.log(\`  With start time: \${withStartTime}/\${nhlGames.length} \${withStartTime === nhlGames.length ? "✔" : "⚠"}\`);
  }

  console.log("\\n✔ NHL DB upsert test complete");
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
`;

fs.writeFileSync("/home/ubuntu/ai-sports-betting/test_nhl_db_upsert_runner.ts", tsScript);
console.log("Runner script written. Execute with: pnpm tsx test_nhl_db_upsert_runner.ts");
