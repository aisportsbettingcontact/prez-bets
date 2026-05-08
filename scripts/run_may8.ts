import "dotenv/config";
import { runMlbModelForDate } from "../server/mlbModelRunner";
import { syncNhlModelForToday } from "../server/nhlModelSync";
import { publishAllStagingGames } from "../server/db";
import { getDb } from "../server/db";
import { games } from "../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";

const TAG = "[RunMay8]";
const DATE = "2026-05-08";

async function verifyGames(sport: "MLB" | "NHL"): Promise<void> {
  const db = await getDb();
  const rows = await db.select({
    id: games.id,
    awayTeam: games.awayTeam,
    homeTeam: games.homeTeam,
    modelRunAt: games.modelRunAt,
    publishedToFeed: games.publishedToFeed,
    publishedModel: games.publishedModel,
    awayModelSpread: games.awayModelSpread,
    homeModelSpread: games.homeModelSpread,
    modelTotal: games.modelTotal,
    modelAwayML: games.modelAwayML,
    modelHomeML: games.modelHomeML,
    modelOverOdds: games.modelOverOdds,
    modelUnderOdds: games.modelUnderOdds,
    awayBookSpread: games.awayBookSpread,
    bookTotal: games.bookTotal,
    awayML: games.awayML,
    homeML: games.homeML,
    awaySpreadOdds: games.awaySpreadOdds,
    homeSpreadOdds: games.homeSpreadOdds,
    overOdds: games.overOdds,
    underOdds: games.underOdds,
    spreadEdge: games.spreadEdge,
    totalEdge: games.totalEdge,
    mlEdge: games.mlEdge,
    spreadAwayBetsPct: games.spreadAwayBetsPct,
    spreadAwayMoneyPct: games.spreadAwayMoneyPct,
    totalOverBetsPct: games.totalOverBetsPct,
    totalOverMoneyPct: games.totalOverMoneyPct,
    mlAwayBetsPct: games.mlAwayBetsPct,
    mlAwayMoneyPct: games.mlAwayMoneyPct,
    awayStartingPitcher: games.awayStartingPitcher,
    homeStartingPitcher: games.homeStartingPitcher,
    awayGoalie: games.awayGoalie,
    homeGoalie: games.homeGoalie,
    startTimeEst: games.startTimeEst,
  }).from(games)
    .where(and(eq(games.gameDate, DATE), eq(games.sport, sport)))
    .orderBy(games.startTimeEst, games.id);

  const modeled   = rows.filter(r => r.modelRunAt !== null).length;
  const published = rows.filter(r => r.publishedToFeed).length;

  console.log(`\n${TAG} ══ ${sport} POST-RUN VERIFICATION (${rows.length} games) ══`);
  console.log(`${TAG}   Modeled  : ${modeled}/${rows.length}`);
  console.log(`${TAG}   Published: ${published}/${rows.length}`);
  console.log(`${TAG} ${"─".repeat(60)}`);

  let issues = 0;
  for (const g of rows) {
    const matchup = `${g.awayTeam}@${g.homeTeam}`;
    const modStatus = g.modelRunAt ? "✅ MODELED" : "❌ NOT_MODELED";
    const pubStatus = g.publishedToFeed ? "📢 PUBLISHED" : "❌ NOT_PUBLISHED";

    console.log(`\n${TAG}   [${g.id}] ${matchup} | ${g.startTimeEst ?? "TBD"}`);
    console.log(`${TAG}     Status  : ${modStatus} | ${pubStatus}`);

    // Book odds
    console.log(`${TAG}     Book    : Spread=${g.awayBookSpread ?? "—"} (${g.awaySpreadOdds ?? "—"}/${g.homeSpreadOdds ?? "—"}) | Total=${g.bookTotal ?? "—"} (${g.overOdds ?? "—"}/${g.underOdds ?? "—"}) | ML=${g.awayML ?? "—"}/${g.homeML ?? "—"}`);

    // Splits
    console.log(`${TAG}     Splits  : Spread=${g.spreadAwayBetsPct ?? "—"}%/${g.spreadAwayMoneyPct ?? "—"}% | Total=${g.totalOverBetsPct ?? "—"}%/${g.totalOverMoneyPct ?? "—"}% | ML=${g.mlAwayBetsPct ?? "—"}%/${g.mlAwayMoneyPct ?? "—"}%`);

    // Pitchers/Goalies
    if (sport === "MLB") {
      console.log(`${TAG}     Pitchers: Away=${g.awayStartingPitcher ?? "TBD"} | Home=${g.homeStartingPitcher ?? "TBD"}`);
    } else {
      console.log(`${TAG}     Goalies : Away=${g.awayGoalie ?? "TBD"} | Home=${g.homeGoalie ?? "TBD"}`);
    }

    // Model output
    if (g.modelRunAt) {
      console.log(`${TAG}     Model   : Spread=${g.awayModelSpread ?? "—"} (${sport === "MLB" ? "RL" : "PL"}) | Total=${g.modelTotal ?? "—"} (${g.modelOverOdds ?? "—"}/${g.modelUnderOdds ?? "—"}) | ML=${g.modelAwayML ?? "—"}/${g.modelHomeML ?? "—"}`);
      console.log(`${TAG}     Edges   : Spread=[${g.spreadEdge ?? "none"}] | Total=[${g.totalEdge ?? "none"}] | ML=[${g.mlEdge ?? "none"}]`);
    } else {
      console.log(`${TAG}     ⚠️  NO MODEL OUTPUT`);
      issues++;
    }

    // Validation checks
    const validationErrors: string[] = [];
    if (!g.publishedToFeed) validationErrors.push("not published to feed");
    if (!g.publishedModel)  validationErrors.push("publishedModel=false");
    if (g.modelRunAt && !g.modelTotal) validationErrors.push("modelTotal is null");
    if (g.modelRunAt && !g.modelAwayML) validationErrors.push("modelAwayML is null");
    if (sport === "MLB" && !g.awayStartingPitcher) validationErrors.push("missing away SP");
    if (sport === "MLB" && !g.homeStartingPitcher) validationErrors.push("missing home SP");
    if (!g.awayBookSpread) validationErrors.push("missing book spread");
    if (!g.bookTotal) validationErrors.push("missing book total");
    if (!g.awayML) validationErrors.push("missing away ML");
    if (!g.spreadAwayBetsPct) validationErrors.push("missing spread splits");
    if (!g.totalOverBetsPct) validationErrors.push("missing total splits");
    if (!g.mlAwayBetsPct) validationErrors.push("missing ML splits");

    if (validationErrors.length > 0) {
      for (const err of validationErrors) {
        console.log(`${TAG}     ❌ ISSUE: ${err}`);
        issues++;
      }
    } else {
      console.log(`${TAG}     ✅ ALL CHECKS PASSED`);
    }
  }

  console.log(`\n${TAG} ══ ${sport} SUMMARY: ${issues === 0 ? "✅ ALL CLEAN" : `❌ ${issues} ISSUES FOUND`} ══`);
}

async function main() {
  console.log(`\n${TAG} ${"═".repeat(60)}`);
  console.log(`${TAG} MAY 8, 2026 — FULL MODEL + PUBLISH PIPELINE`);
  console.log(`${TAG} ${"═".repeat(60)}`);

  // ── Step 1: Run MLB model for all 15 games ────────────────────────────────
  console.log(`\n${TAG} ► STEP 1: Running MLB model for ${DATE} (forceRerun=true)...`);
  const mlbResult = await runMlbModelForDate(DATE, { forceRerun: true });

  console.log(`\n${TAG} MLB engine result:`);
  console.log(`${TAG}   total=${mlbResult.total} | written=${mlbResult.written} | skipped=${mlbResult.skipped} | errors=${mlbResult.errors}`);

  if (mlbResult.validation?.issues?.length) {
    console.log(`${TAG}   ❌ Validation issues (${mlbResult.validation.issues.length}):`);
    for (const issue of mlbResult.validation.issues) {
      console.log(`${TAG}     ✗ ${issue}`);
    }
  }
  if (mlbResult.validation?.warnings?.length) {
    console.log(`${TAG}   ⚠️  Warnings (${mlbResult.validation.warnings.length}):`);
    for (const w of mlbResult.validation.warnings) {
      console.log(`${TAG}     ⚠ ${w}`);
    }
  }

  // ── Step 2: Run NHL model for 2 games ─────────────────────────────────────
  console.log(`\n${TAG} ► STEP 2: Running NHL model for ${DATE} (forceRerun=true)...`);
  const nhlResult = await syncNhlModelForToday("manual", true, false, DATE);
  console.log(`${TAG} NHL result: synced=${nhlResult.synced} | skipped=${nhlResult.skipped} | errors=${nhlResult.errors.length}`);
  if (nhlResult.errors.length > 0) {
    for (const err of nhlResult.errors) {
      console.log(`${TAG}   ❌ NHL error: ${err}`);
    }
  }

  // ── Step 3: Publish all MLB games ─────────────────────────────────────────
  console.log(`\n${TAG} ► STEP 3: Publishing all MLB games for ${DATE}...`);
  await publishAllStagingGames(DATE, "MLB");
  console.log(`${TAG} ✅ MLB published`);

  // ── Step 4: Publish all NHL games ─────────────────────────────────────────
  console.log(`\n${TAG} ► STEP 4: Publishing all NHL games for ${DATE}...`);
  await publishAllStagingGames(DATE, "NHL");
  console.log(`${TAG} ✅ NHL published`);

  // ── Step 5: Full verification pass ────────────────────────────────────────
  console.log(`\n${TAG} ► STEP 5: Running full verification pass...`);
  await verifyGames("MLB");
  await verifyGames("NHL");

  console.log(`\n${TAG} ${"═".repeat(60)}`);
  console.log(`${TAG} ✅ ALL DONE — May 8 MLB + NHL modeled and published`);
  console.log(`${TAG} ${"═".repeat(60)}`);
  process.exit(0);
}

main().catch(e => {
  console.error(`${TAG} FATAL:`, e);
  process.exit(1);
});
