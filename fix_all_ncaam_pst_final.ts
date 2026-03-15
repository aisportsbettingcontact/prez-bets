/**
 * Definitive fix: Set all 21 NCAAM game start times to correct PST values
 * using the confirmed epoch data from the NCAA API debug output.
 *
 * Epoch → PST conversions (verified from debug_ncaa_epochs.ts output):
 *   1773460800 → 21:00 PST (9:00 PM)  — new_mexico @ san_diego_st
 *   1773500400 → 08:00 PST (8:00 AM)  — cornell @ yale, vermont @ umbc
 *   1773507600 → 10:00 PST (10:00 AM) — dayton @ saint_louis, nc_central @ howard, vanderbilt @ florida, wisconsin @ michigan
 *   1773511200 → 11:00 PST (11:00 AM) — pennsylvania @ harvard
 *   1773514800 → 12:00 PST (12:00 PM) — charlotte @ south_florida
 *   1773516600 → 12:30 PST (12:30 PM) — st_josephs @ va_commonwealth, mississippi @ arkansas, purdue @ ucla
 *   1773523800 → 14:30 PST (2:30 PM)  — tulsa @ wichita_st
 *   1773525600 → 15:00 PST (3:00 PM)  — houston @ arizona, san_diego_st @ utah_st
 *   1773527400 → 15:30 PST (3:30 PM)  — connecticut @ st_johns
 *   1773531000 → 16:30 PST (4:30 PM)  — prairie_view_a_and_m @ southern_u
 *   1773532800 → 17:00 PST (5:00 PM)  — toledo @ akron
 *   1773534600 → 17:30 PST (5:30 PM)  — virginia @ duke, kennesaw_st @ louisiana_tech
 *   1773540000 → 19:00 PST (7:00 PM)  — hawaii @ uc_irvine
 */
import dotenv from 'dotenv';
dotenv.config();
import mysql from 'mysql2/promise';

function epochToPst(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

// Definitive mapping: awayTeam → homeTeam → PST time (from epoch)
const CORRECT_TIMES: Array<{ away: string; home: string; epoch: number }> = [
  { away: 'new_mexico',           home: 'san_diego_st',    epoch: 1773460800 }, // 21:00 PST
  { away: 'cornell',              home: 'yale',             epoch: 1773500400 }, // 08:00 PST
  { away: 'vermont',              home: 'umbc',             epoch: 1773500400 }, // 08:00 PST
  { away: 'dayton',               home: 'saint_louis',      epoch: 1773507600 }, // 10:00 PST
  { away: 'nc_central',           home: 'howard',           epoch: 1773507600 }, // 10:00 PST
  { away: 'vanderbilt',           home: 'florida',          epoch: 1773507600 }, // 10:00 PST
  { away: 'wisconsin',            home: 'michigan',         epoch: 1773507600 }, // 10:00 PST
  { away: 'pennsylvania',         home: 'harvard',          epoch: 1773511200 }, // 11:00 PST
  { away: 'charlotte',            home: 'south_florida',    epoch: 1773514800 }, // 12:00 PST
  { away: 'st_josephs',           home: 'va_commonwealth',  epoch: 1773516600 }, // 12:30 PST
  { away: 'mississippi',          home: 'arkansas',         epoch: 1773516600 }, // 12:30 PST
  { away: 'purdue',               home: 'ucla',             epoch: 1773516600 }, // 12:30 PST
  { away: 'tulsa',                home: 'wichita_st',       epoch: 1773523800 }, // 14:30 PST
  { away: 'houston',              home: 'arizona',          epoch: 1773525600 }, // 15:00 PST
  { away: 'san_diego_st',         home: 'utah_st',          epoch: 1773525600 }, // 15:00 PST
  { away: 'connecticut',          home: 'st_johns',         epoch: 1773527400 }, // 15:30 PST
  { away: 'prairie_view_a_and_m', home: 'southern_u',       epoch: 1773531000 }, // 16:30 PST
  { away: 'toledo',               home: 'akron',            epoch: 1773532800 }, // 17:00 PST
  { away: 'virginia',             home: 'duke',             epoch: 1773534600 }, // 17:30 PST
  { away: 'kennesaw_st',          home: 'louisiana_tech',   epoch: 1773534600 }, // 17:30 PST
  { away: 'hawaii',               home: 'uc_irvine',        epoch: 1773540000 }, // 19:00 PST
];

async function main() {
  const conn = await mysql.createConnection({
    uri: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
  });

  console.log('=== Definitive PST Time Fix for All 21 NCAAM Games ===\n');
  console.log('Game                                              | Epoch      | PST Time');
  console.log('--------------------------------------------------|------------|----------');

  let updated = 0;
  let failed = 0;

  for (const game of CORRECT_TIMES) {
    const pstTime = epochToPst(game.epoch);
    const matchup = `${game.away} @ ${game.home}`.padEnd(50);
    console.log(`${matchup}| ${game.epoch} | ${pstTime}`);

    const [result] = await conn.execute(
      `UPDATE games SET startTimeEst = ? 
       WHERE sport = 'NCAAM' AND gameDate = '2026-03-14' 
       AND awayTeam = ? AND homeTeam = ?`,
      [pstTime, game.away, game.home]
    ) as any[];

    if (result.affectedRows > 0) {
      updated++;
    } else {
      console.log(`  ⚠️  NO MATCH in DB for ${game.away} @ ${game.home}`);
      failed++;
    }
  }

  console.log(`\nResult: ${updated} updated, ${failed} failed\n`);

  // Final verification
  const [finalRows] = await conn.execute(
    `SELECT awayTeam, homeTeam, startTimeEst FROM games 
     WHERE sport = 'NCAAM' AND gameDate = '2026-03-14' 
     ORDER BY startTimeEst`
  ) as any[];

  console.log('=== Final Verification — All 21 NCAAM Games (sorted by PST) ===');
  let count = 0;
  for (const row of finalRows as any[]) {
    count++;
    const parts = (row.startTimeEst ?? 'TBD').split(':');
    const h = parseInt(parts[0] ?? '0', 10);
    const m = parts[1]?.slice(0, 2) ?? '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    const display = isNaN(h) ? row.startTimeEst : `${h12}:${m} ${ampm} PST`;
    console.log(`  ${String(count).padStart(2)}. ${row.awayTeam.padEnd(30)} @ ${row.homeTeam.padEnd(30)} → ${display}`);
  }
  console.log(`\nTotal: ${count} games`);

  await conn.end();
}

main().catch(err => { console.error(err); process.exit(1); });
