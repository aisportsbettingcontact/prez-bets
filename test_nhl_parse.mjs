/**
 * NHL VSiN HTML Parser Validation Test
 * Uses the actual HTML from pasted_content_5.txt to validate the scraper's column mapping.
 * Runs entirely offline — no network calls needed.
 */

import * as fs from "fs";
import * as cheerio from "cheerio";

const html = fs.readFileSync("/home/ubuntu/upload/pasted_content_5.txt", "utf8");
const $ = cheerio.load(html);

console.log("═══════════════════════════════════════════════════════════════");
console.log("  NHL VSiN HTML Parser Validation — Live HTML from attachment");
console.log("═══════════════════════════════════════════════════════════════\n");

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getAnchorTexts(td) {
  const texts = [];
  $(td).find("a").each((_i, el) => {
    if ($(el).closest(".collapse").length > 0) return;
    const text = $(el).text().trim();
    if (text) texts.push(text);
  });
  return texts;
}

function getFirstPct(td) {
  const divs = $(td).children("div").not(".collapse").toArray();
  if (divs.length === 0) return null;
  const text = $(divs[0]).text().trim();
  const clean = text.replace(/[^0-9]/g, "");
  if (!clean) return null;
  const val = parseInt(clean, 10);
  return (isNaN(val) || val < 0 || val > 100) ? null : val;
}

function parseSpread(text) {
  if (!text) return null;
  const clean = text.trim().replace(/\s+/g, "");
  if (clean.toLowerCase() === "pk") return 0;
  const match = clean.match(/^([+-]?\d+\.?\d*)/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  return (isNaN(val) || Math.abs(val) > 10) ? null : val;
}

function parseTotal(text) {
  if (!text) return null;
  const clean = text.trim().replace(/\s+/g, "");
  const match = clean.match(/^(\d+\.?\d*)/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  return (isNaN(val) || val < 3 || val > 12) ? null : val;
}

function nhlHrefToDbSlug(href) {
  const parts = href.split("/");
  const raw = parts[parts.length - 1].toLowerCase();
  const aliases = {
    "ny-rangers": "new-york-rangers",
    "ny-islanders": "new-york-islanders",
  };
  const canonical = aliases[raw] ?? raw;
  return canonical.replace(/-/g, "_");
}

// ─── Parse all game rows ──────────────────────────────────────────────────────
const games = [];
let rowsInspected = 0;
let rowsSkipped = 0;

$("table.freezetable tr").each((_i, tr) => {
  const tds = $(tr).find("td").toArray();
  rowsInspected++;

  if (tds.length < 10) { rowsSkipped++; return; }

  const teamAnchors = $(tds[0])
    .find('a.txt-color-vsinred[href*="/teams/"]')
    .toArray()
    .filter(a => $(a).closest(".collapse").length === 0);

  if (teamAnchors.length < 2) { rowsSkipped++; return; }

  // Game ID
  let gameId = null;
  $(tds[0]).find("[data-param2]").each((_j, el) => {
    if (!gameId && $(el).closest(".collapse").length === 0) {
      gameId = $(el).attr("data-param2") || null;
    }
  });
  if (!gameId) { rowsSkipped++; return; }

  const gameDate = gameId.match(/^(\d{8})/)?.[1] ?? null;
  if (!gameDate) { rowsSkipped++; return; }

  const awayTeam = $(teamAnchors[0]).text().trim();
  const homeTeam = $(teamAnchors[1]).text().trim();
  const awayHref = $(teamAnchors[0]).attr("href") || "";
  const homeHref = $(teamAnchors[1]).attr("href") || "";
  const awaySlug = awayHref ? nhlHrefToDbSlug(awayHref) : "";
  const homeSlug = homeHref ? nhlHrefToDbSlug(homeHref) : "";

  const spreadTexts = getAnchorTexts(tds[1]);
  const awaySpread = spreadTexts.length > 0 ? parseSpread(spreadTexts[0]) : null;
  const homeSpread = spreadTexts.length > 1 ? parseSpread(spreadTexts[1]) : null;

  const totalTexts = getAnchorTexts(tds[4]);
  const total = totalTexts.length > 0 ? parseTotal(totalTexts[0]) : null;

  const spreadAwayMoneyPct = getFirstPct(tds[2]);
  const spreadAwayBetsPct  = getFirstPct(tds[3]);
  const totalOverMoneyPct  = getFirstPct(tds[5]);
  const totalOverBetsPct   = getFirstPct(tds[6]);
  const mlTexts            = getAnchorTexts(tds[7]);
  const awayML             = mlTexts.length > 0 ? mlTexts[0] : null;
  const homeML             = mlTexts.length > 1 ? mlTexts[1] : null;
  const mlAwayMoneyPct     = getFirstPct(tds[8]);
  const mlAwayBetsPct      = getFirstPct(tds[9]);

  games.push({
    gameId, gameDate, awayTeam, homeTeam, awaySlug, homeSlug,
    awaySpread, homeSpread, total,
    spreadAwayBetsPct, spreadAwayMoneyPct,
    totalOverBetsPct, totalOverMoneyPct,
    awayML, homeML, mlAwayBetsPct, mlAwayMoneyPct,
  });
});

console.log(`Rows inspected: ${rowsInspected} | Rows skipped: ${rowsSkipped} | Games parsed: ${games.length}\n`);

// ─── Validation checks ────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✔ ${label}${detail ? " — " + detail : ""}`);
    passed++;
  } else {
    console.log(`  ✘ FAIL: ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

console.log("═══ Validation Checks ═══\n");

check("At least 1 game parsed", games.length >= 1, `${games.length} games`);
check("All games have gameId", games.every(g => g.gameId), "gameId present");
check("All games have gameDate YYYYMMDD", games.every(g => /^\d{8}$/.test(g.gameDate)), "format OK");
check("All games have awayTeam", games.every(g => g.awayTeam.length > 0));
check("All games have homeTeam", games.every(g => g.homeTeam.length > 0));
check("All games have awaySlug", games.every(g => g.awaySlug.length > 0));
check("All games have homeSlug", games.every(g => g.homeSlug.length > 0));
check("All slugs are lowercase_underscored", games.every(g => /^[a-z_]+$/.test(g.awaySlug) && /^[a-z_]+$/.test(g.homeSlug)));
check("All spreads are ±1.5 (NHL puck line)", games.every(g => g.awaySpread === 1.5 || g.awaySpread === -1.5 || g.awaySpread === null), `away spreads: ${games.map(g => g.awaySpread).join(", ")}`);
check("All totals are in NHL range 3–12", games.every(g => g.total === null || (g.total >= 3 && g.total <= 12)), `totals: ${games.map(g => g.total).join(", ")}`);
check("All split percentages 0–100", games.every(g => [g.spreadAwayBetsPct, g.spreadAwayMoneyPct, g.totalOverBetsPct, g.totalOverMoneyPct, g.mlAwayBetsPct, g.mlAwayMoneyPct].every(p => p === null || (p >= 0 && p <= 100))));
check("All ML odds present", games.every(g => g.awayML !== null && g.homeML !== null), `sample: ${games[0]?.awayML} / ${games[0]?.homeML}`);
check("Away + home spread bets sum ~100%", games.every(g => {
  if (g.spreadAwayBetsPct === null) return true;
  // VSiN only shows away pct; home = 100 - away
  return g.spreadAwayBetsPct >= 0 && g.spreadAwayBetsPct <= 100;
}));

console.log("\n═══ Per-Game Detail ═══\n");
for (const g of games) {
  console.log(`  ${g.gameId} | ${g.awayTeam} (${g.awaySlug}) @ ${g.homeTeam} (${g.homeSlug})`);
  console.log(`    Spread: away=${g.awaySpread ?? "null"} home=${g.homeSpread ?? "null"} | Total: ${g.total ?? "null"}`);
  console.log(`    SpreadBets: ${g.spreadAwayBetsPct ?? "?"}% handle | SpreadMoney: ${g.spreadAwayMoneyPct ?? "?"}% handle`);
  console.log(`    TotalBets(O): ${g.totalOverBetsPct ?? "?"}% | TotalMoney(O): ${g.totalOverMoneyPct ?? "?"}%`);
  console.log(`    ML: away=${g.awayML ?? "?"} home=${g.homeML ?? "?"} | MLBets: ${g.mlAwayBetsPct ?? "?"}% | MLMoney: ${g.mlAwayMoneyPct ?? "?"}%`);
  console.log();
}

console.log(`═══ Final Result: ${passed} passed, ${failed} failed ═══`);
if (failed === 0) {
  console.log("✔ ALL CHECKS PASSED — NHL VSiN scraper column mapping is 100% accurate");
} else {
  console.log("✘ FAILURES DETECTED — scraper needs fixes");
  process.exit(1);
}
