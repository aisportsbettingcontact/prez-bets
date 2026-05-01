/**
 * Diagnostic: Fetch the VSIN page and print the raw row data for each game pair
 * to verify the away/home row ordering and column values.
 */
import * as cheerio from 'cheerio';

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Referer: "https://data.vsin.com/",
};

const resp = await fetch("https://data.vsin.com/betting-splits/?source=DK&view=today", { headers: HEADERS });
const html = await resp.text();
const $ = cheerio.load(html);

// Find the MLB table
const tables = $("table.sp-table");
let mlbTable: any = null;
tables.each((_i, table) => {
  const header = $(table).find("th.sp-sport-name").text();
  if (header.includes("MLB")) {
    mlbTable = table;
    return false; // break
  }
});

if (!mlbTable) {
  console.error("No MLB table found");
  process.exit(1);
}

const gameRows: cheerio.Cheerio<any>[] = [];
$(mlbTable).find("tr.sp-row").each((_j, row) => {
  gameRows.push($(row));
});

console.log(`Found ${gameRows.length} sp-row rows (${Math.floor(gameRows.length / 2)} game pairs)\n`);

for (let i = 0; i < gameRows.length - 1; i += 2) {
  const awayRow = gameRows[i];
  const homeRow = gameRows[i + 1];
  
  const gameId = awayRow.find("button[data-gamecode]").attr("data-gamecode") ?? "NO_GAMECODE";
  const awayName = awayRow.find("a.sp-team-link").text().trim();
  const homeName = homeRow.find("a.sp-team-link").text().trim();
  
  // Only show today's games
  if (!gameId.startsWith('20260501')) continue;
  
  const awayTds = awayRow.find("td");
  const homeTds = homeRow.find("td");
  
  // Extract raw text from each td
  const extractPct = (tds: any, idx: number) => {
    const badge = $(tds.eq(idx)).find("span.sp-badge").first();
    const raw = badge.clone().find("span").remove().end().text().trim();
    const m = raw.match(/(\d+)%/);
    return m ? parseInt(m[1], 10) : null;
  };
  
  const awayRLHandle = extractPct(awayTds, 3);
  const awayRLBets   = extractPct(awayTds, 4);
  const awayTotalHandle = extractPct(awayTds, 6);
  const awayTotalBets   = extractPct(awayTds, 7);
  const awayMLHandle = extractPct(awayTds, 9);
  const awayMLBets   = extractPct(awayTds, 10);
  
  const homeRLHandle = extractPct(homeTds, 3);
  const homeRLBets   = extractPct(homeTds, 4);
  const homeTotalHandle = extractPct(homeTds, 6);
  const homeTotalBets   = extractPct(homeTds, 7);
  const homeMLHandle = extractPct(homeTds, 9);
  const homeMLBets   = extractPct(homeTds, 10);
  
  console.log(`${gameId}: ${awayName} @ ${homeName}`);
  console.log(`  AWAY row: RL=${awayRLHandle}%H/${awayRLBets}%B | Total=${awayTotalHandle}%H/${awayTotalBets}%B | ML=${awayMLHandle}%H/${awayMLBets}%B`);
  console.log(`  HOME row: RL=${homeRLHandle}%H/${homeRLBets}%B | Total=${homeTotalHandle}%H/${homeTotalBets}%B | ML=${homeMLHandle}%H/${homeMLBets}%B`);
  
  // Check: away RL handle + home RL handle should sum to ~100
  const rlSum = (awayRLHandle ?? 0) + (homeRLHandle ?? 0);
  const totalSum = (awayTotalHandle ?? 0) + (homeTotalHandle ?? 0);
  const mlSum = (awayMLHandle ?? 0) + (homeMLHandle ?? 0);
  console.log(`  SUMS: RL=${rlSum} Total=${totalSum} ML=${mlSum} (should be ~100 each)`);
  console.log();
}
