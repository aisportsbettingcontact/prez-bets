/**
 * DEEP DEBUG: Prairie View A&M vs Bethune-Cookman odds mapping bug
 * 
 * VSiN HTML says:   Prairie View A&M (row 1 = AWAY) vs Bethune-Cookman (row 2 = HOME)
 * NCAA HTML says:   Bethune-Cookman (team 1 = AWAY) vs Prairie View (team 2 = HOME)
 * 
 * This script traces the FULL pipeline with maximum granularity:
 *   1. What VSiN HTML contains (raw)
 *   2. What the scraper extracts (awaySlug, homeSlug, spreads)
 *   3. What the DB stores
 *   4. What the frontend receives
 *   5. Where the inversion causes wrong odds display
 */

import mysql from 'mysql2/promise';
import { config } from 'dotenv';
config();

const DB_URL = process.env.DATABASE_URL;

async function getDb() {
  const url = new URL(DB_URL);
  return mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port || '3306'),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
  });
}

// ─── STEP 1: Parse VSiN HTML ──────────────────────────────────────────────────
function analyzeVsinHtml() {
  console.log('\n' + '═'.repeat(80));
  console.log('STEP 1: VSiN HTML ANALYSIS');
  console.log('═'.repeat(80));

  // From pasted_content_4.txt
  const vsinHtml = `<tr class=""><td class="div_sep text-left fw-bold font-12"><span class=""><a href="" data-bs-toggle="modal" data-bs-target="#VSiNModal" data-param1="dksplitsgame" data-param2="20260311CBB00371"><img src="/img/teams/cbb/854.png" height="20px" width="15px"></a></span>&nbsp;<a class="txt-color-vsinred" href="/college-basketball/teams/prairie-view-a-and-m">Prairie View A&amp;M</a><hr><span class=""><a href="" data-bs-toggle="modal" data-bs-target="#VSiNModal" data-param1="propicks" data-param2="20260311CBB00371"><img src="/img/teams/cbb/371.png" height="20px" width="15px"></a></span>&nbsp;<a class="txt-color-vsinred" href="/college-basketball/teams/bethune-cookman">Bethune-Cookman       </a>`;

  // Extract team hrefs (what the scraper uses)
  const teamHrefPattern = /href="\/college-basketball\/teams\/([^"]+)"/g;
  const teamNamePattern = /href="\/college-basketball\/teams\/[^"]+">([^<]+)<\/a>/g;
  
  const hrefs = [];
  const names = [];
  let m;
  
  while ((m = teamHrefPattern.exec(vsinHtml)) !== null) {
    hrefs.push(m[1].trim());
  }
  while ((m = teamNamePattern.exec(vsinHtml)) !== null) {
    names.push(m[1].trim());
  }

  console.log('\n[VSiN HTML] Raw team order (as they appear in the HTML):');
  console.log(`  Row 1 (FIRST  in HTML): href="${hrefs[0]}" → name="${names[0]}"`);
  console.log(`  Row 2 (SECOND in HTML): href="${hrefs[1]}" → name="${names[1]}"`);
  
  console.log('\n[VSiN HTML] VSiN convention: FIRST team = AWAY, SECOND team = HOME');
  console.log(`  → VSiN AWAY team: "${hrefs[0]}" (${names[0]})`);
  console.log(`  → VSiN HOME team: "${hrefs[1]}" (${names[1]})`);

  // Extract game ID
  const gameIdMatch = vsinHtml.match(/data-param2="(\d{8}CBB\d+)"/);
  const gameId = gameIdMatch ? gameIdMatch[1] : 'UNKNOWN';
  console.log(`\n[VSiN HTML] Game ID: ${gameId}`);
  console.log(`  Date prefix: ${gameId.slice(0, 8)}`);

  // Extract spreads
  const spreadPattern = /href="https:\/\/sportsbook\.draftkings[^"]*">([+-]?\d+\.?\d*)<\/a>/g;
  const spreads = [];
  const vsinFull = `<td class="text-left fw-bold div_sep"><div class="scorebox_highlight text-center game_highlight_dark"><a class="txt-color-vsinred" href="https://sportsbook.draftkings.com/featured?outcomes=0HC83809834P550_3&amp;wpcid=191495&amp;wpcn=BettingSplits&amp;wpsn=VSIN&amp;wpcrid=SelectPick" title="Bet Now at DraftKings" target="_blank" rel="nofollow">+5.5</a></div><hr><div class="scorebox_highlight text-center game_highlight_dark"><a class="txt-color-vsinred" href="https://sportsbook.draftkings.com/featured?outcomes=0HC83809834N550_1&amp;wpcid=191495&amp;wpcn=BettingSplits&amp;wpsn=VSIN&amp;wpcrid=SelectPick" title="Bet Now at DraftKings" target="_blank" rel="nofollow">-5.5</a></div></td>`;
  
  while ((m = spreadPattern.exec(vsinFull)) !== null) {
    spreads.push(m[1]);
  }
  
  console.log('\n[VSiN HTML] Spread column (td[1]) — first anchor = away spread, second = home spread:');
  console.log(`  Spread anchor 1 (AWAY spread): "${spreads[0]}"`);
  console.log(`  Spread anchor 2 (HOME spread): "${spreads[1]}"`);
  
  // Extract total
  const totalFull = `<td class="text-left fw-bold div_sep"><div class="scorebox_highlight text-center game_highlight_dark"><a class="txt-color-vsinred" href="https://sportsbook.draftkings.com/featured?outcomes=0OU83809834O15150_1&amp;wpcid=191495&amp;wpcn=BettingSplits&amp;wpsn=VSIN&amp;wpcrid=SelectPick" title="Bet Now at DraftKings" target="_blank" rel="nofollow">151.5</a></div><hr><div class="scorebox_highlight text-center game_highlight_dark"><a class="txt-color-vsinred" href="https://sportsbook.draftkings.com/featured?outcomes=0OU83809834U15150_3&amp;wpcid=191495&amp;wpcn=BettingSplits&amp;wpsn=VSIN&amp;wpcrid=SelectPick" title="Bet Now at DraftKings" target="_blank" rel="nofollow">151.5</a></div></td>`;
  const totalPattern = /href="https:\/\/sportsbook\.draftkings[^"]*">(\d+\.?\d*)<\/a>/g;
  const totals = [];
  while ((m = totalPattern.exec(totalFull)) !== null) {
    totals.push(m[1]);
  }
  console.log('\n[VSiN HTML] Total column (td[4]):');
  console.log(`  Total: ${totals[0]}`);

  // Extract ML
  const mlFull = `<td class="text-left fw-bold div_sep"><div class="scorebox_highlight text-center game_highlight_dark"><a class="txt-color-vsinred" href="https://sportsbook.draftkings.com/featured?outcomes=0ML83809834_3&amp;wpcid=191495&amp;wpcn=BettingSplits&amp;wpsn=VSIN&amp;wpcrid=SelectPick" title="Bet Now at DraftKings" target="_blank" rel="nofollow">+190</a></div><hr><div class="scorebox_highlight text-center game_highlight_dark"><a class="txt-color-vsinred" href="https://sportsbook.draftkings.com/featured?outcomes=0ML83809834_1&amp;wpcid=191495&amp;wpcn=BettingSplits&amp;wpsn=VSIN&amp;wpcrid=SelectPick" title="Bet Now at DraftKings" target="_blank" rel="nofollow">-230</a></div></td>`;
  const mlPattern = /href="https:\/\/sportsbook\.draftkings[^"]*">([+-]\d+)<\/a>/g;
  const mls = [];
  while ((m = mlPattern.exec(mlFull)) !== null) {
    mls.push(m[1]);
  }
  console.log('\n[VSiN HTML] ML column (td[7]):');
  console.log(`  ML anchor 1 (AWAY ML): "${mls[0]}"`);
  console.log(`  ML anchor 2 (HOME ML): "${mls[1]}"`);

  // Extract splits
  console.log('\n[VSiN HTML] Splits columns:');
  console.log('  td[2] Spread Bets%:  AWAY=36%, HOME=64%');
  console.log('  td[3] Spread Money%: AWAY=30%, HOME=70%');
  console.log('  td[5] Total Bets%:   OVER=50%, UNDER=50%');
  console.log('  td[6] Total Money%:  OVER=45%, UNDER=55%');
  console.log('  td[8] ML Bets%:      AWAY=27%, HOME=73%');
  console.log('  td[9] ML Money%:     AWAY=7%,  HOME=93%');

  return {
    vsinAwayHref: hrefs[0],  // 'prairie-view-a-and-m'
    vsinHomeHref: hrefs[1],  // 'bethune-cookman'
    vsinAwayName: names[0],  // 'Prairie View A&M'
    vsinHomeName: names[1],  // 'Bethune-Cookman'
    awaySpread: spreads[0],  // '+5.5'
    homeSpread: spreads[1],  // '-5.5'
    total: totals[0],        // '151.5'
    awayML: mls[0],          // '+190'
    homeML: mls[1],          // '-230'
    spreadAwayBetsPct: 36,
    spreadAwayMoneyPct: 30,
    totalOverBetsPct: 50,
    totalOverMoneyPct: 45,
    mlAwayBetsPct: 27,
    mlAwayMoneyPct: 7,
  };
}

// ─── STEP 2: NCAA HTML Analysis ───────────────────────────────────────────────
function analyzeNcaaHtml() {
  console.log('\n' + '═'.repeat(80));
  console.log('STEP 2: NCAA HTML ANALYSIS');
  console.log('═'.repeat(80));

  console.log('\n[NCAA HTML] Raw team order (from gamePod HTML):');
  console.log('  Team 1 (FIRST  in HTML): Bethune-Cookman  (img: bethune-cookman.svg)');
  console.log('  Team 2 (SECOND in HTML): Prairie View     (img: prairie-view.svg)');
  console.log('\n[NCAA HTML] NCAA convention: FIRST team = AWAY, SECOND team = HOME');
  console.log('  → NCAA AWAY team: Bethune-Cookman');
  console.log('  → NCAA HOME team: Prairie View');
  console.log('\n[NCAA HTML] Game ID: 6592763');
  console.log('  Game time: 11:00 AM PDT = 14:00 ET = 14:00');

  // NCAA GraphQL API also confirms this
  console.log('\n[NCAA API] GraphQL response for contestId=6592763:');
  console.log('  teams[isHome=false] = bethune-cookman → dbSlug: bethune_cookman');
  console.log('  teams[isHome=true]  = prairie-view    → dbSlug: prairie_view_a_and_m');
  console.log('  → NCAA API AWAY: bethune_cookman');
  console.log('  → NCAA API HOME: prairie_view_a_and_m');
}

// ─── STEP 3: Slug conversion ──────────────────────────────────────────────────
function analyzeSlugConversion(vsinData) {
  console.log('\n' + '═'.repeat(80));
  console.log('STEP 3: SLUG CONVERSION (hrefToDbSlug)');
  console.log('═'.repeat(80));

  // Simulate hrefToDbSlug
  // VSiN href: /college-basketball/teams/prairie-view-a-and-m
  // → raw slug: prairie-view-a-and-m
  // → BY_VSIN_SLUG lookup: prairie-view-a-and-m → dbSlug: prairie_view_a_and_m
  
  // VSiN href: /college-basketball/teams/bethune-cookman
  // → raw slug: bethune-cookman
  // → BY_VSIN_SLUG lookup: bethune-cookman → dbSlug: bethune_cookman

  console.log('\n[hrefToDbSlug] Processing VSiN team hrefs:');
  console.log(`\n  Input href: "${vsinData.vsinAwayHref}"`);
  console.log(`  → raw slug: "prairie-view-a-and-m"`);
  console.log(`  → BY_VSIN_SLUG.get("prairie-view-a-and-m") → { dbSlug: "prairie_view_a_and_m" }`);
  console.log(`  → RESULT awaySlug = "prairie_view_a_and_m"`);
  
  console.log(`\n  Input href: "${vsinData.vsinHomeHref}"`);
  console.log(`  → raw slug: "bethune-cookman"`);
  console.log(`  → BY_VSIN_SLUG.get("bethune-cookman") → { dbSlug: "bethune_cookman" }`);
  console.log(`  → RESULT homeSlug = "bethune_cookman"`);

  console.log('\n[ScrapedOdds object] What the scraper returns:');
  console.log('  {');
  console.log(`    awayTeam:  "Prairie View A&M"       ← VSiN row 1 name`);
  console.log(`    homeTeam:  "Bethune-Cookman"         ← VSiN row 2 name`);
  console.log(`    awaySlug:  "prairie_view_a_and_m"   ← derived from VSiN row 1 href`);
  console.log(`    homeSlug:  "bethune_cookman"         ← derived from VSiN row 2 href`);
  console.log(`    awaySpread: ${vsinData.awaySpread}                    ← td[1] anchor 1`);
  console.log(`    homeSpread: ${vsinData.homeSpread}                   ← td[1] anchor 2`);
  console.log(`    total:      ${vsinData.total}                 ← td[4] anchor 1`);
  console.log(`    awayML:     "${vsinData.awayML}"                  ← td[7] anchor 1`);
  console.log(`    homeML:     "${vsinData.homeML}"                 ← td[7] anchor 2`);
  console.log(`    spreadAwayBetsPct:  ${vsinData.spreadAwayBetsPct}  ← td[2] first div (away = Prairie View)`);
  console.log(`    spreadAwayMoneyPct: ${vsinData.spreadAwayMoneyPct}  ← td[3] first div (away = Prairie View)`);
  console.log(`    mlAwayBetsPct:      ${vsinData.mlAwayBetsPct}  ← td[8] first div (away = Prairie View)`);
  console.log(`    mlAwayMoneyPct:     ${vsinData.mlAwayMoneyPct}   ← td[9] first div (away = Prairie View)`);
  console.log('  }');

  return {
    scrapedAwaySlug: 'prairie_view_a_and_m',
    scrapedHomeSlug: 'bethune_cookman',
  };
}

// ─── STEP 4: DB Lookup (vsinAutoRefresh.ts logic) ─────────────────────────────
async function analyzeDbLookup(db, scrapedData) {
  console.log('\n' + '═'.repeat(80));
  console.log('STEP 4: DB LOOKUP (vsinAutoRefresh.ts — refreshNcaam)');
  console.log('═'.repeat(80));

  // Get the actual DB row
  const [rows] = await db.execute(
    `SELECT id, awayTeam, homeTeam, awayBookSpread, homeBookSpread, bookTotal,
            awayML, homeML, spreadAwayBetsPct, spreadAwayMoneyPct,
            totalOverBetsPct, totalOverMoneyPct, mlAwayBetsPct, mlAwayMoneyPct,
            gameStatus, startTimeEst, ncaaContestId
     FROM games 
     WHERE gameDate = '2026-03-11' AND sport = 'NCAAM'
       AND ((awayTeam = 'bethune_cookman' AND homeTeam = 'prairie_view_a_and_m')
         OR (awayTeam = 'prairie_view_a_and_m' AND homeTeam = 'bethune_cookman'))`
  );

  console.log(`\n[DB Query] Looking for bethune_cookman vs prairie_view_a_and_m (either order):`);
  
  if (rows.length === 0) {
    console.log('  ❌ NO ROWS FOUND — game not in DB!');
    return null;
  }

  const row = rows[0];
  console.log(`\n[DB Row] Found game id=${row.id}:`);
  console.log(`  awayTeam:           "${row.awayTeam}"`);
  console.log(`  homeTeam:           "${row.homeTeam}"`);
  console.log(`  awayBookSpread:     ${row.awayBookSpread}`);
  console.log(`  homeBookSpread:     ${row.homeBookSpread}`);
  console.log(`  bookTotal:          ${row.bookTotal}`);
  console.log(`  awayML:             ${row.awayML}`);
  console.log(`  homeML:             ${row.homeML}`);
  console.log(`  spreadAwayBetsPct:  ${row.spreadAwayBetsPct}%`);
  console.log(`  spreadAwayMoneyPct: ${row.spreadAwayMoneyPct}%`);
  console.log(`  mlAwayBetsPct:      ${row.mlAwayBetsPct}%`);
  console.log(`  mlAwayMoneyPct:     ${row.mlAwayMoneyPct}%`);
  console.log(`  ncaaContestId:      ${row.ncaaContestId}`);
  console.log(`  startTimeEst:       ${row.startTimeEst}`);

  return row;
}

// ─── STEP 5: The Matching Logic in vsinAutoRefresh.ts ─────────────────────────
function analyzeMatchingLogic(dbRow, scrapedData) {
  console.log('\n' + '═'.repeat(80));
  console.log('STEP 5: MATCHING LOGIC TRACE (vsinAutoRefresh.ts refreshNcaam)');
  console.log('═'.repeat(80));

  if (!dbRow) {
    console.log('  Cannot analyze — no DB row found');
    return;
  }

  const dbAwaySlug = dbRow.awayTeam;
  const dbHomeSlug = dbRow.homeTeam;
  const scrapedAwaySlug = scrapedData.scrapedAwaySlug;  // prairie_view_a_and_m
  const scrapedHomeSlug = scrapedData.scrapedHomeSlug;  // bethune_cookman

  console.log('\n[Match Attempt] vsinAutoRefresh.ts looks for existing game:');
  console.log(`  existing.find(e => e.awayTeam === scraped.awaySlug && e.homeTeam === scraped.homeSlug)`);
  console.log(`  = existing.find(e => e.awayTeam === "${scrapedAwaySlug}" && e.homeTeam === "${scrapedHomeSlug}")`);
  
  const canonicalMatch = dbAwaySlug === scrapedAwaySlug && dbHomeSlug === scrapedHomeSlug;
  console.log(`\n  DB row: awayTeam="${dbAwaySlug}", homeTeam="${dbHomeSlug}"`);
  console.log(`  Scraped: awaySlug="${scrapedAwaySlug}", homeSlug="${scrapedHomeSlug}"`);
  console.log(`  Canonical match: ${canonicalMatch ? '✅ YES' : '❌ NO'}`);

  if (!canonicalMatch) {
    // Check if DB has it reversed
    const reversedMatch = dbAwaySlug === scrapedHomeSlug && dbHomeSlug === scrapedAwaySlug;
    console.log(`\n  Checking reversed: DB away="${dbAwaySlug}" === scraped home="${scrapedHomeSlug}" AND DB home="${dbHomeSlug}" === scraped away="${scrapedAwaySlug}"`);
    console.log(`  Reversed match: ${reversedMatch ? '✅ YES' : '❌ NO'}`);
    
    if (reversedMatch) {
      console.log('\n  ⚠️  REVERSED MATCH FOUND!');
      console.log(`  DB stores: ${dbAwaySlug} @ ${dbHomeSlug}`);
      console.log(`  VSiN has:  ${scrapedAwaySlug} @ ${scrapedHomeSlug}`);
      console.log('\n  THE BUG: When a reversed match is found, the code calls updateBookOdds()');
      console.log('  with the scraped odds WITHOUT swapping them to match the DB team order!');
    }
  }
}

// ─── STEP 6: The Root Cause ────────────────────────────────────────────────────
function explainRootCause(dbRow, scrapedData) {
  console.log('\n' + '═'.repeat(80));
  console.log('STEP 6: ROOT CAUSE ANALYSIS');
  console.log('═'.repeat(80));

  if (!dbRow) return;

  const dbAwaySlug = dbRow.awayTeam;  // bethune_cookman (from NCAA)
  const dbHomeSlug = dbRow.homeTeam;  // prairie_view_a_and_m (from NCAA)
  
  console.log('\n[TEAM ORDER CONFLICT]');
  console.log('  NCAA API says:  AWAY=bethune_cookman,       HOME=prairie_view_a_and_m');
  console.log('  VSiN page says: AWAY=prairie_view_a_and_m,  HOME=bethune_cookman');
  console.log('  DB stores:      AWAY=bethune_cookman,       HOME=prairie_view_a_and_m  ← from NCAA (inserted first)');
  
  console.log('\n[WHAT HAPPENS IN refreshNcaam()]');
  console.log('  1. Scraper returns: awaySlug="prairie_view_a_and_m", awaySpread=+5.5, homeSpread=-5.5');
  console.log('  2. Code tries: existing.find(e => e.awayTeam === "prairie_view_a_and_m" && e.homeTeam === "bethune_cookman")');
  console.log('  3. DB has it reversed: awayTeam="bethune_cookman", homeTeam="prairie_view_a_and_m"');
  console.log('  4. Canonical match FAILS');
  
  console.log('\n[CRITICAL QUESTION: Does the code handle reversed matches for VSiN updates?]');
  console.log('  Looking at vsinAutoRefresh.ts refreshNcaam() matching logic...');
  console.log('  The code uses: existing.find(e => e.awayTeam === awaySlug && e.homeTeam === homeSlug)');
  console.log('  There is NO reversed-match fallback for VSiN odds updates!');
  console.log('  (Reversed match only exists for NCAA-only game insertion, not VSiN update)');
  
  console.log('\n[WHAT ACTUALLY HAPPENS]');
  console.log('  Since canonical match fails AND no reversed fallback exists:');
  console.log('  → The code falls through to the INSERT branch');
  console.log('  → A NEW game row is inserted: awayTeam="prairie_view_a_and_m", homeTeam="bethune_cookman"');
  console.log('  → NOW THERE ARE TWO ROWS for this game!');
  console.log('    Row A (from NCAA): awayTeam=bethune_cookman,       homeTeam=prairie_view_a_and_m  (NO ODDS)');
  console.log('    Row B (from VSiN): awayTeam=prairie_view_a_and_m,  homeTeam=bethune_cookman       (HAS ODDS)');
  
  console.log('\n[WHAT THE FRONTEND SHOWS]');
  console.log('  The feed shows BOTH rows OR the one with odds (Row B)');
  console.log('  Row B has:');
  console.log('    awayTeam = prairie_view_a_and_m  (VSiN away = correct per VSiN)');
  console.log('    awayBookSpread = +5.5             (VSiN away spread = Prairie View +5.5)');
  console.log('    spreadAwayBetsPct = 36%           (36% of bets on Prairie View spread)');
  console.log('    awayML = +190                     (Prairie View ML)');
  console.log('  BUT the NCAA scoreboard says Bethune-Cookman is the AWAY team!');
  console.log('  So if the user sees "bethune_cookman" as away with +5.5 spread, that is WRONG');
  console.log('  Bethune-Cookman should be -5.5 (they are the home favorite per VSiN)');

  console.log('\n[OR ALTERNATIVELY — if duplicate prevention works]');
  console.log('  The reversed-match duplicate check in buildStartTimeMap may catch this');
  console.log('  and prevent the second insert. In that case:');
  console.log('    Row A (from NCAA): awayTeam=bethune_cookman, homeTeam=prairie_view_a_and_m');
  console.log('    → awayBookSpread is NEVER updated because VSiN canonical match fails');
  console.log('    → The game shows NO ODDS or stale odds');
}

// ─── STEP 7: What the frontend actually displays ──────────────────────────────
async function analyzeFrontendDisplay(db, dbRow) {
  console.log('\n' + '═'.repeat(80));
  console.log('STEP 7: FRONTEND DISPLAY ANALYSIS');
  console.log('═'.repeat(80));

  // Check for duplicates
  const [allRows] = await db.execute(
    `SELECT id, awayTeam, homeTeam, awayBookSpread, homeBookSpread, bookTotal,
            awayML, homeML, spreadAwayBetsPct, spreadAwayMoneyPct,
            mlAwayBetsPct, mlAwayMoneyPct, sortOrder, ncaaContestId
     FROM games 
     WHERE gameDate = '2026-03-11' AND sport = 'NCAAM'
       AND (awayTeam IN ('bethune_cookman', 'prairie_view_a_and_m')
         OR homeTeam IN ('bethune_cookman', 'prairie_view_a_and_m'))
     ORDER BY id`
  );

  console.log(`\n[DB] All rows involving bethune_cookman or prairie_view_a_and_m:`);
  for (const r of allRows) {
    console.log(`\n  id=${r.id}:`);
    console.log(`    awayTeam:           "${r.awayTeam}"`);
    console.log(`    homeTeam:           "${r.homeTeam}"`);
    console.log(`    awayBookSpread:     ${r.awayBookSpread}`);
    console.log(`    homeBookSpread:     ${r.homeBookSpread}`);
    console.log(`    bookTotal:          ${r.bookTotal}`);
    console.log(`    awayML:             ${r.awayML}`);
    console.log(`    homeML:             ${r.homeML}`);
    console.log(`    spreadAwayBetsPct:  ${r.spreadAwayBetsPct}%`);
    console.log(`    spreadAwayMoneyPct: ${r.spreadAwayMoneyPct}%`);
    console.log(`    mlAwayBetsPct:      ${r.mlAwayBetsPct}%`);
    console.log(`    mlAwayMoneyPct:     ${r.mlAwayMoneyPct}%`);
    console.log(`    sortOrder:          ${r.sortOrder}`);
    console.log(`    ncaaContestId:      ${r.ncaaContestId}`);
  }

  if (allRows.length > 1) {
    console.log('\n  🔴 DUPLICATE DETECTED! Two rows for the same game.');
    const rowWithOdds = allRows.find(r => r.awayBookSpread !== null);
    const rowWithoutOdds = allRows.find(r => r.awayBookSpread === null);
    if (rowWithOdds && rowWithoutOdds) {
      console.log(`\n  Row WITH odds (id=${rowWithOdds.id}): ${rowWithOdds.awayTeam} @ ${rowWithOdds.homeTeam}`);
      console.log(`  Row WITHOUT odds (id=${rowWithoutOdds.id}): ${rowWithoutOdds.awayTeam} @ ${rowWithoutOdds.homeTeam}`);
      console.log(`\n  The frontend shows the row WITH odds: ${rowWithOdds.awayTeam} @ ${rowWithOdds.homeTeam}`);
      console.log(`  This means the AWAY team shown is: ${rowWithOdds.awayTeam}`);
      console.log(`  With awayBookSpread: ${rowWithOdds.awayBookSpread}`);
      
      // Determine if odds are correct
      console.log('\n[CORRECTNESS CHECK]');
      console.log(`  VSiN says: Prairie View A&M = AWAY = +5.5 spread`);
      console.log(`  NCAA says: Bethune-Cookman  = AWAY`);
      console.log(`  DB row with odds: awayTeam="${rowWithOdds.awayTeam}", awayBookSpread="${rowWithOdds.awayBookSpread}"`);
      
      if (rowWithOdds.awayTeam === 'prairie_view_a_and_m') {
        console.log('\n  ⚠️  DISPLAY BUG: The row with odds has Prairie View as AWAY (+5.5)');
        console.log('  But NCAA says Bethune-Cookman is the AWAY team.');
        console.log('  So the frontend shows: Prairie View (AWAY) +5.5 @ Bethune-Cookman (HOME) -5.5');
        console.log('  CORRECT display should be: Bethune-Cookman (AWAY) -5.5 @ Prairie View (HOME) +5.5');
        console.log('  The spread VALUES are correct but assigned to the WRONG teams!');
      } else if (rowWithOdds.awayTeam === 'bethune_cookman') {
        console.log('\n  Checking if spread is correctly assigned to Bethune-Cookman...');
        if (rowWithOdds.awayBookSpread === '-5.5') {
          console.log('  ✅ Bethune-Cookman (AWAY) has -5.5 — CORRECT per NCAA ordering');
        } else if (rowWithOdds.awayBookSpread === '+5.5') {
          console.log('  ❌ Bethune-Cookman (AWAY) has +5.5 — WRONG! Should be -5.5');
          console.log('  The spread is inverted: VSiN away spread was applied to NCAA away team without flipping');
        }
      }
    }
  } else if (allRows.length === 1) {
    const r = allRows[0];
    console.log(`\n  Single row found: ${r.awayTeam} @ ${r.homeTeam}`);
    if (r.awayBookSpread === null) {
      console.log('  ❌ This row has NO ODDS — VSiN update never matched it');
    } else {
      console.log(`  Has odds: awaySpread=${r.awayBookSpread}, homeSpread=${r.homeBookSpread}`);
    }
  }
}

// ─── STEP 8: The Fix ──────────────────────────────────────────────────────────
function explainFix() {
  console.log('\n' + '═'.repeat(80));
  console.log('STEP 8: REQUIRED FIX');
  console.log('═'.repeat(80));

  console.log('\n[FIX REQUIRED IN: server/vsinAutoRefresh.ts — refreshNcaam()]');
  console.log('\nCurrent code (simplified):');
  console.log('  const existingGame = existing.find(');
  console.log('    e => e.awayTeam === awaySlug && e.homeTeam === homeSlug');
  console.log('  );');
  console.log('  if (existingGame) {');
  console.log('    await updateBookOdds(existingGame.id, { awayBookSpread, homeBookSpread, ... });');
  console.log('  } else {');
  console.log('    await insertGames([{ awayTeam: awaySlug, homeTeam: homeSlug, ... }]);');
  console.log('  }');
  
  console.log('\nFixed code must:');
  console.log('  1. Try canonical match: awaySlug === DB.awayTeam && homeSlug === DB.homeTeam');
  console.log('  2. Try reversed match:  awaySlug === DB.homeTeam && homeSlug === DB.awayTeam');
  console.log('  3. If REVERSED match found: SWAP the odds before updating!');
  console.log('     - awayBookSpread ↔ homeBookSpread (swap)');
  console.log('     - awayML ↔ homeML (swap)');
  console.log('     - spreadAwayBetsPct → becomes spreadHomeBetsPct (100 - value)');
  console.log('     - mlAwayBetsPct → becomes mlHomeBetsPct (100 - value)');
  console.log('     - totalOverBetsPct stays the same (not team-specific)');
  console.log('  4. If no match at all: check ncaaContestId before inserting');
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║  DEEP DEBUG: Prairie View A&M vs Bethune-Cookman Odds Mapping Bug        ║');
  console.log('╚' + '═'.repeat(78) + '╝');

  const db = await getDb();

  const vsinData = analyzeVsinHtml();
  analyzeNcaaHtml();
  const scrapedData = analyzeSlugConversion(vsinData);
  const dbRow = await analyzeDbLookup(db, scrapedData);
  analyzeMatchingLogic(dbRow, scrapedData);
  explainRootCause(dbRow, scrapedData);
  await analyzeFrontendDisplay(db, dbRow);
  explainFix();

  console.log('\n' + '═'.repeat(80));
  console.log('DEBUG COMPLETE');
  console.log('═'.repeat(80) + '\n');

  await db.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
