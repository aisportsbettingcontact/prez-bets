/**
 * NHL Pipeline Live End-to-End Test
 *
 * Tests the full pipeline:
 *   1. NHL.com schedule API → parse games for today
 *   2. VSiN NHL scraper → parse odds/splits for today
 *   3. Team slug resolution → verify all teams map correctly
 *
 * Does NOT write to the database — read-only validation.
 * Run from project root: node test_nhl_live.mjs
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });

const VSIN_EMAIL = process.env.VSIN_EMAIL;
const VSIN_PASSWORD = process.env.VSIN_PASSWORD;

console.log("═══════════════════════════════════════════════════════════════");
console.log("  NHL Pipeline Live End-to-End Test");
console.log(`  Date: ${new Date().toISOString()}`);
console.log(`  VSiN credentials: ${VSIN_EMAIL ? "✔ present" : "✘ MISSING"}`);
console.log("═══════════════════════════════════════════════════════════════\n");

// ─── Step 1: NHL.com Schedule API ────────────────────────────────────────────
console.log("STEP 1: Fetching NHL.com schedule for today...\n");

let scheduleGames = [];
try {
  const resp = await fetch("https://api-web.nhle.com/v1/schedule/now", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "application/json",
    },
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  const gameWeek = json?.gameWeek ?? [];

  // Get today in ET
  const todayEt = new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).replace(/(\d+)\/(\d+)\/(\d+)/, "$3-$1-$2");

  console.log(`  Today (ET): ${todayEt}`);
  console.log(`  Game weeks returned: ${gameWeek.length}`);

  for (const dateEntry of gameWeek) {
    const games = dateEntry.games ?? [];
    for (const g of games) {
      if (g.gameType === 1) continue; // skip preseason
      const awayAbbrev = g.awayTeam?.abbrev ?? "?";
      const homeAbbrev = g.homeTeam?.abbrev ?? "?";
      const startUTC = g.startTimeUTC ?? "";
      const offset = g.easternUTCOffset ?? "-05:00";

      // Convert to ET
      const utcMs = new Date(startUTC).getTime();
      const offsetMatch = offset.match(/^([+-])(\d{2}):(\d{2})$/);
      let etTimeStr = "TBD";
      let gameDateEt = startUTC.slice(0, 10);
      if (offsetMatch) {
        const sign = offsetMatch[1] === "+" ? 1 : -1;
        const offsetMs = sign * (parseInt(offsetMatch[2]) * 60 + parseInt(offsetMatch[3])) * 60000;
        const etMs = utcMs + offsetMs;
        const etDate = new Date(etMs);
        etTimeStr = `${String(etDate.getUTCHours()).padStart(2,"0")}:${String(etDate.getUTCMinutes()).padStart(2,"0")}`;
        gameDateEt = `${etDate.getUTCFullYear()}-${String(etDate.getUTCMonth()+1).padStart(2,"0")}-${String(etDate.getUTCDate()).padStart(2,"0")}`;
      }

      const state = g.gameState ?? "FUT";
      const awayScore = state !== "FUT" && state !== "PRE" ? (g.awayTeam?.score ?? null) : null;
      const homeScore = state !== "FUT" && state !== "PRE" ? (g.homeTeam?.score ?? null) : null;

      scheduleGames.push({ awayAbbrev, homeAbbrev, gameDateEt, etTimeStr, state, awayScore, homeScore, gameId: g.id });
    }
  }

  const todayGames = scheduleGames.filter(g => g.gameDateEt === todayEt);
  console.log(`  Total games in window: ${scheduleGames.length}`);
  console.log(`  Today's games (${todayEt}): ${todayGames.length}\n`);

  for (const g of todayGames) {
    console.log(`  ${g.awayAbbrev} @ ${g.homeAbbrev} | ${g.etTimeStr} ET | state=${g.state} | score=${g.awayScore ?? "?"}-${g.homeScore ?? "?"}`);
  }
  console.log();
} catch (err) {
  console.error(`  ✘ NHL.com schedule fetch FAILED: ${err.message}\n`);
}

// ─── Step 2: VSiN NHL Scraper ─────────────────────────────────────────────────
console.log("STEP 2: Fetching VSiN NHL betting splits...\n");

if (!VSIN_EMAIL || !VSIN_PASSWORD) {
  console.error("  ✘ VSIN_EMAIL or VSIN_PASSWORD not set — skipping VSiN scrape\n");
} else {
  try {
    // Login to Piano ID
    console.log("  Logging in to Piano ID...");
    const loginResp = await fetch(
      "https://auth.vsin.com/id/api/v1/identity/login/token?aid=N1owYIiApu&lang=en_US",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "https://auth.vsin.com",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        body: JSON.stringify({ password: VSIN_PASSWORD, remember: true, login: VSIN_EMAIL, loginType: "email" }),
      }
    );

    if (!loginResp.ok) {
      const text = await loginResp.text();
      throw new Error(`Piano ID login failed (${loginResp.status}): ${text.substring(0, 200)}`);
    }

    const loginData = await loginResp.json();
    const token = loginData.access_token;
    if (!token) throw new Error(`No access_token in response: ${JSON.stringify(loginData).substring(0, 200)}`);
    console.log(`  ✔ Login successful (expires_in=${loginData.expires_in}s)\n`);

    // Fetch NHL betting splits page
    console.log("  Fetching https://data.vsin.com/nhl/betting-splits/ ...");
    const pageResp = await fetch("https://data.vsin.com/nhl/betting-splits/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Cookie": `__utp=${token}`,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://vsin.com/",
      },
    });

    if (!pageResp.ok) throw new Error(`Page fetch failed (${pageResp.status})`);
    const html = await pageResp.text();
    console.log(`  ✔ Page fetched: ${html.length} bytes\n`);

    // Check for table
    const hasTable = html.includes("freezetable");
    const hasTeamLinks = html.includes("/nhl/teams/");
    console.log(`  freezetable present: ${hasTable ? "✔" : "✘"}`);
    console.log(`  NHL team links present: ${hasTeamLinks ? "✔" : "✘"}`);

    if (!hasTable) {
      console.error("  ✘ No betting splits table found — page may be behind paywall\n");
      // Show first 2000 chars for debugging
      console.log("  Page preview (first 2000 chars):");
      console.log(html.substring(0, 2000));
    } else {
      // Count game rows
      const gameRows = (html.match(/data-param2="[^"]*NHL[^"]*"/g) ?? []).length;
      console.log(`  Game rows found: ~${gameRows}`);
      console.log("  ✔ VSiN NHL page is accessible and contains game data\n");

      // Extract a few game IDs for verification
      const gameIdMatches = html.match(/data-param2="([^"]*NHL[^"]*)"/g) ?? [];
      console.log("  Sample game IDs:");
      for (const m of gameIdMatches.slice(0, 5)) {
        const id = m.match(/data-param2="([^"]*)"/)?.[1] ?? "?";
        console.log(`    ${id}`);
      }
    }
  } catch (err) {
    console.error(`  ✘ VSiN NHL scrape FAILED: ${err.message}\n`);
  }
}

// ─── Step 3: Team slug validation ────────────────────────────────────────────
console.log("\nSTEP 3: Validating NHL team slug mappings...\n");

// Known teams from today's live HTML parse
const knownTeams = [
  { vsinSlug: "anaheim-ducks", expectedDb: "anaheim_ducks" },
  { vsinSlug: "toronto-maple-leafs", expectedDb: "toronto_maple_leafs" },
  { vsinSlug: "st-louis-blues", expectedDb: "st_louis_blues" },
  { vsinSlug: "carolina-hurricanes", expectedDb: "carolina_hurricanes" },
  { vsinSlug: "washington-capitals", expectedDb: "washington_capitals" },
  { vsinSlug: "buffalo-sabres", expectedDb: "buffalo_sabres" },
  { vsinSlug: "ny-rangers", expectedDb: "new_york_rangers" },
  { vsinSlug: "ny-islanders", expectedDb: "new_york_islanders" },
  { vsinSlug: "colorado-avalanche", expectedDb: "colorado_avalanche" },
  { vsinSlug: "seattle-kraken", expectedDb: "seattle_kraken" },
  { vsinSlug: "utah-mammoth", expectedDb: "utah_mammoth" },
];

const VSIN_NHL_HREF_ALIASES = {
  "ny-rangers": "new-york-rangers",
  "ny-islanders": "new-york-islanders",
};

function nhlHrefToDbSlug(raw) {
  const canonical = VSIN_NHL_HREF_ALIASES[raw] ?? raw;
  return canonical.replace(/-/g, "_");
}

let slugPassed = 0, slugFailed = 0;
for (const { vsinSlug, expectedDb } of knownTeams) {
  const got = nhlHrefToDbSlug(vsinSlug);
  if (got === expectedDb) {
    console.log(`  ✔ "${vsinSlug}" → "${got}"`);
    slugPassed++;
  } else {
    console.log(`  ✘ "${vsinSlug}" → "${got}" (expected "${expectedDb}")`);
    slugFailed++;
  }
}

console.log(`\n  Slug validation: ${slugPassed} passed, ${slugFailed} failed\n`);

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log("═══════════════════════════════════════════════════════════════");
console.log("  SUMMARY");
console.log("═══════════════════════════════════════════════════════════════");
console.log(`  NHL.com schedule: ${scheduleGames.length > 0 ? "✔ accessible" : "✘ failed"}`);
console.log(`  Slug validation: ${slugFailed === 0 ? "✔ all correct" : `✘ ${slugFailed} failures`}`);
console.log();
