import { createRequire } from 'module';
import { register } from 'node:module';

// Use tsx to run this
const { scrapeNbaVsinOdds } = await import('./server/nbaVsinScraper.ts');
const results = await scrapeNbaVsinOdds('2026-03-13');
console.log(JSON.stringify(results.slice(0, 3), null, 2));
console.log(`Total: ${results.length} games`);
