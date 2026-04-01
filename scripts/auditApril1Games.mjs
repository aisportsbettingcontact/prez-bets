/**
 * auditApril1Games.mjs
 *
 * Deep audit of April 1, 2026 MLB games.
 * Uses exact DB column names confirmed from SHOW COLUMNS.
 */

import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

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

// ── Field definitions using exact DB column names ─────────────────────────────

const BOOK_ML_FIELDS = ["awayML", "homeML"];
const BOOK_SPREAD_FIELDS = ["awayBookSpread", "homeBookSpread", "awaySpreadOdds", "homeSpreadOdds"];
const BOOK_TOTAL_FIELDS = ["bookTotal", "overOdds", "underOdds"];
const BOOK_RL_FIELDS = ["awayRunLine", "homeRunLine", "awayRunLineOdds", "homeRunLineOdds"];

const MODEL_ML_FIELDS = ["modelAwayML", "modelHomeML"];
const MODEL_SPREAD_FIELDS = ["awayModelSpread", "homeModelSpread", "modelAwaySpreadOdds", "modelHomeSpreadOdds"];
const MODEL_TOTAL_FIELDS = ["modelTotal", "modelOverOdds", "modelUnderOdds"];

const PITCHER_FIELDS = ["awayStartingPitcher", "homeStartingPitcher"];

function isPopulated(val) {
  return val !== null && val !== undefined && val !== "" && val !== 0;
}

function fmt(val) {
  if (val === null || val === undefined || val === "") return "NULL";
  return String(val);
}

async function main() {
  const conn = await mysql.createConnection(parseDbUrl(DB_URL));

  console.log("\n" + "═".repeat(80));
  console.log("  MLB APRIL 1, 2026 — FULL GAME AUDIT");
  console.log("  " + new Date().toISOString());
  console.log("═".repeat(80));

  // ── Step 1: Fetch all April 1 MLB games ──────────────────────────────────
  const [games] = await conn.execute(
    `SELECT g.*,
            l.awayPitcherName, l.homePitcherName,
            l.awayPitcherConfirmed AS lAwayPitcherConfirmed,
            l.homePitcherConfirmed AS lHomePitcherConfirmed,
            l.awayLineupConfirmed, l.homeLineupConfirmed,
            l.lineupVersion, l.lineupHash, l.lineupModeledVersion,
            l.umpire, l.weatherTemp, l.weatherWind, l.weatherPrecip, l.weatherDome
     FROM games g
     LEFT JOIN mlb_lineups l ON l.gameId = g.id
     WHERE g.sport = 'MLB'
       AND g.gameDate = '2026-04-01'
     ORDER BY g.sortOrder ASC`
  );

  console.log(`\n[INPUT] Found ${games.length} MLB games for 2026-04-01\n`);

  if (games.length === 0) {
    console.log("[WARN] No April 1 MLB games found. Checking nearby dates...");
    const [nearby] = await conn.execute(
      `SELECT gameDate, COUNT(*) as cnt FROM games
       WHERE sport = 'MLB' AND gameDate BETWEEN '2026-03-29' AND '2026-04-04'
       GROUP BY gameDate ORDER BY gameDate`
    );
    console.log("[STATE] Nearby MLB game dates:", nearby);
    await conn.end();
    return;
  }

  // ── Step 2: Per-game field audit ─────────────────────────────────────────
  const summary = {
    total: games.length,
    fullyModeled: 0,
    gamesWithMissingBookML: [],
    gamesWithMissingBookSpread: [],
    gamesWithMissingBookTotal: [],
    gamesWithMissingBookRL: [],
    gamesWithMissingModelML: [],
    gamesWithMissingModelSpread: [],
    gamesWithMissingModelTotal: [],
    gamesWithMissingPitchers: [],
    readyToModel: [],
    notReadyToModel: [],
  };

  for (const game of games) {
    const label = `${game.awayTeam} @ ${game.homeTeam}`;
    const time = game.startTimeEst ?? "TBD";
    console.log("\n" + "─".repeat(70));
    console.log(`[GAME] id=${game.id} | ${label} | ${time} | venue=${game.venue ?? "?"}`);
    console.log(`       gameDate=${game.gameDate} | gameStatus=${game.gameStatus ?? "PRE"} | publishedToFeed=${game.publishedToFeed}`);

    // ── Pitcher / lineup status ───────────────────────────────────────────
    console.log("\n  [PITCHERS & LINEUP]");
    // Pitchers come from games table (awayStartingPitcher/homeStartingPitcher)
    // and also from mlb_lineups (awayPitcherName/homePitcherName)
    const awayP = game.awayStartingPitcher || game.awayPitcherName;
    const homeP = game.homeStartingPitcher || game.homePitcherName;
    console.log(`    games.awayStartingPitcher = ${fmt(game.awayStartingPitcher)}`);
    console.log(`    games.homeStartingPitcher = ${fmt(game.homeStartingPitcher)}`);
    console.log(`    mlb_lineups.awayPitcherName = ${fmt(game.awayPitcherName)}`);
    console.log(`    mlb_lineups.homePitcherName = ${fmt(game.homePitcherName)}`);
    console.log(`    awayLineupConfirmed = ${game.awayLineupConfirmed ?? false}`);
    console.log(`    homeLineupConfirmed = ${game.homeLineupConfirmed ?? false}`);
    console.log(`    lineupVersion = ${game.lineupVersion ?? 0}`);
    console.log(`    lineupModeledVersion = ${game.lineupModeledVersion ?? 0}`);
    console.log(`    umpire = ${fmt(game.umpire)}`);
    console.log(`    weather: ${game.weatherTemp ?? "?"}°F | wind=${game.weatherWind ?? "?"} | precip=${game.weatherPrecip ?? "?"} | dome=${game.weatherDome ?? false}`);

    const hasPitchers = isPopulated(awayP) && isPopulated(homeP);
    if (!hasPitchers) summary.gamesWithMissingPitchers.push(label);

    // ── Book lines audit ──────────────────────────────────────────────────
    console.log("\n  [BOOK LINES — MONEYLINE]");
    const missingBookML = [];
    for (const f of BOOK_ML_FIELDS) {
      const ok = isPopulated(game[f]);
      console.log(`    ${ok ? "✅" : "❌"} ${f.padEnd(20)} = ${fmt(game[f])}`);
      if (!ok) missingBookML.push(f);
    }

    console.log("\n  [BOOK LINES — SPREAD]");
    const missingBookSpread = [];
    for (const f of BOOK_SPREAD_FIELDS) {
      const ok = isPopulated(game[f]);
      console.log(`    ${ok ? "✅" : "❌"} ${f.padEnd(20)} = ${fmt(game[f])}`);
      if (!ok) missingBookSpread.push(f);
    }

    console.log("\n  [BOOK LINES — TOTAL]");
    const missingBookTotal = [];
    for (const f of BOOK_TOTAL_FIELDS) {
      const ok = isPopulated(game[f]);
      console.log(`    ${ok ? "✅" : "❌"} ${f.padEnd(20)} = ${fmt(game[f])}`);
      if (!ok) missingBookTotal.push(f);
    }

    console.log("\n  [BOOK LINES — RUN LINE]");
    const missingBookRL = [];
    for (const f of BOOK_RL_FIELDS) {
      const ok = isPopulated(game[f]);
      console.log(`    ${ok ? "✅" : "❌"} ${f.padEnd(22)} = ${fmt(game[f])}`);
      if (!ok) missingBookRL.push(f);
    }

    // ── Model outputs audit ───────────────────────────────────────────────
    console.log("\n  [MODEL OUTPUTS — MONEYLINE]");
    const missingModelML = [];
    for (const f of MODEL_ML_FIELDS) {
      const ok = isPopulated(game[f]);
      console.log(`    ${ok ? "✅" : "❌"} ${f.padEnd(22)} = ${fmt(game[f])}`);
      if (!ok) missingModelML.push(f);
    }

    console.log("\n  [MODEL OUTPUTS — RUN LINE (spread)]");
    const missingModelSpread = [];
    for (const f of MODEL_SPREAD_FIELDS) {
      const ok = isPopulated(game[f]);
      console.log(`    ${ok ? "✅" : "❌"} ${f.padEnd(26)} = ${fmt(game[f])}`);
      if (!ok) missingModelSpread.push(f);
    }

    console.log("\n  [MODEL OUTPUTS — TOTAL]");
    const missingModelTotal = [];
    for (const f of MODEL_TOTAL_FIELDS) {
      const ok = isPopulated(game[f]);
      console.log(`    ${ok ? "✅" : "❌"} ${f.padEnd(22)} = ${fmt(game[f])}`);
      if (!ok) missingModelTotal.push(f);
    }

    // ── Additional model fields ───────────────────────────────────────────
    console.log("\n  [MODEL OUTPUTS — ADDITIONAL]");
    const extraFields = ["modelAwayScore", "modelHomeScore", "modelAwayWinPct", "modelHomeWinPct",
                         "modelOverRate", "modelUnderRate", "modelRunAt"];
    for (const f of extraFields) {
      const ok = isPopulated(game[f]);
      console.log(`    ${ok ? "✅" : "ℹ️ "} ${f.padEnd(22)} = ${fmt(game[f])}`);
    }

    // ── Readiness verdict ─────────────────────────────────────────────────
    const hasBookLines = missingBookML.length === 0 && missingBookSpread.length === 0 &&
                         missingBookTotal.length === 0 && missingBookRL.length === 0;
    const hasModelOutputs = missingModelML.length === 0 && missingModelSpread.length === 0 &&
                            missingModelTotal.length === 0;
    const isModelable = hasPitchers && hasBookLines;

    console.log(`\n  [VERDICT]`);
    console.log(`    Pitchers present:    ${hasPitchers ? "✅ YES" : "❌ NO"}`);
    console.log(`    Book lines complete: ${hasBookLines ? "✅ YES" : "❌ NO"}`);
    console.log(`    Model outputs full:  ${hasModelOutputs ? "✅ YES" : "❌ NO"}`);
    console.log(`    Ready to model:      ${isModelable ? "✅ YES" : "❌ NO"}`);
    if (!isModelable) {
      const blockers = [];
      if (!hasPitchers) blockers.push("missing pitchers");
      if (missingBookML.length) blockers.push("ML: " + missingBookML.join(","));
      if (missingBookSpread.length) blockers.push("spread: " + missingBookSpread.join(","));
      if (missingBookTotal.length) blockers.push("total: " + missingBookTotal.join(","));
      if (missingBookRL.length) blockers.push("RL: " + missingBookRL.join(","));
      console.log(`    Blockers: ${blockers.join(" | ")}`);
    }

    // ── Accumulate summary ────────────────────────────────────────────────
    if (missingBookML.length) summary.gamesWithMissingBookML.push({ label, missing: missingBookML });
    if (missingBookSpread.length) summary.gamesWithMissingBookSpread.push({ label, missing: missingBookSpread });
    if (missingBookTotal.length) summary.gamesWithMissingBookTotal.push({ label, missing: missingBookTotal });
    if (missingBookRL.length) summary.gamesWithMissingBookRL.push({ label, missing: missingBookRL });
    if (missingModelML.length) summary.gamesWithMissingModelML.push({ label, missing: missingModelML });
    if (missingModelSpread.length) summary.gamesWithMissingModelSpread.push({ label, missing: missingModelSpread });
    if (missingModelTotal.length) summary.gamesWithMissingModelTotal.push({ label, missing: missingModelTotal });

    if (isModelable) summary.readyToModel.push(label);
    else summary.notReadyToModel.push(label);

    if (hasModelOutputs) summary.fullyModeled++;
  }

  // ── Step 3: Global summary ────────────────────────────────────────────────
  console.log("\n\n" + "═".repeat(80));
  console.log("  AUDIT SUMMARY — APRIL 1, 2026 MLB");
  console.log("═".repeat(80));
  console.log(`\n  Total games:           ${summary.total}`);
  console.log(`  Fully modeled:         ${summary.fullyModeled} / ${summary.total}`);
  console.log(`  Ready to model:        ${summary.readyToModel.length} / ${summary.total}`);
  console.log(`  Blocked (no data):     ${summary.notReadyToModel.length}`);

  const sections = [
    ["BOOK ML",     summary.gamesWithMissingBookML],
    ["BOOK SPREAD", summary.gamesWithMissingBookSpread],
    ["BOOK TOTAL",  summary.gamesWithMissingBookTotal],
    ["BOOK RL",     summary.gamesWithMissingBookRL],
    ["MODEL ML",    summary.gamesWithMissingModelML],
    ["MODEL SPREAD",summary.gamesWithMissingModelSpread],
    ["MODEL TOTAL", summary.gamesWithMissingModelTotal],
    ["PITCHERS",    summary.gamesWithMissingPitchers.map(l => ({ label: l, missing: [] }))],
  ];

  for (const [name, list] of sections) {
    if (list.length > 0) {
      console.log(`\n  ❌ MISSING ${name} (${list.length} games):`);
      for (const g of list) {
        const missingStr = g.missing?.length ? ` — missing: ${g.missing.join(", ")}` : "";
        console.log(`     • ${g.label || g}${missingStr}`);
      }
    } else {
      console.log(`  ✅ ${name}: all games complete`);
    }
  }

  console.log("\n" + "═".repeat(80) + "\n");

  await conn.end();
}

main().catch(err => {
  console.error("[FATAL]", err.message);
  process.exit(1);
});
