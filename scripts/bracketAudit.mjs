/**
 * Definitive March Madness 2026 Bracket Audit
 * 
 * From the bracket images provided:
 * 
 * FIRST FOUR (3/17-3/18):
 *   FF-1: UMBC (16) vs Howard (16) → Howard won 86-83 [MIDWEST]
 *   FF-2: Texas (11) vs NC State (11) → Texas won 68-66 [WEST]
 *   FF-3: Prairie View A&M (16) vs Lehigh (16) → LIVE [SOUTH]
 *   FF-4: Miami (Ohio) (11) vs SMU (11) → upcoming [MIDWEST]
 *
 * ROUND OF 64 (3/19-3/20):
 * EAST:
 *   1 Duke vs 16 Siena
 *   8 Ohio St. vs 9 TCU
 *   5 St. John's vs 12 Northern Iowa
 *   4 Kansas vs 13 Cal Baptist
 *   6 Louisville vs 11 South Florida
 *   3 Michigan St. vs 14 North Dakota St.
 *   7 UCLA vs 10 UCF
 *   2 UConn vs 15 Furman
 * SOUTH:
 *   1 Florida vs 16 [PV A&M/Lehigh winner]
 *   8 Clemson vs 9 Iowa
 *   5 Vanderbilt vs 12 McNeese
 *   4 Nebraska vs 13 Troy
 *   6 North Carolina vs 11 VCU
 *   3 Illinois vs 14 Penn
 *   7 Saint Mary's vs 10 Texas A&M
 *   2 Houston vs 15 Idaho
 * WEST:
 *   1 Arizona vs 16 Long Island
 *   8 Villanova vs 9 Utah St.
 *   5 Wisconsin vs 12 High Point
 *   4 Arkansas vs 13 Hawaii
 *   6 BYU vs 11 Texas [Texas beat NC State in FF]
 *   3 Gonzaga vs 14 Kennesaw St.
 *   7 Miami (FL) vs 10 Missouri
 *   2 Purdue vs 15 Queens (N.C.)
 * MIDWEST:
 *   1 Michigan vs 16 Howard [Howard beat UMBC in FF]
 *   8 Georgia vs 9 Saint Louis
 *   5 Texas Tech vs 12 Akron
 *   4 Alabama vs 13 Hofstra
 *   6 Tennessee vs 11 [Miami OH/SMU winner]
 *   3 Virginia vs 14 Wright St.
 *   7 Kentucky vs 10 Santa Clara
 *   2 Iowa St. vs 15 Tennessee St.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// All 36 games: [label, homeTeam_dbSlug, awayTeam_dbSlug, date, notes]
// home = higher seed (top in bracket), away = lower seed (bottom)
// FF-dependent games marked with TBD
const ALL_GAMES = [
  // ===== FIRST FOUR =====
  ['FF-1', 'umbc',    'howard',              '2026-03-17', 'FINAL: Howard won 86-83'],
  ['FF-2', 'nc_state','texas',               '2026-03-17', 'FINAL: Texas won 68-66'],
  ['FF-3', 'prairie_view_a_and_m','lehigh',  '2026-03-18', 'LIVE'],
  ['FF-4', 'miami_oh','smu',                 '2026-03-18', 'Upcoming'],

  // ===== ROUND OF 64 - EAST =====
  ['R64-E1', 'duke',       'siena',           '2026-03-19', '1 vs 16'],
  ['R64-E2', 'ohio_st',    'tcu',             '2026-03-19', '8 vs 9'],
  ['R64-E3', 'st_johns',   'n_iowa',          '2026-03-19', '5 vs 12'],
  ['R64-E4', 'kansas',     'california_baptist','2026-03-19','4 vs 13'],
  ['R64-E5', 'louisville', 'south_florida',   '2026-03-19', '6 vs 11'],
  ['R64-E6', 'michigan_st','n_dakota_st',     '2026-03-19', '3 vs 14'],
  ['R64-E7', 'ucla',       'c_florida',       '2026-03-19', '7 vs 10'],
  ['R64-E8', 'connecticut','furman',          '2026-03-19', '2 vs 15'],

  // ===== ROUND OF 64 - SOUTH =====
  ['R64-S1', 'florida',    'TBD_pvamu_lehigh','2026-03-20', '1 vs 16 FF winner - TBD'],
  ['R64-S2', 'clemson',    'iowa',            '2026-03-19', '8 vs 9'],
  ['R64-S3', 'vanderbilt', 'mcneese_st',      '2026-03-19', '5 vs 12'],
  ['R64-S4', 'nebraska',   'troy',            '2026-03-19', '4 vs 13'],
  ['R64-S5', 'north_carolina','va_commonwealth','2026-03-19','6 vs 11'],
  ['R64-S6', 'illinois',   'pennsylvania',    '2026-03-19', '3 vs 14'],
  ['R64-S7', 'st_marys',   'texas_a_and_m',   '2026-03-19', '7 vs 10'],
  ['R64-S8', 'houston',    'idaho',           '2026-03-19', '2 vs 15'],

  // ===== ROUND OF 64 - WEST =====
  ['R64-W1', 'arizona',    'liu_brooklyn',    '2026-03-19', '1 vs 16'],
  ['R64-W2', 'villanova',  'utah_st',         '2026-03-19', '8 vs 9'],
  ['R64-W3', 'wisconsin',  'high_point',      '2026-03-19', '5 vs 12'],
  ['R64-W4', 'arkansas',   'hawaii',          '2026-03-19', '4 vs 13'],
  ['R64-W5', 'brigham_young','texas',         '2026-03-19', '6 vs 11 (Texas beat NC State FF)'],
  ['R64-W6', 'gonzaga',    'kennesaw_st',     '2026-03-19', '3 vs 14'],
  ['R64-W7', 'miami_fl',   'missouri',        '2026-03-19', '7 vs 10'],
  ['R64-W8', 'purdue',     'queens_nc',       '2026-03-19', '2 vs 15'],

  // ===== ROUND OF 64 - MIDWEST =====
  ['R64-M1', 'michigan',   'howard',          '2026-03-19', '1 vs 16 (Howard beat UMBC FF)'],
  ['R64-M2', 'georgia',    'saint_louis',     '2026-03-19', '8 vs 9'],
  ['R64-M3', 'texas_tech', 'akron',           '2026-03-19', '5 vs 12'],
  ['R64-M4', 'alabama',    'hofstra',         '2026-03-19', '4 vs 13'],
  ['R64-M5', 'tennessee',  'TBD_miaoh_smu',   '2026-03-20', '6 vs 11 FF winner - TBD'],
  ['R64-M6', 'virginia',   'wright_st',       '2026-03-19', '3 vs 14'],
  ['R64-M7', 'kentucky',   'santa_clara',     '2026-03-19', '7 vs 10'],
  ['R64-M8', 'iowa_st',    'tennessee_st',    '2026-03-19', '2 vs 15'],
];

// Query all NCAAM games Mar 17-21
const [rows] = await conn.query(`
  SELECT id, awayTeam, homeTeam, gameDate, publishedToFeed,
         awayBookSpread, homeBookSpread, bookTotal, awayML, homeML,
         spreadAwayBetsPct, totalOverBetsPct, mlAwayBetsPct
  FROM games 
  WHERE sport = 'NCAAM' 
    AND gameDate BETWEEN '2026-03-17' AND '2026-03-21'
  ORDER BY gameDate, id
`);

// Build lookup by team pair
const dbLookup = new Map();
for (const r of rows) {
  dbLookup.set(`${r.awayTeam}@${r.homeTeam}`, r);
  dbLookup.set(`${r.homeTeam}@${r.awayTeam}`, r);
}

// Also build lookup by single team name for TBD games
const dbByTeam = new Map();
for (const r of rows) {
  if (!dbByTeam.has(r.awayTeam)) dbByTeam.set(r.awayTeam, []);
  if (!dbByTeam.has(r.homeTeam)) dbByTeam.set(r.homeTeam, []);
  dbByTeam.get(r.awayTeam).push(r);
  dbByTeam.get(r.homeTeam).push(r);
}

console.log('='.repeat(80));
console.log('MARCH MADNESS 2026 - COMPLETE BRACKET AUDIT');
console.log('='.repeat(80));
console.log(`DB total NCAAM games (Mar 17-21): ${rows.length}`);
console.log();

const results = {
  found_complete: [],
  found_no_odds: [],
  found_no_splits: [],
  missing: [],
  tbd: [],
};

for (const [label, home, away, date, notes] of ALL_GAMES) {
  // Skip TBD games
  if (away.startsWith('TBD') || home.startsWith('TBD')) {
    // Try to find by the known team
    const knownTeam = away.startsWith('TBD') ? home : away;
    const candidates = dbByTeam.get(knownTeam) || [];
    const d = String(date).substring(0,10);
    if (candidates.length > 0) {
      const r = candidates[0];
      tbd_info = `DB id=${r.id} [${String(r.gameDate).substring(0,10)}] ${r.awayTeam}@${r.homeTeam} odds=${r.awayBookSpread !== null ? '✅' : '❌'} pub=${r.publishedToFeed}`;
      results.tbd.push({ label, home, away, date: d, notes, dbInfo: tbd_info });
    } else {
      results.tbd.push({ label, home, away, date: d, notes, dbInfo: 'NOT IN DB YET (awaiting FF result)' });
    }
    continue;
  }

  const r = dbLookup.get(`${away}@${home}`) || dbLookup.get(`${home}@${away}`);
  const d = String(date).substring(0,10);
  
  if (!r) {
    results.missing.push({ label, home, away, date: d, notes });
  } else {
    const hasOdds = r.awayBookSpread !== null;
    const hasSplits = r.spreadAwayBetsPct !== null;
    const pub = r.publishedToFeed;
    const entry = { label, home, away, id: r.id, date: String(r.gameDate).substring(0,10), hasOdds, hasSplits, pub, notes };
    
    if (hasOdds && hasSplits) results.found_complete.push(entry);
    else if (!hasOdds) results.found_no_odds.push(entry);
    else results.found_no_splits.push(entry);
  }
}

console.log(`✅ COMPLETE (odds + splits): ${results.found_complete.length}`);
for (const g of results.found_complete) {
  console.log(`  ${g.label}: ${g.home} vs ${g.away} | id=${g.id} | ${g.date} | pub=${g.pub ? '✅' : '❌'}`);
}

console.log(`\n⚠️  IN DB BUT NO ODDS: ${results.found_no_odds.length}`);
for (const g of results.found_no_odds) {
  console.log(`  ${g.label}: ${g.home} vs ${g.away} | id=${g.id} | ${g.date} | pub=${g.pub ? '✅' : '❌'} | ${g.notes}`);
}

console.log(`\n⚠️  IN DB BUT NO SPLITS: ${results.found_no_splits.length}`);
for (const g of results.found_no_splits) {
  console.log(`  ${g.label}: ${g.home} vs ${g.away} | id=${g.id} | ${g.date} | pub=${g.pub ? '✅' : '❌'}`);
}

console.log(`\n❌ MISSING FROM DB: ${results.missing.length}`);
for (const g of results.missing) {
  console.log(`  ${g.label}: ${g.home} vs ${g.away} | ${g.date} | ${g.notes}`);
}

console.log(`\n🔄 TBD (FF-dependent): ${results.tbd.length}`);
for (const g of results.tbd) {
  console.log(`  ${g.label}: ${g.home} vs ${g.away} | ${g.date} | ${g.notes}`);
  console.log(`    → ${g.dbInfo}`);
}

// Show non-bracket games in DB
const bracketPairs = new Set();
for (const [,home,away] of ALL_GAMES) {
  if (!home.startsWith('TBD') && !away.startsWith('TBD')) {
    bracketPairs.add(`${away}@${home}`);
    bracketPairs.add(`${home}@${away}`);
  }
}
const nonBracket = rows.filter(r => !bracketPairs.has(`${r.awayTeam}@${r.homeTeam}`));
console.log(`\n🚫 NON-BRACKET GAMES IN DB (Mar 17-21): ${nonBracket.length}`);
for (const r of nonBracket) {
  const d = String(r.gameDate).substring(0,10);
  console.log(`  id=${r.id} [${d}] ${r.awayTeam}@${r.homeTeam} | pub=${r.publishedToFeed} | odds=${r.awayBookSpread !== null ? 'YES' : 'NO'}`);
}

console.log('\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
const totalBracket = results.found_complete.length + results.found_no_odds.length + results.found_no_splits.length + results.missing.length + results.tbd.length;
console.log(`Total bracket games: ${totalBracket}/36`);
console.log(`  ✅ Complete (odds+splits): ${results.found_complete.length}`);
console.log(`  ⚠️  In DB, no odds: ${results.found_no_odds.length}`);
console.log(`  ⚠️  In DB, no splits: ${results.found_no_splits.length}`);
console.log(`  ❌ Missing from DB: ${results.missing.length}`);
console.log(`  🔄 TBD (FF-dependent): ${results.tbd.length}`);
console.log(`  🚫 Non-bracket in DB: ${nonBracket.length}`);

await conn.end();
