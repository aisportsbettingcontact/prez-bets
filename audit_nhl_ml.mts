import { getDb } from './server/db.ts';
import { games } from './drizzle/schema.ts';
import { eq, and } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.error('No DB'); process.exit(1); }
  
  const rows = await db.select({
    id: games.id,
    awayTeam: games.awayTeam,
    homeTeam: games.homeTeam,
    gameDate: games.gameDate,
    awayBookSpread: games.awayBookSpread,
    homeBookSpread: games.homeBookSpread,
    bookTotal: games.bookTotal,
    awayML: games.awayML,
    homeML: games.homeML,
    sport: games.sport,
    publishedToFeed: games.publishedToFeed,
    startTimeEst: games.startTimeEst,
  }).from(games).where(and(eq(games.gameDate, '2026-03-12'), eq(games.sport, 'NHL')));

  console.log(`\n=== NHL GAMES TODAY (2026-03-12): ${rows.length} ===\n`);
  
  let missingML = 0;
  let missingSpread = 0;
  let missingTotal = 0;
  let notPublished = 0;
  
  for (const r of rows) {
    const mlStatus = (r.awayML && r.homeML) ? '✓ ML' : '✗ ML MISSING';
    const spreadStatus = (r.awayBookSpread !== null) ? '✓ SPR' : '✗ SPR MISSING';
    const totalStatus = (r.bookTotal !== null) ? '✓ TOT' : '✗ TOT MISSING';
    const pubStatus = r.publishedToFeed ? '✓ PUB' : '✗ NOT PUBLISHED';
    
    console.log(`[${r.id}] ${r.awayTeam} vs ${r.homeTeam} @ ${r.startTimeEst}`);
    console.log(`  Spread: ${r.awayBookSpread} / ${r.homeBookSpread} | Total: ${r.bookTotal} | ML: ${r.awayML} / ${r.homeML}`);
    console.log(`  Status: ${spreadStatus} | ${totalStatus} | ${mlStatus} | ${pubStatus}`);
    console.log('');
    
    if (!r.awayML || !r.homeML) missingML++;
    if (r.awayBookSpread === null) missingSpread++;
    if (r.bookTotal === null) missingTotal++;
    if (!r.publishedToFeed) notPublished++;
  }
  
  console.log('=== SUMMARY ===');
  console.log(`Total games: ${rows.length}`);
  console.log(`Missing ML: ${missingML}`);
  console.log(`Missing Spread: ${missingSpread}`);
  console.log(`Missing Total: ${missingTotal}`);
  console.log(`Not published to feed: ${notPublished}`);
  
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
