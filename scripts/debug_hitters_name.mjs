import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, "../debug_rg_today-hitters.html"), "utf8");
const $ = cheerio.load(html);

let $mainTable = null;
let maxCols = 0;
$("table").each((i, el) => {
  const $t = $(el);
  const cols = $t.find("thead tr th").length;
  if (cols > maxCols) { maxCols = cols; $mainTable = $t; }
});

const firstRow = $mainTable.find("tbody tr").first();
console.log("Hitter first row tr attrs:", JSON.stringify(firstRow[0]?.attribs || {}));

const cols = [];
$mainTable.find("thead tr th").each((i, el) => {
  const $th = $(el);
  const dc = $th.attr("data-col") ?? "";
  const tc = $th.clone().children().remove().end().text().trim();
  cols.push(dc || tc || `col_${i}`);
});
console.log("First 8 hitter cols:", cols.slice(0, 8).join(", "));

const nameIdx = cols.indexOf("NAME");
console.log("NAME col index:", nameIdx);

if (nameIdx >= 0) {
  const nameTd = firstRow.find("td").eq(nameIdx);
  console.log("NAME td html:", nameTd.html()?.substring(0, 500));
  console.log("NAME a.first href:", nameTd.find("a").first().attr("href"));
  console.log("NAME a.first text:", nameTd.find("a").first().text().trim());
  console.log("NAME span.first text:", nameTd.find("span").first().text().trim());
}

// Also check pitchers PLAYER col
const pHtml = fs.readFileSync(path.join(__dirname, "../debug_rg_today-pitchers.html"), "utf8");
const $p = cheerio.load(pHtml);
let $pTable = null; let pMaxCols = 0;
$p("table").each((i, el) => {
  const $t = $p(el);
  const c = $t.find("thead tr th").length;
  if (c > pMaxCols) { pMaxCols = c; $pTable = $t; }
});
const pCols = [];
$pTable.find("thead tr th").each((i, el) => {
  const $th = $p(el);
  const dc = $th.attr("data-col") ?? "";
  const tc = $th.clone().children().remove().end().text().trim();
  pCols.push(dc || tc || `col_${i}`);
});
console.log("\nPitcher first 8 cols:", pCols.slice(0, 8).join(", "));
console.log("Pitcher NAME col index:", pCols.indexOf("NAME"));
console.log("Pitcher PLAYER col index:", pCols.indexOf("PLAYER"));

// Verify: test headshot URL
const playerHref = "/players/jesus-luzardo-1266776";
const playerId = playerHref.split("-").pop();
console.log("\nExtracted player ID from href:", playerId);
console.log("Headshot URL:", `https://rotogrinders.com/images/players/${playerId}.png`);
