/**
 * debug_rg_rows.mjs
 * Inspect the exact HTML structure of pitchers tbody rows to find why NAME is empty.
 */

import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read the saved HTML from the previous diagnostic
const htmlPath = path.join(__dirname, "../debug_rg_today-pitchers.html");
if (!fs.existsSync(htmlPath)) {
  console.error("[FATAL] debug_rg_today-pitchers.html not found. Run debug_rg_pitchers.mjs first.");
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, "utf8");
const $ = cheerio.load(html);

console.log("=== PITCHERS TABLE DEEP INSPECTION ===\n");

// Find the main table (most columns)
let $mainTable = null;
let maxCols = 0;
$("table").each((i, el) => {
  const $t = $(el);
  const cols = $t.find("thead tr th").length;
  if (cols > maxCols) {
    maxCols = cols;
    $mainTable = $t;
  }
});

if (!$mainTable) {
  console.error("[FATAL] No table found");
  process.exit(1);
}

console.log(`[STATE] Main table: ${maxCols} columns`);

// Extract column headers
const columns = [];
$mainTable.find("thead tr th").each((i, el) => {
  const $th = $(el);
  const dataCol = $th.attr("data-col") ?? "";
  const textCol = $th.clone().children("input, select, span.sort-icon, i").remove().end().text().trim();
  const allAttrs = Object.entries($th[0]?.attribs || {}).map(([k,v]) => `${k}="${v.substring(0,30)}"`).join(" ");
  columns.push(dataCol || textCol || `col_${i}`);
  if (i < 10) {
    console.log(`  col[${i}]: "${dataCol || textCol}" | attrs: ${allAttrs}`);
  }
});
console.log(`  ... (${columns.length} total columns)`);
console.log(`  All columns: ${columns.join(", ")}\n`);

// Inspect tbody rows
const $tbody = $mainTable.find("tbody");
const $rows = $tbody.find("tr");
console.log(`[STATE] tbody tr count: ${$rows.length}\n`);

// Inspect first 5 rows in detail
$rows.slice(0, 5).each((ri, row) => {
  const $tr = $(row);
  const trAttrs = Object.entries($tr[0]?.attribs || {}).map(([k,v]) => `${k}="${v.substring(0,50)}"`).join(" ");
  const $tds = $tr.find("td");
  
  console.log(`--- Row[${ri}] ---`);
  console.log(`  <tr> attrs: ${trAttrs || "(none)"}`);
  console.log(`  td count: ${$tds.length}`);
  
  $tds.slice(0, 8).each((ci, td) => {
    const $td = $(td);
    const col = columns[ci] ?? `col_${ci}`;
    const tdAttrs = Object.entries($td[0]?.attribs || {}).map(([k,v]) => `${k}="${v.substring(0,40)}"`).join(" ");
    const rawText = $td.text().trim().substring(0, 80);
    const innerHtml = $td.html()?.substring(0, 200) || "";
    
    console.log(`  td[${ci}] col="${col}":`);
    console.log(`    attrs: ${tdAttrs || "(none)"}`);
    console.log(`    text: "${rawText}"`);
    console.log(`    html: ${innerHtml}`);
    
    // Specifically check the NAME column
    if (col === "NAME" || col === "name") {
      const spans = $td.find("span");
      console.log(`    [NAME ANALYSIS] spans found: ${spans.length}`);
      spans.each((si, span) => {
        const $s = $(span);
        const sAttrs = Object.entries($s[0]?.attribs || {}).map(([k,v]) => `${k}="${v.substring(0,40)}"`).join(" ");
        console.log(`      span[${si}]: text="${$s.text().trim().substring(0,60)}" attrs: ${sAttrs}`);
      });
      const firstSpanText = $td.find("span").first().text().trim();
      console.log(`    [NAME ANALYSIS] span.first().text() = "${firstSpanText}"`);
      const directText = $td.text().trim().split("\n")[0]?.trim() ?? "";
      console.log(`    [NAME ANALYSIS] text().split(\\n)[0] = "${directText}"`);
    }
  });
  console.log();
});

// Check if there's a data-player-id or similar on the rows
console.log("\n=== CHECKING FOR PLAYER ID ATTRIBUTES ===");
$rows.slice(0, 3).each((ri, row) => {
  const $tr = $(row);
  const allAttrs = $tr[0]?.attribs || {};
  console.log(`Row[${ri}] all attrs:`, JSON.stringify(allAttrs));
  
  // Check all tds for data attributes
  $tr.find("td").each((ci, td) => {
    const $td = $(td);
    const tdAttrs = $td[0]?.attribs || {};
    const attrKeys = Object.keys(tdAttrs);
    if (attrKeys.some(k => k.startsWith("data-"))) {
      console.log(`  td[${ci}] data attrs:`, JSON.stringify(tdAttrs));
    }
    // Check for links (player profile links often contain player ID)
    const links = $td.find("a");
    if (links.length > 0) {
      links.each((li, a) => {
        const href = $(a).attr("href") || "";
        const text = $(a).text().trim();
        console.log(`  td[${ci}] link: href="${href}" text="${text}"`);
      });
    }
    // Check for img (headshots)
    const imgs = $td.find("img");
    if (imgs.length > 0) {
      imgs.each((ii, img) => {
        const src = $(img).attr("src") || "";
        const alt = $(img).attr("alt") || "";
        console.log(`  td[${ci}] img: src="${src.substring(0,100)}" alt="${alt}"`);
      });
    }
  });
});

// Now check the hitters page for comparison
console.log("\n\n=== HITTERS PAGE COMPARISON ===");
const hHtmlPath = path.join(__dirname, "../debug_rg_today-hitters.html");
if (fs.existsSync(hHtmlPath)) {
  const hHtml = fs.readFileSync(hHtmlPath, "utf8");
  const $h = cheerio.load(hHtml);
  
  let $hTable = null;
  let hMaxCols = 0;
  $h("table").each((i, el) => {
    const $t = $h(el);
    const cols = $t.find("thead tr th").length;
    if (cols > hMaxCols) {
      hMaxCols = cols;
      $hTable = $t;
    }
  });
  
  if ($hTable) {
    const $hRows = $hTable.find("tbody tr");
    console.log(`[STATE] Hitters tbody rows: ${$hRows.length}`);
    
    // Check first hitter row NAME cell
    const firstHRow = $hRows.first();
    const $hTds = firstHRow.find("td");
    
    // Find NAME column index
    const hCols = [];
    $hTable.find("thead tr th").each((i, el) => {
      const $th = $h(el);
      const dataCol = $th.attr("data-col") ?? "";
      const textCol = $th.clone().children().remove().end().text().trim();
      hCols.push(dataCol || textCol || `col_${i}`);
    });
    
    const nameIdx = hCols.indexOf("NAME");
    console.log(`[STATE] Hitters NAME column index: ${nameIdx}`);
    
    if (nameIdx >= 0) {
      const $nameTd = $hTds.eq(nameIdx);
      console.log(`[STATE] Hitters NAME td html: ${$nameTd.html()?.substring(0, 300)}`);
      console.log(`[STATE] Hitters NAME span.first().text(): "${$nameTd.find("span").first().text().trim()}"`);
    }
  }
} else {
  console.log("Hitters HTML not saved. Run debug_rg_pitchers.mjs first.");
}
