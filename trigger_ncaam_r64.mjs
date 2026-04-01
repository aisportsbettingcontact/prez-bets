/**
 * trigger_ncaam_r64.mjs
 * Run the NCAAM v9 model (250k sims) for all March 19 R64 games,
 * then bulk-approve the projections so they appear on the feed.
 *
 * Usage: node trigger_ncaam_r64.mjs
 */
import mysql from 'mysql2/promise';
import { syncModelForDate } from "./server/ncaamModelSync.js";
import { bulkApproveModels } from "./server/db.js";

const DATE = "2026-03-19";

console.log(`=== NCAAM R64 Model Run — ${DATE} ===`);
console.log("Simulations: 250,000 per game");
console.log("Starting model sync...\n");

const startTime = Date.now();

const result = await syncModelForDate(DATE, {
  skipExisting: false,  // force re-run even if already projected
  concurrency: 1,       // sequential to respect KenPom rate limits
});

const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

console.log("\n=== Model Sync Complete ===");
console.log(`Date:      ${result.date}`);
console.log(`Total:     ${result.totalGames} games`);
console.log(`Ran:       ${result.ran}`);
console.log(`Skipped:   ${result.skipped}`);
console.log(`Failed:    ${result.failed}`);
console.log(`Duration:  ${elapsed} minutes`);

if (result.errors.length > 0) {
  console.log("\nErrors:");
  for (const e of result.errors) {
    console.log(`  ${e.game}: ${e.error}`);
  }
}

if (result.ran > 0) {
  console.log(`\n=== Auto-Approving ${result.ran} projections for feed ===`);
  const approved = await bulkApproveModels(DATE, "NCAAM");
  console.log(`Approved: ${approved} games — projections now live on feed`);
} else {
  console.log("\nNo games ran — nothing to approve.");
}

console.log("\nDone.");
