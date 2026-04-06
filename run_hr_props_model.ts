/**
 * run_hr_props_model.ts — Standalone runner for HR Props model service
 *
 * Usage: npx tsx run_hr_props_model.ts [YYYY-MM-DD]
 * Defaults to today's date if no argument provided.
 */
import * as dotenv from "dotenv";
dotenv.config();

import { resolveAndModelHrProps } from "./server/mlbHrPropsModelService";

async function main() {
  const dateArg = process.argv[2];
  const gameDate = dateArg ?? new Date().toISOString().slice(0, 10);

  console.log(`[Runner] Starting HR Props model for date=${gameDate}`);

  try {
    const result = await resolveAndModelHrProps(gameDate);
    console.log(`\n[Runner] COMPLETE`);
    console.log(`[Runner]   date=${result.date}`);
    console.log(`[Runner]   mlbamId resolved=${result.resolved} alreadyHad=${result.alreadyHad} unresolved=${result.unresolved}`);
    console.log(`[Runner]   modeled=${result.modeled} edges=${result.edges} errors=${result.errors}`);
    console.log(`[Runner] ${result.errors === 0 ? 'PASS' : 'FAIL'} — ${result.errors} errors`);
    process.exit(result.errors === 0 ? 0 : 1);
  } catch (err) {
    console.error(`[Runner] FATAL:`, err);
    process.exit(1);
  }
}

main();
