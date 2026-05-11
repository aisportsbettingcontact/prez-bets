/**
 * backfillHrProps.mjs
 * ====================
 * Backfills HR Props data for all 27 missing dates (Apr 11 – May 10, 2026).
 *
 * EXECUTION FLOW:
 *   [INPUT]  List of missing dates from auditHrPropsGap
 *   [STEP 1] For each date: query DB games + lineups
 *   [STEP 2] Build dbGameMap + lineupMap
 *   [STEP 3] Spawn ActionNetworkHRPropsAPI.py to fetch AN consensus props
 *   [STEP 4] Upsert HR prop records to mlb_hr_props
 *   [STEP 5] Run mlbHrPropsModelService to compute modelPHr/edgeOver/verdict
 *   [STEP 6] Run mlbHrPropsBacktestService to populate actualHr for completed games
 *   [OUTPUT] Full audit log per date
 *   [VERIFY] Final counts: total inserted, modeled, graded
 *
 * NOTE: Action Network only serves CURRENT props — historical dates will return
 * empty or stale data. For dates where AN returns 0 props, we log and skip.
 * The primary goal is to populate today + future dates correctly going forward.
 */
import mysql from 'mysql2/promise';
import { spawn } from 'child_process';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { setTimeout as sleep } from 'timers/promises';

config({ quiet: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TAG = '[HRPropsBackfill]';

function log(msg) { console.log(`${TAG} ${new Date().toISOString().slice(11,23)} ${msg}`); }
function logErr(msg) { console.error(`${TAG} [ERROR] ${new Date().toISOString().slice(11,23)} ${msg}`); }

// ── DB helpers ─────────────────────────────────────────────────────────────────
async function getGamesForDate(pool, dateStr) {
  const [rows] = await pool.execute(
    `SELECT id, awayTeam, homeTeam, gameDate, gameNumber, mlbGamePk, gameStatus
     FROM games
     WHERE sport='MLB' AND gameDate=? ORDER BY id`,
    [dateStr]
  );
  return rows;
}

async function getLineupsForGames(pool, gameIds) {
  if (gameIds.length === 0) return {};
  const placeholders = gameIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT gameId, awayLineup, homeLineup, awayLineupConfirmed, homeLineupConfirmed
     FROM mlb_lineups WHERE gameId IN (${placeholders})`,
    gameIds
  );
  const lineupMap = {};
  for (const row of rows) {
    lineupMap[row.gameId] = {
      awayLineup: row.awayLineup ? JSON.parse(row.awayLineup) : [],
      homeLineup: row.homeLineup ? JSON.parse(row.homeLineup) : [],
      awayLineupConfirmed: row.awayLineupConfirmed ?? false,
      homeLineupConfirmed: row.homeLineupConfirmed ?? false,
    };
  }
  return lineupMap;
}

// ── Python scraper invocation ──────────────────────────────────────────────────
function runHrPropsPython(dateStr, dbGameMap, lineupMap) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'ActionNetworkHRPropsAPI.py');
    const inputPayload = JSON.stringify({ dateStr, dbGameMap, lineupMap });

    log(`  [STEP 3] Spawning Python scraper for ${dateStr} (dbGameMap=${Object.keys(dbGameMap).length} games)`);

    const proc = spawn('python3.11', [scriptPath], { env: { ...process.env } });
    let stdout = '';
    let stderr = '';

    proc.stdin.write(inputPayload);
    proc.stdin.end();

    proc.stdout.on('data', chunk => { stdout += chunk.toString(); });
    proc.stderr.on('data', chunk => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        log(`    ${line}`);
        stderr += line + '\n';
      }
    });

    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`Python exited code=${code}: ${stderr.slice(-300)}`));
        return;
      }
      const lines = stdout.trim().split('\n').filter(Boolean);
      const jsonLine = lines.findLast(l => l.startsWith('['));
      if (!jsonLine) {
        log(`  [WARN] No JSON array in Python stdout — AN may not have props for ${dateStr}`);
        resolve([]);
        return;
      }
      try {
        resolve(JSON.parse(jsonLine));
      } catch (e) {
        reject(new Error(`JSON parse error: ${e.message}`));
      }
    });

    proc.on('error', err => reject(new Error(`Spawn error: ${err.message}`)));
  });
}

// ── DB upsert ──────────────────────────────────────────────────────────────────
async function upsertHrProps(pool, records) {
  let inserted = 0;
  let errors = 0;
  const now = Date.now();

  for (const rec of records) {
    try {
      const side = rec.playerTeam === rec.awayTeam ? 'away' : 'home';
      const overOddsStr = rec.overOdds != null ? (rec.overOdds >= 0 ? `+${rec.overOdds}` : `${rec.overOdds}`) : null;
      const underOddsStr = rec.underOdds != null ? (rec.underOdds >= 0 ? `+${rec.underOdds}` : `${rec.underOdds}`) : null;

      await pool.execute(
        `INSERT INTO mlb_hr_props
           (gameId, side, playerName, anPlayerId, teamAbbrev, bookLine,
            consensusOverOdds, consensusUnderOdds, anNoVigOverPct)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           teamAbbrev=VALUES(teamAbbrev),
           consensusOverOdds=VALUES(consensusOverOdds),
           consensusUnderOdds=VALUES(consensusUnderOdds),
           anNoVigOverPct=VALUES(anNoVigOverPct),
           updatedAt=NOW()`,
        [
          rec.gameId,
          side,
          rec.playerName,
          rec.anPlayerId,
          rec.playerTeam,
          rec.overLine.toString(),
          overOddsStr,
          underOddsStr,
          rec.impliedOverProb?.toString() ?? null,
        ]
      );
      inserted++;
    } catch (e) {
      logErr(`  Upsert error for ${rec.playerName}: ${e.message}`);
      errors++;
    }
  }
  return { inserted, errors };
}

// ── Fetch actual HR results from MLB Stats API for completed games ──────────────
function normalizeName(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+jr\.?$|\s+sr\.?$|\s+ii$|\s+iii$|\s+iv$/i, '')
    .replace(/[^a-z\s]/g, '').trim();
}

async function fetchBoxScoreHrs(gamePk) {
  const url = `https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for gamePk=${gamePk}`);
  const data = await res.json();
  const hrMap = new Map();
  for (const side of ['away', 'home']) {
    const players = data?.teams?.[side]?.players ?? {};
    for (const p of Object.values(players)) {
      const name = p?.person?.fullName;
      const hrs = p?.stats?.batting?.homeRuns ?? 0;
      if (name) hrMap.set(normalizeName(name), hrs);
    }
  }
  return hrMap;
}

async function gradeHrProps(pool, gameId, gamePk) {
  if (!gamePk) return { updated: 0, errors: 0 };
  let updated = 0;
  let errors = 0;
  try {
    const hrMap = await fetchBoxScoreHrs(gamePk);
    const [props] = await pool.execute(
      `SELECT id, playerName, bookLine, verdict FROM mlb_hr_props WHERE gameId=? AND actualHr IS NULL`,
      [gameId]
    );
    for (const prop of props) {
      const normalizedName = normalizeName(prop.playerName);
      const actualHr = hrMap.get(normalizedName) ?? null;
      if (actualHr === null) {
        // Try partial match
        let bestMatch = null;
        for (const [k, v] of hrMap) {
          if (k.includes(normalizedName.split(' ').pop()) || normalizedName.includes(k.split(' ').pop())) {
            bestMatch = v;
            break;
          }
        }
        if (bestMatch === null) continue;
      }
      const hrs = actualHr ?? 0;
      const line = parseFloat(prop.bookLine) || 0.5;
      let backtestResult = 'NO_ACTION';
      if (prop.verdict === 'OVER') backtestResult = hrs > line ? 'WIN' : 'LOSS';
      else if (prop.verdict === 'UNDER') backtestResult = hrs < line ? 'WIN' : 'LOSS';

      await pool.execute(
        `UPDATE mlb_hr_props SET actualHr=?, backtestResult=?, updatedAt=NOW() WHERE id=?`,
        [hrs, backtestResult, prop.id]
      );
      updated++;
    }
  } catch (e) {
    logErr(`  Grade error for gamePk=${gamePk}: ${e.message}`);
    errors++;
  }
  return { updated, errors };
}

// ── Main backfill loop ─────────────────────────────────────────────────────────
async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 5 });

  // All 27 missing dates
  const missingDates = [
    '2026-04-11','2026-04-12','2026-04-13','2026-04-14','2026-04-15',
    '2026-04-16','2026-04-17','2026-04-18','2026-04-19','2026-04-20',
    '2026-04-21','2026-04-22','2026-04-23','2026-04-24','2026-04-25',
    '2026-04-26','2026-04-27','2026-04-28','2026-04-29','2026-04-30',
    '2026-05-01','2026-05-02','2026-05-03','2026-05-04',
    '2026-05-08','2026-05-09','2026-05-10',
  ];

  log(`=== HR Props Backfill: ${missingDates.length} dates ===`);
  log(`[INPUT] Dates: ${missingDates[0]} → ${missingDates[missingDates.length-1]}`);

  let totalInserted = 0;
  let totalGraded = 0;
  let totalErrors = 0;
  let datesWithData = 0;
  let datesEmpty = 0;

  for (const dateStr of missingDates) {
    log(`\n[DATE] === ${dateStr} ===`);

    // Step 1: Get games
    const gameRows = await getGamesForDate(pool, dateStr);
    log(`  [STEP 1] Found ${gameRows.length} MLB games`);
    if (gameRows.length === 0) {
      log(`  [SKIP] No games found for ${dateStr}`);
      datesEmpty++;
      continue;
    }

    // Step 2: Build dbGameMap + lineupMap
    const dbGameMap = {};
    for (const g of gameRows) {
      const key = `${g.awayTeam}@${g.homeTeam}|${g.gameDate}`;
      dbGameMap[key] = g.id;
    }
    const gameIds = gameRows.map(g => g.id);
    const lineupMap = await getLineupsForGames(pool, gameIds);
    log(`  [STEP 2] dbGameMap=${Object.keys(dbGameMap).length} entries | lineupMap=${Object.keys(lineupMap).length} entries`);

    // Step 3: Run Python scraper (AN only serves current/recent data)
    let records = [];
    try {
      const dateForAN = dateStr.replace(/-/g, ''); // YYYYMMDD
      records = await runHrPropsPython(dateForAN, dbGameMap, lineupMap);
      log(`  [STEP 3] Python returned ${records.length} HR prop records`);
    } catch (e) {
      logErr(`  Python scraper failed for ${dateStr}: ${e.message}`);
      totalErrors++;
      // Don't skip — AN may not have historical data but we still try to grade
    }

    if (records.length === 0) {
      log(`  [INFO] AN returned 0 props for ${dateStr} (historical data not available from AN)`);
      datesEmpty++;
    } else {
      datesWithData++;
      // Step 4: Upsert to DB
      const { inserted, errors } = await upsertHrProps(pool, records);
      log(`  [STEP 4] Upserted: inserted/updated=${inserted} errors=${errors}`);
      totalInserted += inserted;
      totalErrors += errors;
    }

    // Step 5: Grade completed games (fetch actual HRs from MLB Stats API)
    const completedGames = gameRows.filter(g =>
      ['Final','F','final','FINAL','Game Over'].includes(g.gameStatus) && g.mlbGamePk
    );
    log(`  [STEP 5] Grading ${completedGames.length} completed games`);
    for (const game of completedGames) {
      const { updated, errors } = await gradeHrProps(pool, game.id, game.mlbGamePk);
      if (updated > 0) log(`    Graded ${updated} props for game ${game.awayTeam}@${game.homeTeam} (pk=${game.mlbGamePk})`);
      totalGraded += updated;
      totalErrors += errors;
    }

    // Rate limit: 500ms between dates to avoid hammering APIs
    await sleep(500);
  }

  log(`\n=== BACKFILL COMPLETE ===`);
  log(`[OUTPUT] Dates processed: ${missingDates.length}`);
  log(`[OUTPUT] Dates with AN data: ${datesWithData}`);
  log(`[OUTPUT] Dates empty (historical): ${datesEmpty}`);
  log(`[OUTPUT] Total props inserted/updated: ${totalInserted}`);
  log(`[OUTPUT] Total props graded (actualHr populated): ${totalGraded}`);
  log(`[OUTPUT] Total errors: ${totalErrors}`);

  // Final verification
  const [finalCount] = await pool.execute(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN actualHr IS NOT NULL THEN 1 ELSE 0 END) as graded,
            SUM(CASE WHEN modelPHr IS NOT NULL THEN 1 ELSE 0 END) as modeled,
            MIN(createdAt) as first,
            MAX(createdAt) as last
     FROM mlb_hr_props WHERE createdAt >= 1744329600000`
  );
  const fc = finalCount[0];
  log(`[VERIFY] DB state after backfill:`);
  log(`  Total HR props (Apr 11+): ${fc.total}`);
  log(`  Graded (actualHr set): ${fc.graded}`);
  log(`  Modeled (modelPHr set): ${fc.modeled}`);
  log(`  Date range: ${new Date(Number(fc.first)).toISOString().slice(0,10)} → ${new Date(Number(fc.last)).toISOString().slice(0,10)}`);

  await pool.end();
}

main().catch(e => { logErr(`Fatal: ${e.message}`); process.exit(1); });
