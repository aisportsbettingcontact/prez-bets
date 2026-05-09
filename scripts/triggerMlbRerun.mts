/**
 * triggerMlbRerun.mts
 * One-shot script: force MLB model rerun for today (or a specified date).
 * Usage: npx tsx scripts/triggerMlbRerun.mts [YYYY-MM-DD]
 */
import { runMlbModelForDate } from "../server/mlbModelRunner.js";

const dateArg = process.argv[2];
const dateStr = dateArg ?? (() => {
  const etStr = new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const [m, d, y] = etStr.split('/');
  return `${y}-${m}-${d}`;
})();

console.log(`[TRIGGER] Forcing MLB model rerun for ${dateStr}`);
try {
  const result = await runMlbModelForDate(dateStr, { forceRerun: true });
  console.log(`[RESULT] written=${result.written} skipped=${result.skipped} errors=${result.errors}`);
  console.log(`[VALIDATION] passed=${result.validation.passed} issues=${result.validation.issues.length} warnings=${result.validation.warnings.length}`);
  if (!result.validation.passed) {
    for (const issue of result.validation.issues) console.error(`  [ISSUE] ${issue}`);
  }
  for (const w of result.validation.warnings) console.warn(`  [WARN] ${w}`);
  process.exit(result.errors > 0 ? 1 : 0);
} catch (err) {
  console.error(`[ERROR] ${err}`);
  process.exit(1);
}
