import 'dotenv/config';
import { getDb } from './server/db.js';
import { games } from './drizzle/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('NO DB'); process.exit(1); }
  const rows = await db.select({
    id: games.id,
    gameDate: games.gameDate,
    awayTeam: games.awayTeam,
    homeTeam: games.homeTeam,
    startTimeEst: games.startTimeEst,
  }).from(games).where(eq(games.sport, 'MLB')).limit(5);
  console.log('MLB DB slugs:');
  rows.forEach(r => console.log(`  id=${r.id} date=${r.gameDate} away="${r.awayTeam}" home="${r.homeTeam}" time="${r.startTimeEst}"`));
}
main().catch(console.error);
