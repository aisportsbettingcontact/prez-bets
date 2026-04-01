/**
 * update_ff_splits.mjs
 *
 * Updates the 2 First Four games with correct VSiN DK NJ betting splits.
 *
 * VSiN HTML data for March 18:
 *
 * Game 1 — VSiN lists: Lehigh (away in VSiN) vs Prairie View A&M (home in VSiN)
 *   Spread: Lehigh -3.5 (favorite), PV A&M +3.5
 *   DB record: prairie_view_a_and_m @ lehigh  (PV A&M = away, Lehigh = home)
 *   So VSiN "away" = Lehigh = our HOME team
 *   Splits mapping (VSiN away = our home, VSiN home = our away):
 *     spreadAwayMoneyPct (our away = PV A&M = VSiN home) = VSiN home handle = 55%
 *     spreadAwayBetsPct  (our away = PV A&M = VSiN home) = VSiN home bets   = 48%
 *     totalOverMoneyPct  = 52% (over handle)
 *     totalOverBetsPct   = 61% (over bets)
 *     mlAwayMoneyPct     (our away = PV A&M = VSiN home ML) = 39%
 *     mlAwayBetsPct      (our away = PV A&M = VSiN home ML) = 35%
 *
 * Game 2 — VSiN lists: SMU (away in VSiN) vs Miami OH (home in VSiN)
 *   Spread: SMU -7.5 (favorite), Miami OH +7.5
 *   DB record: miami_oh @ smu  (Miami OH = away, SMU = home)
 *   So VSiN "away" = SMU = our HOME team
 *   Splits mapping (VSiN away = our home = SMU, VSiN home = our away = Miami OH):
 *     spreadAwayMoneyPct (our away = Miami OH = VSiN home) = VSiN home handle = 58%
 *     spreadAwayBetsPct  (our away = Miami OH = VSiN home) = VSiN home bets   = 70%
 *     totalOverMoneyPct  = 48% (over handle)
 *     totalOverBetsPct   = 45% (over bets)
 *     mlAwayMoneyPct     (our away = Miami OH = VSiN home ML) = 71%
 *     mlAwayBetsPct      (our away = Miami OH = VSiN home ML) = 49%
 *
 * Also updating the odds to match VSiN exactly:
 *   Game 1: Lehigh -3.5 (home fav), PV A&M +3.5, total 142.5, ML: Lehigh -166 / PV A&M +140
 *   Game 2: SMU -7.5 (home fav), Miami OH +7.5, total 161.5, ML: SMU -325 / Miami OH +260
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log('=== UPDATING FIRST FOUR GAMES WITH SPLITS ===');
console.log('');

// ── Game 1: prairie_view_a_and_m @ lehigh (ID: 1890016) ──────────────────────
// VSiN: Lehigh -3.5 (home fav) | PV A&M +3.5 (away dog)
// Our DB: awayTeam = prairie_view_a_and_m, homeTeam = lehigh
// awaySpread = +3.5 (PV A&M), homeSpread = -3.5 (Lehigh)
// awayML = +140 (PV A&M), homeML = -166 (Lehigh)
// Splits: VSiN "away" = Lehigh = our home. VSiN "home" = PV A&M = our away.
//   spreadAwayMoneyPct = VSiN home handle = 55%
//   spreadAwayBetsPct  = VSiN home bets   = 48%
//   totalOverMoneyPct  = 52%
//   totalOverBetsPct   = 61%
//   mlAwayMoneyPct     = VSiN home ML handle = 39%
//   mlAwayBetsPct      = VSiN home ML bets   = 35%

const [r1] = await conn.execute(
  `UPDATE games SET
    awayBookSpread = 3.5,
    homeBookSpread = -3.5,
    awaySpreadOdds = -110,
    homeSpreadOdds = -110,
    bookTotal = 142.5,
    overOdds = -110,
    underOdds = -110,
    awayML = 140,
    homeML = -166,
    spreadAwayMoneyPct = 55,
    spreadAwayBetsPct = 48,
    totalOverMoneyPct = 52,
    totalOverBetsPct = 61,
    mlAwayMoneyPct = 39,
    mlAwayBetsPct = 35,
    publishedToFeed = 1
  WHERE id = 1890016`,
);
console.log(`Game 1 (prairie_view_a_and_m @ lehigh): ${r1.affectedRows} row updated`);
console.log('  Spread: PV A&M +3.5 / Lehigh -3.5');
console.log('  Total: 142.5');
console.log('  ML: PV A&M +140 / Lehigh -166');
console.log('  Splits: spreadHandle=55%/48% | totalOver=52%/61% | mlHandle=39%/35%');

// ── Game 2: miami_oh @ smu (ID: 1890017) ─────────────────────────────────────
// VSiN: SMU -7.5 (home fav) | Miami OH +7.5 (away dog)
// Our DB: awayTeam = miami_oh, homeTeam = smu
// awaySpread = +7.5 (Miami OH), homeSpread = -7.5 (SMU)
// awayML = +260 (Miami OH), homeML = -325 (SMU)
// Splits: VSiN "away" = SMU = our home. VSiN "home" = Miami OH = our away.
//   spreadAwayMoneyPct = VSiN home handle = 58%
//   spreadAwayBetsPct  = VSiN home bets   = 70%
//   totalOverMoneyPct  = 48%
//   totalOverBetsPct   = 45%
//   mlAwayMoneyPct     = VSiN home ML handle = 71%
//   mlAwayBetsPct      = VSiN home ML bets   = 49%

const [r2] = await conn.execute(
  `UPDATE games SET
    awayBookSpread = 7.5,
    homeBookSpread = -7.5,
    awaySpreadOdds = -110,
    homeSpreadOdds = -110,
    bookTotal = 161.5,
    overOdds = -110,
    underOdds = -110,
    awayML = 260,
    homeML = -325,
    spreadAwayMoneyPct = 58,
    spreadAwayBetsPct = 70,
    totalOverMoneyPct = 48,
    totalOverBetsPct = 45,
    mlAwayMoneyPct = 71,
    mlAwayBetsPct = 49,
    publishedToFeed = 1
  WHERE id = 1890017`,
);
console.log(`\nGame 2 (miami_oh @ smu): ${r2.affectedRows} row updated`);
console.log('  Spread: Miami OH +7.5 / SMU -7.5');
console.log('  Total: 161.5');
console.log('  ML: Miami OH +260 / SMU -325');
console.log('  Splits: spreadHandle=58%/70% | totalOver=48%/45% | mlHandle=71%/49%');

// ── Verify ────────────────────────────────────────────────────────────────────
console.log('\n=== VERIFICATION ===');
const [rows] = await conn.execute(
  `SELECT id, awayTeam, homeTeam, gameDate, startTimeEst,
          awayBookSpread, homeBookSpread, bookTotal, awayML, homeML,
          spreadAwayMoneyPct, spreadAwayBetsPct,
          totalOverMoneyPct, totalOverBetsPct,
          mlAwayMoneyPct, mlAwayBetsPct,
          publishedToFeed
   FROM games WHERE id IN (1890016, 1890017)
   ORDER BY startTimeEst`
);

for (const g of rows) {
  const hasSplits = g.spreadAwayBetsPct !== null;
  const hasOdds = g.awayBookSpread !== null && g.bookTotal !== null && g.awayML !== null;
  console.log(`\nID:${g.id} | ${g.awayTeam} @ ${g.homeTeam} | ${g.gameDate} ${g.startTimeEst}`);
  console.log(`  Odds: spread=${g.awayBookSpread > 0 ? '+' : ''}${g.awayBookSpread}/${g.homeBookSpread} | total=${g.bookTotal} | ML=${g.awayML > 0 ? '+' : ''}${g.awayML}/${g.homeML}`);
  console.log(`  Splits: spreadHandle=${g.spreadAwayMoneyPct}%/${100-g.spreadAwayMoneyPct}% | spreadBets=${g.spreadAwayBetsPct}%/${100-g.spreadAwayBetsPct}%`);
  console.log(`         totalOverHandle=${g.totalOverMoneyPct}%/${100-g.totalOverMoneyPct}% | totalOverBets=${g.totalOverBetsPct}%/${100-g.totalOverBetsPct}%`);
  console.log(`         mlHandle=${g.mlAwayMoneyPct}%/${100-g.mlAwayMoneyPct}% | mlBets=${g.mlAwayBetsPct}%/${100-g.mlAwayBetsPct}%`);
  console.log(`  Status: odds=${hasOdds ? '✓' : '✗'} | splits=${hasSplits ? '✓' : '✗'} | published=${g.publishedToFeed ? '✓' : '✗'}`);
}

// Final count of fully populated games
const [summary] = await conn.execute(
  `SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN awayBookSpread IS NOT NULL AND bookTotal IS NOT NULL AND awayML IS NOT NULL THEN 1 ELSE 0 END) as hasOdds,
    SUM(CASE WHEN spreadAwayBetsPct IS NOT NULL THEN 1 ELSE 0 END) as hasSplits,
    SUM(CASE WHEN publishedToFeed = 1 THEN 1 ELSE 0 END) as published
   FROM games WHERE sport = 'NCAAM'`
);
const s = summary[0];
console.log(`\n=== FINAL NCAAM FEED SUMMARY ===`);
console.log(`  Total NCAAM games in DB: ${s.total}`);
console.log(`  Games with full odds:    ${s.hasOdds}`);
console.log(`  Games with splits:       ${s.hasSplits}`);
console.log(`  Games published:         ${s.published}`);

await conn.end();
console.log('\nDone.');
