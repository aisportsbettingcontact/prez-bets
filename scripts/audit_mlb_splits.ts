import mysql from 'mysql2/promise';

// DATABASE_URL is injected by the platform
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('[ERROR] DATABASE_URL not set');
  process.exit(1);
}

const conn = await mysql.createConnection(dbUrl);

const [rows] = await conn.execute<any[]>(`
  SELECT 
    awayTeam, homeTeam, gameDate, sport,
    spreadAwayBetsPct, spreadAwayMoneyPct,
    totalLine, totalOverBetsPct, totalOverMoneyPct,
    awayML, homeML,
    mlAwayBetsPct, mlAwayMoneyPct
  FROM game
  WHERE sport = 'MLB' AND gameDate = '2026-05-01'
  ORDER BY awayTeam
`);

console.log(JSON.stringify(rows, null, 2));
await conn.end();
