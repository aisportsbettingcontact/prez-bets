/**
 * mlbSchedule.ts — tRPC router for MLB schedule history and Last 5 Games data
 *
 * Procedures:
 *   mlbSchedule.getLast5ForMatchup   — public — Last 5 completed games for both teams in a matchup
 *   mlbSchedule.getTeamSchedule      — public — Full schedule for a single team (all games)
 *   mlbSchedule.refreshSchedule      — owner-only — Manually trigger a date range backfill
 *   mlbSchedule.refreshToday         — owner-only — Refresh today's games only
 *
 * Data source: Action Network v2 API, DraftKings NJ (book_id=68) exclusively
 *
 * Logging: [MlbScheduleRouter][PROCEDURE] plain-English, fully traceable
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { ownerProcedure } from "./appUsers";
import {
  getLast5ForMatchup,
  getFullScheduleForTeam,
  getMlbSituationalStats,
  refreshMlbScheduleForDate,
  backfillMlbScheduleHistory,
  type MlbScheduleRefreshResult,
} from "../mlbScheduleHistoryService";

const TAG = "[MlbScheduleRouter]";

// ─── Zod validators ───────────────────────────────────────────────────────────

/** AN url_slug format: lowercase letters, digits, hyphens only */
const zodAnSlug = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9-]+$/, "Invalid team slug — must be lowercase letters, digits, and hyphens only");

/** YYYYMMDD date string for the AN API */
const zodAnDate = z
  .string()
  .length(8)
  .regex(/^\d{8}$/, "Date must be in YYYYMMDD format");

// ─── Router ───────────────────────────────────────────────────────────────────

export const mlbScheduleRouter = router({
  /**
   * Get the last 5 completed games for both teams in a matchup.
   * Powers the "Last 5 Games" panel on each MLB matchup card.
   *
   * Input:
   *   awaySlug — Action Network url_slug for the away team (e.g. "arizona-diamondbacks")
   *   homeSlug — Action Network url_slug for the home team (e.g. "philadelphia-phillies")
   *
   * Returns:
   *   awayLast5 — Array of up to 5 completed games for the away team (most recent first)
   *   homeLast5 — Array of up to 5 completed games for the home team (most recent first)
   */
  getLast5ForMatchup: publicProcedure
    .input(
      z.object({
        awaySlug: zodAnSlug,
        homeSlug: zodAnSlug,
      })
    )
    .query(async ({ input }) => {
      console.log(
        `${TAG}[getLast5ForMatchup] Fetching Last 5 for matchup:` +
        ` away="${input.awaySlug}" vs home="${input.homeSlug}"`
      );

      try {
        const { awayLast5, homeLast5 } = await getLast5ForMatchup(
          input.awaySlug,
          input.homeSlug
        );

        console.log(
          `${TAG}[getLast5ForMatchup] Returning` +
          ` away=${awayLast5.length} games, home=${homeLast5.length} games`
        );

        return { awayLast5, homeLast5 };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${TAG}[getLast5ForMatchup] ERROR: ${msg}`);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch Last 5 games: ${msg}`,
        });
      }
    }),

  /**
   * Get the full schedule for a single MLB team (all games, any status).
   * Powers the Team Schedule page when a user clicks on a team logo.
   *
   * Input:
   *   teamSlug — Action Network url_slug (e.g. "arizona-diamondbacks")
   *
   * Returns:
   *   games — Array of all games for this team (most recent first)
   *   teamSlug — Echo back the slug for the frontend to use
   */
  getTeamSchedule: publicProcedure
    .input(
      z.object({
        teamSlug: zodAnSlug,
      })
    )
    .query(async ({ input }) => {
      console.log(
        `${TAG}[getTeamSchedule] Fetching full schedule for team="${input.teamSlug}"`
      );

      try {
        const games = await getFullScheduleForTeam(input.teamSlug);

        console.log(
          `${TAG}[getTeamSchedule] Returning ${games.length} games for team="${input.teamSlug}"`
        );

        return { games, teamSlug: input.teamSlug };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${TAG}[getTeamSchedule] ERROR: ${msg}`);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch team schedule: ${msg}`,
        });
      }
    }),

  /**
   * Get situational records for a single MLB team.
   * Powers the "Situational Results" panel (ML/Run Line/Total tabs).
   *
   * Input:
   *   teamSlug — Action Network url_slug (e.g. "arizona-diamondbacks")
   *
   * Returns:
   *   ml      — { overall, last10, home, away, favorite, underdog } win/loss records
   *   spread  — { overall, last10, home, away, favorite, underdog } run line ATS records
   *   total   — { overall, last10, home, away, favorite, underdog } O/U records
   *   gamesAnalyzed — Total number of complete games used for computation
   */
  getSituationalStats: publicProcedure
    .input(
      z.object({
        teamSlug: zodAnSlug,
      })
    )
    .query(async ({ input }) => {
      console.log(
        `${TAG}[getSituationalStats] Computing situational stats for team="${input.teamSlug}"`
      );
      try {
        const stats = await getMlbSituationalStats(input.teamSlug);
        console.log(
          `${TAG}[getSituationalStats] Returning stats for team="${input.teamSlug}"` +
          ` gamesAnalyzed=${stats.gamesAnalyzed}`
        );
        return stats;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${TAG}[getSituationalStats] ERROR: ${msg}`);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to compute MLB situational stats: ${msg}`,
        });
      }
    }),

  /**
   * Owner-only: Refresh MLB schedule history for a specific date.
   * Fetches from AN DK NJ API and upserts into mlb_schedule_history.
   *
   * Input:
   *   date — YYYYMMDD format (e.g. "20260410")
   */
  refreshScheduleForDate: ownerProcedure
    .input(
      z.object({
        date: zodAnDate,
      })
    )
    .mutation(async ({ input }) => {
      console.log(
        `${TAG}[refreshScheduleForDate] Manual refresh triggered for date=${input.date}`
      );

      try {
        const result = await refreshMlbScheduleForDate(input.date);

        console.log(
          `${TAG}[refreshScheduleForDate] Complete:` +
          ` fetched=${result.fetched} upserted=${result.upserted}` +
          ` errors=${result.errors.length}`
        );

        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${TAG}[refreshScheduleForDate] ERROR: ${msg}`);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Schedule refresh failed: ${msg}`,
        });
      }
    }),

  /**
   * Owner-only: Backfill MLB schedule history for the last N days.
   * Runs sequentially, fetching each date from the AN DK NJ API.
   *
   * Input:
   *   daysBack — Number of days to backfill (default: 30, max: 60)
   */
  backfillSchedule: ownerProcedure
    .input(
      z.object({
        daysBack: z.number().int().min(1).max(60).default(30),
      })
    )
    .mutation(async ({ input }) => {
      console.log(
        `${TAG}[backfillSchedule] Manual backfill triggered for last ${input.daysBack} days`
      );

      try {
        const results = await backfillMlbScheduleHistory(input.daysBack);

        const totalFetched = results.reduce((s: number, r: MlbScheduleRefreshResult) => s + r.fetched, 0);
        const totalUpserted = results.reduce((s: number, r: MlbScheduleRefreshResult) => s + r.upserted, 0);
        const totalErrors = results.reduce((s: number, r: MlbScheduleRefreshResult) => s + r.errors.length, 0);

        console.log(
          `${TAG}[backfillSchedule] Complete:` +
          ` dates=${results.length} totalFetched=${totalFetched}` +
          ` totalUpserted=${totalUpserted} totalErrors=${totalErrors}`
        );

        return { results, totalFetched, totalUpserted, totalErrors };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${TAG}[backfillSchedule] ERROR: ${msg}`);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Backfill failed: ${msg}`,
        });
      }
    }),
});

export type MlbScheduleRouter = typeof mlbScheduleRouter;
