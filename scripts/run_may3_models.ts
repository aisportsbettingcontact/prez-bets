/**
 * run_may3_models.ts
 * 
 * Runs the MLB model for all 15 May 3 games and the NHL model for the 2 playoff games.
 * Forces a rerun even if modelRunAt is already set.
 */
import { runMlbModelForDate } from '../server/mlbModelRunner';
import { syncNhlModelForToday } from '../server/nhlModelSync';
import { listGamesByDate, publishAllStagingGames } from '../server/db';

const DATE = '2026-05-03';

async function main() {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`[May3ModelRun] ► START — date: ${DATE}`);
  console.log(`${'='.repeat(70)}`);

  // ── Step 1: Run MLB model for all 15 games ─────────────────────────────────
  console.log('\n[May3ModelRun] Step 1: Running MLB model for all 15 games...');
  let mlbResult;
  try {
    mlbResult = await runMlbModelForDate(DATE, { forceRerun: true });
    console.log(`[May3ModelRun] MLB model complete: ${JSON.stringify(mlbResult)}`);
  } catch (err) {
    console.error('[May3ModelRun] MLB model ERROR:', err);
    throw err;
  }

  // ── Step 2: Run NHL model for MTL@TBL and MIN@COL ─────────────────────────
  console.log('\n[May3ModelRun] Step 2: Running NHL model for 2 playoff games...');
  let nhlResult;
  try {
    nhlResult = await syncNhlModelForToday('manual', true, false, DATE);
    console.log(`[May3ModelRun] NHL model complete: synced=${nhlResult.synced} skipped=${nhlResult.skipped} errors=${nhlResult.errors.length}`);
    if (nhlResult.errors.length > 0) {
      console.warn('[May3ModelRun] NHL model errors:', nhlResult.errors);
    }
  } catch (err) {
    console.error('[May3ModelRun] NHL model ERROR:', err);
    throw err;
  }

  // ── Step 3: Verify model outputs ──────────────────────────────────────────
  console.log('\n[May3ModelRun] Step 3: Verifying model outputs...');
  const mlbGames = await listGamesByDate(DATE, 'MLB');
  const nhlGames = await listGamesByDate(DATE, 'NHL');

  let mlbModeled = 0;
  let mlbMissing: string[] = [];
  for (const g of mlbGames) {
    if (g.awayModelSpread !== null && g.modelTotal !== null) {
      mlbModeled++;
      console.log(
        `[May3ModelRun] ✅ MLB ${g.awayTeam}@${g.homeTeam}` +
        ` | modelSpread=${g.awayModelSpread} modelTotal=${g.modelTotal}` +
        ` | modelML=${g.modelAwayML}/${g.modelHomeML}` +
        ` | awayScore=${g.modelAwayScore} homeScore=${g.modelHomeScore}` +
        ` | overRate=${g.modelOverRate}% underRate=${g.modelUnderRate}%` +
        ` | awayWin=${g.modelAwayWinPct}% homeWin=${g.modelHomeWinPct}%`
      );
    } else {
      mlbMissing.push(`${g.awayTeam}@${g.homeTeam}`);
      console.warn(`[May3ModelRun] ❌ MLB ${g.awayTeam}@${g.homeTeam} — NO MODEL OUTPUT (spread=${g.awayModelSpread} total=${g.modelTotal})`);
    }
  }

  // NHL — only check the 2 playoff games (MTL@TBL and MIN@COL)
  const nhlPlayoff = nhlGames.filter(g => 
    (g.awayTeam === 'montreal_canadiens' && g.homeTeam === 'tampa_bay_lightning') ||
    (g.awayTeam === 'minnesota_wild' && g.homeTeam === 'colorado_avalanche')
  );
  let nhlModeled = 0;
  let nhlMissing: string[] = [];
  for (const g of nhlPlayoff) {
    if (g.awayModelSpread !== null && g.modelTotal !== null) {
      nhlModeled++;
      console.log(
        `[May3ModelRun] ✅ NHL ${g.awayTeam}@${g.homeTeam}` +
        ` | modelPL=${g.awayModelSpread} modelTotal=${g.modelTotal}` +
        ` | modelML=${g.modelAwayML}/${g.modelHomeML}` +
        ` | awayWin=${g.modelAwayWinPct}% homeWin=${g.modelHomeWinPct}%`
      );
    } else {
      nhlMissing.push(`${g.awayTeam}@${g.homeTeam}`);
      console.warn(`[May3ModelRun] ❌ NHL ${g.awayTeam}@${g.homeTeam} — NO MODEL OUTPUT`);
    }
  }

  console.log(`\n[May3ModelRun] SUMMARY:`);
  console.log(`  MLB: ${mlbModeled}/15 modeled${mlbMissing.length > 0 ? ' | MISSING: ' + mlbMissing.join(', ') : ''}`);
  console.log(`  NHL: ${nhlModeled}/2 modeled${nhlMissing.length > 0 ? ' | MISSING: ' + nhlMissing.join(', ') : ''}`);

  if (mlbMissing.length > 0 || nhlMissing.length > 0) {
    console.error('[May3ModelRun] ❌ INCOMPLETE — some games have no model output. Check errors above.');
    process.exit(1);
  }

  console.log('\n[May3ModelRun] ✅ ALL GAMES MODELED — ready to publish');
  process.exit(0);
}

main().catch(e => { console.error('[May3ModelRun] FATAL:', e); process.exit(1); });
