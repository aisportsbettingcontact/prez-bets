/**
 * trigger_all_splits.ts
 *
 * Triggers a full splits refresh for all 4 sports (NBA, NHL, MLB, NCAAM)
 * for today AND tomorrow using the new scrapeVsinBettingSplitsBothDays function.
 *
 * Runs each sport sequentially with full debug logging.
 * Validates that no games have NULL splits after the run.
 */

import { scrapeVsinBettingSplitsBothDays, scrapeVsinMlbBettingSplits } from "./vsinBettingSplitsScraper";
import { listGamesByDate, updateBookOdds } from "./db";
import { getMlbTeamByVsinSlug } from "../shared/mlbTeams";
import { getNbaTeamByVsinSlug } from "../shared/nbaTeams";
import { NHL_BY_VSIN_SLUG, VSIN_NHL_HREF_ALIASES } from "../shared/nhlTeams";
import { BY_VSIN_SLUG } from "../shared/ncaamTeams";

const TAG = "[AllSplitsTrigger]";

function datePst(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const str = now.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const [mm, dd, yyyy] = str.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

function resolveNhlVsinSlug(rawSlug: string) {
  const canonical = VSIN_NHL_HREF_ALIASES[rawSlug] ?? rawSlug;
  return NHL_BY_VSIN_SLUG.get(canonical);
}

async function runMlbSplits(dates: string[]): Promise<void> {
  console.log(`\n${TAG}[MLB] ═══════════════════════════════════════`);
  console.log(`${TAG}[MLB] Fetching MLB splits (front+tomorrow)...`);
  const splits = await scrapeVsinMlbBettingSplits();
  console.log(`${TAG}[MLB] Fetched ${splits.length} MLB games from VSiN`);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const dateStr of dates) {
    const existing = await listGamesByDate(dateStr, "MLB");
    console.log(`${TAG}[MLB] DB games for ${dateStr}: ${existing.length}`);

    for (const g of splits) {
      const awayTeam = getMlbTeamByVsinSlug(g.awayVsinSlug);
      const homeTeam = getMlbTeamByVsinSlug(g.homeVsinSlug);

      if (!awayTeam || !homeTeam) {
        console.warn(`${TAG}[MLB] Unknown slug: ${g.awayVsinSlug} @ ${g.homeVsinSlug}`);
        skipped++;
        continue;
      }

      // Try direct match
      let dbGame = existing.find(e => e.awayTeam === awayTeam.abbrev && e.homeTeam === homeTeam.abbrev);
      let swapped = false;
      if (!dbGame) {
        dbGame = existing.find(e => e.awayTeam === homeTeam.abbrev && e.homeTeam === awayTeam.abbrev);
        if (dbGame) swapped = true;
      }

      if (!dbGame) {
        notFound++;
        continue;
      }

      await updateBookOdds(dbGame.id, {
        spreadAwayBetsPct:  swapped ? (g.spreadAwayBetsPct  != null ? 100 - g.spreadAwayBetsPct  : null) : g.spreadAwayBetsPct,
        spreadAwayMoneyPct: swapped ? (g.spreadAwayMoneyPct != null ? 100 - g.spreadAwayMoneyPct : null) : g.spreadAwayMoneyPct,
        totalOverBetsPct:   g.totalOverBetsPct,
        totalOverMoneyPct:  g.totalOverMoneyPct,
        mlAwayBetsPct:      swapped ? (g.mlAwayBetsPct      != null ? 100 - g.mlAwayBetsPct      : null) : g.mlAwayBetsPct,
        mlAwayMoneyPct:     swapped ? (g.mlAwayMoneyPct     != null ? 100 - g.mlAwayMoneyPct     : null) : g.mlAwayMoneyPct,
      });
      console.log(`${TAG}[MLB] ✅ ${dateStr} | ${awayTeam.abbrev}@${homeTeam.abbrev}${swapped ? " [SWAPPED]" : ""} | spread=${g.spreadAwayBetsPct}%/${g.spreadAwayMoneyPct}% total=${g.totalOverBetsPct}%/${g.totalOverMoneyPct}% ml=${g.mlAwayBetsPct}%/${g.mlAwayMoneyPct}%`);
      updated++;
    }
  }

  console.log(`${TAG}[MLB] DONE — updated=${updated} skipped=${skipped} notFound=${notFound}`);
}

async function runNbaSplits(dates: string[]): Promise<void> {
  console.log(`\n${TAG}[NBA] ═══════════════════════════════════════`);
  console.log(`${TAG}[NBA] Fetching NBA splits (front+tomorrow)...`);
  const splits = await scrapeVsinBettingSplitsBothDays("NBA");
  console.log(`${TAG}[NBA] Fetched ${splits.length} NBA games from VSiN`);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const dateStr of dates) {
    const existing = await listGamesByDate(dateStr, "NBA");
    console.log(`${TAG}[NBA] DB games for ${dateStr}: ${existing.length}`);

    for (const g of splits) {
      const awayTeam = getNbaTeamByVsinSlug(g.awayVsinSlug);
      const homeTeam = getNbaTeamByVsinSlug(g.homeVsinSlug);

      if (!awayTeam || !homeTeam) {
        console.warn(`${TAG}[NBA] Unknown slug: ${g.awayVsinSlug} @ ${g.homeVsinSlug}`);
        skipped++;
        continue;
      }

      let dbGame = existing.find(e => e.awayTeam === awayTeam.dbSlug && e.homeTeam === homeTeam.dbSlug);
      let swapped = false;
      if (!dbGame) {
        dbGame = existing.find(e => e.awayTeam === homeTeam.dbSlug && e.homeTeam === awayTeam.dbSlug);
        if (dbGame) swapped = true;
      }

      if (!dbGame) {
        notFound++;
        continue;
      }

      await updateBookOdds(dbGame.id, {
        spreadAwayBetsPct:  swapped ? (g.spreadAwayBetsPct  != null ? 100 - g.spreadAwayBetsPct  : null) : g.spreadAwayBetsPct,
        spreadAwayMoneyPct: swapped ? (g.spreadAwayMoneyPct != null ? 100 - g.spreadAwayMoneyPct : null) : g.spreadAwayMoneyPct,
        totalOverBetsPct:   g.totalOverBetsPct,
        totalOverMoneyPct:  g.totalOverMoneyPct,
        mlAwayBetsPct:      swapped ? (g.mlAwayBetsPct      != null ? 100 - g.mlAwayBetsPct      : null) : g.mlAwayBetsPct,
        mlAwayMoneyPct:     swapped ? (g.mlAwayMoneyPct     != null ? 100 - g.mlAwayMoneyPct     : null) : g.mlAwayMoneyPct,
      });
      console.log(`${TAG}[NBA] ✅ ${dateStr} | ${awayTeam.dbSlug}@${homeTeam.dbSlug}${swapped ? " [SWAPPED]" : ""} | spread=${g.spreadAwayBetsPct}%/${g.spreadAwayMoneyPct}% total=${g.totalOverBetsPct}%/${g.totalOverMoneyPct}% ml=${g.mlAwayBetsPct}%/${g.mlAwayMoneyPct}%`);
      updated++;
    }
  }

  console.log(`${TAG}[NBA] DONE — updated=${updated} skipped=${skipped} notFound=${notFound}`);
}

async function runNhlSplits(dates: string[]): Promise<void> {
  console.log(`\n${TAG}[NHL] ═══════════════════════════════════════`);
  console.log(`${TAG}[NHL] Fetching NHL splits (front+tomorrow)...`);
  const splits = await scrapeVsinBettingSplitsBothDays("NHL");
  console.log(`${TAG}[NHL] Fetched ${splits.length} NHL games from VSiN`);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const dateStr of dates) {
    const existing = await listGamesByDate(dateStr, "NHL");
    console.log(`${TAG}[NHL] DB games for ${dateStr}: ${existing.length}`);

    for (const g of splits) {
      const awayTeam = resolveNhlVsinSlug(g.awayVsinSlug);
      const homeTeam = resolveNhlVsinSlug(g.homeVsinSlug);

      if (!awayTeam || !homeTeam) {
        console.warn(`${TAG}[NHL] Unknown slug: ${g.awayVsinSlug} @ ${g.homeVsinSlug}`);
        skipped++;
        continue;
      }

      let dbGame = existing.find(e => e.awayTeam === awayTeam.dbSlug && e.homeTeam === homeTeam.dbSlug);
      let swapped = false;
      if (!dbGame) {
        dbGame = existing.find(e => e.awayTeam === homeTeam.dbSlug && e.homeTeam === awayTeam.dbSlug);
        if (dbGame) swapped = true;
      }

      if (!dbGame) {
        notFound++;
        continue;
      }

      await updateBookOdds(dbGame.id, {
        spreadAwayBetsPct:  swapped ? (g.spreadAwayBetsPct  != null ? 100 - g.spreadAwayBetsPct  : null) : g.spreadAwayBetsPct,
        spreadAwayMoneyPct: swapped ? (g.spreadAwayMoneyPct != null ? 100 - g.spreadAwayMoneyPct : null) : g.spreadAwayMoneyPct,
        totalOverBetsPct:   g.totalOverBetsPct,
        totalOverMoneyPct:  g.totalOverMoneyPct,
        mlAwayBetsPct:      swapped ? (g.mlAwayBetsPct      != null ? 100 - g.mlAwayBetsPct      : null) : g.mlAwayBetsPct,
        mlAwayMoneyPct:     swapped ? (g.mlAwayMoneyPct     != null ? 100 - g.mlAwayMoneyPct     : null) : g.mlAwayMoneyPct,
      });
      console.log(`${TAG}[NHL] ✅ ${dateStr} | ${awayTeam.dbSlug}@${homeTeam.dbSlug}${swapped ? " [SWAPPED]" : ""} | spread=${g.spreadAwayBetsPct}%/${g.spreadAwayMoneyPct}% total=${g.totalOverBetsPct}%/${g.totalOverMoneyPct}% ml=${g.mlAwayBetsPct}%/${g.mlAwayMoneyPct}%`);
      updated++;
    }
  }

  console.log(`${TAG}[NHL] DONE — updated=${updated} skipped=${skipped} notFound=${notFound}`);
}

async function runNcaamSplits(dates: string[]): Promise<void> {
  console.log(`\n${TAG}[NCAAM] ═══════════════════════════════════════`);
  console.log(`${TAG}[NCAAM] Fetching CBB splits (front+tomorrow)...`);
  const splits = await scrapeVsinBettingSplitsBothDays("CBB");
  console.log(`${TAG}[NCAAM] Fetched ${splits.length} CBB games from VSiN`);

  // Filter to only Final Four teams (Illinois, Connecticut, Michigan, Arizona)
  const FINAL_FOUR_SLUGS = new Set(["illinois", "connecticut", "michigan", "arizona"]);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;
  let filteredOut = 0;

  for (const dateStr of dates) {
    const existing = await listGamesByDate(dateStr, "NCAAM");
    console.log(`${TAG}[NCAAM] DB games for ${dateStr}: ${existing.length}`);

    for (const g of splits) {
      const awayTeam = BY_VSIN_SLUG.get(g.awayVsinSlug) ?? BY_VSIN_SLUG.get(g.awayVsinSlug.replace(/-/g, '_'));
      const homeTeam = BY_VSIN_SLUG.get(g.homeVsinSlug) ?? BY_VSIN_SLUG.get(g.homeVsinSlug.replace(/-/g, '_'));

      if (!awayTeam || !homeTeam) {
        // NIT/non-tournament teams — silently skip (not in NCAAM DB)
        filteredOut++;
        continue;
      }

      let dbGame = existing.find(e => e.awayTeam === awayTeam.dbSlug && e.homeTeam === homeTeam.dbSlug);
      let swapped = false;
      if (!dbGame) {
        dbGame = existing.find(e => e.awayTeam === homeTeam.dbSlug && e.homeTeam === awayTeam.dbSlug);
        if (dbGame) swapped = true;
      }

      if (!dbGame) {
        notFound++;
        continue;
      }

      await updateBookOdds(dbGame.id, {
        spreadAwayBetsPct:  swapped ? (g.spreadAwayBetsPct  != null ? 100 - g.spreadAwayBetsPct  : null) : g.spreadAwayBetsPct,
        spreadAwayMoneyPct: swapped ? (g.spreadAwayMoneyPct != null ? 100 - g.spreadAwayMoneyPct : null) : g.spreadAwayMoneyPct,
        totalOverBetsPct:   g.totalOverBetsPct,
        totalOverMoneyPct:  g.totalOverMoneyPct,
        mlAwayBetsPct:      swapped ? (g.mlAwayBetsPct      != null ? 100 - g.mlAwayBetsPct      : null) : g.mlAwayBetsPct,
        mlAwayMoneyPct:     swapped ? (g.mlAwayMoneyPct     != null ? 100 - g.mlAwayMoneyPct     : null) : g.mlAwayMoneyPct,
      });
      console.log(`${TAG}[NCAAM] ✅ ${dateStr} | ${awayTeam.dbSlug}@${homeTeam.dbSlug}${swapped ? " [SWAPPED]" : ""} | spread=${g.spreadAwayBetsPct}%/${g.spreadAwayMoneyPct}% total=${g.totalOverBetsPct}%/${g.totalOverMoneyPct}% ml=${g.mlAwayBetsPct}%/${g.mlAwayMoneyPct}%`);
      updated++;
    }
  }

  console.log(`${TAG}[NCAAM] DONE — updated=${updated} skipped=${skipped} notFound=${notFound} filteredOut=${filteredOut}`);
}

async function validateSplits(dateStr: string, sport: string): Promise<{ total: number; withSplits: number; missing: number }> {
  const games = await listGamesByDate(dateStr, sport as any);
  const withSplits = games.filter(g => (g as any).spreadAwayBetsPct != null).length;
  const missing = games.length - withSplits;
  return { total: games.length, withSplits, missing };
}

async function main() {
  const todayStr = datePst(0);
  const tomorrowStr = datePst(1);
  const dates = [todayStr, tomorrowStr];

  console.log(`\n${"═".repeat(60)}`);
  console.log(`${TAG} FULL SPLITS REFRESH — ${new Date().toISOString()}`);
  console.log(`${TAG} Dates: today=${todayStr} tomorrow=${tomorrowStr}`);
  console.log(`${"═".repeat(60)}\n`);

  // Run all 4 sports sequentially
  await runMlbSplits(dates);
  await runNbaSplits(dates);
  await runNhlSplits(dates);
  await runNcaamSplits(dates);

  // Validation pass
  console.log(`\n${"═".repeat(60)}`);
  console.log(`${TAG} VALIDATION`);
  console.log(`${"═".repeat(60)}`);

  for (const dateStr of dates) {
    for (const sport of ["MLB", "NBA", "NHL", "NCAAM"]) {
      const v = await validateSplits(dateStr, sport);
      const status = v.missing === 0 ? "✅" : "⚠️ MISSING";
      console.log(`${TAG} ${status} ${dateStr} ${sport}: ${v.withSplits}/${v.total} games have splits (${v.missing} missing)`);
    }
  }

  console.log(`\n${TAG} ✅ ALL DONE — ${new Date().toISOString()}`);
}

main().catch(e => {
  console.error(`${TAG} FATAL ERROR:`, e);
  process.exit(1);
});
