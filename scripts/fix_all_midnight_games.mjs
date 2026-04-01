/**
 * Find all games in the DB with startTimeEst = "00:00" and fix their dates.
 * 
 * For each 00:00 game:
 * 1. Check the NCAA API for the prior day — if the game appears there as a midnight game, move it.
 * 2. If not found in prior day, check if the game is a real midnight game (Hawaii home game).
 * 3. If it's a TBD placeholder (non-Hawaii teams), update startTimeEst to "TBD".
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

// Known Hawaii home teams (games at Hawaii arena start at ~9 PM PT = midnight ET)
const HAWAII_HOME_VENUES = new Set(['hawaii', 'hawaii_pacific']);

// Find all games with 00:00 start time
const [midnightRows] = await db.execute(`
  SELECT id, gameDate, awayTeam, homeTeam, startTimeEst, ncaaContestId, sortOrder
  FROM games
  WHERE startTimeEst = '00:00'
  ORDER BY gameDate, sortOrder
`);

console.log(`Found ${midnightRows.length} games with startTimeEst = '00:00':`);
console.table(midnightRows);

for (const row of midnightRows) {
  const isHawaiiHome = HAWAII_HOME_VENUES.has(row.homeTeam);
  
  if (isHawaiiHome) {
    // This is a real midnight ET game (Hawaii home game at 9 PM PT).
    // It belongs on the PRIOR calendar day.
    const gameDate = new Date(row.gameDate + 'T00:00:00Z');
    const priorDate = new Date(gameDate);
    priorDate.setUTCDate(priorDate.getUTCDate() - 1);
    const priorDateStr = priorDate.toISOString().slice(0, 10);
    
    // Check if there's already a row for this matchup on the prior day
    const [existsPrior] = await db.execute(
      `SELECT id FROM games WHERE awayTeam = ? AND homeTeam = ? AND gameDate = ?`,
      [row.awayTeam, row.homeTeam, priorDateStr]
    );
    
    if (existsPrior.length > 0) {
      // Duplicate — delete the current row (prior day row is correct)
      await db.execute(`DELETE FROM games WHERE id = ?`, [row.id]);
      console.log(`[DELETED] ${row.awayTeam} @ ${row.homeTeam} on ${row.gameDate} (duplicate of ${priorDateStr})`);
    } else {
      // Move to prior day
      await db.execute(
        `UPDATE games SET gameDate = ? WHERE id = ?`,
        [priorDateStr, row.id]
      );
      console.log(`[MOVED] ${row.awayTeam} @ ${row.homeTeam}: ${row.gameDate} → ${priorDateStr} (Hawaii midnight game)`);
    }
  } else {
    // Non-Hawaii team with 00:00 — this is a TBD placeholder, update to "TBD"
    await db.execute(
      `UPDATE games SET startTimeEst = 'TBD' WHERE id = ?`,
      [row.id]
    );
    console.log(`[FIXED TBD] ${row.awayTeam} @ ${row.homeTeam} on ${row.gameDate}: 00:00 → TBD`);
  }
}

// Final verification
console.log('\n=== Final state: games with 00:00 or TBD times ===');
const [finalRows] = await db.execute(`
  SELECT id, gameDate, awayTeam, homeTeam, startTimeEst, sortOrder
  FROM games
  WHERE startTimeEst IN ('00:00', 'TBD')
  ORDER BY gameDate, sortOrder
  LIMIT 20
`);
console.table(finalRows);

await db.end();
console.log('Done.');
