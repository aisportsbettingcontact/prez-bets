import "dotenv/config";
import { getDb } from "./server/db";
import { sql } from "drizzle-orm";

async function main() {
  const db = await getDb();
  const [rows] = await db.execute(sql`
    SELECT id, awayTeam, homeTeam, awayML, homeML,
           awayBookSpread, homeBookSpread, awaySpreadOdds, homeSpreadOdds,
           bookTotal, overOdds, underOdds,
           openAwayML, openHomeML, openTotal,
           modelAwayWinPct, modelTotal, modelAwayScore, modelHomeScore,
           publishedToFeed, gameStatus, startTimeEst
    FROM games
    WHERE gameDate = '2026-04-07' AND sport = 'NHL'
    ORDER BY sortOrder ASC
  `);

  const games = rows as any[];
  console.log(`\n${"=".repeat(70)}`);
  console.log(`[STATE] April 7 NHL Games (${games.length} total)`);
  console.log(`${"=".repeat(70)}`);

  let oddsOk = 0, modeled = 0, published = 0;

  for (const r of games) {
    const hasOdds = !!(r.awayML && r.homeML && r.bookTotal && r.awayBookSpread);
    const isModeled = r.modelAwayWinPct !== null;
    const isPub = r.publishedToFeed === 1;
    if (hasOdds) oddsOk++;
    if (isModeled) modeled++;
    if (isPub) published++;

    console.log(
      `  ${r.awayTeam}@${r.homeTeam} [${r.startTimeEst}] | ` +
      `ML=${r.awayML ?? "n/a"}/${r.homeML ?? "n/a"} | ` +
      `PL=${r.awayBookSpread ?? "n/a"}(${r.awaySpreadOdds ?? "n/a"})/${r.homeBookSpread ?? "n/a"}(${r.homeSpreadOdds ?? "n/a"}) | ` +
      `total=${r.bookTotal ?? "n/a"}(o${r.overOdds ?? "-110"}/u${r.underOdds ?? "-110"}) | ` +
      `openML=${r.openAwayML ?? "n/a"}/${r.openHomeML ?? "n/a"} | ` +
      `model=${isModeled ? `${r.modelAwayScore}/${r.modelHomeScore} tot=${r.modelTotal} winPct=${r.modelAwayWinPct}` : "PENDING"} | ` +
      `pub=${isPub} status=${r.gameStatus}`
    );
  }

  console.log(`\n[VERIFY] Odds: ${oddsOk}/${games.length} | Modeled: ${modeled}/${games.length} | Published: ${published}/${games.length}`);
  console.log(`[VERIFY] Odds: ${oddsOk === games.length ? "PASS ✅" : "FAIL ❌"} | Model: ${modeled === games.length ? "PASS ✅" : "PENDING ⏳"}`);
  console.log(`${"=".repeat(70)}\n`);

  process.exit(0);
}

main().catch((e) => { console.error("[FAIL]", e); process.exit(1); });
