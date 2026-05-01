import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL!);

// First check the columns available in games table
const [cols] = await conn.execute<any[]>('DESCRIBE games');
const colNames = cols.map((c: any) => c.Field);
console.log('[COLUMNS]', colNames.join(', '));

// Query MLB splits for May 1
const [rows] = await conn.execute<any[]>(`
  SELECT 
    awayTeam, homeTeam, gameDate, sport,
    spreadAwayBetsPct, spreadAwayMoneyPct,
    bookTotal, totalOverBetsPct, totalOverMoneyPct,
    awayML, homeML,
    mlAwayBetsPct, mlAwayMoneyPct
  FROM games
  WHERE sport = 'MLB' AND gameDate = '2026-05-01'
  ORDER BY awayTeam
`);

console.log('[ROWS]', JSON.stringify(rows, null, 2));
await conn.end();
