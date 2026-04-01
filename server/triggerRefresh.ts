/**
 * triggerRefresh.ts
 * One-shot script to trigger the full VSiN + MetaBet refresh pipeline
 * and log all results for audit purposes.
 */

import { runVsinRefresh } from "./vsinAutoRefresh";

async function main() {
  console.log("=".repeat(80));
  console.log("TRIGGERING FULL REFRESH PIPELINE");
  console.log("=".repeat(80));
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log();

  try {
    const result = await runVsinRefresh();
    console.log();
    console.log("=".repeat(80));
    console.log("REFRESH COMPLETE");
    console.log("=".repeat(80));
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("REFRESH FAILED:", err);
    process.exit(1);
  }
}

main();
