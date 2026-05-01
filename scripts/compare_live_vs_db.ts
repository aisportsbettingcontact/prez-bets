/**
 * Compare live scrape values against what's actually in the DB.
 * This will show whether the DB is stale, has wrong values, or has mapping issues.
 */
import { scrapeVsinMlbBettingSplits } from '../server/vsinBettingSplitsScraper';
import { getMlbTeamByVsinSlug } from '../shared/mlbTeams';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL!);

// Get all MLB games for today from DB
const [dbGames] = await conn.execute<any[]>(`
  SELECT 
    id, awayTeam, homeTeam, gameDate,
    spreadAwayBetsPct, spreadAwayMoneyPct,
    rlAwayBetsPct, rlAwayMoneyPct,
    totalOverBetsPct, totalOverMoneyPct,
    mlAwayBetsPct, mlAwayMoneyPct
  FROM games
  WHERE sport = 'MLB' AND gameDate = '2026-05-01'
  ORDER BY awayTeam
`);

console.log(`[DB] ${dbGames.length} MLB games for 2026-05-01`);

// Scrape live
console.log('[SCRAPE] Fetching live VSIN MLB splits...');
const scraped = await scrapeVsinMlbBettingSplits();
const todayScraped = scraped.filter(g => g.gameId.startsWith('20260501'));
console.log(`[SCRAPE] ${todayScraped.length} today's MLB games from VSIN`);

// Build a lookup from abbrev pair → scraped game
const scrapedMap = new Map<string, typeof todayScraped[0]>();
for (const g of todayScraped) {
  const awayTeam = getMlbTeamByVsinSlug(g.awayVsinSlug);
  const homeTeam = getMlbTeamByVsinSlug(g.homeVsinSlug);
  if (awayTeam && homeTeam) {
    scrapedMap.set(`${awayTeam.abbrev}@${homeTeam.abbrev}`, g);
  } else {
    console.warn(`[SCRAPE] Unresolved: ${g.awayVsinSlug}@${g.homeVsinSlug}`);
  }
}

console.log('\n=== DB vs LIVE SCRAPE COMPARISON ===\n');
let matchCount = 0;
let mismatchCount = 0;

for (const db of dbGames) {
  const key = `${db.awayTeam}@${db.homeTeam}`;
  const live = scrapedMap.get(key);
  
  if (!live) {
    console.log(`[NO_MATCH] ${key} — not in live scrape`);
    continue;
  }
  
  // Compare: DB spreadAwayBetsPct should match live spreadAwayBetsPct (RL bets)
  // Compare: DB rlAwayMoneyPct should match live spreadAwayMoneyPct (RL handle)
  // Compare: DB totalOverBetsPct should match live totalOverBetsPct
  // Compare: DB totalOverMoneyPct should match live totalOverMoneyPct
  // Compare: DB mlAwayBetsPct should match live mlAwayBetsPct
  // Compare: DB mlAwayMoneyPct should match live mlAwayMoneyPct
  
  const checks = [
    { field: 'RL_bets',     db: db.spreadAwayBetsPct, live: live.spreadAwayBetsPct },
    { field: 'RL_money',    db: db.rlAwayMoneyPct,    live: live.spreadAwayMoneyPct },
    { field: 'Total_bets',  db: db.totalOverBetsPct,  live: live.totalOverBetsPct },
    { field: 'Total_money', db: db.totalOverMoneyPct, live: live.totalOverMoneyPct },
    { field: 'ML_bets',     db: db.mlAwayBetsPct,     live: live.mlAwayBetsPct },
    { field: 'ML_money',    db: db.mlAwayMoneyPct,    live: live.mlAwayMoneyPct },
  ];
  
  const diffs = checks.filter(c => Math.abs((c.db ?? 0) - (c.live ?? 0)) > 2); // allow ±2 for live drift
  
  if (diffs.length === 0) {
    console.log(`✅ ${key} — DB matches live (within ±2%)`);
    matchCount++;
  } else {
    console.log(`❌ ${key} — DB MISMATCH:`);
    for (const d of diffs) {
      console.log(`   ${d.field}: DB=${d.db} LIVE=${d.live} (diff=${Math.abs((d.db ?? 0) - (d.live ?? 0))})`);
    }
    mismatchCount++;
  }
}

console.log(`\n=== SUMMARY: ${matchCount} MATCH, ${mismatchCount} MISMATCH ===`);
await conn.end();
