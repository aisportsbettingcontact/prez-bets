/**
 * Deep audit: check all 42 games (21 NCAAB, 7 NBA, 14 NHL) for:
 * 1. AN odds (awayBookSpread, homeBookSpread, bookTotal, awayML, homeML + juice)
 * 2. Open lines (openAwaySpread, openHomeSpread, openTotal, openAwayML, openHomeML + juice)
 * 3. VSiN splits (awaySpreadPct, homeSpreadPct, awayMoneyPct, homeMoneyPct, etc.)
 * 4. Start times (startTimeEst)
 * 5. Feed visibility (awayBookSpread OR bookTotal must be non-null to appear on feed)
 */
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  connectionLimit: 3,
});

async function audit() {
  const [rows] = await pool.execute(
    `SELECT 
      id, sport, gameDate, awayTeam, homeTeam, startTimeEst,
      -- AN book lines (DK NJ)
      awayBookSpread, awaySpreadOdds, homeBookSpread, homeSpreadOdds,
      bookTotal, overOdds, underOdds,
      awayML, homeML,
      -- Open lines
      openAwaySpread, openAwaySpreadOdds, openHomeSpread, openHomeSpreadOdds,
      openTotal, openOverOdds, openUnderOdds,
      openAwayML, openHomeML,
      -- VSiN splits
      spreadAwayBetsPct, spreadAwayMoneyPct,
      totalOverBetsPct, totalOverMoneyPct,
      mlAwayBetsPct, mlAwayMoneyPct,
      -- Feed visibility
      publishedToFeed
    FROM games 
    WHERE gameDate = '2026-03-14'
    ORDER BY sport, sortOrder`
  );

  const games = rows;
  
  const sports = { NCAAM: [], NBA: [], NHL: [] };
  for (const g of games) {
    if (g.sport === 'NCAAM') sports.NCAAM.push(g);
    else if (g.sport === 'NBA') sports.NBA.push(g);
    else if (g.sport === 'NHL') sports.NHL.push(g);
  }

  console.log('\n' + '='.repeat(80));
  console.log('FULL AUDIT: March 14, 2026 — All 42 Games');
  console.log('='.repeat(80));

  for (const [sport, sportGames] of Object.entries(sports)) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`${sport}: ${sportGames.length} games`);
    console.log('─'.repeat(80));

    let missingOdds = 0, missingOpenLine = 0, missingSplits = 0, missingStartTime = 0, notOnFeed = 0;

    for (const g of sportGames) {
      const hasBookLine = g.awayBookSpread !== null || g.bookTotal !== null;
      const hasOpenLine = g.openAwaySpread !== null || g.openTotal !== null;
      const hasSpreadsplits = g.spreadAwayBetsPct !== null;
      const hasTotalSplits = g.totalOverBetsPct !== null;
      const hasMLSplits = g.mlAwayBetsPct !== null;
      const hasStartTime = g.startTimeEst !== null && g.startTimeEst !== '00:00';
      const onFeed = hasBookLine;

      if (!hasBookLine) missingOdds++;
      if (!hasOpenLine) missingOpenLine++;
      if (!hasSpreadsplits && !hasTotalSplits && !hasMLSplits) missingSplits++;
      if (!hasStartTime) missingStartTime++;
      if (!onFeed) notOnFeed++;

      const oddsStr = hasBookLine 
        ? `SPREAD: ${g.awayBookSpread ?? 'N/A'}(${g.awaySpreadOdds ?? 'N/A'})/${g.homeBookSpread ?? 'N/A'}(${g.homeSpreadOdds ?? 'N/A'}) | TOTAL: ${g.bookTotal ?? 'N/A'}(${g.overOdds ?? 'N/A'}/${g.underOdds ?? 'N/A'}) | ML: ${g.awayML ?? 'N/A'}/${g.homeML ?? 'N/A'}`
        : '*** NO BOOK ODDS ***';
      
      const openStr = hasOpenLine
        ? `OPEN: ${g.openAwaySpread ?? 'N/A'}(${g.openAwaySpreadOdds ?? 'N/A'})/${g.openHomeSpread ?? 'N/A'}(${g.openHomeSpreadOdds ?? 'N/A'}) | T: ${g.openTotal ?? 'N/A'}(${g.openOverOdds ?? 'N/A'}/${g.openUnderOdds ?? 'N/A'}) | ML: ${g.openAwayML ?? 'N/A'}/${g.openHomeML ?? 'N/A'}`
        : '*** NO OPEN LINE ***';

      const homeSpreadBetsPct = g.spreadAwayBetsPct !== null ? (100 - g.spreadAwayBetsPct) : null;
      const homeMLBetsPct = g.mlAwayBetsPct !== null ? (100 - g.mlAwayBetsPct) : null;
      const underBetsPct = g.totalOverBetsPct !== null ? (100 - g.totalOverBetsPct) : null;
      const splitsStr = (hasSpreadsplits || hasTotalSplits || hasMLSplits)
        ? `SPR: ${g.spreadAwayBetsPct ?? 'N/A'}%/${homeSpreadBetsPct ?? 'N/A'}% (money: ${g.spreadAwayMoneyPct ?? 'N/A'}%) | TOT: ${g.totalOverBetsPct ?? 'N/A'}%/${underBetsPct ?? 'N/A'}% (money: ${g.totalOverMoneyPct ?? 'N/A'}%) | ML: ${g.mlAwayBetsPct ?? 'N/A'}%/${homeMLBetsPct ?? 'N/A'}% (money: ${g.mlAwayMoneyPct ?? 'N/A'}%)`
        : '*** NO SPLITS ***';

      const timeStr = hasStartTime ? g.startTimeEst : '*** NO START TIME ***';
      const feedStr = onFeed ? 'ON FEED' : '*** NOT ON FEED ***';

      console.log(`\n  [${g.id}] ${g.awayTeam} @ ${g.homeTeam}`);
      console.log(`    TIME: ${timeStr} EST | ${feedStr}`);
      console.log(`    ${oddsStr}`);
      console.log(`    ${openStr}`);
      console.log(`    SPLITS: ${splitsStr}`);
    }

    console.log(`\n  SUMMARY for ${sport}:`);
    console.log(`    Total games: ${sportGames.length}`);
    console.log(`    Missing book odds: ${missingOdds}/${sportGames.length}`);
    console.log(`    Missing open line: ${missingOpenLine}/${sportGames.length}`);
    console.log(`    Missing splits: ${missingSplits}/${sportGames.length}`);
    console.log(`    Missing start time: ${missingStartTime}/${sportGames.length}`);
    console.log(`    Not on feed: ${notOnFeed}/${sportGames.length}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('OVERALL SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total games: ${games.length}`);
  console.log(`  NCAAM: ${sports.NCAAM.length} | NBA: ${sports.NBA.length} | NHL: ${sports.NHL.length}`);
  
  const totalMissingOdds = games.filter(g => g.awayBookSpread === null && g.bookTotal === null).length;
  const totalMissingOpen = games.filter(g => g.openAwaySpread === null && g.openTotal === null).length;
  const totalMissingSplits = games.filter(g => g.spreadAwayBetsPct === null && g.totalOverBetsPct === null && g.mlAwayBetsPct === null).length;
  const totalMissingTime = games.filter(g => !g.startTimeEst || g.startTimeEst === '00:00').length;
  
  console.log(`Missing book odds: ${totalMissingOdds}/${games.length}`);
  console.log(`Missing open line: ${totalMissingOpen}/${games.length}`);
  console.log(`Missing splits: ${totalMissingSplits}/${games.length}`);
  console.log(`Missing start time: ${totalMissingTime}/${games.length}`);

  await pool.end();
}

audit().catch(console.error);
