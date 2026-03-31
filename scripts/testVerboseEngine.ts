/**
 * testVerboseEngine.ts
 * Runs the MLB model with verbose=True Python engine output to confirm all 3 signals.
 * Run via: npx tsx scripts/testVerboseEngine.ts
 */
import { runMlbModelForDate } from '../server/mlbModelRunner';
import { getDb } from '../server/db';

const today = '2026-03-31';
console.log(`[TEST] Running verbose MLB model for ${today}`);
const db = await getDb();
const result = await runMlbModelForDate(today, db);
console.log(`[TEST RESULT] written=${result.written} errors=${result.errors} validation=${result.validation.passed ? 'PASSED' : 'FAILED'}`);
process.exit(0);
