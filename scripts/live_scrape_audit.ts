/**
 * Live scrape audit: run the actual scraper and compare against VSIN ground truth.
 */
import { scrapeVsinMlbBettingSplits } from '../server/vsinBettingSplitsScraper';
import { writeFileSync } from 'fs';

console.log('[AUDIT] Starting live scrape of MLB splits...');
const games = await scrapeVsinMlbBettingSplits();
console.log(`[AUDIT] Scraped ${games.length} MLB games`);

// Ground truth from pasted_content_5.txt (May 1, 2026)
// Format: awaySlug@homeSlug: { rl_money, rl_bets, total_money, total_bets, ml_money, ml_bets }
const GROUND_TRUTH: Record<string, { rl_money: number, rl_bets: number, total_money: number, total_bets: number, ml_money: number, ml_bets: number }> = {
  'arizona-diamondbacks@chicago-cubs':      { rl_money: 15, rl_bets: 30, total_money: 61, total_bets: 75, ml_money: 30, ml_bets: 27 },
  'texas-rangers@detroit-tigers':           { rl_money: 43, rl_bets: 21, total_money: 70, total_bets: 69, ml_money: 68, ml_bets: 43 },
  'milwaukee-brewers@washington-nationals': { rl_money: 91, rl_bets: 65, total_money: 75, total_bets: 73, ml_money: 74, ml_bets: 79 },
  'baltimore-orioles@new-york-yankees':     { rl_money: 11, rl_bets: 17, total_money: 87, total_bets: 73, ml_money: 29, ml_bets: 12 },
  'houston-astros@boston-red-sox':          { rl_money: 58, rl_bets: 34, total_money: 86, total_bets: 60, ml_money: 34, ml_bets: 47 },
  'san-francisco-giants@tampa-bay-rays':    { rl_money: 23, rl_bets: 49, total_money: 53, total_bets: 65, ml_money: 36, ml_bets: 28 },
  'philadelphia-phillies@miami-marlins':    { rl_money: 74, rl_bets: 45, total_money: 64, total_bets: 62, ml_money: 69, ml_bets: 66 },
  'cincinnati-reds@pittsburgh-pirates':     { rl_money: 18, rl_bets: 62, total_money: 38, total_bets: 67, ml_money: 48, ml_bets: 47 },
  'toronto-blue-jays@minnesota-twins':      { rl_money: 5,  rl_bets: 33, total_money: 87, total_bets: 73, ml_money: 70, ml_bets: 63 },
  'los-angeles-dodgers@st-louis-cardinals': { rl_money: 85, rl_bets: 63, total_money: 93, total_bets: 79, ml_money: 72, ml_bets: 84 },
  'atlanta-braves@colorado-rockies':        { rl_money: 84, rl_bets: 77, total_money: 82, total_bets: 64, ml_money: 79, ml_bets: 86 },
  'new-york-mets@los-angeles-angels':       { rl_money: 54, rl_bets: 22, total_money: 74, total_bets: 63, ml_money: 45, ml_bets: 45 },
  'cleveland-guardians@athletics':          { rl_money: 7,  rl_bets: 23, total_money: 76, total_bets: 44, ml_money: 72, ml_bets: 54 },
  'chicago-white-sox@san-diego-padres':     { rl_money: 18, rl_bets: 41, total_money: 71, total_bets: 67, ml_money: 43, ml_bets: 23 },
  'kansas-city-royals@seattle-mariners':    { rl_money: 12, rl_bets: 38, total_money: 24, total_bets: 67, ml_money: 30, ml_bets: 17 },
};

// Filter to today's games only
const todayGames = games.filter(g => g.gameId.startsWith('20260501'));
console.log(`[AUDIT] Today's MLB games: ${todayGames.length}`);

let passCount = 0;
let failCount = 0;
const results: any[] = [];

for (const g of todayGames) {
  const key = `${g.awayVsinSlug}@${g.homeVsinSlug}`;
  const gt = GROUND_TRUTH[key];
  
  if (!gt) {
    console.log(`[AUDIT] NO_GT: ${key} — no ground truth entry`);
    results.push({ game: key, status: 'NO_GT' });
    continue;
  }
  
  const checks = [
    { field: 'spreadAwayMoneyPct (RL handle)', scraped: g.spreadAwayMoneyPct, expected: gt.rl_money },
    { field: 'spreadAwayBetsPct (RL bets)',    scraped: g.spreadAwayBetsPct,  expected: gt.rl_bets },
    { field: 'totalOverMoneyPct (Total handle)', scraped: g.totalOverMoneyPct, expected: gt.total_money },
    { field: 'totalOverBetsPct (Total bets)',  scraped: g.totalOverBetsPct,   expected: gt.total_bets },
    { field: 'mlAwayMoneyPct (ML handle)',     scraped: g.mlAwayMoneyPct,     expected: gt.ml_money },
    { field: 'mlAwayBetsPct (ML bets)',        scraped: g.mlAwayBetsPct,      expected: gt.ml_bets },
  ];
  
  const failures = checks.filter(c => c.scraped !== c.expected);
  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  
  if (status === 'PASS') {
    passCount++;
    console.log(`[AUDIT] ✅ PASS: ${key}`);
  } else {
    failCount++;
    console.log(`[AUDIT] ❌ FAIL: ${key}`);
    for (const f of failures) {
      console.log(`  ${f.field}: scraped=${f.scraped} expected=${f.expected}`);
    }
  }
  
  results.push({ game: key, status, checks });
}

console.log(`\n[AUDIT] SUMMARY: ${passCount} PASS, ${failCount} FAIL out of ${todayGames.length} games`);
writeFileSync('/home/ubuntu/live_scrape_audit.json', JSON.stringify(results, null, 2));
console.log('[AUDIT] Results written to /home/ubuntu/live_scrape_audit.json');
