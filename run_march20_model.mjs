/**
 * run_march20_model.mjs
 * Runs the v10 KenPom model engine for the first 3 March 20 games and writes
 * results back to the DB. Runs sequentially with 30s stagger between games.
 */
import { spawnSync } from 'child_process';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = path.join(__dirname, 'server/model_v10_engine.py');
const PYTHON = '/usr/bin/python3.11';
const STAGGER_MS = 30_000; // 30s between KenPom logins

const KENPOM_EMAIL = process.env.KENPOM_EMAIL ?? '';
const KENPOM_PASSWORD = process.env.KENPOM_PASSWORD ?? '';

// The first 3 March 20 games by start time
const GAMES = [
  {
    id: 1830105,
    awayTeam: 'santa_clara',
    homeTeam: 'kentucky',
    kenpomAway: 'Santa Clara',
    kenpomHome: 'Kentucky',
    confA: 'WCC',
    confH: 'SEC',
    mktSp: 3.5,       // away spread (positive = away underdog)
    mktTo: 156.5,
    mktMlA: 130,
    mktMlH: -155,
    spreadAwayOdds: -118,
    spreadHomeOdds: -102,
    overOdds: -115,
    underOdds: -105,
  },
  {
    id: 1830099,
    awayTeam: 'akron',
    homeTeam: 'texas_tech',
    kenpomAway: 'Akron',
    kenpomHome: 'Texas Tech',
    confA: 'MAC',
    confH: 'Big 12',
    mktSp: 6.5,
    mktTo: 154.5,
    mktMlA: 230,
    mktMlH: -285,
    spreadAwayOdds: -105,
    spreadHomeOdds: -115,
    overOdds: -110,
    underOdds: -110,
  },
  {
    id: 1830095,
    awayTeam: 'liu_brooklyn',
    homeTeam: 'arizona',
    kenpomAway: 'LIU',
    kenpomHome: 'Arizona',
    confA: 'NEC',
    confH: 'Big 12',
    mktSp: 30.5,
    mktTo: 150.5,
    mktMlA: 5000,
    mktMlH: -100000,
    spreadAwayOdds: -110,
    spreadHomeOdds: -110,
    overOdds: -110,
    underOdds: -110,
  },
];

function roundHalf(val) {
  return Math.round(val * 2) / 2;
}

function formatML(val) {
  if (val === null || val === undefined || isNaN(val)) return null;
  const rounded = Math.round(val);
  return rounded >= 0 ? `+${rounded}` : `${rounded}`;
}

function formatSpreadEdge(result) {
  const e = (result.edges ?? []).find(e => e.type === 'SPREAD');
  if (!e) return null;
  return e.label ?? null;
}

function formatTotalEdge(result) {
  const e = (result.edges ?? []).find(e => e.type === 'TOTAL');
  if (!e) return null;
  return e.label ?? null;
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

  console.log(`\n[ModelRun] ▶ Running: ${game.kenpomAway} @ ${game.kenpomHome}`);
  console.log(`[ModelRun]   mkt_sp=${game.mktSp} mkt_to=${game.mktTo} conf_a=${game.confA} conf_h=${game.confH}`);

  const proc = spawnSync(PYTHON, [ENGINE_PATH], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 120_000,
    env: {
      HOME: process.env.HOME ?? '/home/ubuntu',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      PYTHONPATH: '/usr/local/lib/python3.11/dist-packages:/usr/lib/python3/dist-packages',
      KENPOM_EMAIL: KENPOM_EMAIL,
      KENPOM_PASSWORD: KENPOM_PASSWORD,
    },
  });

  if (proc.error) {
    console.error(`[ModelRun] ✗ Process error:`, proc.error.message);
    return false;
  }

  const stdout = (proc.stdout ?? '').trim();
  const stderr = (proc.stderr ?? '').trim();

  // Print all stdout for debugging
  if (stdout) {
    const lines = stdout.split('\n');
    lines.forEach(l => console.log(`[ModelRun][stdout] ${l}`));
  }
  if (stderr) {
    const lines = stderr.split('\n');
    lines.slice(0, 10).forEach(l => console.log(`[ModelRun][stderr] ${l}`));
  }

  // Parse last JSON line
  const lines = stdout.split('\n').filter(l => l.trim());
  let result = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      result = JSON.parse(lines[i]);
      break;
    } catch { continue; }
  }

  if (!result) {
    console.error(`[ModelRun] ✗ No JSON output found for ${game.kenpomAway} @ ${game.kenpomHome}`);
    return false;
  }

  if (!result.ok) {
    console.error(`[ModelRun] ✗ Engine error: ${result.error}`);
    return false;
  }

  console.log(`[ModelRun] ✓ ${game.kenpomAway} @ ${game.kenpomHome}`);
  console.log(`[ModelRun]   Spread: away=${result.orig_away_sp?.toFixed(2)} home=${result.orig_home_sp?.toFixed(2)}`);
  console.log(`[ModelRun]   Total: ${result.orig_total?.toFixed(2)}`);
  console.log(`[ModelRun]   ML: away=${result.away_ml_fair?.toFixed(0)} home=${result.home_ml_fair?.toFixed(0)}`);
  console.log(`[ModelRun]   Scores: away=${result.orig_away_score?.toFixed(1)} home=${result.orig_home_score?.toFixed(1)}`);
  console.log(`[ModelRun]   WinPct: away=${result.ml_away_pct?.toFixed(1)}% home=${result.ml_home_pct?.toFixed(1)}%`);
  console.log(`[ModelRun]   Over%=${result.over_rate?.toFixed(1)} Under%=${result.under_rate?.toFixed(1)}`);
  console.log(`[ModelRun]   Edges: ${JSON.stringify(result.edges ?? [])}`);

  // Write to DB
  const spreadEdge = formatSpreadEdge(result);
  const totalEdge = formatTotalEdge(result);
  const spreadDiffRaw = (result.edges ?? []).find(e => e.type === 'SPREAD')
    ? Math.abs(result.orig_away_sp - game.mktSp).toFixed(1)
    : null;
  const totalDiffRaw = (result.edges ?? []).find(e => e.type === 'TOTAL')
    ? Math.abs(result.orig_total - game.mktTo).toFixed(1)
    : null;

  await pool.query(`
    UPDATE games SET
      awayModelSpread = ?,
      homeModelSpread = ?,
      modelTotal = ?,
      modelAwayML = ?,
      modelHomeML = ?,
      modelAwayScore = ?,
      modelHomeScore = ?,
      modelOverRate = ?,
      modelUnderRate = ?,
      modelAwayWinPct = ?,
      modelHomeWinPct = ?,
      modelSpreadClamped = ?,
      modelTotalClamped = ?,
      modelCoverDirection = ?,
      modelRunAt = ?,
      modelAwaySpreadOdds = ?,
      modelHomeSpreadOdds = ?,
      modelOverOdds = ?,
      modelUnderOdds = ?,
      spreadEdge = ?,
      spreadDiff = ?,
      totalEdge = ?,
      totalDiff = ?
    WHERE id = ?
  `, [
    String(result.orig_away_sp),
    String(result.orig_home_sp),
    String(result.orig_total),
    formatML(result.away_ml_fair),
    formatML(result.home_ml_fair),
    String(result.orig_away_score),
    String(result.orig_home_score),
    String(result.over_rate),
    String(result.under_rate),
    String(result.ml_away_pct),
    String(result.ml_home_pct),
    result.spread_clamped ? 1 : 0,
    result.total_clamped ? 1 : 0,
    result.cover_direction ?? null,
    Date.now(),
    result.mkt_spread_away_odds != null ? String(result.mkt_spread_away_odds) : null,
    result.mkt_spread_home_odds != null ? String(result.mkt_spread_home_odds) : null,
    result.mkt_total_over_odds != null ? String(result.mkt_total_over_odds) : null,
    result.mkt_total_under_odds != null ? String(result.mkt_total_under_odds) : null,
    spreadEdge,
    spreadDiffRaw,
    totalEdge,
    totalDiffRaw,
    game.id,
  ]);

  console.log(`[ModelRun] ✓ DB updated for game id=${game.id}`);
  return true;
}

async function main() {
  console.log('[ModelRun] Starting March 20 model run for first 3 games');
  console.log(`[ModelRun] KENPOM_EMAIL length: ${KENPOM_EMAIL.length}`);
  console.log(`[ModelRun] KENPOM_PASSWORD length: ${KENPOM_PASSWORD.length}`);
  console.log(`[ModelRun] ENGINE_PATH: ${ENGINE_PATH}`);

  const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 3 });

  for (let i = 0; i < GAMES.length; i++) {
    if (i > 0) {
      console.log(`\n[ModelRun] Waiting ${STAGGER_MS / 1000}s before next game (KenPom rate limit)...`);
      await new Promise(r => setTimeout(r, STAGGER_MS));
    }
    const game = GAMES[i];
    const ok = await runGame(game, pool);
    if (!ok) {
      console.error(`[ModelRun] ✗ FAILED for game ${game.id} (${game.awayTeam} @ ${game.homeTeam})`);
    }
  }

  // Now publish all 3 games (publishedModel=1, publishedToFeed=1)
  console.log('\n[ModelRun] Publishing all 3 games...');
  const ids = GAMES.map(g => g.id);
  await pool.query(
    'UPDATE games SET publishedModel=1, publishedToFeed=1 WHERE id IN (?)',
    [ids]
  );
  console.log(`[ModelRun] Published game ids: ${ids.join(', ')}`);

  // Verify
  const [rows] = await pool.query(
    'SELECT id, awayTeam, homeTeam, awayModelSpread, modelTotal, publishedModel, publishedToFeed FROM games WHERE id IN (?)',
    [ids]
  );
  console.log('\n[ModelRun] Final DB state:');
  rows.forEach(r => {
    console.log(`  id=${r.id} ${r.awayTeam}@${r.homeTeam} modelSpread=${r.awayModelSpread} modelTotal=${r.modelTotal} published=${r.publishedModel}/${r.publishedToFeed}`);
  });

  await pool.end();
  console.log('\n[ModelRun] Done.');
}

main().catch(err => {
  console.error('[ModelRun] Fatal error:', err);
  process.exit(1);
});
