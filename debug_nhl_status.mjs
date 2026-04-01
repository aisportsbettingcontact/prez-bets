import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(`
  SELECT id, awayTeam, homeTeam, gameStatus, startTimeEst, modelRunAt, 
    awayModelSpread, homeModelSpread, modelTotal,
    modelAwayPuckLine, modelHomePuckLine,
    modelAwayPLOdds, modelHomePLOdds,
    modelOverOdds, modelUnderOdds
  FROM games
  WHERE sport = 'NHL' AND gameDate = '2026-03-15'
  ORDER BY startTimeEst ASC
`);

console.log('NHL Games Today (2026-03-15):');
rows.forEach(r => {
  console.log(`\n  ${r.awayTeam} @ ${r.homeTeam}`);
  console.log(`    status=${r.gameStatus} | startTime=${r.startTimeEst} | modelRunAt=${r.modelRunAt}`);
  console.log(`    awayModelSpread=${r.awayModelSpread} | modelTotal=${r.modelTotal}`);
  console.log(`    modelAwayPuckLine=${r.modelAwayPuckLine} | modelHomePuckLine=${r.modelHomePuckLine}`);
  console.log(`    modelAwayPLOdds=${r.modelAwayPLOdds} | modelHomePLOdds=${r.modelHomePLOdds}`);
  console.log(`    modelOverOdds=${r.modelOverOdds} | modelUnderOdds=${r.modelUnderOdds}`);
});

await conn.end();
