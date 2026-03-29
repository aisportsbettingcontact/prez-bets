/**
 * trigger_mlb_march29.ts
 * One-shot script: model all March 29, 2026 MLB games and publish to feed
 */
import { runMlbModelForDate } from "./mlbModelRunner";

async function main() {
  console.log("=== MLB March 29, 2026 Model Run ===");
  console.log(`Start: ${new Date().toISOString()}`);
  
  try {
    const result = await runMlbModelForDate("2026-03-29");
    console.log("\n=== RESULTS ===");
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("FATAL:", err);
    process.exit(1);
  }
  
  console.log(`\nEnd: ${new Date().toISOString()}`);
  process.exit(0);
}

main();
