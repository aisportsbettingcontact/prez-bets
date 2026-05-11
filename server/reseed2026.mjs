/**
 * reseed2026.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Re-seeds all 4 MLB stats tables with 2026 season data.
 *
 * Execution order (sequential to avoid DB connection saturation):
 *   1. mlb_pitcher_stats        — 2026 season ERA/K9/FIP/WHIP for all starters
 *   2. mlb_pitcher_rolling5     — last 5 starts from 2026 game logs
 *   3. mlb_pitcher_sabermetrics — 2026 FIP/xFIP/FIP-/ERA-/WAR + handedness
 *   4. mlb_team_batting_splits  — 2026 vs LHP / vs RHP for all 30 teams
 *
 * Usage: node server/reseed2026.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createRequire } from 'module';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
dotenv.config({ quiet: true });

const TAG = '[Reseed2026]';

function log(msg) { console.log(`${new Date().toISOString()} ${TAG} ${msg}`); }
function err(msg)  { console.error(`${new Date().toISOString()} ${TAG} [ERROR] ${msg}`); }

// ─── Step runner ──────────────────────────────────────────────────────────────

async function runStep(name, scriptPath) {
  log(`[STEP] Starting: ${name}`);
  const start = Date.now();
  try {
    const output = execSync(`cd /home/ubuntu/ai-sports-betting && npx tsx ${scriptPath} 2>&1`, {
      timeout: 300_000, // 5 min max per step
      encoding: 'utf8',
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    log(`[STEP] Completed: ${name} in ${elapsed}s`);
    // Print last 20 lines of output for verification
    const lines = output.trim().split('\n');
    const tail = lines.slice(-20);
    tail.forEach(l => console.log(`  ${l}`));
    return { name, success: true, elapsed, output };
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    err(`[STEP] FAILED: ${name} after ${elapsed}s`);
    err(e.message);
    if (e.stdout) console.error(e.stdout.slice(-2000));
    return { name, success: false, elapsed, error: e.message };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('[INPUT] Starting full 2026 re-seed sequence');
  log('[STATE] Steps: pitcher_stats → pitcher_rolling5 → pitcher_sabermetrics → team_batting_splits');

  const results = [];
  const totalStart = Date.now();

  // Step 1: Pitcher season stats (ERA/K9/FIP/WHIP from 2026 season)
  results.push(await runStep(
    'mlb_pitcher_stats (2026 season ERA/K9/FIP/WHIP)',
    'server/seedPitcherStats.ts'
  ));

  // Step 2: Pitcher rolling-5 (last 5 starts from 2026 game logs)
  results.push(await runStep(
    'mlb_pitcher_rolling5 (2026 game log last-5)',
    'server/seedPitcherRolling5.ts'
  ));

  // Step 3: Pitcher sabermetrics (FIP/xFIP/FIP-/ERA-/WAR + handedness)
  results.push(await runStep(
    'mlb_pitcher_sabermetrics (2026 FIP/xFIP/WAR + handedness)',
    'server/seedPitcherSabermetrics.ts'
  ));

  // Step 4: Team batting splits (vs LHP / vs RHP for all 30 teams)
  results.push(await runStep(
    'mlb_team_batting_splits (2026 vs LHP/RHP)',
    'server/seedTeamBattingSplits.ts'
  ));

  // ─── Summary ────────────────────────────────────────────────────────────────
  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  log('\n=== RESEED 2026 SUMMARY ===');
  results.forEach(r => {
    const status = r.success ? '✅ PASS' : '❌ FAIL';
    log(`  ${status} | ${r.name} | ${r.elapsed}s`);
  });
  log(`\n[OUTPUT] ${passed}/${results.length} steps passed | Total elapsed: ${totalElapsed}s`);
  log(`[VERIFY] ${failed === 0 ? 'PASS — All 4 tables re-seeded with 2026 data' : `FAIL — ${failed} step(s) failed`}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(e => {
  err('[FATAL] ' + e.message);
  process.exit(1);
});
