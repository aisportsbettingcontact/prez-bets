import "dotenv/config";
import { runMlbModelForDate } from "../server/mlbModelRunner";

async function main() {
  console.log("[TEST] Running MLB model for 2026-05-03 (forceRerun=true, single game TOR@MIN id=2250472)...");
  const result = await runMlbModelForDate("2026-05-03", { forceRerun: true, targetGameIds: [2250472] });
  console.log("[TEST] Result:", JSON.stringify(result, null, 2));
  process.exit(0);
}
main().catch(e => { console.error("[TEST] FATAL:", e); process.exit(1); });
