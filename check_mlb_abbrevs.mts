import 'dotenv/config';
import { getDb } from './server/db.js';
import { games } from './drizzle/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('NO DB'); process.exit(1); }
  const rows = await db.selectDistinct({
    awayTeam: games.awayTeam,
  }).from(games).where(eq(games.sport, 'MLB'));
  const homeRows = await db.selectDistinct({
    homeTeam: games.homeTeam,
  }).from(games).where(eq(games.sport, 'MLB'));
  
  const all = new Set([
    ...rows.map(r => r.awayTeam),
    ...homeRows.map(r => r.homeTeam),
  ]);
  console.log('All MLB team values in DB:', [...all].sort().join(', '));
}
main().catch(console.error);
