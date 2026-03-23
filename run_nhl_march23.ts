import "dotenv/config";
import { syncNhlModelForToday } from "./server/nhlModelSync";

console.log("=".repeat(60));
console.log("[MANUAL] Triggering NHL model sync for March 23...");
console.log("=".repeat(60));

try {
  const result = await syncNhlModelForToday("manual", true);
  console.log("\n✅ NHL model sync complete:");
  console.log(`  Synced: ${result.synced}`);
  console.log(`  Skipped: ${result.skipped}`);
  console.log(`  Errors: ${result.errors.length}`);
  if (result.errors.length > 0) {
    result.errors.forEach(e => console.error("  ERROR:", e));
  }
} catch (e) {
  console.error("❌ NHL model sync failed:", e);
}

process.exit(0);
