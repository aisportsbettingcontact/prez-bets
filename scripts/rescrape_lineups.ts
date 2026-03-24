/**
 * One-off script: re-scrape Rotowire lineups and update DB.
 * Run with: npx tsx scripts/rescrape_lineups.ts
 */
import { scrapeRotowireLineupsBoth, upsertLineupsToDB } from "../server/rotowireLineupScraper.js";

console.log("=== Re-scraping Rotowire lineups ===");
const result = await scrapeRotowireLineupsBoth();
console.log(`Today: ${result.today.cardsParsed} parsed, ${result.today.cardsSkipped} skipped`);
console.log(`Tomorrow: ${result.tomorrow.cardsParsed} parsed, ${result.tomorrow.cardsSkipped} skipped`);
console.log(`Combined: ${result.combined.length} unique games`);

if (result.combined.length > 0) {
  const upsert = await upsertLineupsToDB(result.combined);
  console.log(`Upsert: saved=${upsert.saved} skipped=${upsert.skipped} errors=${upsert.errors}`);
} else {
  console.log("No games to upsert");
}
process.exit(0);
