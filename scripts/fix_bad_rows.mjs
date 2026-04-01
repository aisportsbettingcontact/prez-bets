/**
 * Fix bad DB rows:
 * 1. Delete Youngstown St @ Robert Morris on 2026-03-05 (belongs on 2026-03-04)
 * 2. Move UC Riverside @ Hawaii from 2026-03-06 to 2026-03-05 (midnight ET = 9 PM PT on Mar 5)
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const db = await mysql.createConnection(process.env.DATABASE_URL);

// ── Step 1: Inspect current state ─────────────────────────────────────────────
console.log("=== Current state of problem rows ===");
const [rows] = await db.execute(`
  SELECT id, gameDate, awayTeam, homeTeam, startTimeEst, awayBookSpread, sortOrder, ncaaContestId
  FROM games
  WHERE (awayTeam IN ('youngstown_st','robert_morris','uc_riverside','hawaii')
      OR homeTeam IN ('youngstown_st','robert_morris','uc_riverside','hawaii'))
  ORDER BY gameDate, sortOrder
`);
console.table(rows);

// ── Step 2: Fix Youngstown St @ Robert Morris ──────────────────────────────────
// This game is on 2026-03-04 at 19:00 ET (NCAA contestId: 6592981).
// The row on 2026-03-05 with 00:00 is a bad duplicate — delete it.
const [ystRows] = await db.execute(`
  SELECT id, gameDate, awayTeam, homeTeam, startTimeEst FROM games
  WHERE awayTeam = 'youngstown_st' AND homeTeam = 'robert_morris'
  ORDER BY gameDate
`);
console.log("\n=== Youngstown St @ Robert Morris rows ===");
console.table(ystRows);

// Delete the Mar 5 row (bad date/time)
const [delResult] = await db.execute(`
  DELETE FROM games
  WHERE awayTeam = 'youngstown_st' AND homeTeam = 'robert_morris' AND gameDate = '2026-03-05'
`);
console.log(`Deleted ${delResult.affectedRows} Youngstown St @ Robert Morris row(s) on 2026-03-05`);

// Make sure the Mar 4 row has the correct start time (19:00)
const [updateYst] = await db.execute(`
  UPDATE games
  SET startTimeEst = '19:00', ncaaContestId = '6592981'
  WHERE awayTeam = 'youngstown_st' AND homeTeam = 'robert_morris' AND gameDate = '2026-03-04'
`);
console.log(`Updated ${updateYst.affectedRows} Youngstown St @ Robert Morris row(s) on 2026-03-04 → startTime=19:00`);

// ── Step 3: Fix UC Riverside @ Hawaii ─────────────────────────────────────────
// This game is on 2026-03-06 at 00:00 ET (9 PM PT on Mar 5).
// Move it to 2026-03-05 and keep startTimeEst = '00:00'.
const [ucrRows] = await db.execute(`
  SELECT id, gameDate, awayTeam, homeTeam, startTimeEst FROM games
  WHERE awayTeam = 'uc_riverside' AND homeTeam = 'hawaii'
  ORDER BY gameDate
`);
console.log("\n=== UC Riverside @ Hawaii rows ===");
console.table(ucrRows);

// Check if there's already a Mar 5 row for this matchup
const [existsMar5] = await db.execute(`
  SELECT id FROM games WHERE awayTeam = 'uc_riverside' AND homeTeam = 'hawaii' AND gameDate = '2026-03-05'
`);

if (existsMar5.length > 0) {
  console.log("UC Riverside @ Hawaii already exists on 2026-03-05 — deleting the Mar 6 duplicate");
  const [delUcr] = await db.execute(`
    DELETE FROM games WHERE awayTeam = 'uc_riverside' AND homeTeam = 'hawaii' AND gameDate = '2026-03-06'
  `);
  console.log(`Deleted ${delUcr.affectedRows} UC Riverside @ Hawaii row(s) on 2026-03-06`);
} else {
  // Move the Mar 6 row to Mar 5
  const [moveUcr] = await db.execute(`
    UPDATE games
    SET gameDate = '2026-03-05', startTimeEst = '00:00', ncaaContestId = '6503339'
    WHERE awayTeam = 'uc_riverside' AND homeTeam = 'hawaii' AND gameDate = '2026-03-06'
  `);
  console.log(`Moved ${moveUcr.affectedRows} UC Riverside @ Hawaii row(s) from 2026-03-06 to 2026-03-05`);
}

// ── Step 4: Verify final state ─────────────────────────────────────────────────
console.log("\n=== Final state ===");
const [finalRows] = await db.execute(`
  SELECT id, gameDate, awayTeam, homeTeam, startTimeEst, sortOrder, ncaaContestId
  FROM games
  WHERE (awayTeam IN ('youngstown_st','robert_morris','uc_riverside','hawaii')
      OR homeTeam IN ('youngstown_st','robert_morris','uc_riverside','hawaii'))
  ORDER BY gameDate, sortOrder
`);
console.table(finalRows);

await db.end();
console.log("\nDone.");
