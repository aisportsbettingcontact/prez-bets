/**
 * testMlbModel.mjs
 * 
 * Runs the MLB model for today's date and checks for unknown pitcher warnings.
 * Usage: node scripts/testMlbModel.mjs
 */
import { createRequire } from 'module';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Get today's date in PST
const pstDate = new Date().toLocaleDateString('en-US', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
const [mm, dd, yyyy] = pstDate.split('/');
const dateStr = `${yyyy}-${mm}-${dd}`;

console.log(`[TEST] Running MLB model validation for date: ${dateStr}`);
console.log(`[TEST] Checking for unknown pitcher warnings...`);

const proc = spawn('npx', ['tsx', '-e', `
import { runMlbModelForDate } from './server/mlbModelRunner';
runMlbModelForDate('${dateStr}').then(r => {
  console.log('[RESULT] written=' + r.written + ' skipped=' + r.skipped + ' errors=' + r.errors);
  console.log('[RESULT] validation=' + (r.validation.passed ? 'PASSED' : 'FAILED'));
  if (!r.validation.passed) {
    console.error('[RESULT] issues:', r.validation.issues);
  }
  process.exit(0);
}).catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
`], {
  cwd: projectRoot,
  stdio: 'pipe',
  env: { ...process.env }
});

let stdout = '';
let unknownCount = 0;
let dbHitCount = 0;

proc.stdout.on('data', (data) => {
  const text = data.toString();
  stdout += text;
  
  // Count unknown pitcher warnings
  const unknownMatches = text.match(/Unknown pitcher/g);
  if (unknownMatches) unknownCount += unknownMatches.length;
  
  // Count DB hits
  const dbMatches = text.match(/✓ DB stats/g);
  if (dbMatches) dbHitCount += dbMatches.length;
  
  // Print relevant lines
  for (const line of text.split('\n')) {
    if (line.includes('[RESULT]') || line.includes('[FATAL]') || 
        line.includes('Unknown pitcher') || line.includes('✓ DB stats') ||
        line.includes('✓ Registry') || line.includes('PASSED') || line.includes('FAILED') ||
        line.includes('written=') || line.includes('► START') || line.includes('✅ DONE')) {
      console.log(line);
    }
  }
});

proc.stderr.on('data', (data) => {
  const text = data.toString();
  if (text.includes('Unknown pitcher') || text.includes('error') || text.includes('Error')) {
    process.stderr.write(data);
  }
});

proc.on('close', (code) => {
  console.log(`\n[VERIFY] Exit code: ${code}`);
  console.log(`[VERIFY] DB stat hits: ${dbHitCount}`);
  console.log(`[VERIFY] Unknown pitcher warnings: ${unknownCount}`);
  
  if (unknownCount === 0) {
    console.log('[VERIFY] ✅ PASS — Zero unknown pitcher warnings');
  } else {
    console.log(`[VERIFY] ❌ FAIL — ${unknownCount} unknown pitcher warning(s) detected`);
  }
  
  process.exit(code ?? 0);
});
