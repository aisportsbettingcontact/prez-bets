/**
 * validateSplits.mjs
 *
 * Live cross-reference: scrapes VSiN NCAAM + NBA betting splits pages
 * and compares every game + splits value against the database.
 *
 * Run: node scripts/validateSplits.mjs
 */

import { createConnection } from "mysql2/promise";
import * as cheerio from "cheerio";
import dotenv from "dotenv";
dotenv.config();

const VSIN_EMAIL = process.env.VSIN_EMAIL;
const VSIN_PASSWORD = process.env.VSIN_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getToken() {
  const resp = await fetch(
    "https://auth.vsin.com/id/api/v1/identity/login/token?aid=N1owYIiApu&lang=en_US",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: VSIN_PASSWORD, remember: true, login: VSIN_EMAIL, loginType: "email" }),
    }
  );
  if (!resp.ok) throw new Error(`Login failed: ${resp.status}`);
  const data = await resp.json();
  if (!data.access_token) throw new Error("No token returned");
  return data.access_token;
}

async function fetchPage(url, token) {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Cookie": `__utp=${token}`,
      "Accept": "text/html,application/xhtml+xml",
    },
  });
  if (!resp.ok) throw new Error(`Page fetch failed: ${resp.status}`);
  return resp.text();
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parsePct(text) {
  if (!text) return null;
  const clean = text.trim().replace(/[^0-9]/g, "");
  if (!clean) return null;
  const val = parseInt(clean, 10);
  return isNaN(val) || val < 0 || val > 100 ? null : val;
}

function getFirstPct($, td) {
  const divs = $(td).children("div").not(".collapse").toArray();
  if (divs.length === 0) return null;
  return parsePct($(divs[0]).text().trim());
}

function getAnchorTexts($, td) {
  const texts = [];
  $(td).find("a").each((_i, el) => {
    if ($(el).closest(".collapse").length > 0) return;
    const text = $(el).text().trim();
    if (text) texts.push(text);
  });
  return texts;
}

function extractGameDate(gameId) {
  const match = gameId?.match(/^(\d{8})/);
  return match ? match[1] : null;
}

function hrefToSlug(href, sport) {
  const parts = href.split("/");
  const raw = parts[parts.length - 1].toLowerCase();
  // NBA aliases
  const aliases = { "la-clippers": "los-angeles-clippers", "la-lakers": "los-angeles-lakers" };
  const canonical = aliases[raw] ?? raw;
  return canonical.replace(/-/g, "_");
}

function parseSpread(text) {
  if (!text) return null;
  const clean = text.trim().replace(/\s+/g, "");
  if (clean.toLowerCase() === "pk" || clean.toLowerCase() === "pick") return 0;
  const match = clean.match(/^([+-]?\d+\.?\d*)/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  return isNaN(val) || Math.abs(val) > 60 ? null : val;
}

function parseTotal(text, sport) {
  if (!text) return null;
  const clean = text.trim().replace(/\s+/g, "");
  const match = clean.match(/^(\d{2,3}\.?\d*)/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  if (sport === "NBA") return isNaN(val) || val < 150 || val > 300 ? null : val;
  return isNaN(val) || val < 100 || val > 200 ? null : val;
}

function parseGames($, sport) {
  const results = [];
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  $("table.freezetable tr").each((_i, tr) => {
    const tds = $(tr).find("td").toArray();
    if (tds.length < 10) return;

    const teamAnchors = $(tds[0])
      .find('a.txt-color-vsinred[href*="/teams/"]')
      .toArray()
      .filter((a) => $(a).closest(".collapse").length === 0);

    if (teamAnchors.length < 2) return;

    let gameId = null;
    $(tds[0]).find("[data-param2]").each((_j, el) => {
      if (!gameId && $(el).closest(".collapse").length === 0) {
        gameId = $(el).attr("data-param2") || null;
      }
    });
    if (!gameId) return;

    const gameDate = extractGameDate(gameId);
    if (!gameDate) return;

    const awayTeam = $(teamAnchors[0]).text().trim();
    const homeTeam = $(teamAnchors[1]).text().trim();
    if (!awayTeam || !homeTeam) return;

    const awayHref = $(teamAnchors[0]).attr("href") || "";
    const homeHref = $(teamAnchors[1]).attr("href") || "";
    const awaySlug = hrefToSlug(awayHref, sport);
    const homeSlug = hrefToSlug(homeHref, sport);

    // Spreads
    const spreadTexts = getAnchorTexts($, tds[1]);
    const awaySpread = spreadTexts.length > 0 ? parseSpread(spreadTexts[0]) : null;
    const homeSpread = spreadTexts.length > 1 ? parseSpread(spreadTexts[1]) : null;

    // Total
    const totalTexts = getAnchorTexts($, tds[4]);
    const total = totalTexts.length > 0 ? parseTotal(totalTexts[0], sport) : null;

    // Splits
    // NBA: td[2]=spreadMoney, td[3]=spreadBets, td[5]=totalMoney, td[6]=totalBets, td[7]=ML odds, td[8]=mlMoney, td[9]=mlBets
    // NCAAM: same layout
    const spreadAwayMoneyPct = tds.length > 2 ? getFirstPct($, tds[2]) : null;
    const spreadAwayBetsPct  = tds.length > 3 ? getFirstPct($, tds[3]) : null;
    const totalOverMoneyPct  = tds.length > 5 ? getFirstPct($, tds[5]) : null;
    const totalOverBetsPct   = tds.length > 6 ? getFirstPct($, tds[6]) : null;
    const mlTexts = tds.length > 7 ? getAnchorTexts($, tds[7]) : [];
    const awayML = mlTexts.length > 0 ? mlTexts[0].trim() || null : null;
    const homeML = mlTexts.length > 1 ? mlTexts[1].trim() || null : null;
    const mlAwayMoneyPct = tds.length > 8 ? getFirstPct($, tds[8]) : null;
    const mlAwayBetsPct  = tds.length > 9 ? getFirstPct($, tds[9]) : null;

    results.push({
      sport,
      gameDate,
      awayTeam, homeTeam, awaySlug, homeSlug,
      awaySpread, homeSpread, total,
      spreadAwayBetsPct, spreadAwayMoneyPct,
      totalOverBetsPct, totalOverMoneyPct,
      mlAwayBetsPct, mlAwayMoneyPct,
      awayML, homeML,
    });
  });

  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== VSiN Betting Splits Cross-Reference ===\n");
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  // 1. Get auth token
  console.log("Authenticating with VSiN...");
  const token = await getToken();
  console.log("✓ Authenticated\n");

  // 2. Scrape both pages
  console.log("Fetching NCAAM page...");
  const ncaamHtml = await fetchPage("https://data.vsin.com/college-basketball/betting-splits/", token);
  const $ncaam = cheerio.load(ncaamHtml);
  const ncaamGames = parseGames($ncaam, "NCAAM");
  console.log(`✓ NCAAM: ${ncaamGames.length} games scraped from VSiN\n`);

  console.log("Fetching NBA page...");
  const nbaHtml = await fetchPage("https://data.vsin.com/nba/betting-splits/", token);
  const $nba = cheerio.load(nbaHtml);
  const nbaGames = parseGames($nba, "NBA");
  console.log(`✓ NBA: ${nbaGames.length} games scraped from VSiN\n`);

  // 3. Fetch DB records
  const conn = await createConnection(DATABASE_URL);
  const [dbRows] = await conn.execute(
    `SELECT sport, gameDate, awayTeam, homeTeam, 
     awayBookSpread, homeBookSpread, bookTotal,
     spreadAwayBetsPct, spreadAwayMoneyPct,
     totalOverBetsPct, totalOverMoneyPct,
     mlAwayBetsPct, mlAwayMoneyPct,
     awayML, homeML, publishedToFeed
     FROM games 
     WHERE gameDate >= DATE_FORMAT(UTC_DATE(), '%Y-%m-%d')
     ORDER BY sport, gameDate, awayTeam`
  );
  await conn.end();

  const dbByKey = new Map();
  for (const row of dbRows) {
    const key = `${row.sport}|${row.gameDate}|${row.awayTeam}|${row.homeTeam}`;
    dbByKey.set(key, row);
  }

  // 4. Cross-reference
  const allVsinGames = [...ncaamGames, ...nbaGames];
  
  let matchCount = 0;
  let mismatchCount = 0;
  let missingCount = 0;
  const issues = [];
  const matches = [];

  for (const vsin of allVsinGames) {
    const isoDate = `${vsin.gameDate.slice(0,4)}-${vsin.gameDate.slice(4,6)}-${vsin.gameDate.slice(6,8)}`;
    const key = `${vsin.sport}|${isoDate}|${vsin.awaySlug}|${vsin.homeSlug}`;
    const db = dbByKey.get(key);

    if (!db) {
      missingCount++;
      issues.push({
        status: "MISSING_IN_DB",
        sport: vsin.sport,
        date: isoDate,
        game: `${vsin.awayTeam} @ ${vsin.homeTeam}`,
        slugs: `${vsin.awaySlug} @ ${vsin.homeSlug}`,
        vsin: { spreadAwayBetsPct: vsin.spreadAwayBetsPct, spreadAwayMoneyPct: vsin.spreadAwayMoneyPct, totalOverBetsPct: vsin.totalOverBetsPct, mlAwayBetsPct: vsin.mlAwayBetsPct, awayML: vsin.awayML },
      });
      continue;
    }

    // Compare splits fields
    const fields = [
      ["spreadAwayBetsPct", vsin.spreadAwayBetsPct, db.spreadAwayBetsPct],
      ["spreadAwayMoneyPct", vsin.spreadAwayMoneyPct, db.spreadAwayMoneyPct],
      ["totalOverBetsPct", vsin.totalOverBetsPct, db.totalOverBetsPct],
      ["totalOverMoneyPct", vsin.totalOverMoneyPct, db.totalOverMoneyPct],
      ["mlAwayBetsPct", vsin.mlAwayBetsPct, db.mlAwayBetsPct],
      ["mlAwayMoneyPct", vsin.mlAwayMoneyPct, db.mlAwayMoneyPct],
      ["awayML", vsin.awayML, db.awayML],
      ["homeML", vsin.homeML, db.homeML],
    ];

    const mismatches = fields.filter(([, v, d]) => {
      if (v === null && d === null) return false;
      if (v === null || d === null) return true;
      return String(v) !== String(d);
    });

    if (mismatches.length > 0) {
      mismatchCount++;
      issues.push({
        status: "MISMATCH",
        sport: vsin.sport,
        date: isoDate,
        game: `${vsin.awayTeam} @ ${vsin.homeTeam}`,
        slugs: `${vsin.awaySlug} @ ${vsin.homeSlug}`,
        mismatches: mismatches.map(([f, v, d]) => ({ field: f, vsin: v, db: d })),
      });
    } else {
      matchCount++;
      matches.push({
        sport: vsin.sport,
        date: isoDate,
        game: `${vsin.awayTeam} @ ${vsin.homeTeam}`,
        spreadBets: vsin.spreadAwayBetsPct,
        spreadMoney: vsin.spreadAwayMoneyPct,
        totalBets: vsin.totalOverBetsPct,
        totalMoney: vsin.totalOverMoneyPct,
        mlBets: vsin.mlAwayBetsPct,
        mlMoney: vsin.mlAwayMoneyPct,
        awayML: vsin.awayML,
      });
    }
  }

  // 5. Check for DB games not on VSiN
  const vsinKeys = new Set(allVsinGames.map(g => {
    const isoDate = `${g.gameDate.slice(0,4)}-${g.gameDate.slice(4,6)}-${g.gameDate.slice(6,8)}`;
    return `${g.sport}|${isoDate}|${g.awaySlug}|${g.homeSlug}`;
  }));
  const dbOnlyGames = [];
  for (const [key, row] of dbByKey) {
    if (!vsinKeys.has(key)) {
      dbOnlyGames.push({ key, sport: row.sport, date: row.gameDate, game: `${row.awayTeam} @ ${row.homeTeam}`, hasSplits: row.spreadAwayBetsPct != null });
    }
  }

  // 6. Print results
  console.log("═══════════════════════════════════════════════════════");
  console.log("SUMMARY");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`VSiN games scraped:     ${allVsinGames.length} (NCAAM: ${ncaamGames.length}, NBA: ${nbaGames.length})`);
  console.log(`DB games (today+):      ${dbRows.length}`);
  console.log(`✅ Perfect matches:     ${matchCount}`);
  console.log(`⚠️  Mismatches:         ${mismatchCount}`);
  console.log(`❌ Missing in DB:       ${missingCount}`);
  console.log(`ℹ️  DB-only (no VSiN):  ${dbOnlyGames.length}`);
  console.log("");

  if (matches.length > 0) {
    console.log("═══════════════════════════════════════════════════════");
    console.log("✅ PERFECT MATCHES");
    console.log("═══════════════════════════════════════════════════════");
    for (const m of matches) {
      console.log(`[${m.sport}] ${m.date} | ${m.game}`);
      console.log(`  Spread: Bets=${m.spreadBets ?? "—"}% Money=${m.spreadMoney ?? "—"}%  |  Total: Bets=${m.totalBets ?? "—"}% Money=${m.totalMoney ?? "—"}%  |  ML: Bets=${m.mlBets ?? "—"}% Money=${m.mlMoney ?? "—"}%  |  ML Odds: ${m.awayML ?? "—"}`);
    }
    console.log("");
  }

  if (issues.length > 0) {
    console.log("═══════════════════════════════════════════════════════");
    console.log("⚠️  ISSUES");
    console.log("═══════════════════════════════════════════════════════");
    for (const issue of issues) {
      if (issue.status === "MISSING_IN_DB") {
        console.log(`❌ MISSING [${issue.sport}] ${issue.date} | ${issue.game} (slugs: ${issue.slugs})`);
        console.log(`   VSiN splits: ${JSON.stringify(issue.vsin)}`);
      } else {
        console.log(`⚠️  MISMATCH [${issue.sport}] ${issue.date} | ${issue.game}`);
        for (const mm of issue.mismatches) {
          console.log(`   ${mm.field}: VSiN=${mm.vsin} | DB=${mm.db}`);
        }
      }
    }
    console.log("");
  }

  if (dbOnlyGames.length > 0) {
    console.log("═══════════════════════════════════════════════════════");
    console.log("ℹ️  DB GAMES NOT ON VSIN (future/schedule-only)");
    console.log("═══════════════════════════════════════════════════════");
    for (const g of dbOnlyGames) {
      console.log(`[${g.sport}] ${g.date} | ${g.game} | hasSplits=${g.hasSplits}`);
    }
  }
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
