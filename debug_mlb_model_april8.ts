import "dotenv/config";
import { runMlbModelForDate } from "./server/mlbModelRunner.js";

const result = await runMlbModelForDate("2026-04-08");
console.log("\n[RESULT]", JSON.stringify(result, null, 2));
process.exit(0);
