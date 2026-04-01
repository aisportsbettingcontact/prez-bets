/**
 * One-shot script: run only the UNMODELED March 19 NCAAM R64 games.
 * Skips games that already have awayModelSpread populated.
 *
 * Usage: cd /home/ubuntu/ai-sports-betting && npx tsx scripts/runMarch19Remaining.ts
 */
import "dotenv/config";
import { triggerModelWatcherForDate } from "../server/ncaamModelWatcher.js";

console.log("=== NCAAM Model v9: Run remaining (unmodeled) March 19 R64 games ===\n");
console.log("Skipping games that already have projections.");
console.log("Estimated time: ~7 × (40s model + 30s stagger) ≈ 8 minutes\n");

const result = await triggerModelWatcherForDate("2026-03-19", { forceRerun: false });

console.log("\n=== RESULT ===");
console.log(`  Triggered: ${result.triggered}`);
console.log(`  Skipped:   ${result.skipped}`);
