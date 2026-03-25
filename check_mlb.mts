import 'dotenv/config';
import { getDb } from './server/db.js';
import { games } from './drizzle/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  if (!db) { console.log('NO DB'); process.exit(1); }
  const rows = await db.select({
    gameDate: games.gameDate,
    awayTeam: games.awayTeam,
    homeTeam: games.homeTeam,
    awayBookSpread: games.awayBookSpread,
    bookTotal: games.bookTotal,
    spreadAwayBetsPct: games.spreadAwayBetsPct,
    mlAwayBetsPct: games.mlAwayBetsPct,
  }).from(games).where(eq(games.sport, 'MLB')).limit(20);
  console.log('MLB rows in DB:', rows.length);
  rows.forEach(r => console.log(
    r.gameDate,
    r.awayTeam, '@', r.homeTeam,
    '| spread:', r.awayBookSpread,
    '| total:', r.bookTotal,
    '| spreadPct:', r.spreadAwayBetsPct,
    '| mlPct:', r.mlAwayBetsPct
  ));
}
main().catch(console.error);
