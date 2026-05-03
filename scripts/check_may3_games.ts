import { getDb, listGamesByDate } from '../server/db';
import { games } from '../drizzle/schema';
import { eq, and } from 'drizzle-orm';

async function main() {
  const db = await getDb();
  const mlb = await db!.select({
    id: games.id,
    awayTeam: games.awayTeam,
    homeTeam: games.homeTeam,
    gameTime: games.gameTime,
    bookSpreadAway: games.bookSpreadAway,
    bookTotal: games.bookTotal,
    bookMoneyAway: games.bookMoneyAway,
    bookMoneyHome: games.bookMoneyHome,
    spreadAwayBetsPct: games.spreadAwayBetsPct,
    spreadAwayMoneyPct: games.spreadAwayMoneyPct,
    totalOverBetsPct: games.totalOverBetsPct,
    totalOverMoneyPct: games.totalOverMoneyPct,
    mlAwayBetsPct: games.mlAwayBetsPct,
    mlAwayMoneyPct: games.mlAwayMoneyPct,
    projectionPublished: games.projectionPublished,
  }).from(games).where(and(eq(games.gameDate, '2026-05-03'), eq(games.sport, 'MLB'))).orderBy(games.gameTime);

  const nhl = await db!.select({
    id: games.id,
    awayTeam: games.awayTeam,
    homeTeam: games.homeTeam,
    gameTime: games.gameTime,
    bookSpreadAway: games.bookSpreadAway,
    bookTotal: games.bookTotal,
    bookMoneyAway: games.bookMoneyAway,
    bookMoneyHome: games.bookMoneyHome,
    spreadAwayBetsPct: games.spreadAwayBetsPct,
    spreadAwayMoneyPct: games.spreadAwayMoneyPct,
    totalOverBetsPct: games.totalOverBetsPct,
    totalOverMoneyPct: games.totalOverMoneyPct,
    mlAwayBetsPct: games.mlAwayBetsPct,
    mlAwayMoneyPct: games.mlAwayMoneyPct,
    projectionPublished: games.projectionPublished,
  }).from(games).where(and(eq(games.gameDate, '2026-05-03'), eq(games.sport, 'NHL'))).orderBy(games.gameTime);

  console.log('=== MLB May 3 (' + mlb.length + ' games) ===');
  for (const g of mlb) {
    console.log(JSON.stringify(g));
  }
  console.log('=== NHL May 3 (' + nhl.length + ' games) ===');
  for (const g of nhl) {
    console.log(JSON.stringify(g));
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
