/**
 * Simple diagnostic: fetch VSIN page and show raw row data for MLB games.
 * Uses Node.js built-in fetch.
 */
import { writeFileSync } from 'fs';

const resp = await fetch("https://data.vsin.com/betting-splits/?source=DK&view=today", {
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Accept: "text/html",
  }
});

console.log(`HTTP ${resp.status}`);
const html = await resp.text();
console.log(`HTML length: ${html.length}`);

// Extract all MLB game rows using regex
const mlbSection = html.match(/MLB - Friday[\s\S]*?(?=NBA -|NHL -|UFL -|<\/tbody>)/);
if (!mlbSection) {
  console.log('No MLB section found');
  process.exit(1);
}

const mlbHtml = mlbSection[0];
console.log(`MLB section length: ${mlbHtml.length}`);

// Find all game rows
const rowMatches = mlbHtml.match(/<tr class="sp-row[^"]*">([\s\S]*?)<\/tr>/g) ?? [];
console.log(`Found ${rowMatches.length} rows (${Math.floor(rowMatches.length / 2)} game pairs)\n`);

// Extract gamecodes
const gamecodes = mlbHtml.match(/data-gamecode="(\d{8}MLB\d+)"/g) ?? [];
const uniqueGamecodes = [...new Set(gamecodes.map(g => g.match(/"([^"]+)"/)?.[1] ?? ''))];
console.log(`Unique gamecodes: ${uniqueGamecodes.length}`);
for (const gc of uniqueGamecodes) {
  if (gc.startsWith('20260501')) console.log(`  ${gc}`);
}

// Save the MLB section for inspection
writeFileSync('/home/ubuntu/mlb_section.html', mlbHtml);
console.log('\nSaved MLB section to /home/ubuntu/mlb_section.html');
