/**
 * run_march21_model.mjs
 * Runs the v10 KenPom model engine for the 4 March 21 games that were
 * previously tagged as March 20 (no book lines). Lines now populated from VSiN.
 */
import { spawnSync } from 'child_process';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = path.join(__dirname, 'server/model_v10_engine.py');
const PYTHON = '/usr/bin/python3.11';
const STAGGER_MS = 30_000;

const KENPOM_EMAIL = process.env.KENPOM_EMAIL ?? '';
const KENPOM_PASSWORD = process.env.KENPOM_PASSWORD ?? '';

// 4 games now correctly dated 2026-03-21 with VSiN lines populated
const GAMES = [
  {
    id: 1950017,
    awayTeam: 'michigan_st',
    homeTeam: 'louisville',
    kenpomAway: 'Michigan St.',
    kenpomHome: 'Louisville',
    confA: 'Big Ten',
    confH: 'ACC',
    mktSp: -4.5,   // MSU is away favorite
    mktTo: 151.5,
    mktMlA: -192,
    mktMlH: 160,
    spreadAwayOdds: -110,
    spreadHomeOdds: -110,
    overOdds: -110,
    underOdds: -110,
  },
  {
    id: 1950015,
    awayTeam: 'tcu',
    homeTeam: 'duke',
    kenpomAway: 'TCU',
    kenpomHome: 'Duke',
    confA: 'Big 12',
    confH: 'ACC',
    mktSp: 11.5,   // TCU is away underdog
    mktTo: 139.5,
    mktMlA: 500,
    mktMlH: -700,
    spreadAwayOdds: -110,
    spreadHomeOdds: -110,
    overOdds: -110,
    underOdds: -110,
  },
  {
    id: 1950016,
    awayTeam: 'nebraska',
    homeTeam: 'vanderbilt',
    kenpomAway: 'Nebraska',
    kenpomHome: 'Vanderbilt',
    confA: 'Big Ten',
    confH: 'SEC',
    mktSp: 2.5,    // Nebraska is away underdog (Vanderbilt home fav)
    mktTo: 146.5,
    mktMlA: 114,
    mktMlH: -135,
    spreadAwayOdds: -110,
    spreadHomeOdds: -110,
    overOdds: -110,
    underOdds: -110,
  },
  {
    id: 1950018,
    awayTeam: 'arkansas',
    homeTeam: 'high_point',
    kenpomAway: 'Arkansas',
    kenpomHome: 'High Point',
    confA: 'SEC',
    confH: 'Big South',
    mktSp: -11.5,  // Arkansas is away favorite
    mktTo: 168.5,
    mktMlA: -700,
    mktMlH: 500,
    spreadAwayOdds: -110,
    spreadHomeOdds: -110,
    overOdds: -110,
    underOdds: -110,
  },
];

function formatML(val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  const rounded = Math.round(val);
  return rounded >= 0 ? `+${rounded}` : `${rounded}`;
}

function formatSpreadEdge(result) {
  return (result.edges ?? []).find(e => e.type === 'SPREAD')?.label ?? null;
}

function formatTotalEdge(result) {
  return (result.edges ?? []).find(e => e.type === 'TOTAL')?.label ?? null;
}

async function runGame(game, pool) {
  const input = {
    away_team: game.kenpomAway,
    home_team: game.kenpomHome,
    conf_a: game.confA,
    conf_h: game.confH,
    mkt_sp: game.mktSp,
    mkt_to: game.mktTo,
    mkt_ml_a: game.mktMlA,
    mkt_ml_h: game.mktMlH,
    spread_away_odds: game.spreadAwayOdds,
    spread_home_odds: game.spreadHomeOdds,
    over_odds: game.overOdds,
    under_odds: game.underOdds,
    kenpom_email: KENPOM_EMAIL,
    kenpom_pass: KENPOM_PASSWORD,
  };

  console.log(`\n[ModelRun] ▶ ${game.kenpomAway} @ ${game.kenpomHome} | mkt_sp=${game.mktSp} mkt_to=${game.mktTo}`);

  const proc = spawnSync(PYTHON, [ENGINE_PATH], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 120_000,
    env: {
      HOME: process.env.HOME ?? '/home/ubuntu',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      PYTHONPATH: '/usr/local/lib/python3.11/dist-packages:/usr/lib/python3/dist-packages',
      KENPOM_EMAIL,
      KENPOM_PASSWORD,
    },
  });

  if (proc.error) {
    console.error(`[ModelRun] ✗ Process error: ${proc.error.message}`);
    return false;
  }

  const stdout = (proc.stdout ?? '').trim();
  const stderr = (proc.stderr ?? '').trim();

  if (stdout) stdout.split('\n').forEach(l => console.log(`[stdout] ${l}`));
  if (stderr) stderr.split('\n').slice(0, 8).forEach(l => console.log(`[stderr] ${l}`));

  const lines = stdout.split('\n').filter(l => l.trim());
  let result = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    try { result = JSON.parse(lines[i]); break; } catch { continue; }
  }

  if (!result || !result.ok) {
    console.error(`[ModelRun] ✗ ${result?.error ?? 'No JSON output'}`);
    return false;
  }

  console.log(`[ModelRun] ✓ scores=${result.orig_away_score?.toFixed(1)}-${result.orig_home_score?.toFixed(1)} spread=${result.orig_away_sp?.toFixed(1)} total=${result.orig_total?.toFixed(1)} edges=${result.edges?.length ?? 0}`);

  const spreadEdge = formatSpreadEdge(result);
  const totalEdge = formatTotalEdge(result);
  const spreadDiff = (result.edges ?? []).find(e => e.type === 'SPREAD')
    ? String(Math.abs(result.orig_away_sp - game.mktSp).toFixed(1)) : null;
  const totalDiff = (result.edges ?? []).find(e => e.type === 'TOTAL')
    ? String(Math.abs(result.orig_total - game.mktTo).toFixed(1)) : null;

  await pool.query(`
    UPDATE games SET
      awayModelSpread=?, homeModelSpread=?, modelTotal=?,
      modelAwayML=?, modelHomeML=?,
      modelAwayScore=?, modelHomeScore=?,
      modelOverRate=?, modelUnderRate=?,
      modelAwayWinPct=?, modelHomeWinPct=?,
      modelSpreadClamped=?, modelTotalClamped=?,
      modelCoverDirection=?, modelRunAt=?,
      modelAwaySpreadOdds=?, modelHomeSpreadOdds=?,
      modelOverOdds=?, modelUnderOdds=?,
      spreadEdge=?, spreadDiff=?, totalEdge=?, totalDiff=?
    WHERE id=?
  `, [
    String(result.orig_away_sp), String(result.orig_home_sp), String(result.orig_total),
    formatML(result.away_ml_fair), formatML(result.home_ml_fair),
    String(result.orig_away_score), String(result.orig_home_score),
    String(result.over_rate), String(result.under_rate),
    String(result.ml_away_pct), String(result.ml_home_pct),
    result.spread_clamped ? 1 : 0, result.total_clamped ? 1 : 0,
    result.cover_direction ?? null, Date.now(),
    result.mkt_spread_away_odds != null ? String(result.mkt_spread_away_odds) : null,
    result.mkt_spread_home_odds != null ? String(result.mkt_spread_home_odds) : null,
    result.mkt_total_over_odds != null ? String(result.mkt_total_over_odds) : null,
    result.mkt_total_under_odds != null ? String(result.mkt_total_under_odds) : null,
    spreadEdge, spreadDiff, totalEdge, totalDiff,
    game.id,
  ]);

  console.log(`[ModelRun] ✓ DB written for id=${game.id}`);
  return true;
}

async function main() {
  console.log('[ModelRun] March 21 games — 4 games');
  console.log(`[ModelRun] KENPOM_EMAIL length: ${KENPOM_EMAIL.length} | KENPOM_PASSWORD length: ${KENPOM_PASSWORD.length}`);

  const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 3 });

  let succeeded = 0;
  for (let i = 0; i < GAMES.length; i++) {
    if (i > 0) {
      console.log(`\n[ModelRun] Staggering ${STAGGER_MS / 1000}s...`);
      await new Promise(r => setTimeout(r, STAGGER_MS));
    }
    const ok = await runGame(GAMES[i], pool);
    if (ok) succeeded++;
    else console.error(`[ModelRun] ✗ FAILED: ${GAMES[i].awayTeam}@${GAMES[i].homeTeam}`);
  }

  if (succeeded > 0) {
    // Publish all 4 (even partially — publish those that succeeded)
    const successIds = GAMES.filter((_, i) => i < succeeded).map(g => g.id);
    // Actually publish all 4 regardless — model may have run for some
    const allIds = GAMES.map(g => g.id);
    const [rows] = await pool.query(
      'SELECT id, awayModelSpread FROM games WHERE id IN (?)',
      [allIds]
    );
    const modeledIds = rows.filter(r => r.awayModelSpread !== null).map(r => r.id);
    if (modeledIds.length > 0) {
      await pool.query('UPDATE games SET publishedModel=1, publishedToFeed=1 WHERE id IN (?)', [modeledIds]);
      console.log(`\n[ModelRun] Published ${modeledIds.length} games: ${modeledIds.join(', ')}`);
    }
  }

  // Final verification
  const [rows] = await pool.query(
    'SELECT id, awayTeam, homeTeam, gameDate, awayModelSpread, modelTotal, spreadEdge, totalEdge, publishedModel FROM games WHERE id IN (?) ORDER BY startTimeEst ASC',
    [GAMES.map(g => g.id)]
  );
  console.log('\n[ModelRun] Final state:');
  rows.forEach(r => {
    console.log(`  id=${r.id} ${r.awayTeam}@${r.homeTeam} ${r.gameDate} | spread=${r.awayModelSpread} total=${r.modelTotal} | spreadEdge=${r.spreadEdge?.substring(0,25) ?? 'none'} | pub=${r.publishedModel}`);
  });

  await pool.end();
  console.log('\n[ModelRun] Done.');
}

main().catch(err => {
  console.error('[ModelRun] Fatal:', err);
  process.exit(1);
});
