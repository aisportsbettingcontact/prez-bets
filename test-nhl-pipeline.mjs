/**
 * test-nhl-pipeline.mjs
 *
 * End-to-end test of the NHL data pipeline:
 *   1. DB validation — 32 teams, slugs, logos, conferences, divisions
 *   2. VSiN authentication via Piano ID (auth.vsin.com)
 *   3. VSiN NHL betting splits scraping
 *   4. NHL.com API schedule fetch
 *   5. Cross-validation: VSiN teams ↔ NHL API teams
 *   6. Existing NHL games in DB
 *
 * Run: node test-nhl-pipeline.mjs
 */

import * as dotenv from "dotenv";
import mysql from "mysql2/promise";
import * as cheerio from "cheerio";
import axios from "axios";

dotenv.config();

const VSIN_EMAIL = process.env.VSIN_EMAIL;
const VSIN_PASSWORD = process.env.VSIN_PASSWORD;
const DB_URL = process.env.DATABASE_URL;

// ── Color helpers ─────────────────────────────────────────────────────────────
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

let passed = 0;
let failed = 0;
let warnings = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`${GREEN}✔${RESET} ${label}${detail ? ` — ${CYAN}${detail}${RESET}` : ""}`);
    passed++;
  } else {
    console.log(`${RED}✘${RESET} ${label}${detail ? ` — ${RED}${detail}${RESET}` : ""}`);
    failed++;
  }
}

function warn(label, detail = "") {
  console.log(`${YELLOW}⚠${RESET} ${label}${detail ? ` — ${YELLOW}${detail}${RESET}` : ""}`);
  warnings++;
}

function section(title) {
  console.log(`\n${BOLD}${CYAN}══ ${title} ══${RESET}`);
}

// ── NHL Teams Registry ────────────────────────────────────────────────────────
const ABBREV_TO_DB_SLUG = {
  ANA: "anaheim_ducks", BOS: "boston_bruins", BUF: "buffalo_sabres",
  CAR: "carolina_hurricanes", CBJ: "columbus_blue_jackets", CGY: "calgary_flames",
  CHI: "chicago_blackhawks", COL: "colorado_avalanche", DAL: "dallas_stars",
  DET: "detroit_red_wings", EDM: "edmonton_oilers", FLA: "florida_panthers",
  LAK: "los_angeles_kings", MIN: "minnesota_wild", MTL: "montreal_canadiens",
  NJD: "new_jersey_devils", NSH: "nashville_predators", NYI: "new_york_islanders",
  NYR: "new_york_rangers", OTT: "ottawa_senators", PHI: "philadelphia_flyers",
  PIT: "pittsburgh_penguins", SEA: "seattle_kraken", SJS: "san_jose_sharks",
  STL: "st_louis_blues", TBL: "tampa_bay_lightning", TOR: "toronto_maple_leafs",
  UTA: "utah_mammoth", VAN: "vancouver_canucks", VGK: "vegas_golden_knights",
  WPG: "winnipeg_jets", WSH: "washington_capitals",
};

const VSIN_SLUG_TO_DB_SLUG = {
  "anaheim-ducks": "anaheim_ducks", "boston-bruins": "boston_bruins",
  "buffalo-sabres": "buffalo_sabres", "carolina-hurricanes": "carolina_hurricanes",
  "columbus-blue-jackets": "columbus_blue_jackets", "calgary-flames": "calgary_flames",
  "chicago-blackhawks": "chicago_blackhawks", "colorado-avalanche": "colorado_avalanche",
  "dallas-stars": "dallas_stars", "detroit-red-wings": "detroit_red_wings",
  "edmonton-oilers": "edmonton_oilers", "florida-panthers": "florida_panthers",
  "los-angeles-kings": "los_angeles_kings", "minnesota-wild": "minnesota_wild",
  "montreal-canadiens": "montreal_canadiens", "new-jersey-devils": "new_jersey_devils",
  "nashville-predators": "nashville_predators", "ny-islanders": "new_york_islanders",
  "los-angeles-kings": "los_angeles_kings",
  "new-york-rangers": "new_york_rangers",
  "ny-rangers": "new_york_rangers", "ottawa-senators": "ottawa_senators",
  "philadelphia-flyers": "philadelphia_flyers", "pittsburgh-penguins": "pittsburgh_penguins",
  "seattle-kraken": "seattle_kraken", "san-jose-sharks": "san_jose_sharks",
  "st-louis-blues": "st_louis_blues", "tampa-bay-lightning": "tampa_bay_lightning",
  "toronto-maple-leafs": "toronto_maple_leafs", "utah-mammoth": "utah_mammoth",
  "vancouver-canucks": "vancouver_canucks", "vegas-golden-knights": "vegas_golden_knights",
  "winnipeg-jets": "winnipeg_jets", "washington-capitals": "washington_capitals",
};

const VALID_DB_SLUGS = new Set(Object.values(ABBREV_TO_DB_SLUG));

// ── Step 1: DB Validation ─────────────────────────────────────────────────────
section("Step 1: Database Validation");

let db;
try {
  db = await mysql.createConnection(DB_URL);
  console.log(`${GREEN}✔${RESET} DB connection established`);
  passed++;
} catch (err) {
  console.log(`${RED}✘${RESET} DB connection failed: ${err.message}`);
  failed++;
  process.exit(1);
}

const [rows] = await db.execute(
  "SELECT abbrev, dbSlug, vsinSlug, nhlSlug, logoUrl, conference, division FROM nhl_teams ORDER BY conference, division, abbrev"
);
check("nhl_teams has 32 rows", rows.length === 32, `found ${rows.length}`);

// Check uniqueness by building sets
const dbSlugSet = new Set(rows.map(r => r.dbSlug));
const abbrevSet = new Set(rows.map(r => r.abbrev));
check("All 32 DB slugs are unique", dbSlugSet.size === 32, `${dbSlugSet.size} unique`);
check("All 32 abbreviations are unique", abbrevSet.size === 32, `${abbrevSet.size} unique`);

// Validate every DB slug matches our registry
let dbSlugMismatches = 0;
for (const row of rows) {
  const expected = ABBREV_TO_DB_SLUG[row.abbrev];
  if (!expected) {
    warn(`Unknown abbrev in DB: ${row.abbrev}`);
  } else if (row.dbSlug !== expected) {
    console.log(`${RED}✘${RESET} DB slug mismatch for ${row.abbrev}: DB="${row.dbSlug}" expected="${expected}"`);
    dbSlugMismatches++;
    failed++;
  }
}
check("All DB slugs match registry", dbSlugMismatches === 0, dbSlugMismatches === 0 ? "32/32 correct" : `${dbSlugMismatches} mismatches`);

// Validate logo URLs
const badLogos = rows.filter(r => !r.logoUrl || !r.logoUrl.includes("nhle.com"));
check("All 32 logo URLs point to nhle.com", badLogos.length === 0,
  badLogos.length === 0 ? "32/32 valid" : `${badLogos.length} invalid: ${badLogos.map(r => r.abbrev).join(", ")}`);

// Validate conferences
const eastern = rows.filter(r => r.conference === "EASTERN").length;
const western = rows.filter(r => r.conference === "WESTERN").length;
check("16 Eastern / 16 Western teams", eastern === 16 && western === 16, `E=${eastern} W=${western}`);

// Validate divisions
const divCounts = {};
for (const r of rows) divCounts[r.division] = (divCounts[r.division] ?? 0) + 1;
check("8 teams per division (4 divisions)", Object.values(divCounts).every(c => c === 8), JSON.stringify(divCounts));

// Validate vsinSlug format
const badVsinSlugs = rows.filter(r => !r.vsinSlug || !r.vsinSlug.includes("-"));
check("All 32 vsinSlugs are hyphenated", badVsinSlugs.length === 0,
  badVsinSlugs.length === 0 ? "32/32 valid" : `Invalid: ${badVsinSlugs.map(r => r.abbrev).join(", ")}`);

// Validate nhlSlug format
const badNhlSlugs = rows.filter(r => !r.nhlSlug || !r.nhlSlug.includes("-"));
check("All 32 nhlSlugs are hyphenated", badNhlSlugs.length === 0,
  badNhlSlugs.length === 0 ? "32/32 valid" : `Invalid: ${badNhlSlugs.map(r => r.abbrev).join(", ")}`);

// Print full table
console.log(`\n${CYAN}Full NHL Teams DB Table:${RESET}`);
console.log(`${"ABBREV".padEnd(8)} ${"DB_SLUG".padEnd(30)} ${"VSIN_SLUG".padEnd(30)} ${"CONF".padEnd(10)} ${"DIV".padEnd(14)} LOGO`);
console.log("-".repeat(110));
for (const r of rows) {
  const logoOk = r.logoUrl && r.logoUrl.includes("nhle.com") ? "✔" : "✘";
  console.log(`${r.abbrev.padEnd(8)} ${r.dbSlug.padEnd(30)} ${r.vsinSlug.padEnd(30)} ${r.conference.padEnd(10)} ${r.division.padEnd(14)} ${logoOk}`);
}

// ── Step 2: VSiN Authentication ───────────────────────────────────────────────
section("Step 2: VSiN Authentication");

check("VSIN_EMAIL env var set", !!VSIN_EMAIL, VSIN_EMAIL ? VSIN_EMAIL.substring(0, 5) + "..." : "MISSING");
check("VSIN_PASSWORD env var set", !!VSIN_PASSWORD, VSIN_PASSWORD ? "***" : "MISSING");

let vsinToken = null;
if (VSIN_EMAIL && VSIN_PASSWORD) {
  try {
    const loginRes = await axios.post(
      "https://auth.vsin.com/id/api/v1/identity/login/token?aid=N1owYIiApu&lang=en_US",
      {
        password: VSIN_PASSWORD,
        remember: true,
        login: VSIN_EMAIL,
        loginType: "email",
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Origin": "https://auth.vsin.com",
          "Referer": "https://auth.vsin.com/id/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      }
    );
    const loginData = loginRes.data;
    vsinToken = loginData?.access_token;
    check("VSiN Piano ID login successful", !!vsinToken,
      vsinToken ? `token=${vsinToken.substring(0, 16)}... expires_in=${loginData.expires_in}s` : `error=${JSON.stringify(loginData).substring(0, 100)}`);
  } catch (err) {
    const msg = err.response?.data ? JSON.stringify(err.response.data).substring(0, 100) : err.message;
    check("VSiN Piano ID login", false, msg);
  }
}

// ── Step 3: VSiN NHL Scraping ─────────────────────────────────────────────────
section("Step 3: VSiN NHL Betting Splits Scraping");

let vsinGames = [];
if (vsinToken) {
  try {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Cookie": `__utp=${vsinToken}`,
      "Referer": "https://data.vsin.com/",
    };
    const pageRes = await axios.get("https://data.vsin.com/nhl/betting-splits/", { headers });
    const html = pageRes.data;
    check("VSiN NHL page fetched", pageRes.status === 200, `HTTP ${pageRes.status}, ${html.length} bytes`);

    const $ = cheerio.load(html);
    const tableRows = $("table.freezetable tbody tr");
    console.log(`${CYAN}ℹ${RESET} Found ${tableRows.length} table rows on VSiN NHL page`);

    tableRows.each((i, row) => {
      const cells = $(row).find("td");
      if (cells.length < 8) return;

      const teamLink = $(cells[0]).find("a[href*='/nhl/teams/']");
      if (!teamLink.length) return;

      const href = teamLink.attr("href") ?? "";
      const vsinSlug = href.replace(/.*\/nhl\/teams\//, "").replace(/\/$/, "");
      const dbSlug = VSIN_SLUG_TO_DB_SLUG[vsinSlug] ?? vsinSlug.replace(/-/g, "_");

      const getText = (idx) => $(cells[idx]).text().trim();
      const parseNum = (s) => {
        const n = parseFloat(s.replace(/[^0-9.\-+]/g, ""));
        return isNaN(n) ? null : n;
      };
      const parsePct = (s) => {
        const n = parseFloat(s.replace("%", ""));
        return isNaN(n) ? null : n;
      };

      vsinGames.push({
        vsinSlug,
        dbSlug,
        awayML: parseNum(getText(1)),
        homeML: parseNum(getText(2)),
        total: parseNum(getText(3)),
        spreadAwayBetsPct: parsePct(getText(4)),
        spreadAwayMoneyPct: parsePct(getText(5)),
        totalOverBetsPct: parsePct(getText(6)),
        totalOverMoneyPct: parsePct(getText(7)),
        mlAwayBetsPct: cells.length > 8 ? parsePct(getText(8)) : null,
        mlAwayMoneyPct: cells.length > 9 ? parsePct(getText(9)) : null,
      });
    });

    check("VSiN NHL page has game rows", vsinGames.length > 0, `${vsinGames.length} team rows found`);

    // Validate all team slugs resolve to known DB slugs
    const unknownSlugs = vsinGames.filter(g => !VALID_DB_SLUGS.has(g.dbSlug));
    check("All VSiN team slugs map to valid DB slugs", unknownSlugs.length === 0,
      unknownSlugs.length === 0
        ? `${vsinGames.length} teams resolved`
        : `Unknown: ${unknownSlugs.map(g => g.vsinSlug).join(", ")}`);

    // Log sample games
    console.log(`\n${CYAN}VSiN NHL teams scraped today:${RESET}`);
    vsinGames.forEach(g => {
      console.log(`  ${g.vsinSlug.padEnd(30)} → ${g.dbSlug.padEnd(28)} | ML=${String(g.awayML ?? "?").padStart(5)} total=${String(g.total ?? "?").padStart(5)} spread%=${g.spreadAwayBetsPct ?? "?"}%`);
    });

  } catch (err) {
    const msg = err.response?.status ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data).substring(0, 100)}` : err.message;
    check("VSiN NHL scraping", false, msg);
  }
} else {
  warn("Skipping VSiN scraping — no token (credentials missing or login failed)");
}

// ── Step 4: NHL.com API Schedule ──────────────────────────────────────────────
section("Step 4: NHL.com API Schedule");

let nhlApiGames = [];
try {
  const schedRes = await axios.get("https://api-web.nhle.com/v1/schedule/now", {
    headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
  });
  check("NHL API responded", schedRes.status === 200, `HTTP ${schedRes.status}`);

  const schedData = schedRes.data;
  const gameWeek = schedData?.gameWeek ?? [];
  check("NHL API returned gameWeek array", Array.isArray(gameWeek), `${gameWeek.length} days`);

  for (const day of gameWeek) {
    const games = day?.games ?? [];
    for (const g of games) {
      const awayAbbrev = g.awayTeam?.abbrev;
      const homeAbbrev = g.homeTeam?.abbrev;
      const awayDbSlug = ABBREV_TO_DB_SLUG[awayAbbrev];
      const homeDbSlug = ABBREV_TO_DB_SLUG[homeAbbrev];
      const startTimeUTC = g.startTimeUTC;
      const gameDateEst = startTimeUTC
        ? new Date(new Date(startTimeUTC).getTime() - 5 * 3600000).toISOString().slice(0, 10)
        : day.date;

      nhlApiGames.push({
        gameId: g.id,
        gameDateEst,
        awayAbbrev, homeAbbrev,
        awayDbSlug, homeDbSlug,
        startTimeUTC,
        gameState: g.gameState,
        awayScore: g.awayTeam?.score ?? null,
        homeScore: g.homeTeam?.score ?? null,
      });
    }
  }

  check("NHL API returned games", nhlApiGames.length > 0, `${nhlApiGames.length} games in 7-day window`);

  // Validate all abbreviations map to known DB slugs
  const unknownAbbrevs = nhlApiGames.filter(g => !g.awayDbSlug || !g.homeDbSlug);
  check("All NHL API abbreviations map to DB slugs", unknownAbbrevs.length === 0,
    unknownAbbrevs.length === 0
      ? `${nhlApiGames.length} games fully mapped`
      : `Unknown: ${unknownAbbrevs.map(g => `${g.awayAbbrev}@${g.homeAbbrev}`).join(", ")}`);

  // Log today's games
  const today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const todayGames = nhlApiGames.filter(g => g.gameDateEst === today);
  console.log(`\n${CYAN}Today's NHL games (${today}) — ${todayGames.length} games:${RESET}`);
  if (todayGames.length === 0) {
    console.log(`  (no games today)`);
  } else {
    todayGames.forEach(g => {
      const score = g.awayScore !== null ? `${g.awayScore}-${g.homeScore}` : "N/A";
      console.log(`  ${g.awayAbbrev}(${g.awayDbSlug}) @ ${g.homeAbbrev}(${g.homeDbSlug}) | ${g.startTimeUTC?.slice(11, 16)} UTC | state=${g.gameState} | score=${score}`);
    });
  }

  // Log full 7-day schedule
  const byDate = {};
  for (const g of nhlApiGames) {
    if (!byDate[g.gameDateEst]) byDate[g.gameDateEst] = [];
    byDate[g.gameDateEst].push(g);
  }
  console.log(`\n${CYAN}7-day NHL schedule summary:${RESET}`);
  for (const [date, games] of Object.entries(byDate).sort()) {
    console.log(`  ${date}: ${games.length} games`);
  }

} catch (err) {
  const msg = err.response?.status ? `HTTP ${err.response.status}` : err.message;
  check("NHL API schedule fetch", false, msg);
}

// ── Step 5: Cross-Validation (VSiN ↔ NHL API) ─────────────────────────────────
section("Step 5: VSiN ↔ NHL API Cross-Validation");

if (vsinGames.length > 0 && nhlApiGames.length > 0) {
  const today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const todayNhlSlugsArr = nhlApiGames
    .filter(g => g.gameDateEst === today)
    .flatMap(g => [g.awayDbSlug, g.homeDbSlug])
    .filter(Boolean);
  const todayNhlSlugs = new Set(todayNhlSlugsArr);
  const vsinSlugsArr = vsinGames.map(g => g.dbSlug).filter(Boolean);
  const vsinSlugs = new Set(vsinSlugsArr);

  const inVsinNotApi = vsinSlugsArr.filter(s => !todayNhlSlugs.has(s));
  const inApiNotVsin = todayNhlSlugsArr.filter(s => !vsinSlugs.has(s));

  if (inVsinNotApi.length > 0) {
    warn(`Teams on VSiN but not in NHL API today (may be from other dates)`, inVsinNotApi.join(", "));
  } else {
    check("All VSiN teams found in NHL API schedule", true, `${vsinSlugs.size} teams matched`);
  }

  if (inApiNotVsin.length > 0) {
    warn(`Teams in NHL API today but not on VSiN (no odds posted yet)`, inApiNotVsin.join(", "));
  } else {
    check("All NHL API teams today have VSiN odds", true, `${todayNhlSlugs.size} teams matched`);
  }
} else {
  warn("Skipping cross-validation — insufficient data from one or both sources");
}

// ── Step 6: Existing NHL Games in DB ──────────────────────────────────────────
section("Step 6: Existing NHL Games in DB");

const today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
const [gameRows] = await db.execute(
  "SELECT id, gameDate, awayTeam, homeTeam, awayBookSpread, bookTotal, awayML, homeML, sport FROM games WHERE sport='NHL' ORDER BY gameDate DESC LIMIT 20"
);

check("NHL games table accessible", true, `${gameRows.length} recent NHL games in DB`);

if (gameRows.length > 0) {
  console.log(`\n${CYAN}Recent NHL games in DB:${RESET}`);
  gameRows.slice(0, 10).forEach(g => {
    const spread = g.awayBookSpread !== null ? g.awayBookSpread : "?";
    const total = g.bookTotal !== null ? g.bookTotal : "?";
    const ml = g.awayML !== null ? `${g.awayML}/${g.homeML}` : "?/?";
    console.log(`  [${g.gameDate}] ${g.awayTeam.padEnd(28)} @ ${g.homeTeam.padEnd(28)} | spread=${spread} total=${total} ML=${ml}`);
  });

  // Validate all stored teams are valid DB slugs
  const invalidTeams = gameRows.filter(
    g => !VALID_DB_SLUGS.has(g.awayTeam) || !VALID_DB_SLUGS.has(g.homeTeam)
  );
  check("All stored NHL game teams are valid DB slugs", invalidTeams.length === 0,
    invalidTeams.length === 0 ? `${gameRows.length} games valid` : `${invalidTeams.length} with invalid slugs`);

  // Check today's games specifically
  const todayDbGames = gameRows.filter(g => {
    const d = g.gameDate instanceof Date ? g.gameDate.toISOString().slice(0, 10) : String(g.gameDate).slice(0, 10);
    return d === today;
  });
  if (todayDbGames.length > 0) {
    check(`Today's NHL games in DB`, true, `${todayDbGames.length} games for ${today}`);
  } else {
    warn(`No NHL games in DB for today (${today}) — pipeline may not have run yet`);
  }
} else {
  warn("No NHL games in DB yet — pipeline has not run");
}

// ── Final Report ──────────────────────────────────────────────────────────────
section("Final Report");
console.log(`${BOLD}Checks: ${GREEN}${passed} passed${RESET}${BOLD}, ${RED}${failed} failed${RESET}${BOLD}, ${YELLOW}${warnings} warnings${RESET}`);

if (failed === 0) {
  console.log(`\n${GREEN}${BOLD}✔ ALL CHECKS PASSED — NHL pipeline is fully operational${RESET}`);
} else {
  console.log(`\n${RED}${BOLD}✘ ${failed} check(s) failed — see above for details${RESET}`);
}

await db.end();
process.exit(failed > 0 ? 1 : 0);
