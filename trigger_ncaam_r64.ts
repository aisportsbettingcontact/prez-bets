/**
 * trigger_ncaam_r64.ts
 * Run the NCAAM v9 model (250k sims) for all March 19 R64 games,
 * then bulk-approve the projections so they appear on the feed.
 *
 * Usage: npx tsx trigger_ncaam_r64.ts
 */
import { syncModelForDate } from "./server/ncaamModelSync.js";
import { bulkApproveModels } from "./server/db.js";

const DATE = "2026-03-19";

// KenPom credentials — passed directly to avoid shell $ escaping issues in env vars
const KENPOM_EMAIL    = process.env.KENPOM_EMAIL    ?? "";
// Use the known correct password directly since env var has $ truncation issue
const KENPOM_PASSWORD = "3$mHnYuV8iLcYau";

console.log(`=== NCAAM R64 Model Run — ${DATE} ===`);
console.log(`KenPom email: ${KENPOM_EMAIL.slice(0, 5)}***`);
console.log(`KenPom password length: ${KENPOM_PASSWORD.length}`);
console.log("Simulations: 250,000 per game");
console.log("Starting model sync...\n");

const startTime = Date.now();

const result = await syncModelForDate(DATE, {
  skipExisting: false,  // force re-run even if already projected
  concurrency: 1,       // sequential to respect KenPom rate limits
  kenpomEmail:  KENPOM_EMAIL,
  kenpomPass:   KENPOM_PASSWORD,
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
