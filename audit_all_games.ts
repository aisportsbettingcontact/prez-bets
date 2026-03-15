/**
 * Comprehensive audit of all 42 games for March 14, 2026.
 * Verifies: start times, odds (open/dk), splits, and published status.
 */
import dotenv from 'dotenv';
dotenv.config();
import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection({
    uri: process.env.DATABASE_URL!,
    ssl: { rejectUnauthorized: false },
  });

  const [rows] = await conn.execute(
    `SELECT 
       id, sport, awayTeam, homeTeam, startTimeEst, gameStatus, publishedToFeed,
       openAwaySpread, openTotal, awayBookSpread, bookTotal, awayML, homeML,
       spreadAwayBetsPct, spreadAwayMoneyPct, totalOverBetsPct, totalOverMoneyPct,
       mlAwayBetsPct, mlAwayMoneyPct
     FROM games 
     WHERE gameDate = '2026-03-14' 
     ORDER BY sport, startTimeEst`
  ) as any[];

  const games = rows as any[];
  
  const ncaam = games.filter(g => g.sport === 'NCAAM');
  const nba   = games.filter(g => g.sport === 'NBA');
  const nhl   = games.filter(g => g.sport === 'NHL');

  console.log(`\n${'='.repeat(100)}`);
  console.log(`COMPREHENSIVE AUDIT — March 14, 2026`);
  console.log(`Total: ${games.length} games | NCAAM: ${ncaam.length} | NBA: ${nba.length} | NHL: ${nhl.length}`);
  console.log(`${'='.repeat(100)}\n`);

  function hasOdds(g: any): boolean {
    return g.openAwaySpread != null || g.awayBookSpread != null || g.awayML != null;
  }
  function hasSplits(g: any): boolean {
    return g.spreadAwayBetsPct != null || g.mlAwayBetsPct != null;
  }
  function fmtOdds(g: any): string {
    const open = g.openAwaySpread != null ? `Open: ${g.openAwaySpread}` : 'Open: ---';
    const dk   = g.awayBookSpread != null ? `DK: ${Number(g.awayBookSpread) > 0 ? '+' : ''}${g.awayBookSpread}` : 
                 g.awayML != null         ? `DK ML: ${g.awayML}/${g.homeML}` : 'DK: ---';
    return `${open} | ${dk}`;
  }
  function fmtSplits(g: any): string {
    if (g.spreadAwayBetsPct != null) {
      const homeSprd = g.spreadAwayBetsPct != null ? 100 - g.spreadAwayBetsPct : '?';
      return `Sprd: ${g.spreadAwayBetsPct}%/${homeSprd}% | Tot: ${g.totalOverBetsPct}%/${g.totalOverMoneyPct != null ? 100 - g.totalOverBetsPct : '?'}%`;
    }
    if (g.mlAwayBetsPct != null) {
      const homeML = g.mlAwayBetsPct != null ? 100 - g.mlAwayBetsPct : '?';
      return `ML: ${g.mlAwayBetsPct}%/${homeML}%`;
    }
    return 'NO SPLITS';
  }
  function fmtTime(g: any): string {
    const t = g.startTimeEst ?? 'TBD';
    if (t === 'TBD') return 'TBD';
    const parts = t.split(':');
    const h = parseInt(parts[0] ?? '0', 10);
    const m = parts[1]?.slice(0, 2) ?? '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  }

  // Print NCAAM
  console.log(`── NCAAM (${ncaam.length} games) ──────────────────────────────────────────────────────────────`);
  console.log(`${'#'.padEnd(3)} ${'Matchup'.padEnd(45)} ${'Time (PST)'.padEnd(12)} ${'Status'.padEnd(10)} ${'Odds'.padEnd(35)} ${'Splits'.padEnd(40)} ${'Pub'}`);
  console.log(`${'-'.repeat(3)} ${'-'.repeat(45)} ${'-'.repeat(12)} ${'-'.repeat(10)} ${'-'.repeat(35)} ${'-'.repeat(40)} ${'-'.repeat(3)}`);
  let ncaamOdds = 0, ncaamSplits = 0;
  ncaam.forEach((g, i) => {
    const matchup = `${g.awayTeam} @ ${g.homeTeam}`.padEnd(45);
    const time = fmtTime(g).padEnd(12);
    const status = (g.gameStatus ?? '?').padEnd(10);
    const odds = fmtOdds(g).padEnd(35);
    const splits = fmtSplits(g).padEnd(40);
    const pub = g.publishedToFeed ? 'YES' : 'NO ';
    const issues = [];
    if (!hasOdds(g)) issues.push('NO_ODDS');
    if (!hasSplits(g)) issues.push('NO_SPLITS');
    const issueStr = issues.length ? ` ⚠️  ${issues.join(', ')}` : '';
    console.log(`${String(i+1).padStart(2)}. ${matchup} ${time} ${status} ${odds} ${splits} ${pub}${issueStr}`);
    if (hasOdds(g)) ncaamOdds++;
    if (hasSplits(g)) ncaamSplits++;
  });
  console.log(`\n   NCAAM Summary: ${ncaamOdds}/${ncaam.length} have odds | ${ncaamSplits}/${ncaam.length} have splits\n`);

  // Print NBA
  console.log(`── NBA (${nba.length} games) ────────────────────────────────────────────────────────────────────`);
  console.log(`${'#'.padEnd(3)} ${'Matchup'.padEnd(45)} ${'Time (EST)'.padEnd(12)} ${'Status'.padEnd(10)} ${'Odds'.padEnd(35)} ${'Splits'.padEnd(40)} ${'Pub'}`);
  console.log(`${'-'.repeat(3)} ${'-'.repeat(45)} ${'-'.repeat(12)} ${'-'.repeat(10)} ${'-'.repeat(35)} ${'-'.repeat(40)} ${'-'.repeat(3)}`);
  let nbaOdds = 0, nbaSplits = 0;
  nba.forEach((g, i) => {
    const matchup = `${g.awayTeam} @ ${g.homeTeam}`.padEnd(45);
    const time = fmtTime(g).padEnd(12);
    const status = (g.gameStatus ?? '?').padEnd(10);
    const odds = fmtOdds(g).padEnd(35);
    const splits = fmtSplits(g).padEnd(40);
    const pub = g.publishedToFeed ? 'YES' : 'NO ';
    const issues = [];
    if (!hasOdds(g)) issues.push('NO_ODDS');
    if (!hasSplits(g)) issues.push('NO_SPLITS');
    const issueStr = issues.length ? ` ⚠️  ${issues.join(', ')}` : '';
    console.log(`${String(i+1).padStart(2)}. ${matchup} ${time} ${status} ${odds} ${splits} ${pub}${issueStr}`);
    if (hasOdds(g)) nbaOdds++;
    if (hasSplits(g)) nbaSplits++;
  });
  console.log(`\n   NBA Summary: ${nbaOdds}/${nba.length} have odds | ${nbaSplits}/${nba.length} have splits\n`);

  // Print NHL
  console.log(`── NHL (${nhl.length} games) ────────────────────────────────────────────────────────────────────`);
  console.log(`${'#'.padEnd(3)} ${'Matchup'.padEnd(45)} ${'Time (EST)'.padEnd(12)} ${'Status'.padEnd(10)} ${'Odds'.padEnd(50)} ${'Splits'.padEnd(35)} ${'Pub'}`);
  console.log(`${'-'.repeat(3)} ${'-'.repeat(45)} ${'-'.repeat(12)} ${'-'.repeat(10)} ${'-'.repeat(50)} ${'-'.repeat(35)} ${'-'.repeat(3)}`);
  let nhlOdds = 0, nhlSplits = 0;
  nhl.forEach((g, i) => {
    const matchup = `${g.awayTeam} @ ${g.homeTeam}`.padEnd(45);
    const time = fmtTime(g).padEnd(12);
    const status = (g.gameStatus ?? '?').padEnd(10);
    const odds = fmtOdds(g).padEnd(50);
    const splits = fmtSplits(g).padEnd(35);
    const pub = g.publishedToFeed ? 'YES' : 'NO ';
    const issues = [];
    if (!hasOdds(g)) issues.push('NO_ODDS');
    if (!hasSplits(g)) issues.push('NO_SPLITS');
    const issueStr = issues.length ? ` ⚠️  ${issues.join(', ')}` : '';
    console.log(`${String(i+1).padStart(2)}. ${matchup} ${time} ${status} ${odds} ${splits} ${pub}${issueStr}`);
    if (hasOdds(g)) nhlOdds++;
    if (hasSplits(g)) nhlSplits++;
  });
  console.log(`\n   NHL Summary: ${nhlOdds}/${nhl.length} have odds | ${nhlSplits}/${nhl.length} have splits\n`);

  // Overall summary
  const totalOdds = ncaamOdds + nbaOdds + nhlOdds;
  const totalSplits = ncaamSplits + nbaSplits + nhlSplits;
  console.log(`${'='.repeat(100)}`);
  console.log(`OVERALL SUMMARY`);
  console.log(`  Total games: ${games.length} (NCAAM: ${ncaam.length}, NBA: ${nba.length}, NHL: ${nhl.length})`);
  console.log(`  Games with odds:   ${totalOdds}/${games.length}`);
  console.log(`  Games with splits: ${totalSplits}/${games.length}`);
  
  const missingOdds = games.filter(g => !hasOdds(g));
  const missingSplits = games.filter(g => !hasSplits(g));
  
  if (missingOdds.length > 0) {
    console.log(`\n  ⚠️  Missing odds (${missingOdds.length}):`);
    missingOdds.forEach(g => console.log(`     - [${g.sport}] ${g.awayTeam} @ ${g.homeTeam} (${g.gameStatus})`));
  }
  if (missingSplits.length > 0) {
    console.log(`\n  ⚠️  Missing splits (${missingSplits.length}):`);
    missingSplits.forEach(g => console.log(`     - [${g.sport}] ${g.awayTeam} @ ${g.homeTeam} (${g.gameStatus}, time=${g.startTimeEst})`));
  }
  console.log(`${'='.repeat(100)}\n`);

  await conn.end();
}

main().catch(err => { console.error(err); process.exit(1); });
