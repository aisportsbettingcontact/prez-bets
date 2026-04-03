/**
 * runKPropsApril3.mjs
 *
 * Runs StrikeoutModel.py for all 14 April 3, 2026 MLB games.
 *
 * Prerequisites resolved:
 *   - statcast: /home/ubuntu/upload/statcast_2025.json (809 pitchers, full 2025 season)
 *   - plays:    /home/ubuntu/plays_fresh_2025/2025plays.csv (193,768 plays, full 2025 season)
 *   - crosswalk: built inline from RS IDs → MLBAM IDs for all 28 April 3 starters
 *
 * Pitchers missing from 2025 data (use league-average fallback):
 *   - Rhett Lowder (CIN) — 2026 rookie, no 2025 MLB starts
 *   - Tatsuya Imai (HOU) — NPB import, no 2025 MLB data
 *
 * Crosswalk corrections applied:
 *   - Shane Baz: baz-s001 → 669358 (NOT bazae001/Bazardo)
 *   - Clay Holmes: holmc001 → 605280 (NOT holmg001/Grant Holmes)
 *   - Steven Matz: matzs001 → 571927 (NOT Matzek)
 *   - Randy Vasquez: vasqr001 → 681190
 *   - Luis Morales: moral001 → 806960
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const execFileAsync = promisify(execFile);
const TAG = '[KPropsApril3]';

// ─── Data paths ───────────────────────────────────────────────────────────────
const PLAYS_PATH    = '/home/ubuntu/plays_fresh_2025/2025plays.csv';
const STATCAST_PATH = '/home/ubuntu/upload/statcast_2025.json';
const MODEL_SCRIPT  = path.join(process.cwd(), 'server/StrikeoutModel.py');

// ─── Crosswalk: Retrosheet ID → MLBAM ID ─────────────────────────────────────
// Built from plays file + statcast_2025.json verification
// Format: rs_id → mlbam_id
const CROSSWALK = {
  // April 3 starters — verified against statcast_2025.json
  'glast001':  607192,  // Tyler Glasnow (LAD)
  'irvij001':  663623,  // Jake Irvin (WSH)
  'flahj002':  656427,  // Jack Flaherty (DET)
  'meyem001':  676974,  // Max Meyer (MIA)
  'vasqr001':  681190,  // Randy Vasquez (SD)
  // 'lowdr001': null,   // Rhett Lowder (CIN) — 2026 rookie, no 2025 data → league avg
  'imans001':  684007,  // Shota Imanaga (CHC)
  'matzs001':  571927,  // Steven Matz (TB)
  'abelm001':  690953,  // Mick Abel (MIN)
  'luzaj001':  666200,  // Jesús Luzardo (PHI)
  'dollc001':  801403,  // Chase Dollander (COL)
  'baz-s001':  669358,  // Shane Baz (BAL)
  'mlodm001':  669387,  // Carmen Mlodzinski (PIT) — C. Mlodzinski
  'sprob001':  687075,  // Brandon Sproat (MIL)
  'lugos001':  607625,  // Seth Lugo (KC)
  'hance001':  676106,  // Emerson Hancock (SEA)
  'kochj001':  686799,  // Jack Kochanowicz (LAA)
  // 'imai001': null,    // Tatsuya Imai (HOU) — NPB import, no 2025 data → league avg
  'moral001':  806960,  // Luis Morales (ATH)
  'eldeb001':  693821,  // Bryce Elder (ATL)
  'sorom001':  647336,  // Michael Soroka (ARI)
  'holmc001':  605280,  // Clay Holmes (NYM)
  'roupl001':  694738,  // Landen Roupp (SF)
  'ceccs001':  677944,  // Slade Cecconi (CLE)
  'weatr001':  677960,  // Ryan Weathers (NYY)
  'earle001':  813349,  // Connelly Early (BOS)
  'rockk001':  677958,  // Kumar Rocker (TEX)
};

// ─── April 3 games ────────────────────────────────────────────────────────────
// gameId, awayTeam, homeTeam, awayPitcherRsId, homePitcherRsId,
// awayMarketLine (book K line), awayMarketOverOdds, awayMarketUnderOdds,
// homeMarketLine, homeMarketOverOdds, homeMarketUnderOdds
// Note: K lines will be fetched from DB (mlb_strikeout_props or AN props)
const GAMES = [
  { gameId: 2250094, awayTeam: 'LAN', homeTeam: 'WAS', awayRsId: 'glast001', homeRsId: 'irvij001',
    awayML: -285, homeML: 232, bookTotal: 9.5 },
  { gameId: 2250095, awayTeam: 'SLN', homeTeam: 'DET', awayRsId: 'flahj002', homeRsId: 'flahj002',
    awayML: 153, homeML: -182, bookTotal: 8.0 },
  { gameId: 2250096, awayTeam: 'MIA', homeTeam: 'NYA', awayRsId: 'meyem001', homeRsId: 'weatr001',
    awayML: 140, homeML: -166, bookTotal: 8.0 },
  { gameId: 2250097, awayTeam: 'SDN', homeTeam: 'BOS', awayRsId: 'vasqr001', homeRsId: 'earle001',
    awayML: 105, homeML: -125, bookTotal: 8.5 },
  { gameId: 2250098, awayTeam: 'CIN', homeTeam: 'TEX', awayRsId: null, homeRsId: 'rockk001',
    awayML: 137, homeML: -166, bookTotal: 8.0 },  // Lowder: league avg
  { gameId: 2250099, awayTeam: 'CHN', homeTeam: 'CLE', awayRsId: 'imans001', homeRsId: 'ceccs001',
    awayML: -120, homeML: 100, bookTotal: 7.5 },
  { gameId: 2250100, awayTeam: 'TBA', homeTeam: 'MIN', awayRsId: 'matzs001', homeRsId: 'abelm001',
    awayML: -112, homeML: -108, bookTotal: 7.5 },
  { gameId: 2250101, awayTeam: 'PHI', homeTeam: 'COL', awayRsId: 'luzaj001', homeRsId: 'dollc001',
    awayML: -194, homeML: 159, bookTotal: 10.5 },
  { gameId: 2250102, awayTeam: 'BAL', homeTeam: 'PIT', awayRsId: 'baz-s001', homeRsId: 'mlodm001',
    awayML: -122, homeML: 100, bookTotal: 8.5 },
  { gameId: 2250103, awayTeam: 'MIL', homeTeam: 'KCA', homeRsId: 'lugos001', awayRsId: 'sprob001',
    awayML: -112, homeML: -108, bookTotal: 9.0 },
  { gameId: 2250104, awayTeam: 'SEA', homeTeam: 'ANA', awayRsId: 'hance001', homeRsId: 'kochj001',
    awayML: -163, homeML: 135, bookTotal: 8.0 },
  { gameId: 2250105, awayTeam: 'HOU', homeTeam: 'ATH', awayRsId: null, homeRsId: 'moral001',
    awayML: -111, homeML: -110, bookTotal: 10.0 },  // Imai: league avg
  { gameId: 2252381, awayTeam: 'ATL', homeTeam: 'ARI', awayRsId: 'eldeb001', homeRsId: 'sorom001',
    awayML: -114, homeML: -105, bookTotal: 9.0 },
  { gameId: 2250106, awayTeam: 'NYN', homeTeam: 'SFN', awayRsId: 'holmc001', homeRsId: 'roupl001',
    awayML: -136, homeML: 113, bookTotal: 7.5 },
];

// ─── Fetch K lines from AN props API ─────────────────────────────────────────
async function fetchKLines(date) {
  try {
    const url = `https://api.actionnetwork.com/web/v1/scoreboard/mlb?period=game&bookIds=15&date=${date}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    });
    if (!resp.ok) return {};
    const data = await resp.json();
    const kLines = {};
    for (const game of (data.games || [])) {
      for (const team of (game.teams || [])) {
        // Look for pitcher strikeout props in markets
        for (const market of (game.markets || [])) {
          if (market.type === 'pitcher_strikeouts' || market.key?.includes('strikeout')) {
            const awayId = game.teams?.find(t => t.id === game.away_team_id)?.abbreviation;
            const homeId = game.teams?.find(t => t.id === game.home_team_id)?.abbreviation;
            if (awayId && homeId) {
              kLines[`${awayId}@${homeId}`] = market;
            }
          }
        }
      }
    }
    return kLines;
  } catch (e) {
    console.warn(`${TAG} ⚠ Could not fetch K lines: ${e.message}`);
    return {};
  }
}

// ─── Write crosswalk CSV ──────────────────────────────────────────────────────
async function writeCrosswalk(tmpDir) {
  const csvPath = path.join(tmpDir, 'crosswalk_apr3.csv');
  const lines = ['rs_id,sc_id'];
  for (const [rsId, scId] of Object.entries(CROSSWALK)) {
    lines.push(`${rsId},${scId}`);
  }
  await fs.writeFile(csvPath, lines.join('\n') + '\n');
  console.log(`${TAG} ✓ Crosswalk written: ${Object.keys(CROSSWALK).length} entries → ${csvPath}`);
  return csvPath;
}

// ─── Run model for one game ───────────────────────────────────────────────────
async function runGame(game, crosswalkPath, tmpDir, conn) {
  const { gameId, awayTeam, homeTeam, awayRsId, homeRsId, awayML, homeML, bookTotal } = game;
  const label = `${awayTeam}@${homeTeam}`;

  console.log(`\n${TAG} ── ${label} (gameId=${gameId}) ──`);
  console.log(`${TAG}   away pitcher RS: ${awayRsId || 'LEAGUE_AVG'}`);
  console.log(`${TAG}   home pitcher RS: ${homeRsId || 'LEAGUE_AVG'}`);

  // Fetch lineup from DB
  const [lineupRows] = await conn.execute(
    `SELECT awayLineup, homeLineup, awayPitcherName, homePitcherName
     FROM mlb_lineups WHERE gameId = ?`, [gameId]
  );
  const lineup = lineupRows[0];
  if (!lineup) {
    console.warn(`${TAG} ⚠ No lineup found for gameId=${gameId}, skipping`);
    return { gameId, success: false, error: 'no_lineup' };
  }

  // Parse lineup arrays
  let awayLineupArr = [], homeLineupArr = [];
  try {
    awayLineupArr = JSON.parse(lineup.awayLineup || '[]');
    homeLineupArr = JSON.parse(lineup.homeLineup || '[]');
  } catch {
    console.warn(`${TAG} ⚠ Failed to parse lineup JSON for gameId=${gameId}`);
  }

  // Convert lineup player names to RS IDs (best effort — model uses them for batter lookups)
  // For now pass empty arrays if we can't resolve; model will use league-avg batters
  const awayBatters = awayLineupArr.slice(0, 9);
  const homeBatters = homeLineupArr.slice(0, 9);

  console.log(`${TAG}   away batters: ${awayBatters.length} | home batters: ${homeBatters.length}`);

  // Output paths
  const jsonOut = path.join(tmpDir, `kprops_${awayTeam}_${homeTeam}_${gameId}.json`);
  const htmlOut = path.join(tmpDir, `kprops_${awayTeam}_${homeTeam}_${gameId}.html`);

  // Build args
  const args = [
    MODEL_SCRIPT,
    '--plays',       PLAYS_PATH,
    '--statcast',    STATCAST_PATH,
    '--crosswalk',   crosswalkPath,
    '--game-date',   '2026-04-03',
    '--away-team',   awayTeam,
    '--home-team',   homeTeam,
    '--json-output', jsonOut,
    '--output',      htmlOut,
  ];

  // Add pitcher RS IDs (use 'NONE' if missing — model handles gracefully)
  if (awayRsId) {
    args.push('--away-pitcher', awayRsId);
  }
  if (homeRsId) {
    args.push('--home-pitcher', homeRsId);
  }

  // Add lineups if available
  if (awayBatters.length > 0) {
    args.push('--away-lineup', ...awayBatters);
  }
  if (homeBatters.length > 0) {
    args.push('--home-lineup', ...homeBatters);
  }

  console.log(`${TAG}   CMD: python3 StrikeoutModel.py ${args.slice(1, 8).join(' ')} ...`);

  let stdout = '', stderr = '';
  try {
    const result = await execFileAsync('python3', args, {
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err) {
    stdout = err.stdout || '';
    stderr = err.stderr || '';
    const errMsg = `Python process failed: ${err.message}`;
    console.error(`${TAG} ✕ ${label}: ${errMsg}`);
    if (stderr) console.error(`${TAG}   stderr: ${stderr.slice(0, 800)}`);
    return { gameId, success: false, error: errMsg };
  }

  // Log Python output
  if (stdout) {
    for (const line of stdout.trim().split('\n')) {
      console.log(`${TAG}   [py] ${line}`);
    }
  }
  if (stderr) {
    for (const line of stderr.trim().split('\n').slice(0, 10)) {
      console.warn(`${TAG}   [py:err] ${line}`);
    }
  }

  // Read JSON output
  let jsonData;
  try {
    const raw = await fs.readFile(jsonOut, 'utf-8');
    jsonData = JSON.parse(raw);
  } catch (err) {
    console.error(`${TAG} ✕ ${label}: Failed to read JSON output: ${err.message}`);
    return { gameId, success: false, error: `json_read_failed: ${err.message}` };
  }

  const awayProj = jsonData.away;
  const homeProj = jsonData.home;

  if (!awayProj || !homeProj) {
    console.error(`${TAG} ✕ ${label}: JSON missing away/home projection`);
    return { gameId, success: false, error: 'missing_projections' };
  }

  console.log(`${TAG}   ✓ ${awayProj.pitcherName}: kProj=${awayProj.kProj} line=${awayProj.kLine} pOver=${awayProj.pOver} verdict=${awayProj.verdict}`);
  console.log(`${TAG}   ✓ ${homeProj.pitcherName}: kProj=${homeProj.kProj} line=${homeProj.kLine} pOver=${homeProj.pOver} verdict=${homeProj.verdict}`);

  // Upsert to DB
  const now = Date.now();
  for (const proj of [awayProj, homeProj]) {
    const sql = `
      INSERT INTO mlb_strikeout_props (
        gameId, side, pitcherName, pitcherHand, retrosheetId, mlbamId,
        kProj, kLine, kPer9, kMedian, kP5, kP95,
        bookLine, bookOverOdds, bookUnderOdds,
        pOver, pUnder, modelOverOdds, modelUnderOdds,
        edgeOver, edgeUnder, verdict, bestEdge, bestSide, bestMlStr,
        signalBreakdown, matchupRows, distribution, inningBreakdown,
        modelRunAt
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        pitcherName=VALUES(pitcherName), pitcherHand=VALUES(pitcherHand),
        retrosheetId=VALUES(retrosheetId), mlbamId=VALUES(mlbamId),
        kProj=VALUES(kProj), kLine=VALUES(kLine), kPer9=VALUES(kPer9),
        kMedian=VALUES(kMedian), kP5=VALUES(kP5), kP95=VALUES(kP95),
        bookLine=VALUES(bookLine), bookOverOdds=VALUES(bookOverOdds), bookUnderOdds=VALUES(bookUnderOdds),
        pOver=VALUES(pOver), pUnder=VALUES(pUnder),
        modelOverOdds=VALUES(modelOverOdds), modelUnderOdds=VALUES(modelUnderOdds),
        edgeOver=VALUES(edgeOver), edgeUnder=VALUES(edgeUnder),
        verdict=VALUES(verdict), bestEdge=VALUES(bestEdge), bestSide=VALUES(bestSide), bestMlStr=VALUES(bestMlStr),
        signalBreakdown=VALUES(signalBreakdown), matchupRows=VALUES(matchupRows),
        distribution=VALUES(distribution), inningBreakdown=VALUES(inningBreakdown),
        modelRunAt=VALUES(modelRunAt)
    `;
    const vals = [
      gameId,
      proj.side,
      proj.pitcherName,
      proj.pitcherHand || null,
      proj.retrosheetId || null,
      proj.mlbamId || null,
      proj.kProj != null ? String(proj.kProj) : null,
      proj.kLine != null ? String(proj.kLine) : null,
      proj.kPer9 != null ? String(proj.kPer9) : null,
      proj.kMedian != null ? String(proj.kMedian) : null,
      proj.kP5 != null ? String(proj.kP5) : null,
      proj.kP95 != null ? String(proj.kP95) : null,
      proj.bookLine != null ? String(proj.bookLine) : null,
      proj.bookOverOdds || null,
      proj.bookUnderOdds || null,
      proj.pOver != null ? String(proj.pOver) : null,
      proj.pUnder != null ? String(proj.pUnder) : null,
      proj.modelOverOdds || null,
      proj.modelUnderOdds || null,
      proj.edgeOver != null ? String(proj.edgeOver) : null,
      proj.edgeUnder != null ? String(proj.edgeUnder) : null,
      proj.verdict || null,
      proj.bestEdge != null ? String(proj.bestEdge) : null,
      proj.bestSide || null,
      proj.bestMlStr || null,
      proj.signalBreakdown ? JSON.stringify(proj.signalBreakdown) : null,
      proj.matchupRows ? JSON.stringify(proj.matchupRows) : null,
      proj.distribution ? JSON.stringify(proj.distribution) : null,
      proj.inningBreakdown ? JSON.stringify(proj.inningBreakdown) : null,
      now,
    ];
    await conn.execute(sql, vals);
    console.log(`${TAG}   ✓ DB upsert: gameId=${gameId} side=${proj.side} pitcher=${proj.pitcherName}`);
  }

  // Cleanup
  try { await fs.unlink(htmlOut); } catch {}
  try { await fs.unlink(jsonOut); } catch {}

  return {
    gameId,
    success: true,
    label,
    awayPitcher: awayProj.pitcherName,
    homeP: homeProj.pitcherName,
    awayKProj: awayProj.kProj,
    homeKProj: homeProj.kProj,
    awayVerdict: awayProj.verdict,
    homeVerdict: homeProj.verdict,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`${TAG} ═══════════════════════════════════════════════`);
  console.log(`${TAG} K-Props Runner — April 3, 2026 MLB (14 games)`);
  console.log(`${TAG} ═══════════════════════════════════════════════`);
  console.log(`${TAG} plays:    ${PLAYS_PATH}`);
  console.log(`${TAG} statcast: ${STATCAST_PATH}`);
  console.log(`${TAG} model:    ${MODEL_SCRIPT}`);

  // Verify files exist
  for (const f of [PLAYS_PATH, STATCAST_PATH, MODEL_SCRIPT]) {
    try {
      await fs.access(f);
      console.log(`${TAG} ✓ File exists: ${path.basename(f)}`);
    } catch {
      console.error(`${TAG} ✕ MISSING: ${f}`);
      process.exit(1);
    }
  }

  // DB connection
  const u = new URL(process.env.DATABASE_URL);
  const conn = await mysql.createConnection({
    host: u.hostname,
    port: parseInt(u.port || '3306'),
    user: u.username,
    password: u.password,
    database: u.pathname.replace(/^\//, '').split('?')[0],
    ssl: { rejectUnauthorized: false },
  });
  console.log(`${TAG} ✓ DB connected`);

  // Temp dir
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kprops_apr3_'));
  console.log(`${TAG} ✓ Temp dir: ${tmpDir}`);

  // Write crosswalk
  const crosswalkPath = await writeCrosswalk(tmpDir);

  // Run all games
  const results = [];
  let passed = 0, failed = 0;

  for (const game of GAMES) {
    const result = await runGame(game, crosswalkPath, tmpDir, conn);
    results.push(result);
    if (result.success) passed++;
    else failed++;
  }

  // Cleanup temp dir
  try { await fs.rm(tmpDir, { recursive: true }); } catch {}

  await conn.end();

  // Summary
  console.log(`\n${TAG} ═══════════════════════════════════════════════`);
  console.log(`${TAG} SUMMARY: ${passed}/${GAMES.length} games modeled | ${failed} failed`);
  console.log(`${TAG} ═══════════════════════════════════════════════`);
  for (const r of results) {
    if (r.success) {
      console.log(`${TAG}   ✓ [${r.gameId}] ${r.label}: ${r.awayPitcher} kProj=${r.awayKProj} (${r.awayVerdict}) | ${r.homeP} kProj=${r.homeKProj} (${r.homeVerdict})`);
    } else {
      console.log(`${TAG}   ✕ [${r.gameId}]: ${r.error}`);
    }
  }
}

main().catch(err => {
  console.error(`${TAG} FATAL: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
