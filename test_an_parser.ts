import { parseAnAllMarketsHtml } from "./server/anHtmlParser.ts";
import { readFileSync } from "fs";

// Test NCAAB
const ncaabHtml = readFileSync('/home/ubuntu/Downloads/ncaab_all_markets.html', 'utf-8');
const ncaabResult = parseAnAllMarketsHtml(ncaabHtml, 'ncaab');
console.log(`\n=== NCAAB ===`);
console.log(`Games parsed: ${ncaabResult.games.length}`);
console.log(`DK column: ${ncaabResult.dkColumnIndex}`);
console.log(`Warnings: ${ncaabResult.warnings.length}`);
if (ncaabResult.warnings.length) console.log('Warnings:', ncaabResult.warnings.slice(0, 5));
ncaabResult.games.forEach((g, i) => {
  console.log(`  ${i+1}. [${g.anGameId}] ${g.awayName} @ ${g.homeName} | Open: ${g.openAwaySpread?.line}/${g.openHomeSpread?.line} | DK: ${g.dkAwaySpread?.line}/${g.dkHomeSpread?.line}`);
});

// Test NBA
const nbaHtml = readFileSync('/home/ubuntu/Downloads/nba_all_markets.html', 'utf-8');
const nbaResult = parseAnAllMarketsHtml(nbaHtml, 'nba');
console.log(`\n=== NBA ===`);
console.log(`Games parsed: ${nbaResult.games.length}`);
console.log(`DK column: ${nbaResult.dkColumnIndex}`);
nbaResult.games.forEach((g, i) => {
  console.log(`  ${i+1}. [${g.anGameId}] ${g.awayName} @ ${g.homeName} | Open: ${g.openAwaySpread?.line}/${g.openHomeSpread?.line} | DK: ${g.dkAwaySpread?.line}/${g.dkHomeSpread?.line}`);
});

// Test NHL
const nhlHtml = readFileSync('/home/ubuntu/Downloads/nhl_all_markets.html', 'utf-8');
const nhlResult = parseAnAllMarketsHtml(nhlHtml, 'nhl');
console.log(`\n=== NHL ===`);
console.log(`Games parsed: ${nhlResult.games.length}`);
console.log(`DK column: ${nhlResult.dkColumnIndex}`);
nhlResult.games.forEach((g, i) => {
  console.log(`  ${i+1}. [${g.anGameId}] ${g.awayName} @ ${g.homeName} | Open ML: ${g.openAwayML?.line}/${g.openHomeML?.line} | DK ML: ${g.dkAwayML?.line}/${g.dkHomeML?.line}`);
});
