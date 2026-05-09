/**
 * test-dh-pipeline.mjs
 * 
 * End-to-end test for the DH pipeline for 2026-04-30.
 * Tests:
 *   1. AN API returns 0 games for historical date (expected)
 *   2. MLB Stats API returns 11 games including 2x HOU@BAL
 *   3. DH detection assigns gameNumber=1 to gamePk=824848, gameNumber=2 to gamePk=824850
 *   4. linescoreByGameNum key "2026-04-30:HOU:BAL:2" resolves to HOU 11, BAL 5
 */

const MLB_STATS_URL = "https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=2026-04-30&hydrate=linescore,team";
const AN_URL = "https://api.actionnetwork.com/web/v1/games/mlb?bookIds=15,30,76,75,123,69,68,972,71,247,79&date=20260430&periods=event";
const AN_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

// ── Step 1: AN API ────────────────────────────────────────────────────────────
console.log("[STEP 1] Testing AN API for 2026-04-30...");
const anResp = await fetch(AN_URL, { headers: AN_HEADERS });
const anData = await anResp.json();
const anGames = anData.games ?? [];
console.log(`[AN][OUTPUT] HTTP=${anResp.status} | games.length=${anGames.length}`);
if (anGames.length === 0) {
  console.log("[AN][VERIFY] PASS — AN returns 0 games for historical date → fallback will fire");
} else {
  console.log(`[AN][VERIFY] WARN — AN returned ${anGames.length} games (unexpected for historical date)`);
  for (const g of anGames.slice(0, 3)) {
    console.log(`  game id=${g.id} teams.length=${(g.teams ?? []).length}`);
  }
}

// ── Step 2: MLB Stats API ─────────────────────────────────────────────────────
console.log("\n[STEP 2] Testing MLB Stats API for 2026-04-30...");
const mlbResp = await fetch(MLB_STATS_URL);
const mlbData = await mlbResp.json();
const dates = mlbData.dates ?? [];
const dateEntry = dates.find(d => d.date === "2026-04-30");
const apiGames = dateEntry?.games ?? [];
console.log(`[MLB][OUTPUT] HTTP=${mlbResp.status} | games.length=${apiGames.length}`);

// ── Step 3: Parse and DH detection ───────────────────────────────────────────
console.log("\n[STEP 3] Parsing games and detecting doubleheaders...");
const parsed = [];
for (const g of apiGames) {
  const gamePk = g.gamePk;
  const startTime = g.gameDate;
  const away = g.teams?.away?.team?.abbreviation ?? "?";
  const home = g.teams?.home?.team?.abbreviation ?? "?";
  const status = g.status?.abstractGameState ?? "Preview";
  const ls = g.linescore;
  const awayR = ls?.teams?.away?.runs ?? null;
  const homeR = ls?.teams?.home?.runs ?? null;
  parsed.push({ gamePk, startTime, away, home, status, awayR, homeR, gameNumber: 1 });
}

// Sort by startTime ASC (same as server)
parsed.sort((a, b) => a.startTime.localeCompare(b.startTime));

// DH detection (same logic as server)
const dhGroups = new Map();
for (const g of parsed) {
  const key = `2026-04-30:${g.away}:${g.home}`;
  const group = dhGroups.get(key) ?? [];
  group.push(g.gamePk);
  dhGroups.set(key, group);
}
for (const [key, pks] of dhGroups.entries()) {
  if (pks.length < 2) continue;
  pks.sort((a, b) => a - b);
  const g1 = parsed.find(g => g.gamePk === pks[0]);
  const g2 = parsed.find(g => g.gamePk === pks[1]);
  if (g1) g1.gameNumber = 1;
  if (g2) g2.gameNumber = 2;
  console.log(`[DH] Detected: key=${key} G1_gamePk=${pks[0]} G2_gamePk=${pks[1]}`);
}

// Print all games
console.log("\n[STEP 3][OUTPUT] All parsed games:");
for (const g of parsed) {
  console.log(`  gamePk=${g.gamePk} ${g.away}@${g.home} G${g.gameNumber} | status=${g.status} | score=${g.awayR ?? "N/A"}-${g.homeR ?? "N/A"} | start=${g.startTime}`);
}

// ── Step 4: Verify linescoreByGameNum keys ────────────────────────────────────
console.log("\n[STEP 4] Verifying linescoreByGameNum keys...");
const linescoreByGameNum = new Map();
for (const g of parsed) {
  const key = `2026-04-30:${g.away}:${g.home}:${g.gameNumber}`;
  linescoreByGameNum.set(key, { gamePk: g.gamePk, awayR: g.awayR, homeR: g.homeR, status: g.status });
}

// Test the specific keys for HOU@BAL
const g1Key = "2026-04-30:HOU:BAL:1";
const g2Key = "2026-04-30:HOU:BAL:2";
const g1 = linescoreByGameNum.get(g1Key);
const g2 = linescoreByGameNum.get(g2Key);

console.log(`\n[VERIFY] G1 key="${g1Key}":`, g1 ? `gamePk=${g1.gamePk} score=HOU ${g1.awayR}-${g1.homeR} BAL` : "NOT FOUND");
console.log(`[VERIFY] G2 key="${g2Key}":`, g2 ? `gamePk=${g2.gamePk} score=HOU ${g2.awayR}-${g2.homeR} BAL` : "NOT FOUND");

// Expected: G1 = gamePk=824848, HOU 3, BAL 10; G2 = gamePk=824850, HOU 11, BAL 5
const g1Pass = g1 && g1.gamePk === 824848 && g1.awayR === 3 && g1.homeR === 10;
const g2Pass = g2 && g2.gamePk === 824850 && g2.awayR === 11 && g2.homeR === 5;
console.log(`\n[VERIFY] G1 (expected gamePk=824848, HOU 3 BAL 10): ${g1Pass ? "✅ PASS" : "❌ FAIL"}`);
console.log(`[VERIFY] G2 (expected gamePk=824850, HOU 11 BAL 5): ${g2Pass ? "✅ PASS" : "❌ FAIL"}`);

// Also check SF@PHI doubleheader
const sfPhiG1Key = "2026-04-30:SF:PHI:1";
const sfPhiG2Key = "2026-04-30:SF:PHI:2";
const sfPhiG1 = linescoreByGameNum.get(sfPhiG1Key);
const sfPhiG2 = linescoreByGameNum.get(sfPhiG2Key);
console.log(`\n[VERIFY] SF@PHI G1 key="${sfPhiG1Key}":`, sfPhiG1 ? `gamePk=${sfPhiG1.gamePk} score=SF ${sfPhiG1.awayR}-${sfPhiG1.homeR} PHI` : "NOT FOUND");
console.log(`[VERIFY] SF@PHI G2 key="${sfPhiG2Key}":`, sfPhiG2 ? `gamePk=${sfPhiG2.gamePk} score=SF ${sfPhiG2.awayR}-${sfPhiG2.homeR} PHI` : "NOT FOUND");

console.log("\n[DONE] Pipeline test complete.");
