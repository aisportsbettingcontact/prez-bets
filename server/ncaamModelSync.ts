/**
 * ncaamModelSync.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Orchestrator for the NCAAM model v9 backend integration.
 *
 * Execution flow:
 *   1. Fetch all NCAAM games for a given date from the DB
 *   2. For each game, look up kenpomSlug + conference from ncaamTeams registry
 *   3. Dispatch parallel model runs (concurrency-limited to 3 to respect KenPom rate limits)
 *   4. Write all results back to the DB via updateGameProjections()
 *
 * Called from:
 *   - tRPC procedure model.runForDate (owner-only, manual trigger)
 *   - vsinAutoRefresh.ts (auto-trigger after VSiN odds refresh completes)
 */

import { NCAAM_TEAMS } from "../shared/ncaamTeams.js";
import { runModelForGame, type ModelGameInput, type ModelGameResult } from "./ncaamModelEngine.js";
import { updateGameProjections, listGamesByDate } from "./db.js";
import { ENV } from "./_core/env.js";
import type { Game } from "../drizzle/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// TEAM LOOKUP
// ─────────────────────────────────────────────────────────────────────────────

/** Build a fast lookup map: dbSlug → { kenpomSlug, conference } */
const TEAM_MAP = new Map(
  NCAAM_TEAMS.map((t) => [
    t.dbSlug,
    { kenpomSlug: t.kenpomSlug, conference: t.conference },
  ])
);

function lookupTeam(dbSlug: string): { kenpomSlug: string; conference: string } | null {
  return TEAM_MAP.get(dbSlug) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PARALLEL RUNNER WITH CONCURRENCY LIMIT
// ─────────────────────────────────────────────────────────────────────────────

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// EDGE LABEL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function formatSpreadEdge(result: ModelGameResult): string | null {
  const spreadEdge = result.edges.find((e) => e.type === "SPREAD");
  if (!spreadEdge) return null;
  return `${spreadEdge.conf} | ${spreadEdge.side} | ${spreadEdge.cover_pct.toFixed(2)}% | +${spreadEdge.edge_vs_be.toFixed(2)}% vs BE`;
}

function formatTotalEdge(result: ModelGameResult): string | null {
  const totalEdge = result.edges.find((e) => e.type === "TOTAL");
  if (!totalEdge) return null;
  return `${totalEdge.conf} | ${totalEdge.side} | ${totalEdge.cover_pct.toFixed(2)}% | +${totalEdge.edge_vs_be.toFixed(2)}% vs BE`;
}

function formatML(ml: number): string {
  return ml >= 0 ? `+${ml.toFixed(2)}` : ml.toFixed(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SYNC FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

export interface ModelSyncResult {
  date: string;
  totalGames: number;
  ran: number;
  skipped: number;
  failed: number;
  errors: { game: string; error: string }[];
  durationMs: number;
}

export async function syncModelForDate(
  date: string,
  options: {
    /** Only run games that don't already have model projections */
    skipExisting?: boolean;
    /** Concurrency limit for parallel KenPom fetches (default: 3) */
    concurrency?: number;
    /** Override KenPom credentials (falls back to env vars) */
    kenpomEmail?: string;
    kenpomPass?: string;
  } = {}
): Promise<ModelSyncResult> {
  const startTime = Date.now();
  const {
    skipExisting = false,
    concurrency = 3,
    kenpomEmail = ENV.vsinEmail ?? "",
    kenpomPass  = ENV.vsinPassword ?? "",
  } = options;

  if (!kenpomEmail || !kenpomPass) {
    throw new Error("KenPom credentials not configured. Set VSIN_EMAIL and VSIN_PASSWORD env vars.");
  }

  // 1. Fetch all NCAAM games for the date
  const allGames = await listGamesByDate(date, "NCAAM");

  let ran = 0;
  let skipped = 0;
  let failed = 0;
  const errors: { game: string; error: string }[] = [];

  // 2. Build task list
  const tasks = allGames
    .filter((game: Game) => {
      // Skip games without book lines (model needs mkt_sp and mkt_to)
      if (game.awayBookSpread === null || game.bookTotal === null) {
        skipped++;
        return false;
      }
      // Skip games that already have model projections if skipExisting is set
      if (skipExisting && game.awayModelSpread !== null) {
        skipped++;
        return false;
      }
      return true;
    })
    .map((game: Game) => async () => {
      const awayInfo = lookupTeam(game.awayTeam);
      const homeInfo = lookupTeam(game.homeTeam);

      if (!awayInfo || !homeInfo) {
        const missingTeam = !awayInfo ? game.awayTeam : game.homeTeam;
        const errMsg = `Team not found in NCAAM registry: ${missingTeam}`;
        errors.push({ game: `${game.awayTeam} @ ${game.homeTeam}`, error: errMsg });
        failed++;
        console.warn(`[ModelSync] ${errMsg}`);
        return;
      }

      const mktSp = parseFloat(String(game.awayBookSpread ?? "0"));
      const mktTo = parseFloat(String(game.bookTotal ?? "0"));
      const mktMlA = game.awayML ? parseInt(game.awayML, 10) : null;
      const mktMlH = game.homeML ? parseInt(game.homeML, 10) : null;

      const input: ModelGameInput = {
        away_team:    awayInfo.kenpomSlug,
        home_team:    homeInfo.kenpomSlug,
        conf_a:       awayInfo.conference,
        conf_h:       homeInfo.conference,
        mkt_sp:       mktSp,
        mkt_to:       mktTo,
        mkt_ml_a:     mktMlA,
        mkt_ml_h:     mktMlH,
        kenpom_email: kenpomEmail,
        kenpom_pass:  kenpomPass,
      };

      console.log(`[ModelSync] Running: ${awayInfo.kenpomSlug} @ ${homeInfo.kenpomSlug} (${awayInfo.conference} vs ${homeInfo.conference})`);

      const result = await runModelForGame(input);

      if (!result.ok) {
        const errMsg = result.error ?? "Unknown error";
        errors.push({ game: `${game.awayTeam} @ ${game.homeTeam}`, error: errMsg });
        failed++;
        console.error(`[ModelSync] FAILED: ${game.awayTeam} @ ${game.homeTeam} — ${errMsg}`);
        return;
      }

      // 3. Write results to DB
      try {
        await updateGameProjections(game.id, {
          // Spreads (stored as strings to match decimal column format)
          awayModelSpread:    String(result.orig_away_sp),
          homeModelSpread:    String(result.orig_home_sp),
          modelTotal:         String(result.orig_total),
          // Fair ML
          modelAwayML:        formatML(result.away_ml_fair),
          modelHomeML:        formatML(result.home_ml_fair),
          // Score projections (new v9 fields)
          modelAwayScore:     String(result.orig_away_score),
          modelHomeScore:     String(result.orig_home_score),
          // Win/over/under probabilities
          modelOverRate:      String(result.over_rate),
          modelUnderRate:     String(result.under_rate),
          modelAwayWinPct:    String(result.ml_away_pct),
          modelHomeWinPct:    String(result.ml_home_pct),
          // Simulation metadata
          modelSpreadClamped: result.spread_clamped,
          modelTotalClamped:  result.total_clamped,
          modelCoverDirection: result.cover_direction,
          modelRunAt:         Date.now(),
          // Edge labels
          spreadEdge: formatSpreadEdge(result),
          spreadDiff: result.edges.find((e) => e.type === "SPREAD")
            ? String(Math.abs(result.orig_away_sp - mktSp).toFixed(1))
            : null,
          totalEdge:  formatTotalEdge(result),
          totalDiff:  result.edges.find((e) => e.type === "TOTAL")
            ? String(Math.abs(result.orig_total - mktTo).toFixed(1))
            : null,
        });

        ran++;
        console.log(
          `[ModelSync] ✓ ${awayInfo.kenpomSlug} @ ${homeInfo.kenpomSlug} | ` +
          `Spread: ${result.orig_away_sp > 0 ? "+" : ""}${result.orig_away_sp.toFixed(2)} / ` +
          `Total: ${result.orig_total.toFixed(2)} | ` +
          `ML: ${formatML(result.away_ml_fair)} / ${formatML(result.home_ml_fair)} | ` +
          `Edges: ${result.edges.length}`
        );
      } catch (dbErr) {
        const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        errors.push({ game: `${game.awayTeam} @ ${game.homeTeam}`, error: `DB write failed: ${errMsg}` });
        failed++;
        console.error(`[ModelSync] DB write failed for ${game.awayTeam} @ ${game.homeTeam}: ${errMsg}`);
      }
    });

  // 4. Run with concurrency limit
  if (tasks.length > 0) {
    await runWithConcurrency(tasks, concurrency);
  }

  const durationMs = Date.now() - startTime;

  console.log(
    `[ModelSync] Complete — date=${date} total=${allGames.length} ran=${ran} skipped=${skipped} failed=${failed} duration=${(durationMs / 1000).toFixed(1)}s`
  );

  return {
    date,
    totalGames: allGames.length,
    ran,
    skipped,
    failed,
    errors,
    durationMs,
  };
}
