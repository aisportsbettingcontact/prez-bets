import "dotenv/config";
import { getDb } from "./server/db";
import { games } from "./drizzle/schema";
import { eq, and } from "drizzle-orm";

async function main() {
  const db = await getDb();
  const rows = await db.select({
    id: games.id,
    away: games.awayTeam,
    home: games.homeTeam,
    awayML: games.awayML,
    homeML: games.homeML,
    awaySpread: games.awayBookSpread,
    homeSpread: games.homeBookSpread,
    awaySpreadOdds: games.awaySpreadOdds,
    homeSpreadOdds: games.homeSpreadOdds,
    total: games.bookTotal,
    overOdds: games.overOdds,
    underOdds: games.underOdds,
    openAwayML: games.openAwayML,
    openHomeML: games.openHomeML,
    openTotal: games.openTotal,
    openAwaySpread: games.openAwaySpread,
    openHomeSpread: games.openHomeSpread,
    modelAwayWinPct: games.modelAwayWinPct,
    modelTotal: games.modelTotal,
    modelAwayScore: games.modelAwayScore,
    modelHomeScore: games.modelHomeScore,
    modelAwayML: games.modelAwayML,
    modelHomeML: games.modelHomeML,
    published: games.isPublished,
    status: games.gameStatus,
    startTimeEst: games.startTimeEst,
  }).from(games)
    .where(and(eq(games.gameDate, "2026-04-07"), eq(games.sport, "NHL")));

  console.log(`\n${"=".repeat(70)}`);
  console.log(`[STATE] April 7 NHL Games (${rows.length} total)`);
  console.log(`${"=".repeat(70)}`);

  let oddsCount = 0;
  let modeledCount = 0;
  let publishedCount = 0;

  for (const r of rows) {
    const hasOdds = !!(r.awayML && r.homeML && r.total && r.awaySpread);
    const modeled = r.modelAwayWinPct !== null;
    const pub = r.published === 1;
    if (hasOdds) oddsCount++;
    if (modeled) modeledCount++;
    if (pub) publishedCount++;

    console.log(
      `  ${r.away}@${r.home} [${r.startTimeEst}] | ` +
      `ML=${r.awayML}/${r.homeML} | ` +
      `PL=${r.awaySpread ?? "n/a"}(${r.awaySpreadOdds ?? "n/a"})/${r.homeSpread ?? "n/a"}(${r.homeSpreadOdds ?? "n/a"}) | ` +
      `total=${r.total ?? "n/a"}(o${r.overOdds ?? "-110"}/u${r.underOdds ?? "-110"}) | ` +
      `openML=${r.openAwayML ?? "n/a"}/${r.openHomeML ?? "n/a"} | ` +
      `model=${modeled ? `${r.modelAwayScore}/${r.modelHomeScore} tot=${r.modelTotal}` : "PENDING"} | ` +
      `pub=${pub}`
    );
  }

  console.log(`\n[VERIFY] Odds: ${oddsCount}/${rows.length} | Modeled: ${modeledCount}/${rows.length} | Published: ${publishedCount}/${rows.length}`);
  const allOdds = oddsCount === rows.length;
  const allModeled = modeledCount === rows.length;
  console.log(`[VERIFY] Odds: ${allOdds ? "PASS ✅" : "FAIL ❌"} | Model: ${allModeled ? "PASS ✅" : "PENDING ⏳"}`);
  console.log(`${"=".repeat(70)}\n`);

  process.exit(0);
}

main().catch((e) => { console.error("[FAIL]", e); process.exit(1); });
