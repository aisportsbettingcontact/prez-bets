import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(`
  SELECT id, awayTeam, homeTeam, gameDate, gameStatus,
    awayBookSpread, homeBookSpread, bookTotal,
    awayModelSpread, homeModelSpread, modelTotal,
    modelAwayPuckLine, modelHomePuckLine,
    modelAwayPLOdds, modelHomePLOdds,
    modelOverOdds, modelUnderOdds,
    modelAwayML, modelHomeML,
    awaySpreadOdds, homeSpreadOdds, overOdds, underOdds,
    awayML, homeML,
    spreadEdge, spreadDiff, totalEdge, totalDiff,
    modelRunAt
  FROM games
  WHERE sport = 'NHL' AND gameDate = '2026-03-15'
  ORDER BY startTimeEst ASC
  LIMIT 10
`);

rows.forEach(r => {
  console.log('\n--- ' + r.awayTeam + ' @ ' + r.homeTeam + ' ---');
  console.log('  BOOK: spread=' + r.awayBookSpread + '/' + r.homeBookSpread + ' total=' + r.bookTotal + ' ml=' + r.awayML + '/' + r.homeML);
  console.log('  BOOK odds: spreadOdds=' + r.awaySpreadOdds + '/' + r.homeSpreadOdds + ' o/u=' + r.overOdds + '/' + r.underOdds);
  console.log('  MODEL: spread=' + r.awayModelSpread + '/' + r.homeModelSpread + ' total=' + r.modelTotal);
  console.log('  MODEL puckline: ' + r.modelAwayPuckLine + '/' + r.modelHomePuckLine);
  console.log('  MODEL PL odds: ' + r.modelAwayPLOdds + '/' + r.modelHomePLOdds);
  console.log('  MODEL O/U odds: ' + r.modelOverOdds + '/' + r.modelUnderOdds);
  console.log('  MODEL ML: ' + r.modelAwayML + '/' + r.modelHomeML);
  console.log('  EDGE: spread=' + r.spreadEdge + ' diff=' + r.spreadDiff + ' total=' + r.totalEdge + ' diff=' + r.totalDiff);
  console.log('  modelRunAt: ' + r.modelRunAt);
});

await conn.end();
