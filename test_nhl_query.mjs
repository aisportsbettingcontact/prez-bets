import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [rows] = await conn.query(
    `SELECT id, gameDate, awayTeam, homeTeam, gameStatus, modelRunAt, modelAwayScore,
            modelAwayPLCoverPct, modelHomePLCoverPct, modelAwayPuckLine, modelHomePuckLine,
            modelAwayPLOdds, modelHomePLOdds, modelOverOdds, modelUnderOdds
     FROM games 
     WHERE gameDate = ? AND sport = ? AND gameStatus = ? 
       AND (modelRunAt IS NULL OR modelAwayScore IS NULL)`,
    ['2026-03-23', 'NHL', 'upcoming']
  );
  console.log('Query succeeded. Rows:', rows.length);
  rows.forEach(r => console.log(JSON.stringify(r)));
} catch (e) {
  console.error('Query FAILED:', e.message);
  console.error('SQL Error Code:', e.code);
  console.error('SQL State:', e.sqlState);
}
await conn.end();
