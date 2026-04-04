/**
 * Run K-Props backtest for a specific date.
 * Usage: node --loader tsx/esm scripts/run_backtest.mjs 2026-04-03
 * Or: npx tsx scripts/run_backtest.mjs 2026-04-03
 */
import { runKPropsBacktest } from "../server/kPropsBacktestService.js";

const dateArg = process.argv[2] || "2026-04-03";
console.log(`[INPUT] Running K-Props backtest for date: ${dateArg}`);

try {
  await runKPropsBacktest(dateArg);
  console.log(`[OUTPUT] Backtest complete for ${dateArg}`);
  process.exit(0);
} catch (err) {
  console.error(`[ERROR] Backtest failed:`, err);
  process.exit(1);
}
