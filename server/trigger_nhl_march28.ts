/**
 * trigger_nhl_march28.ts
 * Manual trigger for March 28, 2026 NHL model sync.
 * Runs with runAllStatuses=true to include live games (OTT@TBL, FLA@NYI).
 * Runs with forceRerun=true to re-model all 15 games (including already-modeled ones).
 */

import { syncNhlModelForToday } from "./nhlModelSync.js";

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("MANUAL TRIGGER: March 28, 2026 NHL Model Sync");
  console.log("  - forceRerun=true: clears modelRunAt for all NHL games today");
  console.log("  - runAllStatuses=true: includes live + final games");
  console.log("=".repeat(70) + "\n");

  const result = await syncNhlModelForToday("manual", true, true);

  console.log("\n" + "=".repeat(70));
  console.log("SYNC COMPLETE");
  console.log(`  Synced:  ${result.synced}`);
  console.log(`  Skipped: ${result.skipped}`);
  console.log(`  Errors:  ${result.errors.length}`);
  if (result.errors.length > 0) {
    console.log("  Error details:");
    result.errors.forEach((e, i) => console.log(`    [${i + 1}] ${e}`));
  }
  console.log("=".repeat(70) + "\n");

  process.exit(result.errors.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
