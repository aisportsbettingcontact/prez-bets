/**
 * auditHrPropsGap.mjs
 * Identifies all dates Apr 11–May 10 that have MLB games but no HR Props data.
 * Also checks the Statcast ISO gap and F5_SHARE drift state.
 */
import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config({ quiet: true });

const TAG = '[HRPropsGapAudit]';
function log(msg) { console.log(`${TAG} ${msg}`); }

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 3 });

  // ── 1. HR Props gap analysis ────────────────────────────────────────────────
  log('=== HR Props Gap Analysis (Apr 11 – May 10, 2026) ===');
  const [gameDates] = await pool.execute(`
    SELECT gameDate, COUNT(*) as gameCount
    FROM games
    WHERE sport='MLB'
      AND gameDate >= '2026-04-11'
      AND gameDate <= '2026-05-10'
      AND gameStatus IN ('Final','F','final','FINAL')
    GROUP BY gameDate
    ORDER BY gameDate
  `);

  const [hrDates] = await pool.execute(`
    SELECT DATE(createdAt) as hrDate, COUNT(*) as propCount
    FROM mlb_hr_props
    WHERE createdAt >= '2026-04-11'
    GROUP BY DATE(createdAt)
    ORDER BY hrDate
  `);

  const hrDateSet = new Set(hrDates.map(r => {
    const d = r.hrDate;
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    return String(d).slice(0, 10);
  }));

  log(`HR Props dates with data: ${[...hrDateSet].sort().join(', ')}`);
  log('');

  const missingDates = [];
  for (const g of gameDates) {
    const d = String(g.gameDate);
    if (!hrDateSet.has(d)) {
      missingDates.push({ date: d, gameCount: g.gameCount });
      log(`  MISSING: ${d} (${g.gameCount} games)`);
    }
  }
  log(`Total missing dates: ${missingDates.length} of ${gameDates.length}`);
  log('');

  // ── 2. Statcast ISO gap analysis ────────────────────────────────────────────
  log('=== Statcast ISO Gap Analysis ===');
  const [isoStats] = await pool.execute(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN iso IS NOT NULL THEN 1 ELSE 0 END) as has_iso,
      SUM(CASE WHEN barrelPct IS NOT NULL THEN 1 ELSE 0 END) as has_barrel,
      SUM(CASE WHEN hardHitPct IS NOT NULL THEN 1 ELSE 0 END) as has_hardhit,
      SUM(CASE WHEN woba IS NOT NULL THEN 1 ELSE 0 END) as has_woba,
      SUM(CASE WHEN slg IS NOT NULL THEN 1 ELSE 0 END) as has_slg,
      SUM(CASE WHEN obp IS NOT NULL THEN 1 ELSE 0 END) as has_obp,
      SUM(CASE WHEN avg IS NOT NULL THEN 1 ELSE 0 END) as has_avg
    FROM mlb_players
  `);
  const s = isoStats[0];
  log(`Total players: ${s.total}`);
  log(`  iso:      ${s.has_iso}/${s.total} (${(s.has_iso/s.total*100).toFixed(1)}%)`);
  log(`  barrelPct: ${s.has_barrel}/${s.total} (${(s.has_barrel/s.total*100).toFixed(1)}%)`);
  log(`  hardHitPct: ${s.has_hardhit}/${s.total} (${(s.has_hardhit/s.total*100).toFixed(1)}%)`);
  log(`  woba:     ${s.has_woba}/${s.total} (${(s.has_woba/s.total*100).toFixed(1)}%)`);
  log(`  slg:      ${s.has_slg}/${s.total} (${(s.has_slg/s.total*100).toFixed(1)}%)`);
  log(`  obp:      ${s.has_obp}/${s.total} (${(s.has_obp/s.total*100).toFixed(1)}%)`);
  log(`  avg:      ${s.has_avg}/${s.total} (${(s.has_avg/s.total*100).toFixed(1)}%)`);

  // Sample a few players to understand the data structure
  const [samplePlayers] = await pool.execute(`
    SELECT mlbamId, playerName, teamAbbrev, barrelPct, hardHitPct, iso, woba, slg, obp, avg
    FROM mlb_players
    WHERE barrelPct IS NOT NULL
    LIMIT 5
  `);
  log('Sample players with barrelPct:');
  samplePlayers.forEach(p => log(`  ${p.playerName} (${p.teamAbbrev}): barrel=${p.barrelPct} hardhit=${p.hardHitPct} iso=${p.iso} woba=${p.woba} slg=${p.slg} obp=${p.obp} avg=${p.avg}`));

  // ── 3. F5_SHARE drift state ─────────────────────────────────────────────────
  log('');
  log('=== F5_SHARE Drift State ===');
  const [drift] = await pool.execute(`SELECT * FROM mlb_drift_state WHERE market='F5_SHARE'`);
  if (drift.length > 0) {
    const d = drift[0];
    log(`  market: ${d.market}`);
    log(`  rollingValue: ${d.rollingValue}`);
    log(`  baselineValue: ${d.baselineValue}`);
    log(`  delta: ${d.delta}`);
    log(`  direction: ${d.direction}`);
    log(`  driftDetected: ${d.driftDetected}`);
    log(`  consecutiveDriftCount: ${d.consecutiveDriftCount}`);
    log(`  lastCheckedAt: ${new Date(d.lastCheckedAt).toISOString()}`);
    log(`  lastRecalibrationAt: ${d.lastRecalibrationAt ? new Date(d.lastRecalibrationAt).toISOString() : 'NEVER'}`);
  }

  // ── 4. Calibration constants current state ──────────────────────────────────
  log('');
  log('=== Calibration Constants ===');
  const [cc] = await pool.execute(`SELECT paramName, currentValue, baselineValue, sampleSize, updateSource, lastUpdatedAt FROM mlb_calibration_constants ORDER BY paramName`);
  cc.forEach(r => log(`  ${r.paramName}: current=${r.currentValue} baseline=${r.baselineValue} n=${r.sampleSize} source=${r.updateSource}`));

  log('');
  log('[VERIFY] Gap audit complete');
  log(`Missing HR Props dates: ${JSON.stringify(missingDates.map(d => d.date))}`);

  await pool.end();
  return missingDates;
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
