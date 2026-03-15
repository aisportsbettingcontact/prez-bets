import dotenv from 'dotenv';
dotenv.config();
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const [games] = await conn.execute(`
  SELECT 
    id, sport, gameDate, startTimeEst, awayTeam, homeTeam,
    awayBookSpread, homeBookSpread, bookTotal, openAwaySpread, openHomeSpread, openTotal,
    spreadAwayBetsPct, spreadAwayMoneyPct, totalOverBetsPct, totalOverMoneyPct,
    mlAwayBetsPct, mlAwayMoneyPct,
    gameStatus, publishedToFeed, ncaaContestId
  FROM games 
  WHERE gameDate='2026-03-14' 
  ORDER BY sport, startTimeEst
`) as any[];

const ncaam = games.filter((g: any) => g.sport === 'NCAAM');
const nba = games.filter((g: any) => g.sport === 'NBA');
const nhl = games.filter((g: any) => g.sport === 'NHL');

function hasOdds(g: any) {
  return g.awayBookSpread !== null || g.bookTotal !== null;
}
function hasOpenOdds(g: any) {
  return g.openAwaySpread !== null || g.openTotal !== null;
}
function hasSplits(g: any) {
  return g.spreadAwayBetsPct !== null;
}

function printSport(label: string, sportGames: any[]) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${label}: ${sportGames.length} games`);
  console.log('='.repeat(70));
  
  let withOdds = 0, withOpen = 0, withSplits = 0;
  
  for (const g of sportGames) {
    const odds = hasOdds(g) ? `DK=${g.awayBookSpread}/${g.homeBookSpread} O/U=${g.bookTotal}` : 'NO ODDS';
    const open = hasOpenOdds(g) ? `Open=${g.openAwaySpread}/${g.openHomeSpread}` : 'NO OPEN';
    const splits = hasSplits(g) 
      ? `Splits: spread=${g.spreadAwayBetsPct}%/${g.spreadAwayMoneyPct}% total=${g.totalOverBetsPct}%/${g.totalOverMoneyPct}%`
      : 'NO SPLITS';
    const status = g.gameStatus ?? 'unknown';
    const pub = g.publishedToFeed ? '✓PUB' : '○unpub';
    
    if (hasOdds(g)) withOdds++;
    if (hasOpenOdds(g)) withOpen++;
    if (hasSplits(g)) withSplits++;
    
    const timeZone = label === 'NCAAM' ? 'PST' : 'EST';
    console.log(`  ${g.startTimeEst} ${timeZone} | ${g.awayTeam} @ ${g.homeTeam}`);
    console.log(`    ${odds} | ${open} | ${pub} | ${status}`);
    console.log(`    ${splits}`);
  }
  
  console.log(`\nSummary: ${sportGames.length} games | ${withOdds} with DK odds | ${withOpen} with Open odds | ${withSplits} with splits`);
}

printSport('NCAAM', ncaam);
printSport('NBA', nba);
printSport('NHL', nhl);

console.log(`\n${'='.repeat(70)}`);
console.log(`TOTAL: ${games.length} games`);
console.log(`  NCAAM: ${ncaam.length} | NBA: ${nba.length} | NHL: ${nhl.length}`);
console.log(`  With DK odds: ${games.filter(hasOdds).length}/${games.length}`);
console.log(`  With Open odds: ${games.filter(hasOpenOdds).length}/${games.length}`);
console.log(`  With splits: ${games.filter(hasSplits).length}/${games.length}`);
console.log('='.repeat(70));

await conn.end();
