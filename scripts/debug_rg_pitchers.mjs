/**
 * debug_rg_pitchers.mjs
 * Deep diagnostic: fetch Rotogrinders today-pitchers page and analyze HTML structure
 * to find why 0 rows are returned.
 */

import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const RG_BASE = "https://rotogrinders.com";
const PITCHERS_URL = `${RG_BASE}/grids/standard-projections-the-bat-x-3372510#expand`;

const USERNAME = process.env.ROTOGRINDERS_USERNAME;
const PASSWORD = process.env.ROTOGRINDERS_PASSWORD;

if (!USERNAME || !PASSWORD) {
  console.error("[FATAL] ROTOGRINDERS_USERNAME or ROTOGRINDERS_PASSWORD not set");
  process.exit(1);
}

async function login() {
  console.log(`[STEP] Logging in as ${USERNAME}...`);
  const res = await fetch(`${RG_BASE}/sign-in`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      "Referer": `${RG_BASE}/sign-in`,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    body: new URLSearchParams({ username: USERNAME, password: PASSWORD }).toString(),
    redirect: "manual",
  });

  console.log(`[STATE] Login response status: ${res.status}`);
  
  const setCookies = [];
  res.headers.forEach((value, name) => {
    if (name.toLowerCase() === "set-cookie") setCookies.push(value);
  });
  
  console.log(`[STATE] Set-Cookie headers (${setCookies.length}):`);
  setCookies.forEach((c, i) => console.log(`  [${i}] ${c.substring(0, 100)}`));
  
  const cookieStr = setCookies.map(c => c.split(";")[0]).filter(Boolean).join("; ");
  const rguid = setCookies.map(c => c.split(";")[0]).find(c => c.startsWith("rguid="));
  
  console.log(`[STATE] rguid found: ${!!rguid}`);
  console.log(`[STATE] Full cookie string: ${cookieStr.substring(0, 200)}`);
  
  return cookieStr;
}

async function fetchPage(url, cookie) {
  console.log(`\n[STEP] Fetching: ${url}`);
  const res = await fetch(url, {
    headers: {
      "Cookie": cookie,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      "Referer": RG_BASE,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  
  console.log(`[STATE] Page fetch status: ${res.status}`);
  const html = await res.text();
  console.log(`[STATE] HTML length: ${html.length} bytes`);
  return html;
}

function analyzeHtml(html, pageKey) {
  const $ = cheerio.load(html);
  
  console.log("\n=== HTML STRUCTURE ANALYSIS ===");
  
  // 1. Check for login wall / redirect
  const title = $("title").text().trim();
  console.log(`[STATE] Page <title>: "${title}"`);
  
  const bodyText = $("body").text().substring(0, 500).replace(/\s+/g, " ").trim();
  console.log(`[STATE] Body text preview: "${bodyText.substring(0, 200)}"`);
  
  // 2. Check for JavaScript-rendered content indicators
  const hasReact = html.includes("__REACT") || html.includes("react-root") || html.includes("data-reactroot");
  const hasNext = html.includes("__NEXT_DATA__") || html.includes("_next");
  const hasVue = html.includes("__vue__") || html.includes("data-v-");
  const hasAngular = html.includes("ng-version") || html.includes("ng-app");
  console.log(`[STATE] JS framework detection: React=${hasReact} Next=${hasNext} Vue=${hasVue} Angular=${hasAngular}`);
  
  // 3. Check for JSON data embedded in page
  const jsonMatches = html.match(/window\.__[A-Z_]+\s*=\s*(\{[\s\S]{1,200})/g) || [];
  console.log(`[STATE] window.__ JSON globals found: ${jsonMatches.length}`);
  jsonMatches.forEach((m, i) => console.log(`  [${i}] ${m.substring(0, 150)}`));
  
  // 4. Check for API data URLs in the HTML
  const apiUrls = html.match(/https?:\/\/[^"'\s]+api[^"'\s]*/gi) || [];
  const uniqueApiUrls = [...new Set(apiUrls)].slice(0, 10);
  console.log(`[STATE] API URLs found in HTML: ${uniqueApiUrls.length}`);
  uniqueApiUrls.forEach(u => console.log(`  → ${u}`));
  
  // 5. Check for data URLs with "projection" or "grid" in them
  const projUrls = html.match(/https?:\/\/[^"'\s]*(projection|grid|lineup)[^"'\s]*/gi) || [];
  const uniqueProjUrls = [...new Set(projUrls)].slice(0, 10);
  console.log(`[STATE] Projection/Grid URLs found: ${uniqueProjUrls.length}`);
  uniqueProjUrls.forEach(u => console.log(`  → ${u}`));
  
  // 6. Count all tables
  const tables = $("table");
  console.log(`\n[STATE] Total <table> elements: ${tables.length}`);
  tables.each((i, el) => {
    const $t = $(el);
    const thCount = $t.find("thead tr th").length;
    const tdCount = $t.find("tbody tr td").length;
    const trCount = $t.find("tbody tr").length;
    const id = $t.attr("id") || "(no id)";
    const cls = ($t.attr("class") || "(no class)").substring(0, 60);
    console.log(`  Table[${i}]: id="${id}" class="${cls}" ths=${thCount} rows=${trCount} tds=${tdCount}`);
  });
  
  // 7. Check for data-role="sortable" container
  const sortable = $("[data-role='sortable']");
  console.log(`\n[STATE] [data-role='sortable'] elements: ${sortable.length}`);
  sortable.each((i, el) => {
    const $el = $(el);
    const tables = $el.find("table").length;
    console.log(`  sortable[${i}]: tables inside=${tables}`);
  });
  
  // 8. Check for grid/projection containers
  const gridContainers = $("[class*='grid'], [class*='projection'], [class*='lineup'], [id*='grid'], [id*='projection']");
  console.log(`\n[STATE] Grid/projection containers: ${gridContainers.length}`);
  gridContainers.slice(0, 5).each((i, el) => {
    const $el = $(el);
    console.log(`  container[${i}]: tag=${el.tagName} id="${$el.attr("id") || ""}" class="${($el.attr("class") || "").substring(0, 80)}"`);
  });
  
  // 9. Look for any data embedded as JSON in script tags
  const scripts = $("script:not([src])");
  console.log(`\n[STATE] Inline <script> tags: ${scripts.length}`);
  let foundDataScript = false;
  scripts.each((i, el) => {
    const content = $(el).html() || "";
    if (content.includes("projection") || content.includes("player") || content.includes("NAME") || content.includes("FPTS")) {
      console.log(`  [MATCH] Script[${i}] contains projection/player data (${content.length} chars)`);
      console.log(`  Preview: ${content.substring(0, 300).replace(/\s+/g, " ")}`);
      foundDataScript = true;
    }
  });
  if (!foundDataScript) console.log("  No inline scripts with projection data found");
  
  // 10. Check for React/Next hydration data
  const nextData = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextData) {
    console.log(`\n[STATE] __NEXT_DATA__ found (${nextData[1].length} chars)`);
    try {
      const parsed = JSON.parse(nextData[1]);
      console.log(`  Keys: ${Object.keys(parsed).join(", ")}`);
      // Look for player/projection data
      const str = JSON.stringify(parsed);
      if (str.includes("player") || str.includes("NAME") || str.includes("FPTS")) {
        console.log("  [MATCH] Contains player/projection data!");
        // Try to find the grid data
        const gridData = parsed?.props?.pageProps;
        if (gridData) {
          console.log(`  pageProps keys: ${Object.keys(gridData).join(", ")}`);
        }
      }
    } catch (e) {
      console.log(`  Parse error: ${e.message}`);
    }
  }
  
  // 11. Check for any data-* attributes on tbody rows
  const tbodyRows = $("tbody tr");
  console.log(`\n[STATE] Total <tbody tr> elements across all tables: ${tbodyRows.length}`);
  if (tbodyRows.length > 0) {
    const firstRow = tbodyRows.first();
    const attrs = firstRow[0]?.attribs || {};
    console.log(`  First row attrs: ${JSON.stringify(attrs)}`);
    const tds = firstRow.find("td");
    console.log(`  First row td count: ${tds.length}`);
    tds.slice(0, 5).each((i, td) => {
      const $td = $(td);
      console.log(`    td[${i}]: text="${$td.text().trim().substring(0, 50)}" class="${($td.attr("class") || "").substring(0, 40)}"`);
    });
  }
  
  // 12. Look for the actual data in any embedded JSON
  const jsonScriptMatches = html.match(/\{[^{}]{500,}\}/g) || [];
  const playerJsonCandidates = jsonScriptMatches.filter(m => 
    m.includes('"player"') || m.includes('"name"') || m.includes('"fpts"') || m.includes('"FPTS"')
  );
  console.log(`\n[STATE] Large JSON blobs with player data: ${playerJsonCandidates.length}`);
  if (playerJsonCandidates.length > 0) {
    console.log(`  First candidate (300 chars): ${playerJsonCandidates[0].substring(0, 300)}`);
  }
  
  // 13. Check for RG-specific data attributes
  const rgDataEls = $("[data-player], [data-player-id], [data-pid], [data-id]");
  console.log(`\n[STATE] Elements with player data attrs: ${rgDataEls.length}`);
  if (rgDataEls.length > 0) {
    const first = rgDataEls.first();
    console.log(`  First: tag=${first[0]?.tagName} attrs=${JSON.stringify(first[0]?.attribs || {}).substring(0, 200)}`);
  }
  
  // Save the HTML for manual inspection
  const outPath = path.join(__dirname, `../debug_rg_${pageKey}.html`);
  fs.writeFileSync(outPath, html, "utf8");
  console.log(`\n[OUTPUT] HTML saved to: ${outPath}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  try {
    const cookie = await login();
    const html = await fetchPage(PITCHERS_URL, cookie);
    analyzeHtml(html, "today-pitchers");
    
    // Also try the hitters page for comparison
    console.log("\n\n=== HITTERS PAGE COMPARISON ===");
    const HITTERS_URL = `${RG_BASE}/grids/standard-projections-the-bat-x-hitters-3372512#expand`;
    const hHtml = await fetchPage(HITTERS_URL, cookie);
    
    const $h = cheerio.load(hHtml);
    const hTables = $h("table");
    console.log(`[STATE] Hitters page tables: ${hTables.length}`);
    hTables.each((i, el) => {
      const $t = $h(el);
      const thCount = $t.find("thead tr th").length;
      const trCount = $t.find("tbody tr").length;
      console.log(`  Table[${i}]: ths=${thCount} rows=${trCount}`);
    });
    
    const hBodyRows = $h("tbody tr");
    console.log(`[STATE] Hitters tbody rows: ${hBodyRows.length}`);
    
  } catch (err) {
    console.error("[FATAL]", err);
    process.exit(1);
  }
}

main();
