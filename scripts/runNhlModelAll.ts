/**
 * One-shot script: run all March 15 NHL games through the model,
 * regardless of game status (upcoming / live / final).
 * 
 * Usage: cd /home/ubuntu/ai-sports-betting && npx tsx scripts/runNhlModelAll.ts
 */
import "dotenv/config";
import { syncNhlModelForToday } from "../server/nhlModelSync.js";

console.log("=== NHL Model: Force Re-run ALL games (all statuses) ===\n");

const result = await syncNhlModelForToday("manual", true, true);

console.log("\n=== RESULT ===");
console.log(`  Synced:  ${result.synced}`);
console.log(`  Skipped: ${result.skipped}`);
console.log(`  Errors:  ${result.errors.length}`);
if (result.errors.length > 0) {
  console.log("\nErrors:");
  result.errors.forEach(e => console.log("  -", e));
}
console.log("\nDone.");
process.exit(0);
