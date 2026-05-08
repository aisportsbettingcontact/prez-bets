import "dotenv/config";
import { runMlbModelForDate } from "../server/mlbModelRunner";
import { syncNhlModelForToday } from "../server/nhlModelSync";
import { publishAllStagingGames } from "../server/db";
import { getDb } from "../server/db";
import { games } from "../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";

const TAG = "[RunMay8Remaining]";
const DATE = "2026-05-08";

async function main() {
  console.log(`\n${TAG} ${"═".repeat(60)}`);
  console.log(`${TAG} MAY 8 — REMAINING GAMES + PUBLISH`);
  console.log(`${TAG} ${"═".repeat(60)}`);

  // ── Step 1: Find unmodeled MLB games ─────────────────────────────────────
  const db = await getDb();
  const unmodeled = await db.select({
    id: games.id,
    awayTeam: games.awayTeam,
    homeTeam: games.homeTeam,
  }).from(games)
    .where(and(
      eq(games.gameDate, DATE),
      eq(games.sport, "MLB"),
      isNull(games.modelRunAt)
    ));

  console.log(`\n${TAG} [INPUT] Unmodeled MLB games: ${unmodeled.length}`);
  for (const g of unmodeled) {
    console.log(`${TAG}   → [${g.id}] ${g.awayTeam}@${g.homeTeam}`);
  }

  if (unmodeled.length > 0) {
    // ── Step 2: Run MLB model for unmodeled games only ──────────────────────
    console.log(`\n${TAG} ► STEP 2: Running MLB model for ${unmodeled.length} remaining games...`);
    const mlbResult = await runMlbModelForDate(DATE, {
      forceRerun: false,  // Only run games where modelRunAt IS NULL
    });

    console.log(`\n${TAG} [OUTPUT] MLB engine result:`);
    console.log(`${TAG}   total=${mlbResult.total} | written=${mlbResult.written} | skipped=${mlbResult.skipped} | errors=${mlbResult.errors}`);

    if (mlbResult.validation?.issues?.length) {
      console.log(`${TAG}   ❌ Validation issues:`);
      for (const issue of mlbResult.validation.issues) {
        console.log(`${TAG}     ✗ ${issue}`);
      }
    }
  } else {
    console.log(`${TAG} ✅ All MLB games already modeled — skipping MLB model run`);
  }

  // ── Step 3: Re-run NHL model (force) ─────────────────────────────────────
  console.log(`\n${TAG} ► STEP 3: Running NHL model for ${DATE} (forceRerun=true)...`);
  const nhlResult = await syncNhlModelForToday("manual", true, false, DATE);
  console.log(`${TAG} [OUTPUT] NHL: synced=${nhlResult.synced} | skipped=${nhlResult.skipped} | errors=${nhlResult.errors.length}`);
  if (nhlResult.errors.length > 0) {
    for (const err of nhlResult.errors) {
      console.log(`${TAG}   ❌ NHL error: ${err}`);
    }
  }

  // ── Step 4: Publish all MLB games ─────────────────────────────────────────
  console.log(`\n${TAG} ► STEP 4: Publishing all MLB games for ${DATE}...`);
  await publishAllStagingGames(DATE, "MLB");
  console.log(`${TAG} ✅ MLB published`);

  // ── Step 5: Publish all NHL games ─────────────────────────────────────────
  console.log(`\n${TAG} ► STEP 5: Publishing all NHL games for ${DATE}...`);
  await publishAllStagingGames(DATE, "NHL");
  console.log(`${TAG} ✅ NHL published`);

  // ── Step 6: Final DB verification ─────────────────────────────────────────
  console.log(`\n${TAG} ► STEP 6: Final verification...`);
  const allGames = await db.select({
    id: games.id,
    sport: games.sport,
    awayTeam: games.awayTeam,
    homeTeam: games.homeTeam,
    modelRunAt: games.modelRunAt,
    publishedToFeed: games.publishedToFeed,
    publishedModel: games.publishedModel,
    awayBookSpread: games.awayBookSpread,
    bookTotal: games.bookTotal,
    awayML: games.awayML,
    homeML: games.homeML,
    awaySpreadOdds: games.awaySpreadOdds,
    homeSpreadOdds: games.homeSpreadOdds,
    overOdds: games.overOdds,
    underOdds: games.underOdds,
    awayModelSpread: games.awayModelSpread,
    modelTotal: games.modelTotal,
    modelAwayML: games.modelAwayML,
    modelHomeML: games.modelHomeML,
    modelOverOdds: games.modelOverOdds,
    modelUnderOdds: games.modelUnderOdds,
    spreadEdge: games.spreadEdge,
    totalEdge: games.totalEdge,
    mlEdge: games.mlEdge,
    spreadAwayBetsPct: games.spreadAwayBetsPct,
    totalOverBetsPct: games.totalOverBetsPct,
    mlAwayBetsPct: games.mlAwayBetsPct,
    awayStartingPitcher: games.awayStartingPitcher,
    homeStartingPitcher: games.homeStartingPitcher,
    awayGoalie: games.awayGoalie,
    homeGoalie: games.homeGoalie,
    startTimeEst: games.startTimeEst,
  }).from(games)
    .where(and(eq(games.gameDate, DATE)))
    .orderBy(games.sport, games.startTimeEst, games.id);

  const mlbGames = allGames.filter(g => g.sport === "MLB");
  const nhlGames = allGames.filter(g => g.sport === "NHL");

  let totalIssues = 0;

  for (const sportGames of [mlbGames, nhlGames]) {
    if (sportGames.length === 0) continue;
    const sport = sportGames[0].sport;
    const modeled   = sportGames.filter(g => g.modelRunAt !== null).length;
    const published = sportGames.filter(g => g.publishedToFeed).length;

    console.log(`\n${TAG} ══ ${sport} FINAL STATUS (${sportGames.length} games) ══`);
    console.log(`${TAG}   Modeled  : ${modeled}/${sportGames.length} ${modeled === sportGames.length ? "✅" : "❌"}`);
    console.log(`${TAG}   Published: ${published}/${sportGames.length} ${published === sportGames.length ? "✅" : "❌"}`);
    console.log(`${TAG} ${"─".repeat(60)}`);

    for (const g of sportGames) {
      const matchup = `${g.awayTeam}@${g.homeTeam}`;
      const issues: string[] = [];

      if (!g.modelRunAt)       issues.push("NOT_MODELED");
      if (!g.publishedToFeed)  issues.push("NOT_PUBLISHED");
      if (!g.publishedModel)   issues.push("publishedModel=false");
      if (!g.awayBookSpread)   issues.push("missing_book_spread");
      if (!g.bookTotal)        issues.push("missing_book_total");
      if (!g.awayML)           issues.push("missing_away_ML");
      if (!g.awaySpreadOdds)   issues.push("missing_spread_odds");
      if (!g.overOdds)         issues.push("missing_over_odds");
      if (!g.spreadAwayBetsPct) issues.push("missing_spread_splits");
      if (!g.totalOverBetsPct)  issues.push("missing_total_splits");
      if (!g.mlAwayBetsPct)     issues.push("missing_ML_splits");
      if (g.modelRunAt && !g.modelTotal)   issues.push("model_total_null");
      if (g.modelRunAt && !g.modelAwayML)  issues.push("model_ML_null");
      if (sport === "MLB" && !g.awayStartingPitcher) issues.push("missing_away_SP");
      if (sport === "MLB" && !g.homeStartingPitcher) issues.push("missing_home_SP");
      if (sport === "NHL" && !g.awayGoalie) issues.push("missing_away_goalie");
      if (sport === "NHL" && !g.homeGoalie) issues.push("missing_home_goalie");

      const status = issues.length === 0 ? "✅" : "❌";
      console.log(`\n${TAG}   ${status} [${g.id}] ${matchup} | ${g.startTimeEst ?? "TBD"}`);
      console.log(`${TAG}      Book  : Spread=${g.awayBookSpread ?? "—"}(${g.awaySpreadOdds ?? "—"}/${g.homeSpreadOdds ?? "—"}) | Total=${g.bookTotal ?? "—"}(${g.overOdds ?? "—"}/${g.underOdds ?? "—"}) | ML=${g.awayML ?? "—"}/${g.homeML ?? "—"}`);
      console.log(`${TAG}      Model : Spread=${g.awayModelSpread ?? "—"} | Total=${g.modelTotal ?? "—"}(${g.modelOverOdds ?? "—"}/${g.modelUnderOdds ?? "—"}) | ML=${g.modelAwayML ?? "—"}/${g.modelHomeML ?? "—"}`);
      console.log(`${TAG}      Splits: Spread=${g.spreadAwayBetsPct ?? "—"}% | Total=${g.totalOverBetsPct ?? "—"}% | ML=${g.mlAwayBetsPct ?? "—"}%`);
      console.log(`${TAG}      Edges : [${g.spreadEdge ?? "none"}] | [${g.totalEdge ?? "none"}] | [${g.mlEdge ?? "none"}]`);
      if (sport === "MLB") {
        console.log(`${TAG}      SPs  : ${g.awayStartingPitcher ?? "TBD"} vs ${g.homeStartingPitcher ?? "TBD"}`);
      } else {
        console.log(`${TAG}      GLs  : ${g.awayGoalie ?? "TBD"} vs ${g.homeGoalie ?? "TBD"}`);
      }
      if (issues.length > 0) {
        for (const iss of issues) {
          console.log(`${TAG}      ❌ ${iss}`);
          totalIssues++;
        }
      }
    }
  }

  console.log(`\n${TAG} ${"═".repeat(60)}`);
  if (totalIssues === 0) {
    console.log(`${TAG} ✅ ALL 17 GAMES VERIFIED — May 8 MLB + NHL complete`);
  } else {
    console.log(`${TAG} ❌ ${totalIssues} TOTAL ISSUES FOUND — review above`);
  }
  console.log(`${TAG} ${"═".repeat(60)}`);
  process.exit(0);
}

main().catch(e => {
  console.error(`${TAG} FATAL:`, e);
  process.exit(1);
});
