import "dotenv/config";
import { getDb } from "../server/db";
import { games } from "../drizzle/schema";
import { eq, and, or } from "drizzle-orm";

async function main() {
  const db = await getDb();

  const rows = await db.select({
    id: games.id,
    sport: games.sport,
    awayTeam: games.awayTeam,
    homeTeam: games.homeTeam,
    gameDate: games.gameDate,
    modelRunAt: games.modelRunAt,
    publishedToFeed: games.publishedToFeed,
    awayModelSpread: games.awayModelSpread,
    modelTotal: games.modelTotal,
    modelAwayML: games.modelAwayML,
    awayBookSpread: games.awayBookSpread,
    bookTotal: games.bookTotal,
    awayML: games.awayML,
    homeML: games.homeML,
  }).from(games)
    .where(
      and(
        or(eq(games.gameDate, "2026-05-03")),
        or(eq(games.sport, "MLB"), eq(games.sport, "NHL"))
      )
    )
    .orderBy(games.sport, games.id);

  const mlb = rows.filter(r => r.sport === "MLB");
  const nhl = rows.filter(r => r.sport === "NHL");

  const mlbModeled = mlb.filter(r => r.modelRunAt !== null);
  const mlbPublished = mlb.filter(r => r.publishedToFeed);
  const nhlModeled = nhl.filter(r => r.modelRunAt !== null);
  const nhlPublished = nhl.filter(r => r.publishedToFeed);

  console.log(`\n=== MAY 3, 2026 MODEL STATUS ===`);
  console.log(`MLB: ${mlbModeled.length}/${mlb.length} modeled | ${mlbPublished.length}/${mlb.length} published`);
  console.log(`NHL: ${nhlModeled.length}/${nhl.length} modeled | ${nhlPublished.length}/${nhl.length} published`);

  console.log(`\n--- MLB GAMES ---`);
  for (const g of mlb) {
    const modeled = g.modelRunAt ? "✅ MODELED" : "⏳ PENDING";
    const published = g.publishedToFeed ? "📢 PUBLISHED" : "—";
    const spread = g.awayModelSpread ?? "—";
    const total = g.modelTotal ?? "—";
    const ml = g.modelAwayML ?? "—";
    const bookSpread = g.awayBookSpread ?? "—";
    const bookTotal = g.bookTotal ?? "—";
    const bookML = g.awayML ?? "—";
    console.log(`[${g.id}] ${g.awayTeam}@${g.homeTeam} | ${modeled} ${published}`);
    console.log(`       Book: RL=${bookSpread} Tot=${bookTotal} ML=${bookML} | Model: RL=${spread} Tot=${total} ML=${ml}`);
  }

  console.log(`\n--- NHL GAMES ---`);
  for (const g of nhl) {
    const modeled = g.modelRunAt ? "✅ MODELED" : "⏳ PENDING";
    const published = g.publishedToFeed ? "📢 PUBLISHED" : "—";
    const spread = g.awayModelSpread ?? "—";
    const total = g.modelTotal ?? "—";
    const ml = g.modelAwayML ?? "—";
    const bookSpread = g.awayBookSpread ?? "—";
    const bookTotal = g.bookTotal ?? "—";
    const bookML = g.awayML ?? "—";
    console.log(`[${g.id}] ${g.awayTeam}@${g.homeTeam} | ${modeled} ${published}`);
    console.log(`       Book: PL=${bookSpread} Tot=${bookTotal} ML=${bookML} | Model: PL=${spread} Tot=${total} ML=${ml}`);
  }

  process.exit(0);
}

main().catch(e => { console.error("ERROR:", e); process.exit(1); });
