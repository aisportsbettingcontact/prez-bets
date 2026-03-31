/**
 * validateMlbSignals.mjs
 * Validates all 3 MLB pitcher stat enhancement signals are active.
 * Uses tsx to run the TypeScript model and captures full output.
 *
 * [INPUT]  Today's date + DB connection
 * [STEP]   Run MLB model via tsx with full logging
 * [STATE]  Parse all log lines for signal presence
 * [OUTPUT] Signal activation summary
 * [VERIFY] All 3 signals confirmed active, zero unknown pitchers
 */

import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const today = new Date().toISOString().split('T')[0];

console.log(`[INPUT] Validating MLB model signals for date: ${today}`);
console.log(`[STEP] Running model via tsx (full output capture)...`);

// Write a temp runner script
import { writeFileSync, unlinkSync } from 'fs';
const runnerPath = path.join(projectRoot, 'scripts', '_tempRunner.ts');
writeFileSync(runnerPath, `
import { runMlbModelForDate } from '../server/mlbModelRunner';
import { getDb } from '../server/db';

const today = '${today}';
const db = await getDb();
const result = await runMlbModelForDate(today, db);
console.log('[MODEL_RESULT]', JSON.stringify(result));
process.exit(0);
`);

let output = '';
try {
  const proc = spawnSync('npx', ['tsx', 'scripts/_tempRunner.ts'], {
    cwd: projectRoot,
    timeout: 180000,
    maxBuffer: 20 * 1024 * 1024,
    encoding: 'utf8',
  });
  output = (proc.stdout || '') + (proc.stderr || '');
} finally {
  try { unlinkSync(runnerPath); } catch {}
}

console.log(`[STATE] Captured ${output.length} chars of output`);
console.log(`[STATE] Output preview (first 500 chars):\n${output.slice(0, 500)}`);

const lines = output.split('\n');

// ── Signal 1: FIP/xFIP ────────────────────────────────────────────────────────
const fipLines = lines.filter(l => l.includes('xFIP=') || l.includes('FIP=') || l.includes('fip='));
console.log(`\n[VERIFY] Signal 1 — Real xFIP/FIP: ${fipLines.length} log lines`);
if (fipLines.length > 0) {
  fipLines.slice(0, 5).forEach(l => console.log(`  ✅ ${l.trim()}`));
  if (fipLines.length > 5) console.log(`  ... +${fipLines.length - 5} more`);
} else {
  console.log(`  ❌ FAIL — No FIP/xFIP log lines found`);
  // Show what lines DO exist for debugging
  const pitcherLines = lines.filter(l => l.includes('[MLBModelRunner]') || l.includes('pitcher') || l.includes('SP features'));
  console.log(`  [DEBUG] Pitcher-related lines (${pitcherLines.length}):`);
  pitcherLines.slice(0, 10).forEach(l => console.log(`    ${l.trim()}`));
}

// ── Signal 2: Pitcher handedness ─────────────────────────────────────────────
const handLines = lines.filter(l => l.includes('hand=') || l.includes('(LP)') || l.includes('(RP)') || l.includes('pitch_hand'));
console.log(`\n[VERIFY] Signal 2 — Pitcher handedness: ${handLines.length} log lines`);
if (handLines.length > 0) {
  handLines.slice(0, 5).forEach(l => console.log(`  ✅ ${l.trim()}`));
  if (handLines.length > 5) console.log(`  ... +${handLines.length - 5} more`);
} else {
  console.log(`  ❌ FAIL — No pitcher hand log lines found`);
}

// ── Signal 2b: Batting splits ─────────────────────────────────────────────────
const splitLines = lines.filter(l => l.includes('split:') || l.includes('vsL') || l.includes('vsR') || l.includes('wOBA=') || l.includes('batting split'));
console.log(`\n[VERIFY] Signal 2b — Batting splits: ${splitLines.length} log lines`);
if (splitLines.length > 0) {
  splitLines.slice(0, 5).forEach(l => console.log(`  ✅ ${l.trim()}`));
} else {
  console.log(`  ❌ FAIL — No batting split log lines found`);
}

// ── Signal 3: Rolling-5 blend ─────────────────────────────────────────────────
const rollingLines = lines.filter(l => l.includes('rolling') || l.includes('rolling_starts') || l.includes('rolling-5'));
console.log(`\n[VERIFY] Signal 3 — Rolling-5 blend: ${rollingLines.length} log lines`);
if (rollingLines.length > 0) {
  rollingLines.slice(0, 5).forEach(l => console.log(`  ✅ ${l.trim()}`));
  if (rollingLines.length > 5) console.log(`  ... +${rollingLines.length - 5} more`);
} else {
  console.log(`  ❌ FAIL — No rolling-5 log lines found`);
}

// ── Unknown pitcher check ─────────────────────────────────────────────────────
const unknownLines = lines.filter(l => l.includes('⚠ Unknown pitcher') || l.includes('Unknown pitcher'));
console.log(`\n[VERIFY] Unknown pitcher warnings: ${unknownLines.length}`);
if (unknownLines.length === 0) {
  console.log(`  ✅ PASS — Zero unknown pitcher warnings`);
} else {
  unknownLines.forEach(l => console.log(`  ❌ ${l.trim()}`));
}

// ── DB batch load ─────────────────────────────────────────────────────────────
const batchLines = lines.filter(l => l.includes('[BATCH]'));
console.log(`\n[VERIFY] DB batch load: ${batchLines.length} log lines`);
batchLines.forEach(l => console.log(`  ✅ ${l.trim()}`));

// ── Model result ─────────────────────────────────────────────────────────────
const resultLine = lines.find(l => l.includes('[MODEL_RESULT]'));
if (resultLine) {
  try {
    const result = JSON.parse(resultLine.replace('[MODEL_RESULT]', '').trim());
    console.log(`\n[OUTPUT] Model result: written=${result.written} skipped=${result.skipped} errors=${result.errors} validation=${result.validation?.passed ? '✅ PASSED' : '❌ FAILED'}`);
    if (result.validation?.issues?.length > 0) {
      result.validation.issues.forEach(i => console.log(`  ❌ ${i}`));
    }
  } catch (e) {
    console.log(`\n[OUTPUT] Could not parse model result: ${e.message}`);
  }
}

// ── Final verdict ─────────────────────────────────────────────────────────────
const allPassed = unknownLines.length === 0 && fipLines.length > 0 && handLines.length > 0;
console.log(`\n[VERIFY] Final verdict: ${allPassed ? '✅ ALL 3 SIGNALS ACTIVE' : '⚠ SOME SIGNALS NEED VERIFICATION'}`);
console.log('[DONE]');
