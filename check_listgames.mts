import 'dotenv/config';
import { listGames } from './server/db.js';

async function main() {
  // Check what listGames returns for MLB today
  const today = '2026-03-25';
  const rows = await listGames({ gameDate: today, sport: 'MLB' });
  console.log(`listGames MLB ${today}: ${rows.length} rows`);
  rows.forEach(r => console.log(' -', r.awayTeam, '@', r.homeTeam, 'spread:', r.awayBookSpread, 'spreadPct:', r.spreadAwayBetsPct));
  
  // Also check with no sport filter
  const allRows = await listGames({ gameDate: today });
  console.log(`\nlistGames ALL ${today}: ${allRows.length} rows`);
  allRows.forEach(r => console.log(' -', r.sport, r.awayTeam, '@', r.homeTeam));
}
main().catch(console.error);
