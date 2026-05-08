/**
 * test_rg_proxy.ts
 * Tests the Rotogrinders login + table scrape end-to-end.
 * Run: npx tsx scripts/test_rg_proxy.ts
 */

import { config } from "dotenv";
import * as cheerio from "cheerio";
config();

const RG_BASE = "https://rotogrinders.com";
const username = process.env.ROTOGRINDERS_USERNAME;
const password = process.env.ROTOGRINDERS_PASSWORD;

console.log(`[INPUT] username=${username} password=${password ? "***" : "MISSING"}`);

async function main() {
  if (!username || !password) {
    console.error("[VERIFY] FAIL — credentials not set in .env");
    process.exit(1);
  }

  // ── Step 1: Login ─────────────────────────────────────────────────────────
  console.log("[STEP] Logging in to Rotogrinders via POST /sign-in ...");
  const loginRes = await fetch(`${RG_BASE}/sign-in`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      "Referer": `${RG_BASE}/sign-in`,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    body: new URLSearchParams({ username, password }).toString(),
    redirect: "manual",
  });

  console.log(`[STATE] Login status=${loginRes.status} location=${loginRes.headers.get("location") ?? "(none)"}`);

  const setCookieHeaders: string[] = [];
  loginRes.headers.forEach((value: string, name: string) => {
    if (name.toLowerCase() === "set-cookie") setCookieHeaders.push(value);
  });

  console.log(`[STATE] Set-Cookie count=${setCookieHeaders.length}`);
  for (const c of setCookieHeaders) {
    const nameVal = c.split(";")[0];
    console.log(`  [STATE] Cookie: ${nameVal.substring(0, 80)}`);
  }

  const rguidCookie = setCookieHeaders
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith("rguid="));

  const cookieStr = setCookieHeaders.map((c) => c.split(";")[0]).filter(Boolean).join("; ");

  if (!rguidCookie) {
    console.error("[VERIFY] FAIL — rguid cookie not found. Login may have failed.");
    if (!cookieStr) { process.exit(1); }
    console.log("[STATE] Proceeding with all cookies as fallback");
  } else {
    console.log(`[VERIFY] PASS — rguid obtained: ${rguidCookie.substring(0, 50)}...`);
  }

  // ── Step 2: Fetch the hitters page ────────────────────────────────────────
  const pageUrl = `${RG_BASE}/grids/standard-projections-the-bat-x-hitters-3372512`;
  console.log(`\n[STEP] Fetching hitters projection page...`);
  console.log(`[INPUT] URL: ${pageUrl}`);

  const pageRes = await fetch(pageUrl, {
    headers: {
      "Cookie": cookieStr,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      "Referer": RG_BASE,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  const html = await pageRes.text();
  console.log(`[STATE] Page status=${pageRes.status} html_size=${html.length} bytes`);

  // ── Step 3: Parse with cheerio ────────────────────────────────────────────
  const $ = cheerio.load(html);

  let maxCols = 0;
  let $bestTable: cheerio.Cheerio<cheerio.AnyNode> | null = null;
  $("table").each(function () {
    const cols = $(this).find("thead tr th").length;
    if (cols > maxCols) {
      maxCols = cols;
      $bestTable = $(this);
    }
  });

  if (!$bestTable) {
    console.error("[VERIFY] FAIL — No table found in HTML");
    const paywallText = html.includes("MLB subscribers") ? "PAYWALL DETECTED" : "no paywall text found";
    console.error(`[STATE] ${paywallText}`);
    // Save HTML for inspection
    const fs = await import("fs");
    fs.writeFileSync("/tmp/rg_debug.html", html);
    console.log("[STATE] HTML saved to /tmp/rg_debug.html for inspection");
    return;
  }

  // Extract headers
  const columns: string[] = [];
  ($bestTable as cheerio.Cheerio<cheerio.AnyNode>).find("thead tr th").each(function () {
    const dataCol = $(this).attr("data-col") ?? "";
    const textCol = $(this).clone().children("input, select, span.sort-icon, i").remove().end().text().trim();
    columns.push(dataCol || textCol || `col_${columns.length}`);
  });

  // Count rows and extract first 5 player names
  const names: string[] = [];
  let rowCount = 0;
  ($bestTable as cheerio.Cheerio<cheerio.AnyNode>).find("tbody tr").each(function () {
    const tds = $(this).find("td");
    if (!tds.length) return;
    rowCount++;
    if (names.length < 5) {
      const firstTd = $(this).find("td").first();
      const nameEl = firstTd.find("span.player-name, span.name, a.player-link, a").first();
      const name = nameEl.length ? nameEl.text().trim() : firstTd.text().trim().split("\n")[0]?.trim() ?? "";
      if (name) names.push(name);
    }
  });

  console.log(`[STATE] Table: ${columns.length} columns, ${rowCount} rows`);
  console.log(`[STATE] Columns (first 15): ${columns.slice(0, 15).join(", ")}`);
  console.log(`[STATE] First 5 players: ${names.join(", ")}`);

  // ── Step 4: Validation ────────────────────────────────────────────────────
  const hasFptsUpdated = html.includes("FPTS Updated");
  const hasPaywall = html.includes("available to MLB subscribers");

  console.log(`[STATE] fpts_updated=${hasFptsUpdated} paywall=${hasPaywall}`);

  if (rowCount > 50 && !hasPaywall) {
    console.log(`[VERIFY] PASS — Full authenticated table: ${rowCount} rows, ${columns.length} columns`);
  } else if (rowCount > 0 && rowCount <= 10) {
    console.error(`[VERIFY] FAIL — Only ${rowCount} rows (paywall likely blocking full data)`);
  } else if (rowCount > 10) {
    console.log(`[VERIFY] PASS (partial) — ${rowCount} rows loaded`);
  } else {
    console.error(`[VERIFY] FAIL — No data rows`);
  }
}

main().catch(e => {
  console.error("[FATAL]", e.message);
  process.exit(1);
});
