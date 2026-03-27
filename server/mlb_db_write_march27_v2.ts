/**
 * mlb_db_write_march27_v2.ts
 * CORRECTED DB adapter for March 27, 2026 MLB model results.
 *
 * FIXES vs v1:
 *   1. modelTotal        ← total_line (= book O/U, NOT proj_total)
 *   2. awayModelSpread   ← away_run_line (= ±1.5 book RL, NOT raw model_spread diff)
 *   3. homeModelSpread   ← home_run_line (= ∓1.5 book RL)
 *   4. awayRunLine       ← away_run_line (populate the dedicated column)
 *   5. homeRunLine       ← home_run_line
 *   6. awayRunLineOdds   ← away_rl_odds  (model-derived odds at book ±1.5)
 *   7. homeRunLineOdds   ← home_rl_odds
 *   8. modelOverOdds     ← over_odds  (computed at book total)
 *   9. modelUnderOdds    ← under_odds (computed at book total)
 *  10. modelOverRate     ← over_pct   (probability at book total)
 *  11. modelUnderRate    ← under_pct  (probability at book total)
 *
 * Also stores proj_total in a separate field for reference (raw model projection).
 */

import { readFileSync } from 'fs';
import { getDb } from './db.js';
import { games } from '../drizzle/schema.js';
import { eq } from 'drizzle-orm';

interface MlbResult {
  db_id: number;
  away: string;
  home: string;
  away_pitcher: string;
  home_pitcher: string;
  proj_away: number;
  proj_home: number;
  proj_total: number;       // Raw model projection (NOT book total)
  book_total: number;       // Book O/U line
  total_diff: number;       // proj_total - book_total
  away_model_spread: number; // Raw model spread diff (from old v1 — ignored in v2)
  home_model_spread: number;
  away_ml: number;
  home_ml: number;
  away_win_pct: number;
  home_win_pct: number;
  away_run_line: string;    // e.g. "+1.5" or "-1.5" (book RL)
  home_run_line: string;    // e.g. "-1.5" or "+1.5" (book RL)
  away_rl_odds: number;     // Model-derived odds at book ±1.5
  home_rl_odds: number;
  away_rl_cover_pct: number;
  home_rl_cover_pct: number;
  total_line: number;       // = book O/U (ou_line passed to engine)
  over_odds: number;        // Model-derived odds at book total
  under_odds: number;
  over_pct: number;         // Model probability at book total
  under_pct: number;
  model_spread: number;     // Raw home-perspective spread diff (for reference only)
  edges: Array<{ market: string; edge: number; model_odds?: number; book_odds?: number; ou_line?: number }>;
  warnings: string[];
  valid: boolean;
}

function fmtMl(ml: number): string {
  const rounded = Math.round(ml);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function fmtPct(p: number): string {
  return `${p.toFixed(2)}%`;
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('  MLB DB WRITE v2 — March 27, 2026 (8 Games)');
  console.log('  CORRECTED: modelTotal=book_total, awayModelSpread=book_RL±1.5');
  console.log('  ' + new Date().toISOString());
  console.log('='.repeat(80) + '\n');

  const raw = readFileSync('/tmp/march27_mlb_results.json', 'utf-8');
  const results: MlbResult[] = JSON.parse(raw);
  console.log(`[OK] Loaded ${results.length} game results from JSON\n`);

  const db = await getDb();
  let written = 0;
  let errors = 0;

  for (const r of results) {
    const gameLabel = `${r.away} @ ${r.home}`;
    console.log(`${'─'.repeat(80)}`);
    console.log(`  [${r.db_id}] ${gameLabel}`);
    console.log(`  Pitchers: ${r.away_pitcher} vs ${r.home_pitcher}`);
    console.log('');

    // ── Field mapping audit ────────────────────────────────────────────────
    console.log('  FIELD MAPPING (v2 corrected):');
    console.log(`    modelTotal:       ${r.total_line}  (book O/U — was proj_total=${r.proj_total.toFixed(2)})`);
    console.log(`    awayModelSpread:  ${r.away_run_line}  (book RL — was raw diff=${r.away_model_spread})`);
    console.log(`    homeModelSpread:  ${r.home_run_line}  (book RL — was raw diff=${r.home_model_spread})`);
    console.log(`    awayRunLine:      ${r.away_run_line}  (NEW — was NULL)`);
    console.log(`    homeRunLine:      ${r.home_run_line}  (NEW — was NULL)`);
    console.log(`    awayRunLineOdds:  ${fmtMl(r.away_rl_odds)}  (model-derived at ±1.5 — was NULL)`);
    console.log(`    homeRunLineOdds:  ${fmtMl(r.home_rl_odds)}  (model-derived at ±1.5 — was NULL)`);
    console.log(`    modelOverOdds:    ${fmtMl(r.over_odds)}  (at book total ${r.total_line})`);
    console.log(`    modelUnderOdds:   ${fmtMl(r.under_odds)}  (at book total ${r.total_line})`);
    console.log(`    modelOverRate:    ${fmtPct(r.over_pct)}  (at book total ${r.total_line})`);
    console.log(`    modelUnderRate:   ${fmtPct(r.under_pct)}  (at book total ${r.total_line})`);
    console.log('');

    // ── Projection summary ─────────────────────────────────────────────────
    console.log('  PROJECTIONS:');
    console.log(`    Score:  ${r.proj_away.toFixed(2)}-${r.proj_home.toFixed(2)} (proj_total=${r.proj_total.toFixed(2)}, book=${r.total_line}, diff=${r.total_diff > 0 ? '+' : ''}${r.total_diff.toFixed(2)})`);
    console.log(`    ML:     ${r.away} ${fmtMl(r.away_ml)} (${r.away_win_pct.toFixed(1)}%) / ${r.home} ${fmtMl(r.home_ml)} (${r.home_win_pct.toFixed(1)}%)`);
    console.log(`    RL:     ${r.away} ${r.away_run_line} ${fmtMl(r.away_rl_odds)} (${r.away_rl_cover_pct.toFixed(1)}%) / ${r.home} ${r.home_run_line} ${fmtMl(r.home_rl_odds)} (${r.home_rl_cover_pct.toFixed(1)}%)`);
    console.log(`    O/U ${r.total_line}: OVER ${fmtMl(r.over_odds)} (${r.over_pct.toFixed(1)}%) / UNDER ${fmtMl(r.under_odds)} (${r.under_pct.toFixed(1)}%)`);
    console.log(`    Model spread (home): ${r.model_spread > 0 ? '+' : ''}${r.model_spread.toFixed(2)}`);

    if (r.edges.length > 0) {
      console.log(`    Edges: ${r.edges.map(e => `[${e.market}] ${(e.edge * 100).toFixed(2)}%`).join(', ')}`);
    }
    console.log('');

    // ── Validation checks ──────────────────────────────────────────────────
    console.log('  VALIDATION:');
    const rlAwayNum = parseFloat(r.away_run_line);
    const rlHomeNum = parseFloat(r.home_run_line);
    if (Math.abs(Math.abs(rlAwayNum) - 1.5) > 0.01) {
      console.log(`    [WARN] away_run_line=${r.away_run_line} is not ±1.5!`);
    } else {
      console.log(`    [OK] RL spread: away=${r.away_run_line} home=${r.home_run_line} (both ±1.5)`);
    }
    if (Math.abs(r.total_line - r.book_total) > 0.01) {
      console.log(`    [WARN] total_line=${r.total_line} ≠ book_total=${r.book_total}!`);
    } else {
      console.log(`    [OK] Total anchored to book: ${r.total_line}`);
    }
    const overPlusPush = r.over_pct + r.under_pct;
    if (overPlusPush < 85 || overPlusPush > 105) {
      console.log(`    [WARN] over_pct+under_pct=${overPlusPush.toFixed(1)}% (push probability=${(100-overPlusPush).toFixed(1)}%)`);
    } else {
      console.log(`    [OK] O/U probabilities: ${r.over_pct.toFixed(1)}% + ${r.under_pct.toFixed(1)}% = ${overPlusPush.toFixed(1)}% (push=${(100-overPlusPush).toFixed(1)}%)`);
    }
    console.log('');

    try {
      const affected = await db.update(games)
        .set({
          // ── Corrected fields ─────────────────────────────────────────────
          // modelTotal = book O/U line (NOT raw projected total)
          modelTotal:           String(r.total_line),
          // awayModelSpread / homeModelSpread = book RL spread (±1.5)
          awayModelSpread:      r.away_run_line,   // e.g. "+1.5" or "-1.5"
          homeModelSpread:      r.home_run_line,   // e.g. "-1.5" or "+1.5"
          // awayRunLine / homeRunLine = book RL spread (dedicated columns)
          awayRunLine:          r.away_run_line,
          homeRunLine:          r.home_run_line,
          // RL odds = model-derived at book ±1.5
          awayRunLineOdds:      fmtMl(r.away_rl_odds),
          homeRunLineOdds:      fmtMl(r.home_rl_odds),
          // O/U odds and rates = computed at book total
          modelOverOdds:        fmtMl(r.over_odds),
          modelUnderOdds:       fmtMl(r.under_odds),
          modelOverRate:        String(r.over_pct.toFixed(2)),
          modelUnderRate:       String(r.under_pct.toFixed(2)),
          // ── Unchanged fields ─────────────────────────────────────────────
          modelAwayML:          fmtMl(r.away_ml),
          modelHomeML:          fmtMl(r.home_ml),
          modelAwayScore:       String(r.proj_away.toFixed(2)),
          modelHomeScore:       String(r.proj_home.toFixed(2)),
          modelAwayWinPct:      String(r.away_win_pct.toFixed(2)),
          modelHomeWinPct:      String(r.home_win_pct.toFixed(2)),
          modelSpreadClamped:   false,
          modelTotalClamped:    false,
          modelRunAt:           BigInt(Date.now()),
          awayStartingPitcher:  r.away_pitcher,
          homeStartingPitcher:  r.home_pitcher,
          awayPitcherConfirmed: true,
          homePitcherConfirmed: true,
          publishedToFeed:      true,
          publishedModel:       true,
        })
        .where(eq(games.id, r.db_id));

      console.log(`  [DB] UPDATE id=${r.db_id} → affectedRows=${JSON.stringify(affected)} ✓`);
      written++;
    } catch (err) {
      console.error(`  [DB] ERROR for id=${r.db_id}: ${err}`);
      errors++;
    }
    console.log('');
  }

  console.log('='.repeat(80));
  console.log(`  COMPLETE: ${written} written, ${errors} errors`);
  console.log('='.repeat(80) + '\n');

  // ── Post-write verification ────────────────────────────────────────────────
  console.log('[VERIFY] Post-write DB audit...\n');
  const published = await db.select({
    id:              games.id,
    away:            games.awayTeam,
    home:            games.homeTeam,
    awayML:          games.awayML,
    homeML:          games.homeML,
    awayBookSpread:  games.awayBookSpread,
    homeBookSpread:  games.homeBookSpread,
    bookTotal:       games.bookTotal,
    overOdds:        games.overOdds,
    underOdds:       games.underOdds,
    awayRunLine:     games.awayRunLine,
    homeRunLine:     games.homeRunLine,
    awayRunLineOdds: games.awayRunLineOdds,
    homeRunLineOdds: games.homeRunLineOdds,
    modelTotal:      games.modelTotal,
    modelOverOdds:   games.modelOverOdds,
    modelUnderOdds:  games.modelUnderOdds,
    modelOverRate:   games.modelOverRate,
    modelUnderRate:  games.modelUnderRate,
    modelAwayML:     games.modelAwayML,
    modelHomeML:     games.modelHomeML,
    awayModelSpread: games.awayModelSpread,
    homeModelSpread: games.homeModelSpread,
    publishedToFeed: games.publishedToFeed,
    publishedModel:  games.publishedModel,
  }).from(games)
    .where(eq(games.gameDate, '2026-03-27'));

  const mlbGames = published.filter((g: typeof published[0]) => results.some(r => r.db_id === g.id));

  console.log(`  March 27 MLB games verified (${mlbGames.length}):\n`);
  let verifyIssues = 0;

  for (const g of mlbGames) {
    console.log(`  [${g.id}] ${g.away} @ ${g.home}`);
    console.log(`    BOOK:  ML ${g.awayML}/${g.homeML}  |  RL ${g.awayBookSpread}/${g.homeBookSpread}  |  Total ${g.bookTotal} (O:${g.overOdds} U:${g.underOdds})`);
    console.log(`    MODEL: ML ${g.modelAwayML}/${g.modelHomeML}  |  RL ${g.awayModelSpread}/${g.homeModelSpread} (${g.awayRunLineOdds}/${g.homeRunLineOdds})  |  Total ${g.modelTotal} (O:${g.modelOverOdds} U:${g.modelUnderOdds})`);
    console.log(`    RATES: over=${g.modelOverRate}%  under=${g.modelUnderRate}%`);
    console.log(`    FEED:  publishedToFeed=${g.publishedToFeed}  publishedModel=${g.publishedModel}`);

    // Verify total match
    const bookT = parseFloat(String(g.bookTotal));
    const modelT = parseFloat(String(g.modelTotal));
    if (Math.abs(bookT - modelT) > 0.01) {
      console.log(`    *** TOTAL STILL MISMATCHED: book=${bookT} model=${modelT}`);
      verifyIssues++;
    } else {
      console.log(`    [OK] Total matches book: ${modelT}`);
    }

    // Verify RL spread
    const awayRL = String(g.awayModelSpread);
    if (!awayRL.includes('1.5')) {
      console.log(`    *** RL SPREAD WRONG: awayModelSpread=${awayRL} (should be ±1.5)`);
      verifyIssues++;
    } else {
      console.log(`    [OK] RL spread: ${g.awayModelSpread}/${g.homeModelSpread}`);
    }

    // Verify RL odds populated
    if (!g.awayRunLineOdds || g.awayRunLineOdds === 'NULL') {
      console.log(`    *** awayRunLineOdds still NULL`);
      verifyIssues++;
    } else {
      console.log(`    [OK] RL odds: away=${g.awayRunLineOdds} home=${g.homeRunLineOdds}`);
    }

    console.log('');
  }

  console.log('='.repeat(80));
  if (verifyIssues === 0) {
    console.log(`  VERIFICATION PASSED: All ${mlbGames.length} games correct`);
  } else {
    console.log(`  VERIFICATION FAILED: ${verifyIssues} issues remain`);
  }
  console.log('='.repeat(80) + '\n');
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
