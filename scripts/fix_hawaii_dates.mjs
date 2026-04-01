/**
 * Fix Hawaii midnight game dates.
 * 
 * The rule: midnight ET games (Hawaii home games at 9 PM PT) belong on the SAME
 * calendar day they are played (the PT date), NOT the prior day.
 * 
 * - UC Riverside @ Hawaii: played March 5 at 9 PM PT = midnight ET on March 6
 *   NCAA API lists under March 6, should be stored under March 5.
 *   My previous script wrongly moved it to March 4 — fix back to March 5.
 * 
 * - Long Beach St @ Hawaii: played March 7 at 9 PM PT = midnight ET on March 8
 *   NCAA API lists under March 8, should be stored under March 7.
 *   My previous script moved it to March 7 — that is CORRECT.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const db = await mysql.createConnection(process.env.DATABASE_URL);

  // Check current state of Hawaii games
  const [rows] = await db.execute(`
    SELECT id, gameDate, awayTeam, homeTeam, startTimeEst, sortOrder
    FROM games
    WHERE homeTeam = 'hawaii' OR awayTeam = 'hawaii'
    ORDER BY gameDate
  `);
  console.log('Hawaii games (current state):');
  console.table(rows);

  // Fix UC Riverside @ Hawaii: was wrongly moved to March 4, should be March 5
  const [fix1] = await db.execute(`
    UPDATE games SET gameDate = '2026-03-05'
    WHERE awayTeam = 'uc_riverside' AND homeTeam = 'hawaii' AND gameDate = '2026-03-04'
  `);
  console.log(`Fixed UC Riverside @ Hawaii: ${fix1.affectedRows} row(s) → 2026-03-05`);

  // Verify Long Beach St @ Hawaii is on March 7 (correct)
  const [lbRows] = await db.execute(`
    SELECT id, gameDate, awayTeam, homeTeam, startTimeEst FROM games
    WHERE awayTeam = 'long_beach_st' AND homeTeam = 'hawaii'
  `);
  console.log('Long Beach St @ Hawaii:');
  console.table(lbRows);
  if (lbRows.length > 0 && lbRows[0].gameDate === '2026-03-07') {
    console.log('✓ Long Beach St @ Hawaii is correctly on 2026-03-07');
  } else {
    console.log('⚠ Long Beach St @ Hawaii needs attention');
  }

  // Final state
  const [final] = await db.execute(`
    SELECT id, gameDate, awayTeam, homeTeam, startTimeEst, sortOrder
    FROM games
    WHERE homeTeam = 'hawaii' OR awayTeam = 'hawaii'
    ORDER BY gameDate
  `);
  console.log('\nFinal state of Hawaii games:');
  console.table(final);

  await db.end();
  console.log('Done.');
}

main().catch(console.error);
