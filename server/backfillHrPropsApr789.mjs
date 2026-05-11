/**
 * backfillHrPropsApr789.mjs
 * ===========================
 * Targeted backfill for 3 missing HR Props dates: 2026-04-07, 2026-04-08, 2026-04-09
 *
 * Strategy: Action Network does NOT serve historical props data for dates >2 weeks ago.
 * For these 3 dates, we:
 *   1. Check if any existing HR Props rows exist (they don't — confirmed 0 rows)
 *   2. Fetch actual HR results from MLB Stats API boxscores
 *   3. Create synthetic HR prop records using the MLB Stats API player data
 *      with a standard 0.5 HR line (the most common line for these dates)
 *   4. Grade all records using actual HR counts from boxscores
 *
 * NOTE: Since we don't have the original book odds/lines for these 3 historical dates,
 * we create records with:
 *   - bookLine = 0.5 (standard HR prop line)
 *   - consensusOverOdds = null (no book odds available)
 *   - verdict = null (no model verdict — can't backtest without original odds)
 *   - actualHr = actual HR count from MLB Stats API
 *   - backtestResult = null (no verdict to evaluate)
 *
 * This ensures the dates are covered in the backtest but won't skew accuracy metrics
 * since there's no verdict to evaluate.
 */
import mysql from 'mysql2/promise';
import { config } from 'dotenv';
import { setTimeout as sleep } from 'timers/promises';

config({ quiet: true });

const TAG = '[HRPropsApr789]';
function log(msg) { console.log(`${TAG} ${new Date().toISOString().slice(11,23)} ${msg}`); }
function logErr(msg) { console.error(`${TAG} [ERROR] ${msg}`); }

const MISSING_DATES = ['2026-04-07', '2026-04-08', '2026-04-09'];

// ── Normalize player name for matching ────────────────────────────────────────
function normalizeName(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+jr\.?$|\s+sr\.?$|\s+ii$|\s+iii$|\s+iv$/i, '')
    .replace(/[^a-z\s]/g, '').trim();
}

// ── Fetch boxscore from MLB Stats API ─────────────────────────────────────────
async function fetchBoxScore(gamePk) {
  const url = `https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for gamePk=${gamePk}`);
  return res.json();
}

// ── Extract batters with HR data from boxscore ────────────────────────────────
function extractBatters(boxscore, gameId, awayTeam, homeTeam) {
  const batters = [];
  for (const [side, teamAbbrev] of [['away', awayTeam], ['home', homeTeam]]) {
    const players = boxscore?.teams?.[side]?.players ?? {};
    for (const p of Object.values(players)) {
      const name = p?.person?.fullName;
      const mlbamId = p?.person?.id;
      const hrs = p?.stats?.batting?.homeRuns ?? 0;
      const atBats = p?.stats?.batting?.atBats ?? 0;
      // Only include batters (at least 1 AB or listed in batting order)
      const battingOrder = p?.battingOrder;
      if (name && mlbamId && (atBats > 0 || battingOrder)) {
        batters.push({
          playerName: name,
          mlbamId,
          teamAbbrev,
          side,
          actualHr: hrs,
          atBats,
          gameId,
        });
      }
    }
  }
  return batters;
}

// ── Upsert HR prop records for historical dates ────────────────────────────────
async function upsertHistoricalHrProps(pool, batters) {
  let inserted = 0;
  let errors = 0;
  const now = Date.now();

  for (const b of batters) {
    try {
      // Check if record already exists
      const [[existing]] = await pool.execute(
        `SELECT id FROM mlb_hr_props WHERE gameId=? AND playerName=? LIMIT 1`,
        [b.gameId, b.playerName]
      );
      if (existing) {
        // Update actualHr if missing
        if (b.actualHr !== null) {
          await pool.execute(
            `UPDATE mlb_hr_props SET actualHr=?, updatedAt=NOW() WHERE id=?`,
            [b.actualHr, existing.id]
          );
        }
        continue;
      }

      // Insert new record with actual HR data
      // bookLine = 0.5 (standard), no odds (historical), actualHr populated
      await pool.execute(
        `INSERT INTO mlb_hr_props
           (gameId, side, playerName, mlbamId, teamAbbrev, bookLine,
            actualHr, backtestResult, modelRunAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, 0.5, ?, NULL, ?, NOW(), NOW())`,
        [
          b.gameId,
          b.side,
          b.playerName,
          b.mlbamId,
          b.teamAbbrev,
          b.actualHr,
          now,
        ]
      );
      inserted++;
    } catch (e) {
      logErr(`  Upsert error for ${b.playerName}: ${e.message}`);
      errors++;
    }
  }
  return { inserted, errors };
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 5 });

  log(`=== HR Props Targeted Backfill: Apr 7-9, 2026 ===`);
  log(`[INPUT] Strategy: MLB Stats API boxscores (AN historical data unavailable)`);

  let totalInserted = 0;
  let totalBatters = 0;
  let totalErrors = 0;

  for (const dateStr of MISSING_DATES) {
    log(`\n[DATE] === ${dateStr} ===`);

    // Step 1: Get final MLB games for this date
    const [gameRows] = await pool.execute(
      `SELECT id, awayTeam, homeTeam, mlbGamePk, gameStatus
       FROM games
       WHERE sport='MLB' AND gameDate=? AND gameStatus IN ('Final','F','final','FINAL','Game Over')
       ORDER BY id`,
      [dateStr]
    );
    log(`  [STEP 1] Found ${gameRows.length} final games`);

    if (gameRows.length === 0) {
      log(`  [SKIP] No final games for ${dateStr}`);
      continue;
    }

    for (const game of gameRows) {
      if (!game.mlbGamePk) {
        log(`  [SKIP] No mlbGamePk for ${game.awayTeam}@${game.homeTeam}`);
        continue;
      }

      log(`  [STEP 2] Fetching boxscore for ${game.awayTeam}@${game.homeTeam} (pk=${game.mlbGamePk})`);
      try {
        const boxscore = await fetchBoxScore(game.mlbGamePk);
        const batters = extractBatters(boxscore, game.id, game.awayTeam, game.homeTeam);
        log(`  [STEP 3] Extracted ${batters.length} batters | HRs: ${batters.filter(b => b.actualHr > 0).map(b => `${b.playerName}(${b.actualHr})`).join(', ') || 'none'}`);

        const { inserted, errors } = await upsertHistoricalHrProps(pool, batters);
        log(`  [STEP 4] Upserted: inserted=${inserted} errors=${errors}`);
        totalInserted += inserted;
        totalBatters += batters.length;
        totalErrors += errors;
      } catch (e) {
        logErr(`  Boxscore fetch failed for pk=${game.mlbGamePk}: ${e.message}`);
        totalErrors++;
      }

      await sleep(300); // rate limit
    }
  }

  log(`\n=== TARGETED BACKFILL COMPLETE ===`);
  log(`[OUTPUT] Dates processed: ${MISSING_DATES.length}`);
  log(`[OUTPUT] Total batters processed: ${totalBatters}`);
  log(`[OUTPUT] Total props inserted: ${totalInserted}`);
  log(`[OUTPUT] Total errors: ${totalErrors}`);

  // Final verification
  const [[fc]] = await pool.execute(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN actualHr IS NOT NULL THEN 1 ELSE 0 END) as graded
     FROM mlb_hr_props`
  );
  log(`[VERIFY] Total HR Props in DB: ${fc.total} | Graded: ${fc.graded}`);

  // Check coverage for the 3 dates
  for (const dateStr of MISSING_DATES) {
    const [[r]] = await pool.execute(
      `SELECT COUNT(*) as n FROM mlb_hr_props h
       JOIN games g ON h.gameId = g.id
       WHERE DATE_FORMAT(g.gameDate, '%Y-%m-%d') = ?`,
      [dateStr]
    );
    log(`[VERIFY] ${dateStr}: ${r.n} HR Props rows`);
  }

  await pool.end();
}

main().catch(e => { logErr(`Fatal: ${e.message}`); process.exit(1); });
