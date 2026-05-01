/**
 * Force-trigger the MLB refresh and verify DB values match VSIN.
 * This calls the same refreshMlb logic that the auto-refresh job uses.
 */
import mysql from 'mysql2/promise';
import { scrapeVsinMlbBettingSplits } from '../server/vsinBettingSplitsScraper';
import { getMlbTeamByVsinSlug } from '../shared/mlbTeams';
import { updateBookOdds, listGamesByDate } from '../server/db';

const todayStr = '2026-05-01';
const tomorrowStr = '2026-05-02';
const tag = '[ForceRefresh]';

console.log(`${tag} Scraping VSIN MLB splits...`);
const vsinSplits = await scrapeVsinMlbBettingSplits();
console.log(`${tag} Got ${vsinSplits.length} total games`);

// Build date-aware maps
type SplitsEntry = { game: typeof vsinSplits[0]; swapped: boolean };
const todaySplitsMap    = new Map<string, SplitsEntry>();
const tomorrowSplitsMap = new Map<string, SplitsEntry>();

for (const g of vsinSplits) {
  const awayTeam = getMlbTeamByVsinSlug(g.awayVsinSlug);
  const homeTeam = getMlbTeamByVsinSlug(g.homeVsinSlug);
  if (!awayTeam || !homeTeam) {
    console.warn(`${tag} Unresolved: ${g.awayVsinSlug}@${g.homeVsinSlug}`);
    continue;
  }
  const gameDate = g.gameId.length >= 8 ? `${g.gameId.slice(0,4)}-${g.gameId.slice(4,6)}-${g.gameId.slice(6,8)}` : 'unknown';
  const targetMap = gameDate === tomorrowStr ? tomorrowSplitsMap : todaySplitsMap;
  const normalKey = `${awayTeam.abbrev}@${homeTeam.abbrev}`;
  const swappedKey = `${homeTeam.abbrev}@${awayTeam.abbrev}`;
  if (!targetMap.has(normalKey)) {
    targetMap.set(normalKey, { game: g, swapped: false });
    targetMap.set(swappedKey, { game: g, swapped: true });
    console.log(`${tag} Mapped [${gameDate}]: ${awayTeam.abbrev}@${homeTeam.abbrev}`);
  }
}

console.log(`${tag} Maps: today=${todaySplitsMap.size / 2} games, tomorrow=${tomorrowSplitsMap.size / 2} games`);

const getEntry = (key: string, dbGameDate: string): SplitsEntry | undefined => {
  if (dbGameDate === tomorrowStr) {
    return tomorrowSplitsMap.get(key) ?? todaySplitsMap.get(key);
  }
  return todaySplitsMap.get(key) ?? tomorrowSplitsMap.get(key);
};

// Get DB games
const [todayGames, tomorrowGames] = await Promise.all([
  listGamesByDate(todayStr, 'MLB'),
  listGamesByDate(tomorrowStr, 'MLB'),
]);
const allGames = [...todayGames, ...tomorrowGames];
console.log(`${tag} DB: ${todayGames.length} today + ${tomorrowGames.length} tomorrow = ${allGames.length} total`);

let updated = 0;
let skipped = 0;

for (const dbGame of allGames) {
  const key = `${dbGame.awayTeam}@${dbGame.homeTeam}`;
  const entry = getEntry(key, dbGame.gameDate);
  if (!entry) {
    console.log(`${tag} NO_MATCH: ${key} (${dbGame.gameDate})`);
    skipped++;
    continue;
  }
  const { game: splits, swapped } = entry;
  
  const spreadAwayBetsPct = swapped ? (splits.spreadAwayBetsPct != null ? 100 - splits.spreadAwayBetsPct : null) : splits.spreadAwayBetsPct;
  const spreadAwayMoneyPct = swapped ? (splits.spreadAwayMoneyPct != null ? 100 - splits.spreadAwayMoneyPct : null) : splits.spreadAwayMoneyPct;
  const mlAwayBetsPct = swapped ? (splits.mlAwayBetsPct != null ? 100 - splits.mlAwayBetsPct : null) : splits.mlAwayBetsPct;
  const mlAwayMoneyPct = swapped ? (splits.mlAwayMoneyPct != null ? 100 - splits.mlAwayMoneyPct : null) : splits.mlAwayMoneyPct;
  
  const rlSplitsAvailable = !(spreadAwayBetsPct === 0 && spreadAwayMoneyPct === 0);
  
  await updateBookOdds(dbGame.id, {
    ...(rlSplitsAvailable ? {
      spreadAwayBetsPct,
      spreadAwayMoneyPct,
      rlAwayBetsPct: spreadAwayBetsPct,
      rlAwayMoneyPct: spreadAwayMoneyPct,
    } : {}),
    totalOverBetsPct: splits.totalOverBetsPct,
    totalOverMoneyPct: splits.totalOverMoneyPct,
    mlAwayBetsPct,
    mlAwayMoneyPct,
  });
  
  console.log(`${tag} ✅ Updated: ${dbGame.awayTeam}@${dbGame.homeTeam} (${dbGame.gameDate}) | RL: ${rlSplitsAvailable ? spreadAwayBetsPct + '%B/' + spreadAwayMoneyPct + '%H' : 'SKIP(0/0)'} | Total: ${splits.totalOverBetsPct}%B/${splits.totalOverMoneyPct}%H | ML: ${mlAwayBetsPct}%B/${mlAwayMoneyPct}%H`);
  updated++;
}

console.log(`\n${tag} DONE: updated=${updated} skipped=${skipped}`);

// Now verify DB values match VSIN
console.log('\n=== VERIFICATION ===');
const conn = await mysql.createConnection(process.env.DATABASE_URL!);
const [dbRows] = await conn.execute<any[]>(`
  SELECT awayTeam, homeTeam, gameDate,
    spreadAwayBetsPct, spreadAwayMoneyPct,
    rlAwayBetsPct, rlAwayMoneyPct,
    totalOverBetsPct, totalOverMoneyPct,
    mlAwayBetsPct, mlAwayMoneyPct
  FROM games WHERE sport='MLB' AND gameDate='2026-05-01' ORDER BY awayTeam
`);
await conn.end();

for (const row of dbRows) {
  const key = `${row.awayTeam}@${row.homeTeam}`;
  const entry = todaySplitsMap.get(key);
  if (!entry) { console.log(`NO_VSIN: ${key}`); continue; }
  const { game: v, swapped } = entry;
  const vRL_bets = swapped ? (v.spreadAwayBetsPct != null ? 100 - v.spreadAwayBetsPct : null) : v.spreadAwayBetsPct;
  const vRL_money = swapped ? (v.spreadAwayMoneyPct != null ? 100 - v.spreadAwayMoneyPct : null) : v.spreadAwayMoneyPct;
  const vML_bets = swapped ? (v.mlAwayBetsPct != null ? 100 - v.mlAwayBetsPct : null) : v.mlAwayBetsPct;
  const vML_money = swapped ? (v.mlAwayMoneyPct != null ? 100 - v.mlAwayMoneyPct : null) : v.mlAwayMoneyPct;
  
  const ok = row.spreadAwayBetsPct === vRL_bets && row.spreadAwayMoneyPct === vRL_money &&
             row.totalOverBetsPct === v.totalOverBetsPct && row.totalOverMoneyPct === v.totalOverMoneyPct &&
             row.mlAwayBetsPct === vML_bets && row.mlAwayMoneyPct === vML_money;
  
  if (ok) {
    console.log(`✅ ${key}: DB matches VSIN`);
  } else {
    console.log(`❌ ${key}: MISMATCH`);
    if (row.spreadAwayBetsPct !== vRL_bets) console.log(`   RL_bets: DB=${row.spreadAwayBetsPct} VSIN=${vRL_bets}`);
    if (row.spreadAwayMoneyPct !== vRL_money) console.log(`   RL_money: DB=${row.spreadAwayMoneyPct} VSIN=${vRL_money}`);
    if (row.totalOverBetsPct !== v.totalOverBetsPct) console.log(`   Total_bets: DB=${row.totalOverBetsPct} VSIN=${v.totalOverBetsPct}`);
    if (row.totalOverMoneyPct !== v.totalOverMoneyPct) console.log(`   Total_money: DB=${row.totalOverMoneyPct} VSIN=${v.totalOverMoneyPct}`);
    if (row.mlAwayBetsPct !== vML_bets) console.log(`   ML_bets: DB=${row.mlAwayBetsPct} VSIN=${vML_bets}`);
    if (row.mlAwayMoneyPct !== vML_money) console.log(`   ML_money: DB=${row.mlAwayMoneyPct} VSIN=${vML_money}`);
  }
}
