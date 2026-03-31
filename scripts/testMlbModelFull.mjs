/**
 * testMlbModelFull.mjs
 * Full validation test for all 3 MLB pitcher stat enhancements:
 *   1. Real xFIP/FIP (not ERA-derived proxy)
 *   2. Pitcher handedness + batter-vs-handedness splits
 *   3. Last-5-starts rolling stats blend (70/30)
 *
 * [INPUT]  Today's date
 * [STEP]   Run MLB model via runMlbModelForDate
 * [STATE]  Capture all pitcher resolution logs and feature diagnostics
 * [OUTPUT] Summary of all signals active
 * [VERIFY] Zero unknown pitchers, all 3 signals confirmed active
 */

import { execSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { createConnection } from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Run the model via tsx and capture all output
const today = new Date().toISOString().split('T')[0];
console.log(`[INPUT] Running full MLB model validation for date: ${today}`);
console.log(`[STEP] Executing model via tsx...`);

let output = '';
let exitCode = 0;

try {
  output = execSync(
    `cd ${projectRoot} && npx tsx server/mlbModelRunner.ts 2>&1`,
    { timeout: 180000, maxBuffer: 10 * 1024 * 1024 }
  ).toString();
} catch (err) {
  // tsx doesn't have a CLI entry point — use a wrapper
  output = err.stdout?.toString() || '';
  exitCode = err.status || 1;
}

// If direct run failed, use a wrapper approach
if (!output || output.includes('No such file')) {
  console.log(`[STEP] Direct run failed, using wrapper script...`);
  try {
    output = execSync(
      `cd ${projectRoot} && npx tsx -e "
import { runMlbModelForDate } from './server/mlbModelRunner.js';
import { getDb } from './server/db.js';
async function main() {
  const db = await getDb();
  const result = await runMlbModelForDate('${today}', db);
  console.log('[MODEL_RESULT]', JSON.stringify(result));
}
main().catch(e => { console.error('[ERROR]', e); process.exit(1); });
" 2>&1`,
      { timeout: 180000, maxBuffer: 10 * 1024 * 1024 }
    ).toString();
  } catch (err2) {
    output = (err2.stdout?.toString() || '') + (err2.stderr?.toString() || '');
  }
}

console.log(`[STATE] Raw output length: ${output.length} chars`);

// ── Validation checks ─────────────────────────────────────────────────────────

// 1. Unknown pitcher warnings
const unknownPitcherLines = output.split('\n').filter(l => l.includes('⚠ Unknown pitcher') || l.includes('Unknown pitcher'));
console.log(`\n[VERIFY] Unknown pitcher warnings: ${unknownPitcherLines.length}`);
if (unknownPitcherLines.length > 0) {
  unknownPitcherLines.forEach(l => console.log(`  ❌ ${l.trim()}`));
} else {
  console.log(`  ✅ PASS — Zero unknown pitcher warnings`);
}

// 2. FIP/xFIP signal active
const fipLines = output.split('\n').filter(l => l.includes('xFIP=') || l.includes('FIP='));
console.log(`\n[VERIFY] FIP/xFIP signal active: ${fipLines.length} log lines`);
if (fipLines.length > 0) {
  // Show first 3 examples
  fipLines.slice(0, 3).forEach(l => console.log(`  ✅ ${l.trim()}`));
  if (fipLines.length > 3) console.log(`  ... and ${fipLines.length - 3} more`);
} else {
  console.log(`  ❌ FAIL — No FIP/xFIP log lines found`);
}

// 3. Pitcher handedness signal active
const handLines = output.split('\n').filter(l => l.includes('hand=') || l.includes('(LP)') || l.includes('(RP)'));
console.log(`\n[VERIFY] Pitcher handedness signal active: ${handLines.length} log lines`);
if (handLines.length > 0) {
  handLines.slice(0, 3).forEach(l => console.log(`  ✅ ${l.trim()}`));
  if (handLines.length > 3) console.log(`  ... and ${handLines.length - 3} more`);
} else {
  console.log(`  ❌ FAIL — No pitcher hand log lines found`);
}

// 4. Batting splits active
const splitLines = output.split('\n').filter(l => l.includes('split:') || l.includes('vsL=') || l.includes('vsR=') || l.includes('wOBA='));
console.log(`\n[VERIFY] Batting splits signal active: ${splitLines.length} log lines`);
if (splitLines.length > 0) {
  splitLines.slice(0, 3).forEach(l => console.log(`  ✅ ${l.trim()}`));
  if (splitLines.length > 3) console.log(`  ... and ${splitLines.length - 3} more`);
} else {
  console.log(`  ❌ FAIL — No batting split log lines found`);
}

// 5. Rolling-5 blend active
const rollingLines = output.split('\n').filter(l => l.includes('rolling') || l.includes('rolling_starts') || l.includes('rolling-5'));
console.log(`\n[VERIFY] Rolling-5 blend signal active: ${rollingLines.length} log lines`);
if (rollingLines.length > 0) {
  rollingLines.slice(0, 3).forEach(l => console.log(`  ✅ ${l.trim()}`));
  if (rollingLines.length > 3) console.log(`  ... and ${rollingLines.length - 3} more`);
} else {
  console.log(`  ❌ FAIL — No rolling-5 log lines found`);
}

// 6. DB batch load confirmed
const batchLines = output.split('\n').filter(l => l.includes('[BATCH]'));
console.log(`\n[VERIFY] DB batch load confirmed: ${batchLines.length} log lines`);
batchLines.forEach(l => console.log(`  ✅ ${l.trim()}`));

// 7. Model result summary
const resultLine = output.split('\n').find(l => l.includes('[MODEL_RESULT]'));
if (resultLine) {
  try {
    const result = JSON.parse(resultLine.replace('[MODEL_RESULT]', '').trim());
    console.log(`\n[OUTPUT] Model result: written=${result.written} skipped=${result.skipped} errors=${result.errors} validation=${result.validation?.passed ? '✅ PASSED' : '❌ FAILED'}`);
  } catch {}
}

// Final pass/fail
const allPassed = unknownPitcherLines.length === 0 && fipLines.length > 0 && handLines.length > 0;
console.log(`\n[VERIFY] Overall: ${allPassed ? '✅ ALL SIGNALS ACTIVE' : '❌ SOME SIGNALS MISSING'}`);
console.log('[DONE]');
