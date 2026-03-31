/**
 * MLB March 31, 2026 — Model Trigger Script
 * Full debug logging, validates all 14 games
 */
import { runMlbModelForDate } from "./mlbModelRunner";
const DATE = "2026-03-31";
async function main() {
  console.log("=".repeat(70));
  console.log(`MLB MODEL TRIGGER — ${DATE}`);
  console.log(`Started: ${new Date().toISOString()}`);
  console.log("=".repeat(70));
  try {
    const summary = await runMlbModelForDate(DATE);
    console.log("\n" + "=".repeat(70));
    console.log("SUMMARY:");
    console.log("=".repeat(70));
    console.log(`  Date:    ${summary.date}`);
    console.log(`  Total:   ${summary.total}`);
    console.log(`  Written: ${summary.written}`);
    console.log(`  Skipped: ${summary.skipped}`);
    console.log(`  Errors:  ${summary.errors}`);
    console.log(`  Validation passed: ${summary.validation.passed}`);
    if (summary.validation.issues.length > 0) {
      console.log(`  Issues:`);
      for (const issue of summary.validation.issues) {
        console.log(`    ❌ ${issue}`);
      }
    }
    if (summary.validation.warnings.length > 0) {
      console.log(`  Warnings:`);
      for (const warn of summary.validation.warnings) {
        console.log(`    ⚠️  ${warn}`);
      }
    }
    console.log(`Finished: ${new Date().toISOString()}`);
    console.log("=".repeat(70));
    if (summary.errors > 0 || !summary.validation.passed) {
      process.exit(1);
    }
  } catch (err) {
    console.error("\n💥 FATAL ERROR:", err);
    process.exit(1);
  }
}
main();
