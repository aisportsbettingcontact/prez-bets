/**
 * auditDataSources.mjs
 * =====================
 * Comprehensive audit of all data sources feeding into FG ML/RL/Totals.
 * Checks: table schemas, year coverage, data freshness, and model input completeness.
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

const TAG = '[DataAudit]';
function log(msg) { console.log(`${TAG} ${msg}`); }

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 5 });

  log('=== FULL DATA SOURCE AUDIT ===\n');

  // ── 1. mlb_pitcher_stats ──────────────────────────────────────────────────
  log('── mlb_pitcher_stats ──');
  const [[ps]] = await pool.execute(`
    SELECT COUNT(*) as n,
           SUM(CASE WHEN era IS NOT NULL THEN 1 ELSE 0 END) as hasEra,
           SUM(CASE WHEN k9 IS NOT NULL THEN 1 ELSE 0 END) as hasK9,
           SUM(CASE WHEN xera IS NOT NULL THEN 1 ELSE 0 END) as hasXera,
           SUM(CASE WHEN fip IS NOT NULL THEN 1 ELSE 0 END) as hasFip,
           SUM(CASE WHEN nrfiRate IS NOT NULL THEN 1 ELSE 0 END) as hasNrfi,
           MIN(lastFetchedAt) as minFetch,
           MAX(lastFetchedAt) as maxFetch
    FROM mlb_pitcher_stats
  `);
  log(`  Total pitchers: ${ps.n}`);
  log(`  ERA: ${ps.hasEra} | K9: ${ps.hasK9} | xERA: ${ps.hasXera} | FIP: ${ps.hasFip} | NRFI: ${ps.hasNrfi}`);
  if (ps.maxFetch) {
    log(`  Last fetched: ${new Date(Number(ps.maxFetch)).toISOString().slice(0,10)}`);
    log(`  First fetched: ${new Date(Number(ps.minFetch)).toISOString().slice(0,10)}`);
  }
  // No season column — check if data is current-year only
  const [pitcherSample] = await pool.execute(
    'SELECT fullName, teamAbbrev, era, k9, gamesStarted, lastFetchedAt FROM mlb_pitcher_stats ORDER BY lastFetchedAt DESC LIMIT 5'
  );
  log(`  Most recently updated pitchers:`);
  pitcherSample.forEach(p => log(`    ${p.fullName} (${p.teamAbbrev}): ERA=${p.era} K9=${p.k9} GS=${p.gamesStarted} updated=${new Date(Number(p.lastFetchedAt)).toISOString().slice(0,10)}`));

  // ── 2. mlb_batter_stats / statcast ────────────────────────────────────────
  log('\n── mlb_batter_stats / statcast ──');
  try {
    const [batCols] = await pool.execute('DESCRIBE mlb_batter_stats');
    log(`  Columns: ${batCols.map(c => c.Field).join(', ')}`);
    const [[bs]] = await pool.execute(`
      SELECT COUNT(*) as n,
             SUM(CASE WHEN iso IS NOT NULL THEN 1 ELSE 0 END) as hasIso,
             SUM(CASE WHEN barrelPct IS NOT NULL THEN 1 ELSE 0 END) as hasBarrel,
             SUM(CASE WHEN hardHitPct IS NOT NULL THEN 1 ELSE 0 END) as hasHardHit,
             MIN(lastFetchedAt) as minFetch,
             MAX(lastFetchedAt) as maxFetch
      FROM mlb_batter_stats
    `);
    log(`  Total batters: ${bs.n} | ISO: ${bs.hasIso} | Barrel: ${bs.hasBarrel} | HardHit: ${bs.hasHardHit}`);
    if (bs.maxFetch) log(`  Last fetched: ${new Date(Number(bs.maxFetch)).toISOString().slice(0,10)}`);
  } catch (e) {
    log(`  Table not found or error: ${e.message}`);
  }

  // ── 3. mlb_team_stats ─────────────────────────────────────────────────────
  log('\n── mlb_team_stats ──');
  try {
    const [tCols] = await pool.execute('DESCRIBE mlb_team_stats');
    log(`  Columns: ${tCols.map(c => c.Field).join(', ')}`);
    const [[ts]] = await pool.execute(`
      SELECT COUNT(*) as n,
             MIN(lastFetchedAt) as minFetch,
             MAX(lastFetchedAt) as maxFetch
      FROM mlb_team_stats
    `);
    log(`  Total teams: ${ts.n}`);
    if (ts.maxFetch) log(`  Last fetched: ${new Date(Number(ts.maxFetch)).toISOString().slice(0,10)}`);
    const [teamSample] = await pool.execute('SELECT teamAbbrev, runsPerGame, runsAllowedPerGame, lastFetchedAt FROM mlb_team_stats ORDER BY lastFetchedAt DESC LIMIT 3');
    teamSample.forEach(t => log(`    ${t.teamAbbrev}: RPG=${t.runsPerGame} RAPG=${t.runsAllowedPerGame}`));
  } catch (e) {
    log(`  Table not found or error: ${e.message}`);
  }

  // ── 4. mlb_park_factors ───────────────────────────────────────────────────
  log('\n── mlb_park_factors ──');
  try {
    const [pfCols] = await pool.execute('DESCRIBE mlb_park_factors');
    log(`  Columns: ${pfCols.map(c => c.Field).join(', ')}`);
    const [[pf]] = await pool.execute(`
      SELECT COUNT(*) as n,
             MIN(season) as minSeason,
             MAX(season) as maxSeason,
             MIN(lastFetchedAt) as minFetch,
             MAX(lastFetchedAt) as maxFetch
      FROM mlb_park_factors
    `);
    log(`  Total records: ${pf.n} | Seasons: ${pf.minSeason} - ${pf.maxSeason}`);
    if (pf.maxFetch) log(`  Last fetched: ${new Date(Number(pf.maxFetch)).toISOString().slice(0,10)}`);
    const [pfSample] = await pool.execute('SELECT teamAbbrev, season, parkFactor, hrFactor FROM mlb_park_factors ORDER BY season DESC, teamAbbrev LIMIT 6');
    pfSample.forEach(p => log(`    ${p.teamAbbrev} (${p.season}): parkFactor=${p.parkFactor} hrFactor=${p.hrFactor}`));
  } catch (e) {
    log(`  Table not found or error: ${e.message}`);
  }

  // ── 5. mlb_calibration_constants ─────────────────────────────────────────
  log('\n── mlb_calibration_constants ──');
  try {
    const [cc] = await pool.execute('SELECT * FROM mlb_calibration_constants ORDER BY id');
    cc.forEach(r => log(`  ${r.constantName}: ${r.constantValue} (source=${r.updateSource} n=${r.sampleSize} updated=${new Date(r.updatedAt).toISOString().slice(0,10)})`));
  } catch (e) {
    log(`  Error: ${e.message}`);
  }

  // ── 6. games table — what's in the backtest ───────────────────────────────
  log('\n── games table (MLB final games with model data) ──');
  const [[gm]] = await pool.execute(`
    SELECT COUNT(*) as n,
           MIN(gameDate) as minDate,
           MAX(gameDate) as maxDate,
           SUM(CASE WHEN modelRunAt IS NOT NULL THEN 1 ELSE 0 END) as hasModel,
           SUM(CASE WHEN actualAwayScore IS NOT NULL THEN 1 ELSE 0 END) as hasScore,
           SUM(CASE WHEN modelHomeWinPct IS NOT NULL THEN 1 ELSE 0 END) as hasMlPct,
           SUM(CASE WHEN modelOverRate IS NOT NULL THEN 1 ELSE 0 END) as hasOverRate,
           SUM(CASE WHEN modelF5HomeWinPct IS NOT NULL THEN 1 ELSE 0 END) as hasF5Ml
    FROM games
    WHERE sport='MLB' AND gameStatus='final'
  `);
  log(`  Total final MLB games: ${gm.n}`);
  log(`  Date range: ${gm.minDate} → ${gm.maxDate}`);
  log(`  With model data: ${gm.hasModel} | With scores: ${gm.hasScore}`);
  log(`  Has ML%: ${gm.hasMlPct} | Has O/U rate: ${gm.hasOverRate} | Has F5 ML%: ${gm.hasF5Ml}`);

  // Check if any pre-2026 games exist
  const [[pre2026]] = await pool.execute(`
    SELECT COUNT(*) as n FROM games WHERE sport='MLB' AND gameStatus='final' AND gameDate < '2026-01-01'
  `);
  log(`  Pre-2026 games in DB: ${pre2026.n}`);

  // ── 7. What data feeds into the model at runtime ──────────────────────────
  log('\n── Model input data flow (from MLBCycle / routers) ──');
  
  // Check what the model receives as input by looking at the most recent game projection
  const [recentGame] = await pool.execute(`
    SELECT id, awayTeam, homeTeam, gameDate, 
           modelRunAt, modelHomeWinPct, modelAwayWinPct,
           modelOverRate, modelUnderRate, bookTotal,
           awayML, homeML, awayRunLine, homeRunLine,
           f5AwayML, f5HomeML, modelF5HomeWinPct, modelF5AwayWinPct
    FROM games 
    WHERE sport='MLB' AND modelRunAt IS NOT NULL
    ORDER BY modelRunAt DESC 
    LIMIT 3
  `);
  log(`  Most recently modeled games:`);
  recentGame.forEach(g => {
    log(`    ${g.awayTeam}@${g.homeTeam} (${g.gameDate}): ` +
        `homeWin%=${g.modelHomeWinPct} overRate%=${g.modelOverRate} ` +
        `bookTotal=${g.bookTotal} homeML=${g.homeML} awayML=${g.awayML}`);
  });

  // ── 8. Check FangraphsTeamStats / ISO data sources ────────────────────────
  log('\n── Statcast/ISO data source check ──');
  try {
    const [scCols] = await pool.execute('DESCRIBE mlb_statcast_batter');
    log(`  mlb_statcast_batter columns: ${scCols.map(c => c.Field).join(', ')}`);
    const [[scCnt]] = await pool.execute(`
      SELECT COUNT(*) as n, MIN(season) as minSeason, MAX(season) as maxSeason,
             MIN(lastFetchedAt) as minFetch, MAX(lastFetchedAt) as maxFetch
      FROM mlb_statcast_batter
    `);
    log(`  Records: ${scCnt.n} | Seasons: ${scCnt.minSeason} - ${scCnt.maxSeason}`);
    if (scCnt.maxFetch) log(`  Last fetched: ${new Date(Number(scCnt.maxFetch)).toISOString().slice(0,10)}`);
  } catch (e) {
    log(`  mlb_statcast_batter: ${e.message}`);
  }

  // ── 9. Check FG team offense/defense tables ────────────────────────────────
  log('\n── FanGraphs team offense/defense tables ──');
  for (const tbl of ['mlb_fg_team_offense', 'mlb_fg_team_defense', 'mlb_fg_team_stats', 'mlb_fangraphs_team']) {
    try {
      const [[r]] = await pool.execute(`SELECT COUNT(*) as n FROM ${tbl}`);
      log(`  ${tbl}: ${r.n} rows`);
    } catch (e) {
      log(`  ${tbl}: NOT FOUND`);
    }
  }

  // ── 10. What Python scripts fetch data and from where ─────────────────────
  log('\n── Python data fetchers (source URLs) ──');
  await pool.end();
}

main().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
