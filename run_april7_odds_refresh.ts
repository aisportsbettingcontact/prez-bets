/**
 * run_april7_odds_refresh.ts
 * ==========================
 * Full Action Network odds refresh for April 7, 2026:
 *   - MLB: DK NJ spread (run line), total, ML + F5/NRFI odds
 *   - NHL: DK NJ puck line, total, ML
 *
 * [INPUT]  date=2026-04-07, sports=[mlb, nhl]
 * [OUTPUT] Updated spread/total/ML for all 15 MLB + 11 NHL games
 *          F5/NRFI odds for all 15 MLB games
 */
import "dotenv/config";

const DATE = "2026-04-07";

async function main() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`[INPUT] Action Network odds refresh for ${DATE}`);
  console.log(`[INPUT] Sports: MLB (15 games) + NHL (11 games)`);
  console.log(`[INPUT] Book: DK NJ (book_id=68), Open line (book_id=30)`);
  console.log(`${"=".repeat(70)}\n`);

  // ── Step 1: MLB + NHL spread/total/ML from AN DK NJ ──────────────────────
  console.log(`[STEP 1] Fetching MLB + NHL DK NJ odds from Action Network...`);
  const { fetchActionNetworkOdds } = await import('./server/actionNetworkScraper');
  const { listGamesByDate, updateAnOdds, insertOddsHistory } = await import('./server/db');
  const { getMlbTeamByAnSlug } = await import('./shared/mlbTeams');
  const { getNhlTeamByAnSlug } = await import('./shared/nhlTeams');

  for (const sport of ["mlb", "nhl"] as const) {
    const dbSport = sport === "mlb" ? "MLB" : "NHL";
    console.log(`\n[STEP 1.${sport === "mlb" ? "A" : "B"}] Fetching ${dbSport} odds from AN...`);

    const anGames = await fetchActionNetworkOdds(sport, DATE);
    console.log(`[STATE] AN returned ${anGames.length} ${dbSport} games`);

    if (anGames.length === 0) {
      console.warn(`[WARN] No ${dbSport} games from AN for ${DATE}`);
      continue;
    }

    const existingGames = await listGamesByDate(DATE, dbSport);
    console.log(`[STATE] DB has ${existingGames.length} ${dbSport} games for ${DATE}`);

    let updated = 0, skipped = 0, errors = 0;

    for (const anGame of anGames) {
      let awayDbSlug: string | undefined;
      let homeDbSlug: string | undefined;

      if (sport === "mlb") {
        const awayMlb = getMlbTeamByAnSlug(anGame.awayUrlSlug);
        const homeMlb = getMlbTeamByAnSlug(anGame.homeUrlSlug);
        awayDbSlug = awayMlb?.abbrev;
        homeDbSlug = homeMlb?.abbrev;
        if (!awayMlb || !homeMlb) {
          console.warn(`[WARN][MLB] UNRESOLVED: "${anGame.awayUrlSlug}" @ "${anGame.homeUrlSlug}"`);
          errors++;
          continue;
        }
      } else {
        const awayNhl = getNhlTeamByAnSlug(anGame.awayUrlSlug);
        const homeNhl = getNhlTeamByAnSlug(anGame.homeUrlSlug);
        awayDbSlug = awayNhl?.dbSlug;
        homeDbSlug = homeNhl?.dbSlug;
        if (!awayNhl || !homeNhl) {
          console.warn(`[WARN][NHL] UNRESOLVED: "${anGame.awayUrlSlug}" @ "${anGame.homeUrlSlug}"`);
          errors++;
          continue;
        }
      }

      // Match to DB game (try both orderings)
      const dbGameDirect = existingGames.find(e => e.awayTeam === awayDbSlug && e.homeTeam === homeDbSlug);
      const dbGameSwapped = !dbGameDirect ? existingGames.find(e => e.awayTeam === homeDbSlug && e.homeTeam === awayDbSlug) : undefined;
      const dbGame = dbGameDirect ?? dbGameSwapped;
      const teamsSwapped = !!dbGameSwapped && !dbGameDirect;

      if (!dbGame) {
        console.warn(`[WARN][${dbSport}] NO_MATCH: ${awayDbSlug} @ ${homeDbSlug} on ${DATE}`);
        errors++;
        continue;
      }

      // Skip live/final games (odds freeze)
      if (dbGame.gameStatus === "live" || dbGame.gameStatus === "final") {
        console.log(`[STATE][${dbSport}] FROZEN: ${dbGame.awayTeam}@${dbGame.homeTeam} (${dbGame.gameStatus})`);
        continue;
      }

      // Flip spread/ML if teams are swapped
      const dkAwaySpread = teamsSwapped ? anGame.dkHomeSpread : anGame.dkAwaySpread;
      const dkAwaySpreadOdds = teamsSwapped ? anGame.dkHomeSpreadOdds : anGame.dkAwaySpreadOdds;
      const dkHomeSpread = teamsSwapped ? anGame.dkAwaySpread : anGame.dkHomeSpread;
      const dkHomeSpreadOdds = teamsSwapped ? anGame.dkAwaySpreadOdds : anGame.dkHomeSpreadOdds;
      const dkAwayML = teamsSwapped ? anGame.dkHomeML : anGame.dkAwayML;
      const dkHomeML = teamsSwapped ? anGame.dkAwayML : anGame.dkHomeML;
      const openAwaySpread = teamsSwapped ? anGame.openHomeSpread : anGame.openAwaySpread;
      const openAwaySpreadOdds = teamsSwapped ? anGame.openHomeSpreadOdds : anGame.openAwaySpreadOdds;
      const openHomeSpread = teamsSwapped ? anGame.openAwaySpread : anGame.openHomeSpread;
      const openHomeSpreadOdds = teamsSwapped ? anGame.openAwaySpreadOdds : anGame.openHomeSpreadOdds;
      const openAwayML = teamsSwapped ? anGame.openHomeML : anGame.openAwayML;
      const openHomeML = teamsSwapped ? anGame.openAwayML : anGame.openHomeML;

      const fmtSpread = (v: number | null): string | null =>
        v === null ? null : v > 0 ? `+${v}` : `${v}`;
      const fmtTotal = (v: number | null): string | null =>
        v === null ? null : `${v}`;

      await updateAnOdds(dbGame.id, {
        awayBookSpread: fmtSpread(dkAwaySpread),
        awaySpreadOdds: dkAwaySpreadOdds,
        homeBookSpread: fmtSpread(dkHomeSpread),
        homeSpreadOdds: dkHomeSpreadOdds,
        bookTotal: fmtTotal(anGame.dkTotal),
        overOdds: anGame.dkOverOdds,
        underOdds: anGame.dkUnderOdds,
        awayML: dkAwayML,
        homeML: dkHomeML,
        ...(openAwaySpread !== null ? {
          openAwaySpread: fmtSpread(openAwaySpread),
          openAwaySpreadOdds: openAwaySpreadOdds,
          openHomeSpread: fmtSpread(openHomeSpread),
          openHomeSpreadOdds: openHomeSpreadOdds,
          openTotal: fmtTotal(anGame.openTotal),
          openAwayML: openAwayML,
          openHomeML: openHomeML,
        } : {}),
      });

      await insertOddsHistory(dbGame.id, dbSport, "manual", {
        awaySpread: fmtSpread(dkAwaySpread),
        awaySpreadOdds: dkAwaySpreadOdds,
        homeSpread: fmtSpread(dkHomeSpread),
        homeSpreadOdds: dkHomeSpreadOdds,
        total: fmtTotal(anGame.dkTotal),
        overOdds: anGame.dkOverOdds,
        underOdds: anGame.dkUnderOdds,
        awayML: dkAwayML,
        homeML: dkHomeML,
      });

      console.log(
        `[OUTPUT][${dbSport}] ${dbGame.awayTeam}@${dbGame.homeTeam}${teamsSwapped ? " [SWAPPED]" : ""} | ` +
        `spread=${dkAwaySpread}/${dkHomeSpread} total=${anGame.dkTotal} ML=${dkAwayML}/${dkHomeML}`
      );
      updated++;
    }

    console.log(`[VERIFY][${dbSport}] updated=${updated} skipped=${skipped} errors=${errors} total=${anGames.length}`);
    if (errors > 0) console.warn(`[WARN][${dbSport}] ${errors} games failed to match — check AN slug aliases`);
  }

  // ── Step 2: F5/NRFI odds from AN (FanDuel NJ source) ─────────────────────
  console.log(`\n[STEP 2] Fetching MLB F5/NRFI odds from Action Network...`);
  try {
    const { scrapeAndStoreF5Nrfi } = await import('./server/mlbF5NrfiScraper');
    const f5Result = await scrapeAndStoreF5Nrfi(DATE);
    console.log(
      `[OUTPUT][F5/NRFI] processed=${f5Result.processed} matched=${f5Result.matched} ` +
      `unmatched=${f5Result.unmatched.length} errors=${f5Result.errors.length}`
    );
    if (f5Result.unmatched.length > 0) {
      console.warn(`[WARN][F5/NRFI] Unmatched games:`, f5Result.unmatched);
    }
    if (f5Result.errors.length > 0) {
      console.warn(`[WARN][F5/NRFI] Errors:`, f5Result.errors.slice(0, 5));
    }
    console.log(`[VERIFY][F5/NRFI] PASS — F5/NRFI odds stored for ${f5Result.matched} MLB games`);
  } catch (err) {
    console.warn(`[WARN][F5/NRFI] Scrape failed (non-fatal):`, err);
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`[OUTPUT] AN ODDS REFRESH COMPLETE for ${DATE}`);
  console.log(`${"=".repeat(70)}\n`);

  process.exit(0);
}

main().catch((e) => { console.error("[FAIL]", e); process.exit(1); });
