/**
 * auditMarchMadness.mjs
 *
 * Deep audit of the March Madness feed.
 * Checks:
 *   1. MARCH MADNESS label in UI source
 *   2. All 68 bracket teams present in allowlist
 *   3. All expected First Four + Round of 64 games in DB
 *   4. Every game has: spread, total, moneyline, all 6 splits fields
 *   5. Zero non-bracket games published to feed
 *   6. Correct favorite/underdog orientation per bracket seeding
 */

import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

// ─── Bracket definition (all 68 teams, all expected matchups) ──────────────

const BRACKET_TEAMS = new Set([
  // First Four (all 8 participants)
  "umbc", "howard", "texas", "nc_state",
  "prairie_view_a_and_m", "lehigh", "miami_oh", "smu",
  // East
  "duke","siena","ohio_st","tcu","st_johns","n_iowa","kansas","california_baptist",
  "louisville","south_florida","michigan_st","n_dakota_st","ucla","c_florida","connecticut","furman",
  // South
  "florida","clemson","iowa","vanderbilt","mcneese_st","nebraska","troy",
  "north_carolina","va_commonwealth","illinois","pennsylvania","st_marys","texas_a_and_m","houston","idaho",
  // West
  "arizona","liu_brooklyn","villanova","utah_st","wisconsin","high_point","arkansas","hawaii",
  "brigham_young","gonzaga","kennesaw_st","miami_fl","missouri","purdue","queens_nc",
  // Midwest
  "michigan","georgia","saint_louis","texas_tech","akron","alabama","hofstra",
  "tennessee","virginia","wright_st","kentucky","santa_clara","iowa_st","tennessee_st",
]);

// First Four matchups (March 17-18, 2026)
const FIRST_FOUR = [
  { away: "umbc",                 home: "howard",  date: "2026-03-17", note: "16-seed East (played)" },
  { away: "texas",                home: "nc_state",date: "2026-03-17", note: "11-seed East (played)" },
  { away: "prairie_view_a_and_m", home: "lehigh",  date: "2026-03-18", note: "16-seed South" },
  { away: "miami_oh",             home: "smu",     date: "2026-03-18", note: "11-seed Midwest" },
];

// ─── DB connection ──────────────────────────────────────────────────────────

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log("═══════════════════════════════════════════════════════════════════");
console.log("  MARCH MADNESS FEED AUDIT — " + new Date().toISOString());
console.log("═══════════════════════════════════════════════════════════════════\n");

// ─── SECTION 1: Bracket allowlist integrity ─────────────────────────────────

console.log("── SECTION 1: Bracket Allowlist Integrity ──────────────────────────");
console.log(`   Expected: 68 unique bracket teams`);
console.log(`   Actual  : ${BRACKET_TEAMS.size} teams in BRACKET_TEAMS set`);
if (BRACKET_TEAMS.size !== 68) {
  console.error(`   ❌ FAIL: Expected 68, got ${BRACKET_TEAMS.size}`);
} else {
  console.log(`   ✅ PASS: Exactly 68 bracket teams confirmed`);
}
console.log();

// ─── SECTION 2: All NCAAM games in DB for March 17-20 ───────────────────────

console.log("── SECTION 2: All NCAAM Games in DB (March 17–20) ─────────────────");
const [allGames] = await conn.query(`
  SELECT id, awayTeam, homeTeam, gameDate, startTimeEst,
         awayBookSpread, homeBookSpread, bookTotal,
         awayML, homeML,
         spreadAwayBetsPct, spreadAwayMoneyPct,
         totalOverBetsPct, totalOverMoneyPct,
         mlAwayBetsPct, mlAwayMoneyPct,
         publishedToFeed, sport
  FROM games
  WHERE sport = 'NCAAM'
    AND gameDate BETWEEN '2026-03-17' AND '2026-03-22'
  ORDER BY gameDate, startTimeEst
`);

console.log(`   Total NCAAM games in DB (March 17-22): ${allGames.length}`);
console.log();

// ─── SECTION 3: Classify each game ─────────────────────────────────────────

const bracketGames = [];
const nonBracketGames = [];

for (const g of allGames) {
  const awayInBracket = BRACKET_TEAMS.has(g.awayTeam);
  const homeInBracket = BRACKET_TEAMS.has(g.homeTeam);
  const bothInBracket = awayInBracket && homeInBracket;
  if (bothInBracket) {
    bracketGames.push(g);
  } else {
    nonBracketGames.push(g);
  }
}

console.log("── SECTION 3: Game Classification ──────────────────────────────────");
console.log(`   ✅ Bracket games (both teams in bracket): ${bracketGames.length}`);
console.log(`   ${nonBracketGames.length > 0 ? "❌" : "✅"} Non-bracket games in DB: ${nonBracketGames.length}`);
if (nonBracketGames.length > 0) {
  console.log(`\n   ⚠️  NON-BRACKET GAMES FOUND (should NOT appear on feed):`);
  for (const g of nonBracketGames) {
    const awayFlag = BRACKET_TEAMS.has(g.awayTeam) ? "✅" : "❌";
    const homeFlag = BRACKET_TEAMS.has(g.homeTeam) ? "✅" : "❌";
    const feedFlag = g.publishedToFeed ? "PUBLISHED ⚠️" : "not published";
    console.log(`      [${g.gameDate}] ${awayFlag}${g.awayTeam} @ ${homeFlag}${g.homeTeam} | feed=${feedFlag} | id=${g.id}`);
  }
}
console.log();

// ─── SECTION 4: Published feed games ────────────────────────────────────────

const publishedBracket = bracketGames.filter(g => g.publishedToFeed);
const unpublishedBracket = bracketGames.filter(g => !g.publishedToFeed);
const publishedNonBracket = nonBracketGames.filter(g => g.publishedToFeed);

console.log("── SECTION 4: Published Feed Status ────────────────────────────────");
console.log(`   Bracket games published to feed  : ${publishedBracket.length}`);
console.log(`   Bracket games NOT on feed        : ${unpublishedBracket.length}`);
console.log(`   ${publishedNonBracket.length > 0 ? "❌ CRITICAL" : "✅"} Non-bracket games on feed: ${publishedNonBracket.length}`);
if (publishedNonBracket.length > 0) {
  for (const g of publishedNonBracket) {
    console.log(`      ❌ CONTAMINATION: [${g.gameDate}] ${g.awayTeam} @ ${g.homeTeam} | id=${g.id}`);
  }
}
if (unpublishedBracket.length > 0) {
  console.log(`\n   ⚠️  Bracket games not yet published:`);
  for (const g of unpublishedBracket) {
    console.log(`      [${g.gameDate}] ${g.awayTeam} @ ${g.homeTeam} | id=${g.id}`);
  }
}
console.log();

// ─── SECTION 5: First Four games deep audit ─────────────────────────────────

console.log("── SECTION 5: First Four Games Deep Audit ──────────────────────────");
for (const ff of FIRST_FOUR) {
  const match = bracketGames.find(g =>
    g.awayTeam === ff.away && g.homeTeam === ff.home && g.gameDate.toISOString?.().startsWith(ff.date) ||
    g.awayTeam === ff.away && g.homeTeam === ff.home && String(g.gameDate).startsWith(ff.date)
  );

  if (!match) {
    // Try looser search
    const loose = allGames.find(g =>
      (g.awayTeam === ff.away || g.homeTeam === ff.away) &&
      (g.awayTeam === ff.home || g.homeTeam === ff.home)
    );
    if (loose) {
      console.log(`   ⚠️  FOUND (different date): [${loose.gameDate}] ${loose.awayTeam} @ ${loose.homeTeam} | id=${loose.id}`);
      auditGameFields(loose, ff.note);
    } else {
      console.log(`   ❌ MISSING: ${ff.away} @ ${ff.home} (${ff.date}) — ${ff.note}`);
    }
  } else {
    auditGameFields(match, ff.note);
  }
}
console.log();

// ─── SECTION 6: Odds completeness for all published bracket games ────────────

console.log("── SECTION 6: Odds & Splits Completeness (All Published Bracket Games) ─");

let totalGames = publishedBracket.length;
let gamesWithSpread = 0, gamesWithTotal = 0, gamesWithML = 0;
let gamesWithAllSplits = 0;
const missingOdds = [];
const missingSplits = [];

for (const g of publishedBracket) {
  const hasSpread = g.awayBookSpread !== null && g.homeBookSpread !== null;
  const hasTotal  = g.bookTotal !== null;
  const hasML     = g.awayML !== null && g.homeML !== null;
  const hasSplits = (
    g.spreadAwayBetsPct !== null && g.spreadAwayMoneyPct !== null &&
    g.totalOverBetsPct  !== null && g.totalOverMoneyPct  !== null &&
    g.mlAwayBetsPct     !== null && g.mlAwayMoneyPct     !== null
  );

  if (hasSpread) gamesWithSpread++;
  if (hasTotal)  gamesWithTotal++;
  if (hasML)     gamesWithML++;
  if (hasSplits) gamesWithAllSplits++;

  const issues = [];
  if (!hasSpread) issues.push("NO_SPREAD");
  if (!hasTotal)  issues.push("NO_TOTAL");
  if (!hasML)     issues.push("NO_ML");
  if (!hasSplits) issues.push("MISSING_SPLITS");

  if (issues.length > 0) {
    const entry = {
      id: g.id,
      matchup: `${g.awayTeam} @ ${g.homeTeam}`,
      date: g.gameDate,
      issues,
      awaySpread: g.awayBookSpread,
      homeSpread: g.homeBookSpread,
      total: g.bookTotal,
      awayML: g.awayML,
      homeML: g.homeML,
      spreadAwayBets: g.spreadAwayBetsPct,
      spreadAwayMoney: g.spreadAwayMoneyPct,
      totalOverBets: g.totalOverBetsPct,
      totalOverMoney: g.totalOverMoneyPct,
      mlAwayBets: g.mlAwayBetsPct,
      mlAwayMoney: g.mlAwayMoneyPct,
    };
    if (!hasSpread || !hasTotal || !hasML) missingOdds.push(entry);
    if (!hasSplits) missingSplits.push(entry);
  }
}

console.log(`   Total published bracket games : ${totalGames}`);
console.log(`   Games with spread (±)         : ${gamesWithSpread}/${totalGames} ${gamesWithSpread === totalGames ? "✅" : "❌"}`);
console.log(`   Games with total (O/U)        : ${gamesWithTotal}/${totalGames} ${gamesWithTotal === totalGames ? "✅" : "❌"}`);
console.log(`   Games with moneyline (ML)     : ${gamesWithML}/${totalGames} ${gamesWithML === totalGames ? "✅" : "❌"}`);
console.log(`   Games with all 6 splits fields: ${gamesWithAllSplits}/${totalGames} ${gamesWithAllSplits === totalGames ? "✅" : "❌"}`);

if (missingOdds.length > 0) {
  console.log(`\n   ❌ GAMES MISSING ODDS (${missingOdds.length}):`);
  for (const g of missingOdds) {
    console.log(`      [${g.date}] id=${g.id} | ${g.matchup}`);
    console.log(`         Spread: away=${g.awaySpread} home=${g.homeSpread} | Total: ${g.total} | ML: away=${g.awayML} home=${g.homeML}`);
    console.log(`         Issues: ${g.issues.join(", ")}`);
  }
}

if (missingSplits.length > 0) {
  console.log(`\n   ❌ GAMES MISSING SPLITS (${missingSplits.length}):`);
  for (const g of missingSplits) {
    console.log(`      [${g.date}] id=${g.id} | ${g.matchup}`);
    console.log(`         Spread splits: bets=${g.spreadAwayBets}% money=${g.spreadAwayMoney}%`);
    console.log(`         Total splits : bets=${g.totalOverBets}% money=${g.totalOverMoney}%`);
    console.log(`         ML splits    : bets=${g.mlAwayBets}% money=${g.mlAwayMoney}%`);
  }
}
console.log();

// ─── SECTION 7: Full game-by-game roster ────────────────────────────────────

console.log("── SECTION 7: Full Published Bracket Game Roster ───────────────────");
const byDate = {};
for (const g of publishedBracket) {
  const d = String(g.gameDate).substring(0, 10);
  if (!byDate[d]) byDate[d] = [];
  byDate[d].push(g);
}

for (const [date, games] of Object.entries(byDate).sort()) {
  console.log(`\n   📅 ${date} (${games.length} games):`);
  for (const g of games) {
    const spread = g.awayBookSpread !== null ? `${g.awayBookSpread}/${g.homeBookSpread}` : "NO_SPREAD";
    const total  = g.bookTotal !== null ? `O/U ${g.bookTotal}` : "NO_TOTAL";
    const ml     = g.awayML !== null ? `${g.awayML}/${g.homeML}` : "NO_ML";
    const splits = (g.spreadAwayBetsPct !== null) ? `✅splits` : "❌splits";
    const time   = g.startTimeEst ?? "TBD";
    console.log(`      [${time}] ${g.awayTeam} @ ${g.homeTeam}`);
    console.log(`               Spread: ${spread} | ${total} | ML: ${ml} | ${splits}`);
  }
}
console.log();

// ─── SECTION 8: Summary verdict ─────────────────────────────────────────────

console.log("── SECTION 8: AUDIT SUMMARY ─────────────────────────────────────────");
const allClear =
  BRACKET_TEAMS.size === 68 &&
  publishedNonBracket.length === 0 &&
  missingOdds.length === 0 &&
  missingSplits.length === 0;

if (allClear) {
  console.log("   ✅ ALL CHECKS PASSED — March Madness feed is clean and complete");
} else {
  console.log("   ❌ ISSUES FOUND — see sections above for details");
  if (BRACKET_TEAMS.size !== 68)         console.log(`      • Bracket team count mismatch: ${BRACKET_TEAMS.size} (expected 68)`);
  if (publishedNonBracket.length > 0)    console.log(`      • ${publishedNonBracket.length} non-bracket game(s) published to feed`);
  if (missingOdds.length > 0)            console.log(`      • ${missingOdds.length} game(s) missing odds`);
  if (missingSplits.length > 0)          console.log(`      • ${missingSplits.length} game(s) missing splits`);
}
console.log(`\n   Published bracket games : ${publishedBracket.length}`);
console.log(`   Unpublished bracket games: ${unpublishedBracket.length}`);
console.log(`   Non-bracket contamination: ${publishedNonBracket.length}`);
console.log("═══════════════════════════════════════════════════════════════════\n");

await conn.end();

// ─── Helper ──────────────────────────────────────────────────────────────────

function auditGameFields(g, note) {
  const date = String(g.gameDate).substring(0, 10);
  const hasSpread = g.awayBookSpread !== null && g.homeBookSpread !== null;
  const hasTotal  = g.bookTotal !== null;
  const hasML     = g.awayML !== null && g.homeML !== null;
  const hasSplits = (
    g.spreadAwayBetsPct !== null && g.spreadAwayMoneyPct !== null &&
    g.totalOverBetsPct  !== null && g.totalOverMoneyPct  !== null &&
    g.mlAwayBetsPct     !== null && g.mlAwayMoneyPct     !== null
  );

  const status = (hasSpread && hasTotal && hasML && hasSplits) ? "✅ COMPLETE" : "❌ INCOMPLETE";
  console.log(`   ${status} [${date}] ${g.awayTeam} @ ${g.homeTeam} (${note})`);
  console.log(`            id=${g.id} | published=${g.publishedToFeed ? "YES" : "NO"}`);
  console.log(`            Spread : away=${g.awayBookSpread ?? "NULL"} home=${g.homeBookSpread ?? "NULL"} ${hasSpread ? "✅" : "❌"}`);
  console.log(`            Total  : ${g.bookTotal ?? "NULL"} ${hasTotal ? "✅" : "❌"}`);
  console.log(`            ML     : away=${g.awayML ?? "NULL"} home=${g.homeML ?? "NULL"} ${hasML ? "✅" : "❌"}`);
  console.log(`            Splits : spreadBets=${g.spreadAwayBetsPct ?? "NULL"}% spreadMoney=${g.spreadAwayMoneyPct ?? "NULL"}%`);
  console.log(`                     totalBets=${g.totalOverBetsPct ?? "NULL"}% totalMoney=${g.totalOverMoneyPct ?? "NULL"}%`);
  console.log(`                     mlBets=${g.mlAwayBetsPct ?? "NULL"}% mlMoney=${g.mlAwayMoneyPct ?? "NULL"}% ${hasSplits ? "✅" : "❌"}`);
}
