/**
 * run_nhl_march28.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Manual trigger for the NHL model sync on March 28, 2026.
 * Runs syncNhlModelForToday() with forceRerun=true to re-model all 15 games
 * even if they were previously modeled (modelRunAt IS NOT NULL).
 *
 * Deep logging: all console output captured to /tmp/march28_nhl_model_run.log
 *
 * Usage:
 *   npx tsx server/run_nhl_march28.ts 2>&1 | tee /tmp/march28_nhl_model_run.log
 */

import { syncNhlModelForToday } from "./nhlModelSync.js";

const START = Date.now();

console.log("=".repeat(70));
console.log("[run_nhl_march28] ► MANUAL TRIGGER — March 28, 2026 NHL Slate");
console.log(`[run_nhl_march28] ► Start time: ${new Date().toISOString()}`);
console.log(`[run_nhl_march28] ► Mode: forceRerun=true (re-models all 15 games)`);
console.log("=".repeat(70));

async function main() {
  try {
    // forceRerun=true: re-runs model even if modelRunAt is already set
    // runAllStatuses=false: only upcoming games (not live/final)
    const result = await syncNhlModelForToday("manual", true, false);

    const elapsed = ((Date.now() - START) / 1000).toFixed(1);

    console.log("\n" + "=".repeat(70));
    console.log("[run_nhl_march28] ► FINAL SUMMARY");
    console.log("=".repeat(70));
    console.log(`  Synced:   ${result.synced}`);
    console.log(`  Skipped:  ${result.skipped}`);
    console.log(`  Errors:   ${result.errors.length}`);
    console.log(`  Elapsed:  ${elapsed}s`);
    console.log(`  SyncedAt: ${result.syncedAt}`);

    if (result.errors.length > 0) {
      console.log("\n[run_nhl_march28] ► ERRORS:");
      result.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
    }

    if (result.synced === 0 && result.errors.length === 0) {
      console.log("\n[run_nhl_march28] ⚠ 0 games synced with 0 errors — all games may already be modeled.");
      console.log("[run_nhl_march28]   If forceRerun=true is set, check that getTodayDate() returns '2026-03-28'.");
    }

    console.log("\n[run_nhl_march28] ► DONE");
    process.exit(result.errors.length > 0 ? 1 : 0);
  } catch (err) {
    console.error("[run_nhl_march28] ✗ Unhandled error:", err);
    process.exit(1);
  }
}

main();
