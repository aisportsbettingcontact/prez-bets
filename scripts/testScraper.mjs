// Quick test of the WagerTalk scraper
// Run: node scripts/testScraper.mjs

import puppeteer from "puppeteer";

function parseSpread(text) {
  if (!text) return null;
  const clean = text.trim().replace(/\s+/g, "");
  const match = clean.match(/^([+-]?\d+\.?\d*|[+-]?\d+½)(?:[+-]\d+)?$/);
  if (!match) {
    if (clean.toLowerCase() === "pk") return 0;
    return null;
  }
  const val = parseFloat(match[1].replace("½", ".5"));
  if (isNaN(val) || Math.abs(val) > 60) return null;
  return val;
}

function parseTotal(text) {
  if (!text) return null;
  const clean = text.trim().replace(/\s+/g, "");
  const match = clean.match(/^[OU]?(\d{2,3}\.?\d*)/i) || clean.match(/(\d{2,3}[½.]?\d*)/);
  if (!match) return null;
  const val = parseFloat(match[1].replace("½", ".5"));
  if (isNaN(val) || val < 100 || val > 300) return null;
  return val;
}

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});

const page = await browser.newPage();
await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

console.log("Loading WagerTalk NCAAM odds...");
await page.goto("https://www.wagertalk.com/odds?sport=L4", { waitUntil: "networkidle2", timeout: 30000 });
await new Promise(r => setTimeout(r, 4000));

const rawGames = await page.evaluate(() => {
  const results = [];
  const gameRows = Array.from(document.querySelectorAll("tr[id^='g']"));

  for (const row of gameRows) {
    const rowId = row.id;
    const rotBase = rowId.slice(1);
    const gnumTh = document.getElementById(`t${rotBase}g`);
    if (!gnumTh) continue;

    const rotAway = gnumTh.querySelector(`#t${rotBase}g0`)?.textContent?.trim() ?? "";
    const rotHome = gnumTh.querySelector(`#t${rotBase}g1`)?.textContent?.trim() ?? "";
    if (!rotAway || !rotHome || isNaN(parseInt(rotAway))) continue;

    const bookCells = Array.from(row.querySelectorAll("td.book"));
    if (bookCells.length === 0) continue;

    const consensusCell = bookCells[bookCells.length - 1];
    const divs = Array.from(consensusCell.querySelectorAll("div"));
    const r1 = divs.find(d => d.id.endsWith("r1"))?.textContent?.trim() ?? "";
    const r2 = divs.find(d => d.id.endsWith("r2"))?.textContent?.trim() ?? "";

    // Get team names
    const teamTh = document.getElementById(`t${rotBase}n`);
    const awayTeam = teamTh?.querySelector(`#t${rotBase}n0`)?.textContent?.trim() ?? "";
    const homeTeam = teamTh?.querySelector(`#t${rotBase}n1`)?.textContent?.trim() ?? "";

    results.push({ rotAway, rotHome, awayTeam, homeTeam, spreadRaw: r2, totalRaw: r1 });
  }
  return results;
});

console.log(`\nFound ${rawGames.length} games. First 10:\n`);
rawGames.slice(0, 10).forEach(g => {
  const spread = parseSpread(g.spreadRaw);
  const total = parseTotal(g.totalRaw);
  console.log(`  [${g.rotAway}/${g.rotHome}] ${g.awayTeam} vs ${g.homeTeam}`);
  console.log(`    Raw: spread="${g.spreadRaw}" total="${g.totalRaw}"`);
  console.log(`    Parsed: spread=${spread} total=${total}`);
});

// Check specifically for game 689 (Creighton vs Butler)
const g689 = rawGames.find(g => g.rotAway === "689");
console.log("\nGame 689 (Creighton vs Butler):", g689 ? JSON.stringify(g689) : "NOT FOUND");

await browser.close();
