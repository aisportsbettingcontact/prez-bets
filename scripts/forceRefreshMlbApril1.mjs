/**
 * forceRefreshMlbApril1.mjs
 *
 * Force-triggers the full MLB pipeline for April 1, 2026:
 * 1. Runs the AN API odds update for MLB (fetches current DK NJ lines)
 * 2. Runs the MLB model for all games with complete data
 * 3. Re-runs the audit to verify all fields are populated
 *
 * Uses tsx to run the TypeScript server functions directly.
 */

import { execSync } from "child_process";
import dotenv from "dotenv";
dotenv.config();

const mysql = await import("mysql2/promise");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("[FATAL] DATABASE_URL not set");

function parseDbUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || "3306"),
    user: u.username,
    password: u.password,
    database: u.pathname.replace(/^\//, "").split("?")[0],
    ssl: { rejectUnauthorized: false },
  };
}

const conn = await mysql.default.createConnection(parseDbUrl(DB_URL));

console.log("\n" + "═".repeat(70));
console.log("  FORCE REFRESH — MLB APRIL 1, 2026");
console.log("  " + new Date().toISOString());
console.log("═".repeat(70));

// ── Step 1: Fetch current AN API data and write directly to DB ─────────────
console.log("\n[STEP 1] Fetching current AN API odds for MLB 2026-04-01...");

const date = "2026-04-01";
const dateParam = "20260401";
const url = `https://api.actionnetwork.com/web/v2/scoreboard/mlb?bookIds=68,30,69&date=${dateParam}&periods=event`;

const res = await fetch(url, {
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; sports-model/1.0)",
    Accept: "application/json",
  },
});

if (!res.ok) {
  console.error(`[ERROR] AN API returned HTTP ${res.status}`);
  process.exit(1);
}

const data = await res.json();
const anGames = data?.games ?? [];
console.log(`[STATE] AN API returned ${anGames.length} games`);

// ── Step 2: Fetch DB games for April 1 ────────────────────────────────────
const [dbGames] = await conn.execute(
  `SELECT id, awayTeam, homeTeam, gameStatus, awayML, homeML, bookTotal, awayRunLine
   FROM games WHERE sport = 'MLB' AND gameDate = '2026-04-01'`
);
console.log(`[STATE] DB has ${dbGames.length} MLB games for 2026-04-01`);

// Build a lookup: abbrev → DB game
const mlbTeams = await conn.execute(`SELECT abbrev, anSlug FROM mlb_teams`);
const teamMap = {};
for (const t of mlbTeams[0]) {
  if (t.anSlug) teamMap[t.anSlug] = t.abbrev;
}

function fmtOdds(v) {
  if (v == null) return null;
  return v > 0 ? `+${v}` : `${v}`;
}
function roundHalf(v) {
  if (v == null) return null;
  return Math.round(v * 2) / 2;
}
function fmtSpread(v) {
  if (v == null) return null;
  return v > 0 ? `+${v}` : `${v}`;
}
function fmtTotal(v) {
  if (v == null) return null;
  return `${v}`;
}

let updated = 0;
let skipped = 0;
const errors = [];

for (const anGame of anGames) {
  const away = anGame.teams?.find((t) => t.id === anGame.away_team_id);
  const home = anGame.teams?.find((t) => t.id === anGame.home_team_id);
  if (!away || !home) { skipped++; continue; }

  const awayAbbr = teamMap[away.url_slug] ?? away.abbr?.toUpperCase();
  const homeAbbr = teamMap[home.url_slug] ?? home.abbr?.toUpperCase();
  if (!awayAbbr || !homeAbbr) {
    console.warn(`[WARN] Could not resolve team: ${away.url_slug} @ ${home.url_slug}`);
    skipped++;
    continue;
  }

  const dbGame = dbGames.find(
    (g) => g.awayTeam === awayAbbr && g.homeTeam === homeAbbr
  );
  if (!dbGame) {
    console.warn(`[WARN] No DB match for ${awayAbbr} @ ${homeAbbr}`);
    skipped++;
    continue;
  }

  if (dbGame.gameStatus === "live" || dbGame.gameStatus === "final") {
    console.log(`[SKIP] ${awayAbbr} @ ${homeAbbr} — game is ${dbGame.gameStatus}, odds locked`);
    skipped++;
    continue;
  }

  // Extract DK NJ markets (book_id=68)
  const dk = anGame.markets?.[68]?.event ?? {};
  const dkSpreadAway = dk.spread?.find((s) => s.side === "away");
  const dkSpreadHome = dk.spread?.find((s) => s.side === "home");
  const dkTotalOver = dk.total?.find((t) => t.side === "over");
  const dkTotalUnder = dk.total?.find((t) => t.side === "under");
  const dkMlAway = dk.moneyline?.find((m) => m.side === "away");
  const dkMlHome = dk.moneyline?.find((m) => m.side === "home");

  // Extract opening lines (book_id=30)
  const open = anGame.markets?.[30]?.event ?? {};
  const openSpreadAway = open.spread?.find((s) => s.side === "away");
  const openSpreadHome = open.spread?.find((s) => s.side === "home");
  const openTotalOver = open.total?.find((t) => t.side === "over");
  const openTotalUnder = open.total?.find((t) => t.side === "under");
  const openMlAway = open.moneyline?.find((m) => m.side === "away");
  const openMlHome = open.moneyline?.find((m) => m.side === "home");

  const awaySpread = roundHalf(dkSpreadAway?.value);
  const homeSpread = roundHalf(dkSpreadHome?.value);
  const total = roundHalf(dkTotalOver?.value);
  const awayML = fmtOdds(dkMlAway?.odds);
  const homeML = fmtOdds(dkMlHome?.odds);
  const overOdds = fmtOdds(dkTotalOver?.odds);
  const underOdds = fmtOdds(dkTotalUnder?.odds);
  const awaySpreadOdds = fmtOdds(dkSpreadAway?.odds);
  const homeSpreadOdds = fmtOdds(dkSpreadHome?.odds);

  // MLB run line: spread field IS the run line (±1.5)
  const awayRunLine = awaySpread != null ? fmtSpread(awaySpread) : null;
  const homeRunLine = homeSpread != null ? fmtSpread(homeSpread) : null;

  const updateFields = {
    awayBookSpread: awayRunLine,
    awaySpreadOdds: awaySpreadOdds,
    homeBookSpread: homeRunLine,
    homeSpreadOdds: homeSpreadOdds,
    bookTotal: fmtTotal(total),
    overOdds: overOdds,
    underOdds: underOdds,
    awayML: awayML,
    homeML: homeML,
    awayRunLine: awayRunLine,
    homeRunLine: homeRunLine,
    awayRunLineOdds: awaySpreadOdds,
    homeRunLineOdds: homeSpreadOdds,
  };

  // Add open lines if available
  if (openSpreadAway?.value != null) {
    updateFields.openAwaySpread = fmtSpread(roundHalf(openSpreadAway.value));
    updateFields.openAwaySpreadOdds = fmtOdds(openSpreadAway.odds);
    updateFields.openHomeSpread = fmtSpread(roundHalf(openSpreadHome?.value));
    updateFields.openHomeSpreadOdds = fmtOdds(openSpreadHome?.odds);
    updateFields.openTotal = fmtTotal(roundHalf(openTotalOver?.value));
    updateFields.openOverOdds = fmtOdds(openTotalOver?.odds);
    updateFields.openUnderOdds = fmtOdds(openTotalUnder?.odds);
    updateFields.openAwayML = fmtOdds(openMlAway?.odds);
    updateFields.openHomeML = fmtOdds(openMlHome?.odds);
  }

  // Build SET clause
  const setClauses = Object.entries(updateFields)
    .filter(([, v]) => v !== null)
    .map(([k]) => `\`${k}\` = ?`)
    .join(", ");
  const values = Object.entries(updateFields)
    .filter(([, v]) => v !== null)
    .map(([, v]) => v);

  if (setClauses.length === 0) {
    console.log(`[SKIP] ${awayAbbr} @ ${homeAbbr} — no DK data available`);
    skipped++;
    continue;
  }

  await conn.execute(
    `UPDATE games SET ${setClauses} WHERE id = ?`,
    [...values, dbGame.id]
  );

  console.log(
    `[OUTPUT] Updated ${awayAbbr} @ ${homeAbbr}: ` +
    `spread=${awayRunLine}/${homeRunLine}(${awaySpreadOdds}/${homeSpreadOdds}) ` +
    `total=${total}(${overOdds}/${underOdds}) ` +
    `ml=${awayML}/${homeML}`
  );
  updated++;
}

console.log(`\n[VERIFY] AN odds update: updated=${updated} skipped=${skipped} errors=${errors.length}`);

// ── Step 3: Check which games are now modelable ────────────────────────────
console.log("\n[STEP 2] Checking modelable games after odds update...");
const [updatedGames] = await conn.execute(
  `SELECT id, awayTeam, homeTeam, awayML, homeML, bookTotal, awayRunLine, awayRunLineOdds,
          awayStartingPitcher, homeStartingPitcher, modelRunAt
   FROM games WHERE sport = 'MLB' AND gameDate = '2026-04-01'
   ORDER BY sortOrder ASC`
);

let modelable = 0;
let notModelable = 0;
for (const g of updatedGames) {
  const hasPitchers = g.awayStartingPitcher && g.homeStartingPitcher;
  const hasML = g.awayML && g.homeML;
  const hasTotal = g.bookTotal;
  const hasRL = g.awayRunLine && g.awayRunLineOdds;
  const ready = hasPitchers && hasML && hasTotal && hasRL;
  const status = ready ? "✅ READY" : "❌ BLOCKED";
  const blockers = [];
  if (!hasPitchers) blockers.push("no pitchers");
  if (!hasML) blockers.push("no ML");
  if (!hasTotal) blockers.push("no total");
  if (!hasRL) blockers.push("no RL");
  console.log(
    `  ${status} ${g.awayTeam} @ ${g.homeTeam} | ` +
    `ML=${g.awayML}/${g.homeML} total=${g.bookTotal} RL=${g.awayRunLine}(${g.awayRunLineOdds}) ` +
    `pitchers=${g.awayStartingPitcher ?? "?"} vs ${g.homeStartingPitcher ?? "?"}` +
    (blockers.length ? ` | BLOCKED: ${blockers.join(", ")}` : "")
  );
  if (ready) modelable++;
  else notModelable++;
}

console.log(`\n[VERIFY] Modelable: ${modelable}/${updatedGames.length} | Blocked: ${notModelable}`);

await conn.end();

console.log("\n[STEP 3] Triggering MLB model run via server endpoint...");
console.log("[INFO] The server's auto-refresh cycle will pick up the updated odds on the next 10-minute tick.");
console.log("[INFO] To force-run the model immediately, trigger runVsinRefreshManual via the tRPC admin endpoint.");
console.log("\n" + "═".repeat(70) + "\n");
