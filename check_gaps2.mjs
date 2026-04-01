import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 2 });

// Check the duplicate san_diego_st game
const [dup] = await pool.execute(
  `SELECT id, awayTeam, homeTeam, startTimeEst, gameDate, awayBookSpread, bookTotal, sport, sortOrder
   FROM games WHERE (awayTeam = 'san_diego_st' OR homeTeam = 'san_diego_st') 
   AND gameDate IN ('2026-03-13', '2026-03-14', '2026-03-15')
   ORDER BY gameDate, startTimeEst`
);
console.log('san_diego_st games:');
dup.forEach(r => console.log(' ', r.id, r.gameDate, r.awayTeam, '@', r.homeTeam, 'time:', r.startTimeEst, 'odds:', r.awayBookSpread, 'sortOrder:', r.sortOrder));

// Check new_mexico game
const [nm] = await pool.execute(
  `SELECT id, awayTeam, homeTeam, startTimeEst, gameDate, awayBookSpread, bookTotal, sport, sortOrder
   FROM games WHERE id = 1830046`
);
console.log('\nnew_mexico game:', nm[0]);

// Check Kings/Clippers splits
const [kc] = await pool.execute(
  `SELECT id, awayTeam, homeTeam, startTimeEst, spreadAwayBetsPct, totalOverBetsPct, mlAwayBetsPct
   FROM games WHERE id = 1620043`
);
console.log('\nKings/Clippers:', kc[0]);

// Check VSiN splits for NBA - are there any games with splits?
const [nba] = await pool.execute(
  `SELECT id, awayTeam, homeTeam, startTimeEst, spreadAwayBetsPct
   FROM games WHERE sport = 'NBA' AND gameDate = '2026-03-14' ORDER BY sortOrder`
);
console.log('\nNBA splits status:');
nba.forEach(r => console.log(' ', r.id, r.awayTeam, '@', r.homeTeam, 'splits:', r.spreadAwayBetsPct));

await pool.end();
