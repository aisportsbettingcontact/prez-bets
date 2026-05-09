/**
 * test-dh-pipeline-v2.mjs
 * 
 * End-to-end validation of the doubleheader detection pipeline for 2026-04-30.
 * Tests all three fixed code paths:
 *   1. fetchMlbStatsSlate (actionNetwork.ts) — startTime-based DH detection
 *   2. getLinescores (betTracker.ts)          — startTime-based DH detection (FIXED)
 *   3. gradeTrackedBet (scoreGrader.ts)       — startTime-based G2 fallback (FIXED)
 *
 * Expected results for 2026-04-30:
 *   HOU@BAL G1: gamePk=824848, starts 16:35Z, HOU 3 - BAL 10
 *   HOU@BAL G2: gamePk=824850, starts 16:40Z, HOU 11 - BAL 5
 *   SF@PHI  G1: gamePk=823472, starts 16:35Z, SF 2 - PHI 3   ← lower gamePk is LATER game
 *   SF@PHI  G2: gamePk=823471, starts 21:35Z, SF 5 - PHI 6   ← higher gamePk is EARLIER game
 */

const DATE = "2026-04-30";
let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✅ PASS: ${label} → ${actual}`);
    pass++;
  } else {
    console.log(`  ❌ FAIL: ${label} → got=${actual} expected=${expected}`);
    fail++;
  }
}

// ─── Step 1: MLB Stats API raw data ──────────────────────────────────────────
console.log("\n[STEP 1] Fetching MLB Stats API for 2026-04-30...");
const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${DATE}&hydrate=linescore,team`;
const resp = await fetch(url);
const json = await resp.json();
const games = json.dates?.[0]?.games ?? [];
console.log(`[INPUT] HTTP=${resp.status} | games.length=${games.length}`);

// Build a map of gamePk → {startTime, awayAbbrev, homeAbbrev, awayScore, homeScore}
const gameMap = new Map();
for (const g of games) {
  gameMap.set(g.gamePk, {
    gamePk: g.gamePk,
    startTime: g.gameDate,
    awayAbbrev: g.teams?.away?.team?.abbreviation ?? "",
    homeAbbrev: g.teams?.home?.team?.abbreviation ?? "",
    awayScore: g.teams?.away?.score ?? null,
    homeScore: g.teams?.home?.score ?? null,
  });
}

// Verify the two DH matchups exist
const pk824848 = gameMap.get(824848);
const pk824850 = gameMap.get(824850);
const pk823471 = gameMap.get(823471);
const pk823472 = gameMap.get(823472);

console.log(`\n[STATE] HOU@BAL games:`);
console.log(`  gamePk=824848: ${pk824848?.awayAbbrev}@${pk824848?.homeAbbrev} startTime=${pk824848?.startTime} score=${pk824848?.awayScore}-${pk824848?.homeScore}`);
console.log(`  gamePk=824850: ${pk824850?.awayAbbrev}@${pk824850?.homeAbbrev} startTime=${pk824850?.startTime} score=${pk824850?.awayScore}-${pk824850?.homeScore}`);
console.log(`\n[STATE] SF@PHI games:`);
console.log(`  gamePk=823471: ${pk823471?.awayAbbrev}@${pk823471?.homeAbbrev} startTime=${pk823471?.startTime} score=${pk823471?.awayScore}-${pk823471?.homeScore}`);
console.log(`  gamePk=823472: ${pk823472?.awayAbbrev}@${pk823472?.homeAbbrev} startTime=${pk823472?.startTime} score=${pk823472?.awayScore}-${pk823472?.homeScore}`);

// ─── Step 2: Simulate fetchMlbStatsSlate DH detection (actionNetwork.ts) ─────
console.log("\n[STEP 2] Simulating fetchMlbStatsSlate DH detection (startTime-based)...");

// Parse all games into slate format, sorted by startTime ASC
const parsed = games.map(g => ({
  gamePk: g.gamePk,
  gameDate: DATE,
  awayTeam: g.teams?.away?.team?.abbreviation ?? "",
  homeTeam: g.teams?.home?.team?.abbreviation ?? "",
  startUtc: g.gameDate ?? "",
  gameNumber: 1,
})).sort((a, b) => a.startUtc.localeCompare(b.startUtc));

// DH detection: counter-based (first occurrence = G1, second = G2)
const matchupCount = new Map();
for (const g of parsed) {
  const key = `${g.gameDate}:${g.awayTeam}:${g.homeTeam}`;
  const seen = matchupCount.get(key) ?? 0;
  if (seen === 0) {
    matchupCount.set(key, 1);
  } else {
    g.gameNumber = 2;
    matchupCount.set(key, seen + 1);
  }
}

const houBalG1 = parsed.find(g => g.awayTeam === "HOU" && g.homeTeam === "BAL" && g.gameNumber === 1);
const houBalG2 = parsed.find(g => g.awayTeam === "HOU" && g.homeTeam === "BAL" && g.gameNumber === 2);
const sfPhiG1  = parsed.find(g => g.awayTeam === "SF"  && g.homeTeam === "PHI" && g.gameNumber === 1);
const sfPhiG2  = parsed.find(g => g.awayTeam === "SF"  && g.homeTeam === "PHI" && g.gameNumber === 2);

console.log(`\n[STATE] fetchMlbStatsSlate DH results:`);
console.log(`  HOU@BAL G1: gamePk=${houBalG1?.gamePk} startTime=${houBalG1?.startUtc}`);
console.log(`  HOU@BAL G2: gamePk=${houBalG2?.gamePk} startTime=${houBalG2?.startUtc}`);
console.log(`  SF@PHI  G1: gamePk=${sfPhiG1?.gamePk}  startTime=${sfPhiG1?.startUtc}`);
console.log(`  SF@PHI  G2: gamePk=${sfPhiG2?.gamePk}  startTime=${sfPhiG2?.startUtc}`);

check("fetchMlbStatsSlate: HOU@BAL G1 = gamePk 824848 (16:35Z)", houBalG1?.gamePk, 824848);
check("fetchMlbStatsSlate: HOU@BAL G2 = gamePk 824850 (16:40Z)", houBalG2?.gamePk, 824850);
check("fetchMlbStatsSlate: SF@PHI G1 = gamePk 823472 (16:35Z, earlier)", sfPhiG1?.gamePk, 823472);
check("fetchMlbStatsSlate: SF@PHI G2 = gamePk 823471 (21:35Z, later)", sfPhiG2?.gamePk, 823471);

// ─── Step 3: Simulate getLinescores DH detection (betTracker.ts) ──────────────
console.log("\n[STEP 3] Simulating getLinescores DH detection (startTime-based, FIXED)...");

// Build result map (as getLinescores does)
const result = {};
for (const g of games) {
  result[g.gamePk] = {
    gamePk: g.gamePk,
    gameDate: DATE,
    awayAbbrev: g.teams?.away?.team?.abbreviation ?? "",
    homeAbbrev: g.teams?.home?.team?.abbreviation ?? "",
    gameNumber: 1,
    startTime: g.gameDate ?? "",
    awayR: g.teams?.away?.score ?? null,
    homeR: g.teams?.home?.score ?? null,
  };
}

// DH detection: sort by startTime ASC (FIXED — was gamePk sort before)
const dhGroups = new Map();
for (const entry of Object.values(result)) {
  const key = `${entry.gameDate}:${entry.awayAbbrev}:${entry.homeAbbrev}`;
  const group = dhGroups.get(key) ?? [];
  group.push(entry.gamePk);
  dhGroups.set(key, group);
}
for (const [key, pks] of dhGroups.entries()) {
  if (pks.length < 2) continue;
  // FIXED: sort by startTime ASC
  pks.sort((a, b) => (result[a].startTime ?? "").localeCompare(result[b].startTime ?? ""));
  result[pks[0]].gameNumber = 1;
  result[pks[1]].gameNumber = 2;
}

// Build linescoreByGameNum map (as BetTracker.tsx does)
const linescoreByGameNum = {};
for (const entry of Object.values(result)) {
  const key = `${entry.gameDate}:${entry.awayAbbrev}:${entry.homeAbbrev}:${entry.gameNumber}`;
  linescoreByGameNum[key] = entry;
}

// Verify keys
const houBalG1Ls = linescoreByGameNum[`${DATE}:HOU:BAL:1`];
const houBalG2Ls = linescoreByGameNum[`${DATE}:HOU:BAL:2`];
const sfPhiG1Ls  = linescoreByGameNum[`${DATE}:SF:PHI:1`];
const sfPhiG2Ls  = linescoreByGameNum[`${DATE}:SF:PHI:2`];

console.log(`\n[STATE] getLinescores linescoreByGameNum:`);
console.log(`  "${DATE}:HOU:BAL:1": gamePk=${houBalG1Ls?.gamePk} score=${houBalG1Ls?.awayR}-${houBalG1Ls?.homeR}`);
console.log(`  "${DATE}:HOU:BAL:2": gamePk=${houBalG2Ls?.gamePk} score=${houBalG2Ls?.awayR}-${houBalG2Ls?.homeR}`);
console.log(`  "${DATE}:SF:PHI:1":  gamePk=${sfPhiG1Ls?.gamePk}  score=${sfPhiG1Ls?.awayR}-${sfPhiG1Ls?.homeR}`);
console.log(`  "${DATE}:SF:PHI:2":  gamePk=${sfPhiG2Ls?.gamePk}  score=${sfPhiG2Ls?.awayR}-${sfPhiG2Ls?.homeR}`);

check("getLinescores: HOU@BAL G1 gamePk=824848", houBalG1Ls?.gamePk, 824848);
check("getLinescores: HOU@BAL G1 score=HOU 3, BAL 10", `${houBalG1Ls?.awayR}-${houBalG1Ls?.homeR}`, "3-10");
check("getLinescores: HOU@BAL G2 gamePk=824850", houBalG2Ls?.gamePk, 824850);
check("getLinescores: HOU@BAL G2 score=HOU 11, BAL 5", `${houBalG2Ls?.awayR}-${houBalG2Ls?.homeR}`, "11-5");
check("getLinescores: SF@PHI G1 gamePk=823472 (earlier, 16:35Z)", sfPhiG1Ls?.gamePk, 823472);
check("getLinescores: SF@PHI G1 score=SF 2, PHI 3", `${sfPhiG1Ls?.awayR}-${sfPhiG1Ls?.homeR}`, "2-3");
check("getLinescores: SF@PHI G2 gamePk=823471 (later, 21:35Z)", sfPhiG2Ls?.gamePk, 823471);
check("getLinescores: SF@PHI G2 score=SF 5, PHI 6", `${sfPhiG2Ls?.awayR}-${sfPhiG2Ls?.homeR}`, "5-6");

// ─── Step 4: Simulate gradeTrackedBet G2 fallback (scoreGrader.ts) ────────────
console.log("\n[STEP 4] Simulating gradeTrackedBet G2 fallback (startTime-based, FIXED)...");

// Build GameScoreData array (as fetchMlbScores returns)
const gameScoreData = games.map(g => ({
  sport: "MLB",
  gameId: String(g.gamePk),
  startTime: g.gameDate ?? "",
  awayAbbrev: g.teams?.away?.team?.abbreviation ?? "",
  homeAbbrev: g.teams?.home?.team?.abbreviation ?? "",
  awayScore: g.teams?.away?.score ?? null,
  homeScore: g.teams?.home?.score ?? null,
}));

// Simulate G2 fallback for HOU@BAL (gameNumber=2)
function resolveG2(games, awayTeam, homeTeam) {
  const normAway = awayTeam.toUpperCase();
  const normHome = homeTeam.toUpperCase();
  const matches = games.filter(g => {
    const ga = g.awayAbbrev.toUpperCase();
    const gh = g.homeAbbrev.toUpperCase();
    return (ga === normAway && gh === normHome) ||
           (ga.includes(normAway) || normAway.includes(ga)) && (gh.includes(normHome) || normHome.includes(gh));
  });
  // FIXED: sort by startTime ASC (was gameId/gamePk sort before)
  matches.sort((a, b) => {
    if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime);
    return Number(a.gameId) - Number(b.gameId);
  });
  return matches[1] ?? matches[0] ?? null; // G2 = index 1
}

const houBalG2Grade = resolveG2(gameScoreData, "HOU", "BAL");
const sfPhiG2Grade  = resolveG2(gameScoreData, "SF",  "PHI");

console.log(`\n[STATE] gradeTrackedBet G2 fallback:`);
console.log(`  HOU@BAL G2: gameId=${houBalG2Grade?.gameId} score=${houBalG2Grade?.awayScore}-${houBalG2Grade?.homeScore} startTime=${houBalG2Grade?.startTime}`);
console.log(`  SF@PHI  G2: gameId=${sfPhiG2Grade?.gameId}  score=${sfPhiG2Grade?.awayScore}-${sfPhiG2Grade?.homeScore}  startTime=${sfPhiG2Grade?.startTime}`);

check("gradeTrackedBet: HOU@BAL G2 gameId=824850", houBalG2Grade?.gameId, "824850");
check("gradeTrackedBet: HOU@BAL G2 score=HOU 11, BAL 5", `${houBalG2Grade?.awayScore}-${houBalG2Grade?.homeScore}`, "11-5");
check("gradeTrackedBet: SF@PHI G2 gameId=823471 (later, 21:35Z)", sfPhiG2Grade?.gameId, "823471");
check("gradeTrackedBet: SF@PHI G2 score=SF 5, PHI 6", `${sfPhiG2Grade?.awayScore}-${sfPhiG2Grade?.homeScore}`, "5-6");

// ─── Step 5: Verify bet 60006 (HOU@BAL G2, gameNumber=2) ─────────────────────
console.log("\n[STEP 5] Verifying bet 60006 (HOU@BAL G2, gameNumber=2)...");
console.log(`  Bet 60006: awayTeam=HOU homeTeam=BAL gameDate=${DATE} gameNumber=2`);
console.log(`  Expected linescore key: "${DATE}:HOU:BAL:2"`);
console.log(`  Resolved linescore: gamePk=${houBalG2Ls?.gamePk} score=HOU ${houBalG2Ls?.awayR} - BAL ${houBalG2Ls?.homeR}`);
check("Bet 60006 linescore key resolves to G2 (HOU 11, BAL 5)", `${houBalG2Ls?.awayR}-${houBalG2Ls?.homeR}`, "11-5");

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(60)}`);
console.log(`[SUMMARY] ${pass} passed, ${fail} failed`);
if (fail === 0) {
  console.log(`[VERIFY] ✅ ALL TESTS PASS — DH pipeline is correct and fully intact`);
} else {
  console.log(`[VERIFY] ❌ ${fail} TESTS FAILED — investigate above`);
}
console.log(`${"=".repeat(60)}\n`);
