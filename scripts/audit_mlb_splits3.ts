import mysql from 'mysql2/promise';
import { writeFileSync } from 'fs';

const conn = await mysql.createConnection(process.env.DATABASE_URL!);

// Also include rlAwayBetsPct and rlAwayMoneyPct
const [rows] = await conn.execute<any[]>(`
  SELECT 
    awayTeam, homeTeam, gameDate, sport,
    spreadAwayBetsPct, spreadAwayMoneyPct,
    rlAwayBetsPct, rlAwayMoneyPct,
    bookTotal, totalOverBetsPct, totalOverMoneyPct,
    awayML, homeML,
    mlAwayBetsPct, mlAwayMoneyPct
  FROM games
  WHERE sport = 'MLB' AND gameDate = '2026-05-01'
  ORDER BY awayTeam
`);

const output = JSON.stringify(rows, null, 2);
writeFileSync('/home/ubuntu/mlb_splits_db.json', output);
console.log('Written to /home/ubuntu/mlb_splits_db.json');
console.log(`Found ${rows.length} games`);

// Print summary
for (const r of rows) {
  console.log(`${r.awayTeam}@${r.homeTeam}: RL_bets=${r.rlAwayBetsPct} RL_money=${r.rlAwayMoneyPct} | Total_bets=${r.totalOverBetsPct} Total_money=${r.totalOverMoneyPct} | ML_bets=${r.mlAwayBetsPct} ML_money=${r.mlAwayMoneyPct}`);
}

await conn.end();
