import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 2 });

const [rows] = await pool.execute(
  `SELECT id, awayTeam, homeTeam, startTimeEst, awayBookSpread, bookTotal, sport, spreadAwayBetsPct
   FROM games WHERE gameDate = '2026-03-14'
   ORDER BY sport, sortOrder`
);

console.log('\n=== NCAAB MISSING BOOK ODDS ===');
rows.filter(r => r.sport === 'NCAAM' && r.awayBookSpread === null && r.bookTotal === null)
  .forEach(r => console.log(`  [${r.id}] ${r.awayTeam} @ ${r.homeTeam}  time=${r.startTimeEst}`));

console.log('\n=== MISSING START TIME ===');
rows.filter(r => !r.startTimeEst || r.startTimeEst === '00:00')
  .forEach(r => console.log(`  [${r.id}] ${r.sport} ${r.awayTeam} @ ${r.homeTeam}`));

console.log('\n=== MISSING SPLITS ===');
rows.filter(r => r.spreadAwayBetsPct === null)
  .forEach(r => console.log(`  [${r.id}] ${r.sport} ${r.awayTeam} @ ${r.homeTeam}  time=${r.startTimeEst}`));

console.log('\n=== NBA MISSING SPLITS DETAIL ===');
rows.filter(r => r.sport === 'NBA' && r.spreadAwayBetsPct === null)
  .forEach(r => console.log(`  [${r.id}] ${r.awayTeam} @ ${r.homeTeam}`));

await pool.end();
