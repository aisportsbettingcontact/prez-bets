/**
 * Deep debug script for the AN HTML parser.
 * Tests the parser against the actual downloaded HTML files and the pasted UConn HTML.
 * Logs every cell, every span, every extracted value for maximum visibility.
 */

import * as cheerio from "cheerio";
import { readFileSync } from "fs";
import { parseAnAllMarketsHtml, type AnParsedGame, type AnSport } from "./server/anHtmlParser.js";

// ─── Helper: pretty-print a parsed game ──────────────────────────────────────

function printGame(g: AnParsedGame, index: number) {
  console.log(`\n  [${index + 1}] ${g.awayName} (${g.awayAbbr}) @ ${g.homeName} (${g.homeAbbr})`);
  console.log(`      URL: ${g.gameUrl}`);
  console.log(`      ROT: ${g.awayRot} / ${g.homeRot}`);
  console.log(`      Open Spread:  away=${JSON.stringify(g.openAwaySpread)}  home=${JSON.stringify(g.openHomeSpread)}`);
  console.log(`      DK   Spread:  away=${JSON.stringify(g.dkAwaySpread)}  home=${JSON.stringify(g.dkHomeSpread)}`);
  console.log(`      Open Total:   over=${JSON.stringify(g.openOver)}  under=${JSON.stringify(g.openUnder)}`);
  console.log(`      DK   Total:   over=${JSON.stringify(g.dkOver)}  under=${JSON.stringify(g.dkUnder)}`);
  console.log(`      Open ML:      away=${JSON.stringify(g.openAwayML)}  home=${JSON.stringify(g.openHomeML)}`);
  console.log(`      DK   ML:      away=${JSON.stringify(g.dkAwayML)}  home=${JSON.stringify(g.dkHomeML)}`);

  // Flag missing data
  const missing: string[] = [];
  if (!g.openAwaySpread) missing.push("openAwaySpread");
  if (!g.openHomeSpread) missing.push("openHomeSpread");
  if (!g.openOver) missing.push("openOver");
  if (!g.openUnder) missing.push("openUnder");
  if (!g.openAwayML) missing.push("openAwayML");
  if (!g.openHomeML) missing.push("openHomeML");
  if (!g.dkAwaySpread) missing.push("dkAwaySpread");
  if (!g.dkHomeSpread) missing.push("dkHomeSpread");
  if (!g.dkOver) missing.push("dkOver");
  if (!g.dkUnder) missing.push("dkUnder");
  if (!g.dkAwayML) missing.push("dkAwayML");
  if (!g.dkHomeML) missing.push("dkHomeML");
  if (missing.length > 0) {
    console.log(`      ⚠️  MISSING: ${missing.join(", ")}`);
  }
}

// ─── Deep cell-level debugger ─────────────────────────────────────────────────

function deepDebugRow(html: string, sport: AnSport, dkColIndex: number, rowIndex: number) {
  const $ = cheerio.load("<table>" + html + "</table>");
  const rows = $("tr").toArray();
  if (rowIndex >= rows.length) {
    console.log(`Row ${rowIndex} does not exist (only ${rows.length} rows)`);
    return;
  }
  const row = rows[rowIndex];
  const cells = $(row).find("> td").toArray();
  console.log(`\n=== Deep debug: row ${rowIndex}, ${cells.length} cells ===`);

  cells.forEach((cell, ci) => {
    const isOpen = ci === 1;
    const isDK = ci === dkColIndex;
    const label = isOpen ? "[OPEN]" : isDK ? "[DK]" : `[col${ci}]`;

    if (isOpen || isDK) {
      console.log(`\n  Cell ${ci} ${label}:`);
      console.log(`    Raw HTML: ${$(cell).html()?.substring(0, 400)}`);

      if (isOpen) {
        const openCells = $(cell).find(".best-odds__open-cell").toArray();
        openCells.forEach((oc, oi) => {
          const allDivs = $(oc).children("div").toArray();
          const secondary = $(oc).find(".best-odds__open-cell-secondary");
          const lineDiv = allDivs.find(d => !$(d).hasClass("best-odds__open-cell-secondary"));
          const line = lineDiv ? $(lineDiv).text().trim() : "(no line div)";
          const juice = secondary.find("div").first().text().trim();
          console.log(`    open-cell[${oi}]: line="${line}" juice="${juice}"`);
        });
      }

      if (isDK) {
        const wrappers = $(cell).find(".best-odds__odds-container > div").toArray();
        console.log(`    DK wrappers: ${wrappers.length}`);
        wrappers.forEach((wrapper, wi) => {
          const oddsDiv = $(wrapper).find('[data-testid="book-cell__odds"]');
          const isNA = oddsDiv.find(".css-1db6njd").length > 0;
          const allSpans = oddsDiv.find("span").toArray();
          const filteredSpans = allSpans.filter(s => $(s).find("svg").length === 0 && $(s).find("picture").length === 0);
          const texts = filteredSpans.map(s => $(s).text().trim()).filter(t => t && t !== "N/A");
          console.log(`    wrapper[${wi}]: isNA=${isNA} allSpans=${allSpans.length} filteredSpans=${filteredSpans.length} texts=${JSON.stringify(texts)}`);
        });
      }
    }
  });
}

// ─── Test 1: Parse the pasted UConn @ St. John's HTML ────────────────────────

console.log("\n" + "═".repeat(80));
console.log("TEST 1: Pasted UConn @ St. John's HTML (pasted_content_2.txt)");
console.log("═".repeat(80));

const pastedHtml = readFileSync("/home/ubuntu/upload/pasted_content_2.txt", "utf-8");
const pastedResult = parseAnAllMarketsHtml(pastedHtml, "ncaab");
console.log(`\nDK column index: ${pastedResult.dkColumnIndex}`);
console.log(`Games parsed: ${pastedResult.games.length}`);
console.log(`Warnings: ${pastedResult.warnings.join(", ") || "none"}`);
pastedResult.games.forEach((g, i) => printGame(g, i));

// Deep debug the spread row (row 0)
deepDebugRow(pastedHtml, "ncaab", pastedResult.dkColumnIndex, 0);

// ─── Test 2: Parse the full NCAAB HTML file ───────────────────────────────────

console.log("\n\n" + "═".repeat(80));
console.log("TEST 2: Full NCAAB HTML (/home/ubuntu/Downloads/ncaab_odds.html)");
console.log("═".repeat(80));

try {
  const ncaabHtml = readFileSync("/home/ubuntu/Downloads/ncaab_odds.html", "utf-8");
  const ncaabResult = parseAnAllMarketsHtml(ncaabHtml, "ncaab");
  console.log(`\nDK column index: ${ncaabResult.dkColumnIndex}`);
  console.log(`Games parsed: ${ncaabResult.games.length}`);
  console.log(`Warnings: ${ncaabResult.warnings.join(", ") || "none"}`);
  ncaabResult.games.forEach((g, i) => printGame(g, i));

  // Count missing fields
  let gamesWithAllDK = 0, gamesWithAllOpen = 0, gamesWithAllML = 0;
  for (const g of ncaabResult.games) {
    if (g.dkAwaySpread && g.dkHomeSpread && g.dkOver && g.dkUnder) gamesWithAllDK++;
    if (g.openAwaySpread && g.openHomeSpread && g.openOver && g.openUnder) gamesWithAllOpen++;
    if (g.dkAwayML && g.dkHomeML) gamesWithAllML++;
  }
  console.log(`\nSummary: ${ncaabResult.games.length} games | ${gamesWithAllDK} with full DK spread+total | ${gamesWithAllOpen} with full Open | ${gamesWithAllML} with DK ML`);
} catch (e) {
  console.log(`NCAAB HTML file not found: ${e}`);
}

// ─── Test 3: Parse the full NBA HTML file ────────────────────────────────────

console.log("\n\n" + "═".repeat(80));
console.log("TEST 3: Full NBA HTML (/home/ubuntu/Downloads/nba_odds.html)");
console.log("═".repeat(80));

try {
  const nbaHtml = readFileSync("/home/ubuntu/Downloads/nba_odds.html", "utf-8");
  const nbaResult = parseAnAllMarketsHtml(nbaHtml, "nba");
  console.log(`\nDK column index: ${nbaResult.dkColumnIndex}`);
  console.log(`Games parsed: ${nbaResult.games.length}`);
  console.log(`Warnings: ${nbaResult.warnings.join(", ") || "none"}`);
  nbaResult.games.forEach((g, i) => printGame(g, i));

  let gamesWithAllDK = 0, gamesWithAllML = 0;
  for (const g of nbaResult.games) {
    if (g.dkAwaySpread && g.dkHomeSpread && g.dkOver && g.dkUnder) gamesWithAllDK++;
    if (g.dkAwayML && g.dkHomeML) gamesWithAllML++;
  }
  console.log(`\nSummary: ${nbaResult.games.length} games | ${gamesWithAllDK} with full DK spread+total | ${gamesWithAllML} with DK ML`);
} catch (e) {
  console.log(`NBA HTML file not found: ${e}`);
}

// ─── Test 4: Parse the full NHL HTML file ────────────────────────────────────

console.log("\n\n" + "═".repeat(80));
console.log("TEST 4: Full NHL HTML (/home/ubuntu/Downloads/nhl_odds.html)");
console.log("═".repeat(80));

try {
  const nhlHtml = readFileSync("/home/ubuntu/Downloads/nhl_odds.html", "utf-8");
  const nhlResult = parseAnAllMarketsHtml(nhlHtml, "nhl");
  console.log(`\nDK column index: ${nhlResult.dkColumnIndex}`);
  console.log(`Games parsed: ${nhlResult.games.length}`);
  console.log(`Warnings: ${nhlResult.warnings.join(", ") || "none"}`);
  nhlResult.games.forEach((g, i) => printGame(g, i));

  let gamesWithAllDK = 0, gamesWithAllML = 0;
  for (const g of nhlResult.games) {
    if (g.dkAwaySpread && g.dkHomeSpread && g.dkOver && g.dkUnder) gamesWithAllDK++;
    if (g.dkAwayML && g.dkHomeML) gamesWithAllML++;
  }
  console.log(`\nSummary: ${nhlResult.games.length} games | ${gamesWithAllDK} with full DK spread+total | ${gamesWithAllML} with DK ML`);
} catch (e) {
  console.log(`NHL HTML file not found: ${e}`);
}
