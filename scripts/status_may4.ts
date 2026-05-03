import "dotenv/config";
import { getDb } from "../server/db";
import { games } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

async function main() {
  const db = await getDb();

  const rows = await db.select({
    id: games.id,
    sport: games.sport,
    awayTeam: games.awayTeam,
    homeTeam: games.homeTeam,
    gameDate: games.gameDate,
    startTimeEst: games.startTimeEst,
    modelRunAt: games.modelRunAt,
    publishedToFeed: games.publishedToFeed,
    awayModelSpread: games.awayModelSpread,
    modelTotal: games.modelTotal,
    modelAwayML: games.modelAwayML,
    awayBookSpread: games.awayBookSpread,
    bookTotal: games.bookTotal,
    awayML: games.awayML,
    homeML: games.homeML,
    awayStartingPitcher: games.awayStartingPitcher,
    homeStartingPitcher: games.homeStartingPitcher,
    // splits
    spreadAwayBetsPct: games.spreadAwayBetsPct,
    totalOverBetsPct: games.totalOverBetsPct,
    mlAwayBetsPct: games.mlAwayBetsPct,
  }).from(games)
    .where(and(eq(games.gameDate, "2026-05-04"), eq(games.sport, "MLB")))
    .orderBy(games.startTimeEst, games.id);

  console.log(`\n=== MAY 4, 2026 MLB STATUS ===`);
  const modeled = rows.filter(r => r.modelRunAt !== null);
  const published = rows.filter(r => r.publishedToFeed);
  console.log(`Total: ${rows.length} games | Modeled: ${modeled.length}/${rows.length} | Published: ${published.length}/${rows.length}`);

  console.log(`\n--- GAME DETAIL ---`);
  for (const g of rows) {
    const modelStatus = g.modelRunAt ? "✅ MODELED" : "⏳ PENDING";
    const pubStatus = g.publishedToFeed ? "📢 PUB" : "—";
    const hasOdds = g.awayBookSpread !== null && g.bookTotal !== null && g.awayML !== null;
    const hasSplits = g.spreadAwayBetsPct !== null && g.totalOverBetsPct !== null && g.mlAwayBetsPct !== null;
    const hasPitchers = g.awayStartingPitcher !== null && g.homeStartingPitcher !== null;
    const oddsStatus = hasOdds ? "✅ ODDS" : "❌ NO_ODDS";
    const splitsStatus = hasSplits ? "✅ SPLITS" : "❌ NO_SPLITS";
    const pitcherStatus = hasPitchers ? "✅ SP" : "❌ NO_SP";

    console.log(`[${g.id}] ${g.awayTeam}@${g.homeTeam} ${g.startTimeEst ?? "TBD"} | ${modelStatus} ${pubStatus}`);
    console.log(`       ${oddsStatus} RL=${g.awayBookSpread ?? "—"} Tot=${g.bookTotal ?? "—"} ML=${g.awayML ?? "—"}/${g.homeML ?? "—"}`);
    console.log(`       ${splitsStatus} Spread=${g.spreadAwayBetsPct ?? "—"}% Total=${g.totalOverBetsPct ?? "—"}% ML=${g.mlAwayBetsPct ?? "—"}%`);
    console.log(`       ${pitcherStatus} Away=${g.awayStartingPitcher ?? "TBD"} Home=${g.homeStartingPitcher ?? "TBD"}`);
    if (g.modelRunAt) {
      console.log(`       Model: RL=${g.awayModelSpread ?? "—"} Tot=${g.modelTotal ?? "—"} ML=${g.modelAwayML ?? "—"}`);
    }
  }

  process.exit(0);
}

main().catch(e => { console.error("ERROR:", e); process.exit(1); });
