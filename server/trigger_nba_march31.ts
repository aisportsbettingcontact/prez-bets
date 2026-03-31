/**
 * trigger_nba_march31.ts
 * Manual trigger for March 31, 2026 NBA model sync from Google Sheets.
 */
import { syncNbaModelFromSheet } from "./nbaModelSync";

async function main() {
  console.log("=".repeat(60));
  console.log("NBA MODEL SYNC TRIGGER — " + new Date().toISOString());
  console.log("=".repeat(60));
  const result = await syncNbaModelFromSheet();
  console.log("\nRESULT:");
  console.log(`  Synced:  ${result.synced}`);
  console.log(`  Skipped: ${result.skipped}`);
  console.log(`  Errors:  ${result.errors.length}`);
  if (result.errors.length > 0) {
    result.errors.forEach(e => console.log(`  ❌ ${e}`));
  }
  console.log("=".repeat(60));
}
main().catch(console.error).finally(() => process.exit(0));
