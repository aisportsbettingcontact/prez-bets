/**
 * run_mlb_april10.mjs
 *
 * Standalone pipeline runner for MLB April 10, 2026.
 * Executes the full 8-step MLB cycle:
 *   Step 1: Action Network odds (Run Lines, Totals, MLs)
 *   Step 2: VSiN MLB betting splits
 *   Step 3: MLB model (runMlbModelForDate)
 *   Step 4: K-Props (AN fetch + model EV)
 *   Step 5: F5/NRFI scrape (FanDuel NJ)
 *   Step 6: HR Props scrape + model EV
 *   Step 7: Publish all 15 games to feed
 *   Step 8: Final audit — verify all markets populated
 *
 * Logging format:
 *   [STEP n] description
 *   [INPUT]  source + parsed values
 *   [STATE]  intermediate computations
 *   [OUTPUT] result
 *   [VERIFY] PASS/FAIL + reason
 *   [ERROR]  error message + context
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load env
const dotenv = require('dotenv');
dotenv.config();

const TARGET_DATE = '2026-04-10';
const SPORT = 'MLB';

const tag = `[MLBPipeline][${TARGET_DATE}]`;

function log(level, msg) {
  console.log(`${tag} [${level}] ${msg}`);
}

async function runPipeline() {
  log('INPUT', `Target date: ${TARGET_DATE} | Sport: ${SPORT}`);
  log('INPUT', `Pipeline start: ${new Date().toISOString()}`);
  console.log('='.repeat(80));

  // ── Step 1: Action Network odds ─────────────────────────────────────────────
  console.log('');
  log('STEP 1', 'Action Network odds — Run Lines, Totals, Moneylines (DK NJ)');
  try {
    const { refreshAnApiOdds } = await import('./vsinAutoRefresh.ts');
    const anResult = await refreshAnApiOdds(TARGET_DATE, ['mlb'], 'manual');
    log('OUTPUT', `AN odds: updated=${anResult?.mlbUpdated ?? 'N/A'} errors=${anResult?.errors ?? 0}`);
    log('VERIFY', anResult ? 'PASS — AN odds refresh completed' : 'WARN — no result returned');
  } catch (err) {
    log('ERROR', `AN odds refresh failed: ${err.message}`);
    // Non-fatal — continue pipeline
  }

  // ── Step 2: VSiN MLB betting splits ─────────────────────────────────────────
  console.log('');
  log('STEP 2', 'VSiN MLB betting splits — tickets% and money% for all markets');
  try {
    const { refreshMlb } = await import('./vsinAutoRefresh.ts');
    const mlbResult = await refreshMlb(TARGET_DATE);
    log('OUTPUT', `VSiN splits: updated=${mlbResult.updated} total=${mlbResult.total}`);
    log('VERIFY', mlbResult.total > 0 ? 'PASS — splits populated' : 'WARN — 0 games matched on VSiN');
  } catch (err) {
    log('ERROR', `VSiN splits failed: ${err.message}`);
  }

  // ── Step 3: MLB model (full game projections) ────────────────────────────────
  console.log('');
  log('STEP 3', 'MLB model — full game projections (scores, spreads, totals, MLs, F5)');
  try {
    const { runMlbModelForDate } = await import('./mlbModelRunner.ts');
    const modelResult = await runMlbModelForDate(TARGET_DATE);
    log('OUTPUT',
      `Model: written=${modelResult.written} skipped=${modelResult.skipped} errors=${modelResult.errors}`
    );
    if (modelResult.validation.passed) {
      log('VERIFY', `PASS — validation passed | ${modelResult.written} games modeled`);
    } else {
      log('VERIFY', `FAIL — ${modelResult.validation.issues.length} validation issues:`);
      modelResult.validation.issues.forEach(issue => log('ERROR', `  Issue: ${issue}`));
    }
    // Log per-game model results
    if (modelResult.games) {
      modelResult.games.forEach(g => {
        log('STATE',
          `  ${g.awayTeam} @ ${g.homeTeam}: ` +
          `proj=${g.modelAwayScore?.toFixed(2)}-${g.modelHomeScore?.toFixed(2)} ` +
          `spread=${g.awayModelSpread} total=${g.modelTotal} ` +
          `ml=${g.modelAwayML}/${g.modelHomeML} ` +
          `overRate=${g.modelOverRate?.toFixed(1)}% ` +
          `awayWin=${g.modelAwayWinPct?.toFixed(1)}%`
        );
      });
    }
  } catch (err) {
    log('ERROR', `MLB model failed: ${err.message}`);
    console.error(err.stack);
  }

  // ── Step 4: K-Props ──────────────────────────────────────────────────────────
  console.log('');
  log('STEP 4', 'K-Props — fetch AN strikeout lines + run model EV computation');
  try {
    const { fetchANKProps, formatANDate } = await import('./anKPropsService.ts');
    const anDateStr = formatANDate(new Date(TARGET_DATE + 'T12:00:00'));
    log('STATE', `AN K-Props date string: ${anDateStr}`);
    const anResult = await fetchANKProps(anDateStr);
    log('OUTPUT', `AN K-Props: fetched ${anResult.props.length} lines for ${anDateStr}`);

    if (anResult.props.length > 0) {
      const { upsertKPropsFromAN } = await import('./kPropsDbHelpers.ts');
      const upsertResult = await upsertKPropsFromAN(anResult, TARGET_DATE);
      log('OUTPUT',
        `K-Props upsert: inserted=${upsertResult.inserted} updated=${upsertResult.updated} ` +
        `skipped=${upsertResult.skipped} errors=${upsertResult.errors}`
      );
      log('VERIFY', upsertResult.errors === 0 ? 'PASS — K-Props upserted cleanly' : `WARN — ${upsertResult.errors} upsert errors`);

      // Run K-Props model EV
      const { modelKPropsForDate } = await import('./mlbKPropsModelService.ts');
      const kModelResult = await modelKPropsForDate(TARGET_DATE);
      log('OUTPUT',
        `K-Props model: modeled=${kModelResult.modeled} edges=${kModelResult.edges} errors=${kModelResult.errors}`
      );
      log('VERIFY', kModelResult.errors === 0 ? 'PASS — K-Props model EV computed' : `WARN — ${kModelResult.errors} model errors`);
    } else {
      log('VERIFY', 'WARN — 0 K-Props lines fetched from AN (market may not be open yet)');
    }
  } catch (err) {
    log('ERROR', `K-Props pipeline failed: ${err.message}`);
    console.error(err.stack);
  }

  // ── Step 5: F5/NRFI scrape ──────────────────────────────────────────────────
  console.log('');
  log('STEP 5', 'F5/NRFI — scrape FanDuel NJ F5 ML/RL/Total + NRFI/YRFI odds');
  try {
    const { scrapeAndStoreF5Nrfi } = await import('./mlbF5NrfiScraper.ts');
    const f5Result = await scrapeAndStoreF5Nrfi(TARGET_DATE);
    log('OUTPUT',
      `F5/NRFI: processed=${f5Result.processed} matched=${f5Result.matched} ` +
      `unmatched=${f5Result.unmatched.length} errors=${f5Result.errors.length}`
    );
    if (f5Result.unmatched.length > 0) {
      log('STATE', `Unmatched games: ${f5Result.unmatched.join(', ')}`);
    }
    if (f5Result.errors.length > 0) {
      f5Result.errors.slice(0, 5).forEach(e => log('ERROR', `  F5 error: ${e}`));
    }
    log('VERIFY',
      f5Result.matched > 0 ? `PASS — ${f5Result.matched} games matched with F5/NRFI odds` :
      'WARN — 0 games matched (FanDuel NJ market may not be open yet)'
    );
  } catch (err) {
    log('ERROR', `F5/NRFI scrape failed: ${err.message}`);
    console.error(err.stack);
  }

  // ── Step 6: HR Props scrape + model EV ──────────────────────────────────────
  console.log('');
  log('STEP 6', 'HR Props — scrape AN consensus HR prop odds + compute model EV');
  try {
    const { scrapeHrPropsForDate } = await import('./mlbHrPropsScraper.ts');
    const hrResult = await scrapeHrPropsForDate(TARGET_DATE);
    log('OUTPUT',
      `HR Props scrape: inserted=${hrResult.inserted} updated=${hrResult.updated} ` +
      `skipped=${hrResult.skipped} errors=${hrResult.errors}`
    );
    log('VERIFY', hrResult.errors === 0 ? 'PASS — HR Props scraped cleanly' : `WARN — ${hrResult.errors} scrape errors`);

    // Run HR Props model EV
    const { resolveAndModelHrProps } = await import('./mlbHrPropsModelService.ts');
    const hrModelResult = await resolveAndModelHrProps(TARGET_DATE);
    log('OUTPUT',
      `HR Props model: resolved=${hrModelResult.resolved} alreadyHad=${hrModelResult.alreadyHad} ` +
      `modeled=${hrModelResult.modeled} edges=${hrModelResult.edges} errors=${hrModelResult.errors}`
    );
    log('VERIFY',
      hrModelResult.errors === 0 ? `PASS — HR Props EV computed for ${hrModelResult.modeled} players` :
      `WARN — ${hrModelResult.errors} model errors`
    );
  } catch (err) {
    log('ERROR', `HR Props pipeline failed: ${err.message}`);
    console.error(err.stack);
  }

  // ── Step 7: Publish all 15 games to feed ────────────────────────────────────
  console.log('');
  log('STEP 7', 'Publish all 15 MLB games to frontend feed');
  try {
    const { publishAllStagingGames } = await import('./db.ts');
    await publishAllStagingGames(TARGET_DATE, SPORT);
    log('OUTPUT', `Published all ${SPORT} games for ${TARGET_DATE} to feed`);
    log('VERIFY', 'PASS — publishAllStagingGames completed');
  } catch (err) {
    log('ERROR', `Publish failed: ${err.message}`);
    console.error(err.stack);
  }

  // ── Step 8: Final audit ──────────────────────────────────────────────────────
  console.log('');
  log('STEP 8', 'Final audit — verify all 15 games have complete market data');
  try {
    const { createConnection } = require('mysql2/promise');
    const conn = await createConnection(process.env.DATABASE_URL);
    const [rows] = await conn.execute(`
      SELECT id, awayTeam, homeTeam, startTimeEst,
             publishedToFeed, publishedModel,
             awayBookSpread, homeBookSpread, bookTotal, awayML, homeML,
             awayRunLine, homeRunLine, awayRunLineOdds, homeRunLineOdds,
             f5Total, f5AwayML, f5HomeML,
             nrfiOverOdds, yrfiUnderOdds,
             modelRunAt, modelAwayScore, modelHomeScore,
             modelF5AwayScore, modelF5HomeScore,
             modelPNrfi, modelAwayHrPct, modelHomeHrPct,
             awayModelSpread, modelTotal, modelAwayML, modelHomeML,
             modelOverRate, modelAwayWinPct
      FROM games
      WHERE sport = 'MLB' AND gameDate = '${TARGET_DATE}'
      ORDER BY startTimeEst ASC
    `);

    log('OUTPUT', `Final state for ${rows.length} games:`);
    console.log('');

    let allModeled = 0, allPubFeed = 0, allRL = 0, allF5 = 0, allYRFI = 0;

    rows.forEach((r, i) => {
      const modeled    = r.modelRunAt ? '✅' : '❌';
      const pubFeed    = r.publishedToFeed ? '✅' : '❌';
      const hasRL      = r.awayRunLine ? '✅' : '❌';
      const hasF5      = r.f5Total ? '✅' : '❌';
      const hasYRFI    = r.nrfiOverOdds ? '✅' : '❌';
      const hasHR      = r.modelAwayHrPct != null ? '✅' : '❌';

      if (r.modelRunAt)      allModeled++;
      if (r.publishedToFeed) allPubFeed++;
      if (r.awayRunLine)     allRL++;
      if (r.f5Total)         allF5++;
      if (r.nrfiOverOdds)    allYRFI++;

      console.log(
        `  [${String(i+1).padStart(2)}] ${r.awayTeam.padEnd(4)} @ ${r.homeTeam.padEnd(4)} ${r.startTimeEst.padEnd(12)} | ` +
        `Model=${modeled} Feed=${pubFeed} RL=${hasRL} F5=${hasF5} YRFI=${hasYRFI} HR=${hasHR}`
      );
      if (r.modelRunAt) {
        console.log(
          `       Proj: ${r.modelAwayScore?.toFixed(2) ?? 'N/A'}-${r.modelHomeScore?.toFixed(2) ?? 'N/A'} ` +
          `spread=${r.awayModelSpread ?? 'N/A'} total=${r.modelTotal ?? 'N/A'} ` +
          `ml=${r.modelAwayML ?? 'N/A'}/${r.modelHomeML ?? 'N/A'} ` +
          `over=${r.modelOverRate?.toFixed(1) ?? 'N/A'}% awayWin=${r.modelAwayWinPct?.toFixed(1) ?? 'N/A'}%`
        );
      }
    });

    console.log('');
    log('VERIFY',
      `SUMMARY: ${rows.length} total | ` +
      `Modeled=${allModeled}/15 | PubFeed=${allPubFeed}/15 | ` +
      `RL=${allRL}/15 | F5=${allF5}/15 | YRFI=${allYRFI}/15`
    );

    const allGood = allModeled === 15 && allPubFeed === 15;
    log('VERIFY', allGood ? 'PASS — all 15 games modeled and published' : 'PARTIAL — some markets still missing (see above)');

    await conn.end();
  } catch (err) {
    log('ERROR', `Final audit failed: ${err.message}`);
  }

  console.log('');
  console.log('='.repeat(80));
  log('OUTPUT', `Pipeline complete: ${new Date().toISOString()}`);
  console.log('='.repeat(80));
}

runPipeline().catch(err => {
  console.error('[MLBPipeline] FATAL:', err);
  process.exit(1);
});
