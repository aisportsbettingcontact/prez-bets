import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1. Check what MLB games exist for May 14-17
const [may] = await conn.execute(
  'SELECT id, gameDate, awayTeam, homeTeam, sport, gameStatus, publishedToFeed, awayBookSpread FROM games WHERE sport = "MLB" AND gameDate >= "2026-05-14" AND gameDate <= "2026-05-17" ORDER BY gameDate, sortOrder LIMIT 30'
);
console.log('[STEP 1] May 14-17 MLB games in DB:', may.length);
if (may.length > 0) {
  console.log('[STATE] Sample:', JSON.stringify(may.slice(0, 3), null, 2));
} else {
  console.log('[STATE] ZERO games found for May 14-17 — this is the bug');
}

// 2. What is the earliest and latest gameDate for MLB in the DB?
const [range] = await conn.execute(
  'SELECT MIN(gameDate) as minDate, MAX(gameDate) as maxDate, COUNT(*) as total FROM games WHERE sport = "MLB"'
);
console.log('[STEP 2] MLB date range in DB:', JSON.stringify(range[0]));

// 3. Check the exact listGames window right now
const nowUtc = new Date();
const FEED_CUTOFF_UTC_HOUR = 11;
const isBeforeCutoff = nowUtc.getUTCHours() < FEED_CUTOFF_UTC_HOUR;
const windowStartDate = new Date(nowUtc);
if (isBeforeCutoff) windowStartDate.setUTCDate(windowStartDate.getUTCDate() - 1);
const todayUtc = [
  windowStartDate.getUTCFullYear(),
  String(windowStartDate.getUTCMonth() + 1).padStart(2, '0'),
  String(windowStartDate.getUTCDate()).padStart(2, '0'),
].join('-');
const plusSevenDate = new Date(windowStartDate);
plusSevenDate.setUTCDate(plusSevenDate.getUTCDate() + 7);
const plusSeven = [
  plusSevenDate.getUTCFullYear(),
  String(plusSevenDate.getUTCMonth() + 1).padStart(2, '0'),
  String(plusSevenDate.getUTCDate()).padStart(2, '0'),
].join('-');
console.log('[STEP 3] Current listGames window:', todayUtc, '→', plusSeven);

// 4. How many MLB games match the current window?
const [window] = await conn.execute(
  `SELECT COUNT(*) as cnt FROM games WHERE sport = "MLB" AND gameDate >= ? AND gameDate <= ? AND gameStatus != "postponed"`,
  [todayUtc, plusSeven]
);
console.log('[STEP 4] Games matching current window:', window[0].cnt);

// 5. Check if there's a heartbeat/scheduled job that ran recently and may have deleted games
const [recent] = await conn.execute(
  'SELECT id, gameDate, awayTeam, homeTeam FROM games WHERE sport = "MLB" ORDER BY id DESC LIMIT 5'
);
console.log('[STEP 5] Most recently updated MLB games:');
recent.forEach(r => console.log(`  ${r.gameDate} ${r.awayTeam}@${r.homeTeam} updatedAt=${r.updatedAt}`));

// 6. Check what the VSiN scraper would produce for today
console.log('[STEP 6] Checking VSiN MLB page for today...');
try {
  const resp = await fetch('https://data.vsin.com/mlb/betting-splits/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    }
  });
  const text = await resp.text();
  const gameCount = (text.match(/<tr/g) || []).length;
  console.log(`[STATE] VSiN MLB page status=${resp.status} rows=${gameCount}`);
} catch (e) {
  console.log('[STATE] VSiN fetch failed:', e.message);
}

await conn.end();
console.log('[VERIFY] Diagnostic complete');
