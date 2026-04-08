/**
 * run_april8_full_pipeline.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * Full model + publish pipeline for April 8, 2026
 *
 * Steps:
 *   1. AN odds refresh (MLB + NHL) — DK NJ book
 *   2. F5/NRFI scrape (FD NJ) for all 15 MLB games
 *   3. MLB Monte Carlo model for all 15 games
 *   4. K-Props upsert from AN + EV model
 *   5. HR Props seed from AN + EV model
 *   6. NHL Poisson model for all 3 games
 *   7. Publish all modeled games to feed
 *
 * Usage: npx tsx run_april8_full_pipeline.ts
 */

import "dotenv/config";

const DATE = "2026-04-08";
const AN_DATE = "20260408";

// ─── Timing helpers ───────────────────────────────────────────────────────────
const t0 = Date.now();
function elapsed(): string {
  return `[+${((Date.now() - t0) / 1000).toFixed(1)}s]`;
}

function banner(title: string) {
  console.log(`\n${"═".repeat(72)}`);
  console.log(`${elapsed()} ${title}`);
  console.log(`${"═".repeat(72)}`);
}

function step(msg: string) {
  console.log(`\n${elapsed()} [STEP] ${msg}`);
}

function ok(msg: string) {
  console.log(`${elapsed()} [OK] ${msg}`);
}

function warn(msg: string) {
  console.log(`${elapsed()} [WARN] ${msg}`);
}

function fail(msg: string) {
  console.error(`${elapsed()} [FAIL] ${msg}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  banner(`APRIL 8, 2026 — FULL MODEL + PUBLISH PIPELINE`);
  console.log(`  MLB: 15 games | NHL: 3 games`);
  console.log(`  Date: ${DATE} | AN Date: ${AN_DATE}`);

  let totalErrors = 0;

  // ─── Step 1: AN Odds Refresh (MLB + NHL) ─────────────────────────────────
  banner("STEP 1 — ACTION NETWORK ODDS REFRESH (DK NJ)");
  step("Importing refreshAnApiOdds from vsinAutoRefresh...");

  try {
    const { runVsinRefreshManual } = await import("./server/vsinAutoRefresh.js");
    // Run manual refresh for April 8 specifically — MLB + NHL
    // We call it with sports=['mlb','nhl'] and dateOverride
    // Since runVsinRefreshManual uses today's date internally, we need to
    // call refreshAnApiOdds directly via the module
    const { fetchActionNetworkOdds } = await import("./server/actionNetworkScraper.js");
    const { getDb } = await import("./server/db.js");
    const { updateAnOdds } = await import("./server/db.js");
    const { MLB_BY_AN_SLUG } = await import("./shared/mlbTeams.js");
    const { NHL_BY_AN_SLUG } = await import("./shared/nhlTeams.js");
    const { games } = await import("./drizzle/schema.js");
    const { eq, and } = await import("drizzle-orm");

    const db = await getDb();

    for (const sport of ["mlb", "nhl"] as const) {
      step(`Fetching ${sport.toUpperCase()} odds from AN for ${DATE}...`);
      const dbSport = sport === "nhl" ? "NHL" : "MLB";
      const anGames = await fetchActionNetworkOdds(sport, DATE);
      console.log(`  [STATE] AN returned ${anGames.length} ${sport.toUpperCase()} games`);

      let updated = 0;
      let skipped = 0;

      for (const ag of anGames) {
        // Match to DB game
        const awaySlug = ag.awayTeam?.slug ?? "";
        const homeSlug = ag.homeTeam?.slug ?? "";
        const teamLookup = sport === "nhl" ? NHL_BY_AN_SLUG : MLB_BY_AN_SLUG;
        const awayAbbr = (teamLookup as Record<string, { abbr: string }>)[awaySlug]?.abbr;
        const homeAbbr = (teamLookup as Record<string, { abbr: string }>)[homeSlug]?.abbr;

        if (!awayAbbr || !homeAbbr) {
          warn(`  No team mapping for ${awaySlug}@${homeSlug} — skipping`);
          skipped++;
          continue;
        }

        const dbGames = await db.select({ id: games.id, awayML: games.awayML, homeML: games.homeML })
          .from(games)
          .where(and(
            eq(games.gameDate, DATE),
            eq(games.sport, dbSport),
            eq(games.awayTeam, awayAbbr),
            eq(games.homeTeam, homeAbbr)
          ));

        if (dbGames.length === 0) {
          warn(`  No DB game for ${awayAbbr}@${homeAbbr} on ${DATE}`);
          skipped++;
          continue;
        }

        const dbGame = dbGames[0];

        // Extract DK NJ odds (book_id=68)
        const dkBook = ag.odds?.find((o: any) => o.book_id === 68);
        if (!dkBook) {
          warn(`  No DK NJ odds for ${awayAbbr}@${homeAbbr}`);
          skipped++;
          continue;
        }

        const awayML = dkBook.ml_away ?? null;
        const homeML = dkBook.ml_home ?? null;
        const awaySpread = dkBook.spread_away ?? null;
        const awaySpreadOdds = dkBook.spread_away_line ?? null;
        const homeSpread = dkBook.spread_home ?? null;
        const homeSpreadOdds = dkBook.spread_home_line ?? null;
        const total = dkBook.total ?? null;
        const overOdds = dkBook.total_over_line ?? null;
        const underOdds = dkBook.total_under_line ?? null;

        await updateAnOdds(dbGame.id, {
          awayML: awayML !== null ? String(awayML) : null,
          homeML: homeML !== null ? String(homeML) : null,
          awayBookSpread: awaySpread !== null ? String(awaySpread) : null,
          awayBookSpreadOdds: awaySpreadOdds !== null ? String(awaySpreadOdds) : null,
          homeBookSpread: homeSpread !== null ? String(homeSpread) : null,
          homeBookSpreadOdds: homeSpreadOdds !== null ? String(homeSpreadOdds) : null,
          bookTotal: total !== null ? String(total) : null,
          bookTotalOverOdds: overOdds !== null ? String(overOdds) : null,
          bookTotalUnderOdds: underOdds !== null ? String(underOdds) : null,
        });

        console.log(`  [OK] ${awayAbbr}@${homeAbbr}: ML=${awayML}/${homeML} SPR=${awaySpread}(${awaySpreadOdds}) TOT=${total}(o${overOdds}/u${underOdds})`);
        updated++;
      }

      ok(`${sport.toUpperCase()} odds: ${updated} updated, ${skipped} skipped`);
    }
  } catch (err) {
    fail(`AN odds refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    totalErrors++;
  }

  // ─── Step 2: F5/NRFI Scrape ───────────────────────────────────────────────
  banner("STEP 2 — F5/NRFI SCRAPE (FanDuel NJ)");
  step("Scraping F5/NRFI odds for April 8...");

  try {
    const { scrapeAndStoreF5Nrfi } = await import("./server/mlbF5NrfiScraper.js");
    const f5Result = await scrapeAndStoreF5Nrfi(DATE);
    ok(`F5/NRFI: processed=${f5Result.processed} matched=${f5Result.matched} unmatched=${f5Result.unmatched.length} errors=${f5Result.errors.length}`);
    if (f5Result.unmatched.length > 0) {
      warn(`  Unmatched: ${f5Result.unmatched.join(", ")}`);
    }
    if (f5Result.errors.length > 0) {
      fail(`  F5/NRFI errors: ${f5Result.errors.join("; ")}`);
      totalErrors += f5Result.errors.length;
    }
  } catch (err) {
    fail(`F5/NRFI scrape failed: ${err instanceof Error ? err.message : String(err)}`);
    totalErrors++;
  }

  // ─── Step 3: MLB Monte Carlo Model ────────────────────────────────────────
  banner("STEP 3 — MLB MONTE CARLO MODEL (15 games)");
  step("Running MLB model for April 8...");

  try {
    const { runMlbModelForDate } = await import("./server/mlbModelRunner.js");
    const mlbResult = await runMlbModelForDate(DATE);
    ok(`MLB model: ${mlbResult.modeled} modeled, ${mlbResult.skipped} skipped, ${mlbResult.errors.length} errors`);
    if (mlbResult.errors.length > 0) {
      fail(`  MLB model errors: ${mlbResult.errors.slice(0, 3).join("; ")}`);
      totalErrors += mlbResult.errors.length;
    }
  } catch (err) {
    fail(`MLB model failed: ${err instanceof Error ? err.message : String(err)}`);
    totalErrors++;
  }

  // ─── Step 4: K-Props Upsert + EV Model ────────────────────────────────────
  banner("STEP 4 — K-PROPS UPSERT + EV MODEL");
  step("Upserting K-Props from Action Network for April 8...");

  try {
    const { upsertKPropsForDate } = await import("./server/kPropsDbHelpers.js");
    const kUpsertResult = await upsertKPropsForDate(AN_DATE);
    ok(`K-Props upsert: inserted=${kUpsertResult.inserted} updated=${kUpsertResult.updated} errors=${kUpsertResult.errors.length}`);
    if (kUpsertResult.errors.length > 0) {
      fail(`  K-Props upsert errors: ${kUpsertResult.errors.slice(0, 3).join("; ")}`);
      totalErrors += kUpsertResult.errors.length;
    }
  } catch (err) {
    fail(`K-Props upsert failed: ${err instanceof Error ? err.message : String(err)}`);
    totalErrors++;
  }

  step("Running K-Props EV model for April 8...");
  try {
    const { modelKPropsForDate } = await import("./server/mlbKPropsModelService.js");
    const kModelResult = await modelKPropsForDate(DATE);
    ok(`K-Props model: modeled=${kModelResult.modeled} edges=${kModelResult.edges} errors=${kModelResult.errors.length}`);
    if (kModelResult.edges > 0) {
      console.log(`  [STATE] Top K-Props edges:`);
      kModelResult.topEdges?.slice(0, 5).forEach((e: any) => {
        console.log(`    ${e.pitcherName} (${e.teamAbbrev}): line=${e.bookLine} proj=${e.kProj?.toFixed(1)} edge=${(e.edgeOver * 100).toFixed(1)}% verdict=${e.verdict}`);
      });
    }
  } catch (err) {
    fail(`K-Props model failed: ${err instanceof Error ? err.message : String(err)}`);
    totalErrors++;
  }

  // ─── Step 5: HR Props Seed + EV Model ─────────────────────────────────────
  banner("STEP 5 — HR PROPS SEED + EV MODEL");
  step("Seeding HR Props from Action Network for April 8...");

  try {
    const { resolveAndModelHrProps } = await import("./server/mlbHrPropsModelService.js");
    const hrResult = await resolveAndModelHrProps(DATE);
    ok(`HR Props: resolved=${hrResult.resolved} modeled=${hrResult.modeled} edges=${hrResult.edges} errors=${hrResult.errors.length}`);
    if (hrResult.errors.length > 0) {
      fail(`  HR Props errors: ${hrResult.errors.slice(0, 3).join("; ")}`);
      totalErrors += hrResult.errors.length;
    }
    if (hrResult.edges > 0) {
      console.log(`  [STATE] Top HR Props edges:`);
      hrResult.topEdges?.slice(0, 5).forEach((e: any) => {
        console.log(`    ${e.playerName} (${e.teamAbbrev}): line=${e.bookLine} pHr=${(e.modelPHr * 100).toFixed(1)}% edge=${(e.edgeOver * 100).toFixed(1)}% verdict=${e.verdict}`);
      });
    }
  } catch (err) {
    fail(`HR Props failed: ${err instanceof Error ? err.message : String(err)}`);
    totalErrors++;
  }

  // ─── Step 6: NHL Poisson Model ────────────────────────────────────────────
  banner("STEP 6 — NHL POISSON MODEL (3 games)");
  step("Running NHL model for April 8...");

  try {
    const { syncNhlModelForToday } = await import("./server/nhlModelSync.js");
    const nhlResult = await syncNhlModelForToday("manual", true, true, DATE);
    ok(`NHL model: synced=${nhlResult.synced} skipped=${nhlResult.skipped} errors=${nhlResult.errors.length}`);
    if (nhlResult.errors.length > 0) {
      fail(`  NHL model errors: ${nhlResult.errors.slice(0, 3).join("; ")}`);
      totalErrors += nhlResult.errors.length;
    }
  } catch (err) {
    fail(`NHL model failed: ${err instanceof Error ? err.message : String(err)}`);
    totalErrors++;
  }

  // ─── Step 7: Publish All Games ────────────────────────────────────────────
  banner("STEP 7 — PUBLISH ALL MODELED GAMES TO FEED");
  step("Publishing all April 8 MLB + NHL games to feed...");

  try {
    const { getDb } = await import("./server/db.js");
    const { games } = await import("./drizzle/schema.js");
    const { eq, and, isNotNull } = await import("drizzle-orm");

    const db = await getDb();

    // Publish MLB games that have been modeled
    const mlbPublish = await db
      .update(games)
      .set({ publishedToFeed: true })
      .where(and(
        eq(games.gameDate, DATE),
        eq(games.sport, "MLB"),
        isNotNull(games.modelRunAt)
      ));

    // Publish NHL games that have been modeled
    const nhlPublish = await db
      .update(games)
      .set({ publishedToFeed: true })
      .where(and(
        eq(games.gameDate, DATE),
        eq(games.sport, "NHL"),
        isNotNull(games.modelRunAt)
      ));

    ok(`Published: MLB games updated, NHL games updated`);
  } catch (err) {
    fail(`Publish failed: ${err instanceof Error ? err.message : String(err)}`);
    totalErrors++;
  }

  // ─── Final Summary ────────────────────────────────────────────────────────
  banner("PIPELINE COMPLETE — FINAL AUDIT");

  try {
    const { getDb } = await import("./server/db.js");
    const { games, mlbStrikeoutProps, mlbHrProps } = await import("./drizzle/schema.js");
    const { eq, and, isNotNull, count, sql } = await import("drizzle-orm");

    const db = await getDb();

    // MLB summary
    const mlbGames = await db.select({
      awayTeam: games.awayTeam,
      homeTeam: games.homeTeam,
      awayML: games.awayML,
      homeML: games.homeML,
      awayBookSpread: games.awayBookSpread,
      bookTotal: games.bookTotal,
      f5AwayML: games.f5AwayML,
      nrfiOverOdds: games.nrfiOverOdds,
      modelRunAt: games.modelRunAt,
      publishedToFeed: games.publishedToFeed,
    }).from(games).where(and(eq(games.gameDate, DATE), eq(games.sport, "MLB")));

    console.log(`\n[AUDIT] April 8, 2026 — MLB (${mlbGames.length} games)`);
    for (const g of mlbGames) {
      const modeled = g.modelRunAt ? "✅" : "❌";
      const published = g.publishedToFeed ? "✅" : "❌";
      const f5 = g.f5AwayML ? "✅" : "❌";
      const nrfi = g.nrfiOverOdds ? "✅" : "❌";
      console.log(`  ${g.awayTeam}@${g.homeTeam}: ML=${g.awayML}/${g.homeML} SPR=${g.awayBookSpread} TOT=${g.bookTotal} F5=${f5} NRFI=${nrfi} model=${modeled} pub=${published}`);
    }

    const mlbModeled = mlbGames.filter(g => g.modelRunAt).length;
    const mlbPublished = mlbGames.filter(g => g.publishedToFeed).length;
    const mlbF5 = mlbGames.filter(g => g.f5AwayML).length;
    const mlbNrfi = mlbGames.filter(g => g.nrfiOverOdds).length;
    console.log(`\n  [SUMMARY] Modeled: ${mlbModeled}/15 | Published: ${mlbPublished}/15 | F5: ${mlbF5}/15 | NRFI: ${mlbNrfi}/15`);

    // K-Props summary
    const kPropsRows = await db.select({ id: mlbStrikeoutProps.id })
      .from(mlbStrikeoutProps)
      .innerJoin(games, eq(mlbStrikeoutProps.gameId, games.id))
      .where(eq(games.gameDate, DATE));
    console.log(`  [SUMMARY] K-Props: ${kPropsRows.length} seeded`);

    // HR Props summary
    const hrPropsRows = await db.select({ id: mlbHrProps.id })
      .from(mlbHrProps)
      .innerJoin(games, eq(mlbHrProps.gameId, games.id))
      .where(eq(games.gameDate, DATE));
    console.log(`  [SUMMARY] HR Props: ${hrPropsRows.length} seeded`);

    // NHL summary
    const nhlGames = await db.select({
      awayTeam: games.awayTeam,
      homeTeam: games.homeTeam,
      awayML: games.awayML,
      homeML: games.homeML,
      awayBookSpread: games.awayBookSpread,
      bookTotal: games.bookTotal,
      modelRunAt: games.modelRunAt,
      publishedToFeed: games.publishedToFeed,
    }).from(games).where(and(eq(games.gameDate, DATE), eq(games.sport, "NHL")));

    console.log(`\n[AUDIT] April 8, 2026 — NHL (${nhlGames.length} games)`);
    for (const g of nhlGames) {
      const modeled = g.modelRunAt ? "✅" : "❌";
      const published = g.publishedToFeed ? "✅" : "❌";
      console.log(`  ${g.awayTeam}@${g.homeTeam}: ML=${g.awayML}/${g.homeML} PL=${g.awayBookSpread} TOT=${g.bookTotal} model=${modeled} pub=${published}`);
    }

    const nhlModeled = nhlGames.filter(g => g.modelRunAt).length;
    const nhlPublished = nhlGames.filter(g => g.publishedToFeed).length;
    console.log(`\n  [SUMMARY] Modeled: ${nhlModeled}/3 | Published: ${nhlPublished}/3`);

  } catch (err) {
    fail(`Audit failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  banner(`PIPELINE FINISHED — Total errors: ${totalErrors}`);
  console.log(`  Total elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("[FATAL] Unhandled error:", err);
  process.exit(1);
});
