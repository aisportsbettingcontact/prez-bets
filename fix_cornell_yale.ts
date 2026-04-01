import dotenv from 'dotenv';
dotenv.config();
import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection({
    uri: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
  });

  // Cornell @ Yale: epoch 1773500400 = 08:00 PST = 11:00 EST
  // Our DB incorrectly has 11:00 (was EST, should be 08:00 PST)
  const [rows] = await conn.execute(
    `SELECT id, awayTeam, homeTeam, startTimeEst, ncaaContestId FROM games 
     WHERE sport = 'NCAAM' AND gameDate = '2026-03-14' AND awayTeam = 'cornell' AND homeTeam = 'yale'`
  ) as any[];
  console.log('Before fix:', JSON.stringify(rows, null, 2));

  const [result] = await conn.execute(
    `UPDATE games SET startTimeEst = '08:00' 
     WHERE sport = 'NCAAM' AND gameDate = '2026-03-14' AND awayTeam = 'cornell' AND homeTeam = 'yale'`
  ) as any[];
  console.log('Updated Cornell @ Yale:', result.affectedRows, 'rows affected');

  // Final verification of all 21 NCAAM games sorted by PST time
  const [finalRows] = await conn.execute(
    `SELECT awayTeam, homeTeam, startTimeEst FROM games 
     WHERE sport = 'NCAAM' AND gameDate = '2026-03-14' 
     ORDER BY startTimeEst`
  ) as any[];

  console.log('\n=== All 21 NCAAM games for March 14 (PST) ===');
  for (const row of finalRows as any[]) {
    const parts = (row.startTimeEst ?? 'TBD').split(':');
    const h = parseInt(parts[0] ?? '0', 10);
    const m = parts[1]?.slice(0, 2) ?? '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    const display = isNaN(h) ? row.startTimeEst : `${h12}:${m} ${ampm} PST`;
    console.log(`  ${row.awayTeam.padEnd(30)} @ ${row.homeTeam.padEnd(30)} → ${display}`);
  }

  await conn.end();
}

main().catch(err => { console.error(err); process.exit(1); });
