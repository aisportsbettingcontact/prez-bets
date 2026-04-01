/**
 * runMlbModelApril1.ts
 *
 * Directly triggers the MLB model for April 1, 2026.
 * Run with: npx tsx scripts/runMlbModelApril1.ts
 */

import { runMlbModelForDate } from "../server/mlbModelRunner";

const DATE = "2026-04-01";

console.log("\n" + "═".repeat(70));
console.log(`  MLB MODEL RUN — ${DATE}`);
console.log("  " + new Date().toISOString());
console.log("═".repeat(70) + "\n");

try {
  console.log(`[STEP] Running MLB model for ${DATE}...`);
  const result = await runMlbModelForDate(DATE);

  console.log("\n" + "═".repeat(70));
  console.log("  MODEL RUN COMPLETE");
  console.log("═".repeat(70));
  console.log(`[OUTPUT] modeled:    ${result.modeled}`);
  console.log(`[OUTPUT] skipped:    ${result.skipped}`);
  console.log(`[OUTPUT] errors:     ${result.errors.length}`);
  console.log(`[OUTPUT] published:  ${result.published}`);

  if (result.errors.length > 0) {
    console.log("\n[ERRORS]:");
    for (const e of result.errors) {
      console.error("  ❌", e);
    }
  }

  if (result.modeled > 0) {
    console.log("\n[VERIFY] ✅ Model ran successfully for", result.modeled, "games");
  } else {
    console.log("\n[VERIFY] ⚠️  No games were modeled — check skip reasons above");
  }
} catch (err) {
  console.error("[FATAL] Model run failed:", err instanceof Error ? err.message : String(err));
  if (err instanceof Error && err.stack) {
    console.error("[STACK]", err.stack);
  }
  process.exit(1);
}

console.log("\n" + "═".repeat(70) + "\n");
