/**
 * betTracker.ts — tRPC router for the Bet Tracker feature.
 *
 * All procedures are gated behind handicapperProcedure, which allows
 * OWNER, ADMIN, and HANDICAPPER roles only.
 *
 * Procedures:
 *   list      — list bets for the current user (filterable by sport, date, result)
 *   create    — create a new tracked bet (structured: game + timeframe + market + pickSide)
 *   update    — update an existing bet (result, notes, odds, risk, etc.)
 *   delete    — delete a bet by id
 *   getSlate  — get the AN game slate for a given sport + date (cached, ~0ms on warm)
 *   getStats  — aggregate P/L stats for the current user
 *
 * Schema fields added in v3:
 *   anGameId   — Action Network game id (links to AN scoreboard)
 *   timeframe  — FULL_GAME | FIRST_5 | FIRST_INNING
 *   market     — ML | RL | TOTAL
 *   pickSide   — AWAY | HOME | OVER | UNDER
 *
 * Logging convention:
 *   [BetTracker][INPUT]  — raw input received
 *   [BetTracker][STEP]   — operation in progress
 *   [BetTracker][STATE]  — intermediate computed values
 *   [BetTracker][OUTPUT] — final result
 *   [BetTracker][VERIFY] — validation pass/fail
 *   [BetTracker][ERROR]  — failure with context
 */

import { z } from "zod";
import { router } from "../_core/trpc";
import { handicapperProcedure } from "./appUsers";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { trackedBets } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { fetchAnSlate } from "../actionNetwork";

// ─── Shared Zod enums ─────────────────────────────────────────────────────────

const RESULTS    = ["PENDING", "WIN", "LOSS", "PUSH", "VOID"] as const;
const SPORTS     = ["MLB", "NBA", "NHL", "NCAAM", "NFL", "CUSTOM"] as const;
const TIMEFRAMES = [
  "FULL_GAME",
  "FIRST_5",
  "FIRST_INNING",
  "REGULATION",
  "FIRST_PERIOD",
  "FIRST_HALF",
  "FIRST_QUARTER",
] as const;
const MARKETS    = ["ML", "RL", "TOTAL"] as const;
const PICK_SIDES = ["AWAY", "HOME", "OVER", "UNDER"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Compute toWin from American odds + risk (dollars) */
function calcToWin(odds: number, risk: number): number {
  if (odds >= 100) {
    return parseFloat((risk * (odds / 100)).toFixed(2));
  } else {
    return parseFloat((risk * (100 / Math.abs(odds))).toFixed(2));
  }
}

/**
 * Derive a human-readable pick string from structured inputs.
 * Examples:
 *   AWAY + ML  → "HOU ML"
 *   HOME + RL  → "SEA RL"
 *   OVER + TOTAL → "OVER"
 *   UNDER + TOTAL → "UNDER"
 */
function derivePickLabel(
  pickSide: typeof PICK_SIDES[number],
  market: typeof MARKETS[number],
  awayTeam: string,
  homeTeam: string,
): string {
  if (market === "TOTAL") {
    return pickSide === "OVER" ? "OVER" : "UNDER";
  }
  const team = pickSide === "AWAY" ? awayTeam : homeTeam;
  const suffix = market === "ML" ? "ML" : "RL";
  return `${team} ${suffix}`;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const betTrackerRouter = router({

  /**
   * list — fetch all bets for the authenticated user.
   * Optional filters: sport, gameDate, result.
   */
  list: handicapperProcedure
    .input(z.object({
      sport:    z.enum(SPORTS).optional(),
      gameDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      result:   z.enum(RESULTS).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.appUser.id;
      console.log(`[BetTracker][INPUT] list: userId=${userId} sport=${input?.sport ?? "ALL"} date=${input?.gameDate ?? "ALL"} result=${input?.result ?? "ALL"}`);

      const conditions = [eq(trackedBets.userId, userId)];
      if (input?.sport)    conditions.push(eq(trackedBets.sport, input.sport));
      if (input?.gameDate) conditions.push(eq(trackedBets.gameDate, input.gameDate));
      if (input?.result)   conditions.push(eq(trackedBets.result, input.result));

      const db = await getDb();
      const rows = await db
        .select()
        .from(trackedBets)
        .where(and(...conditions))
        .orderBy(desc(trackedBets.createdAt));

      console.log(`[BetTracker][OUTPUT] list: userId=${userId} → ${rows.length} bets returned`);
      return rows;
    }),

  /**
   * create — add a new tracked bet.
   * Structured inputs: anGameId, timeframe, market, pickSide.
   * pick is auto-derived from pickSide + market + team abbreviations.
   * toWin is auto-calculated from odds + risk.
   */
  create: handicapperProcedure
    .input(z.object({
      // Game identification
      anGameId:  z.number().int().positive(),
      sport:     z.enum(SPORTS).default("MLB"),
      gameDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      awayTeam:  z.string().min(1).max(128),
      homeTeam:  z.string().min(1).max(128),
      // Bet structure
      timeframe: z.enum(TIMEFRAMES).default("FULL_GAME"),
      market:    z.enum(MARKETS).default("ML"),
      pickSide:  z.enum(PICK_SIDES),
      // Stake
      odds:      z.number().int().min(-10000).max(10000),
      risk:      z.number().positive().max(1_000_000),
      toWin:     z.number().positive().optional(),
      // Optional
      notes:     z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.appUser.id;
      const toWin  = input.toWin ?? calcToWin(input.odds, input.risk);
      const pick   = derivePickLabel(input.pickSide, input.market, input.awayTeam, input.homeTeam);

      console.log(`[BetTracker][INPUT] create: userId=${userId} sport=${input.sport} date=${input.gameDate} anGameId=${input.anGameId} timeframe=${input.timeframe} market=${input.market} pickSide=${input.pickSide} pick="${pick}" odds=${input.odds} risk=${input.risk} toWin=${toWin}`);
      console.log(`[BetTracker][STATE] create: awayTeam=${input.awayTeam} homeTeam=${input.homeTeam} derivedPick="${pick}"`);

      const db = await getDb();
      const [result] = await db.insert(trackedBets).values({
        userId,
        anGameId:  input.anGameId,
        sport:     input.sport,
        gameDate:  input.gameDate,
        awayTeam:  input.awayTeam,
        homeTeam:  input.homeTeam,
        timeframe: input.timeframe,
        market:    input.market,
        pickSide:  input.pickSide,
        betType:   input.market === "TOTAL" ? (input.pickSide === "OVER" ? "OVER" : "UNDER") : input.market,
        pick,
        odds:      input.odds,
        risk:      String(input.risk),
        toWin:     String(toWin),
        book:      null,
        notes:     input.notes ?? null,
        result:    "PENDING",
      });

      const insertId = (result as { insertId: number }).insertId;
      console.log(`[BetTracker][OUTPUT] create: SUCCESS — insertId=${insertId} userId=${userId} pick="${pick}"`);
      console.log(`[BetTracker][VERIFY] create: PASS — bet inserted with id=${insertId}`);

      const [created] = await db.select().from(trackedBets).where(eq(trackedBets.id, insertId));
      return created;
    }),

  /**
   * update — update an existing bet.
   * Only the owner of the bet can update it.
   * Supports updating result, notes, odds, risk, timeframe, market, pickSide.
   */
  update: handicapperProcedure
    .input(z.object({
      id:        z.number().int().positive(),
      timeframe: z.enum(TIMEFRAMES).optional(),
      market:    z.enum(MARKETS).optional(),
      pickSide:  z.enum(PICK_SIDES).optional(),
      odds:      z.number().int().min(-10000).max(10000).optional(),
      risk:      z.number().positive().max(1_000_000).optional(),
      toWin:     z.number().positive().optional(),
      notes:     z.string().max(2000).optional(),
      result:    z.enum(RESULTS).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.appUser.id;
      console.log(`[BetTracker][INPUT] update: userId=${userId} betId=${input.id} fields=${JSON.stringify(Object.keys(input).filter(k => k !== 'id'))}`);

      const db = await getDb();
      const [existing] = await db.select().from(trackedBets).where(eq(trackedBets.id, input.id));
      if (!existing) {
        console.log(`[BetTracker][ERROR] update: betId=${input.id} not found`);
        throw new TRPCError({ code: "NOT_FOUND", message: "Bet not found" });
      }
      if (existing.userId !== userId) {
        console.log(`[BetTracker][ERROR] update: betId=${input.id} owned by userId=${existing.userId}, requester=${userId}`);
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot modify another user's bet" });
      }

      // Build update payload — only include provided fields
      const patch: Record<string, unknown> = {};
      if (input.timeframe !== undefined) patch.timeframe = input.timeframe;
      if (input.market    !== undefined) patch.market    = input.market;
      if (input.pickSide  !== undefined) patch.pickSide  = input.pickSide;
      if (input.notes     !== undefined) patch.notes     = input.notes;
      if (input.result    !== undefined) patch.result    = input.result;

      // Re-derive pick label if market or pickSide changed
      const newMarket   = (input.market   ?? existing.market)   as typeof MARKETS[number];
      const newPickSide = (input.pickSide ?? existing.pickSide) as typeof PICK_SIDES[number];
      if (input.market !== undefined || input.pickSide !== undefined) {
        const awayTeam = existing.awayTeam ?? "";
        const homeTeam = existing.homeTeam ?? "";
        patch.pick   = derivePickLabel(newPickSide, newMarket, awayTeam, homeTeam);
        patch.betType = newMarket === "TOTAL"
          ? (newPickSide === "OVER" ? "OVER" : "UNDER")
          : newMarket;
        console.log(`[BetTracker][STATE] update: re-derived pick="${patch.pick}" betType="${patch.betType}"`);
      }

      // Recalculate toWin if odds or risk changed
      const newOdds = input.odds ?? existing.odds;
      const newRisk = input.risk !== undefined ? input.risk : parseFloat(existing.risk);
      if (input.risk !== undefined) patch.risk = String(input.risk);
      if (input.toWin !== undefined) {
        patch.toWin = String(input.toWin);
      } else if (input.odds !== undefined || input.risk !== undefined) {
        patch.toWin = String(calcToWin(newOdds, newRisk));
        console.log(`[BetTracker][STATE] update: recalculated toWin=${patch.toWin} (odds=${newOdds} risk=${newRisk})`);
      }
      if (input.odds !== undefined) patch.odds = input.odds;

      if (Object.keys(patch).length === 0) {
        console.log(`[BetTracker][OUTPUT] update: no-op — no fields changed for betId=${input.id}`);
        return existing;
      }

      await db.update(trackedBets).set(patch).where(eq(trackedBets.id, input.id));
      const [updated] = await db.select().from(trackedBets).where(eq(trackedBets.id, input.id));
      console.log(`[BetTracker][OUTPUT] update: SUCCESS — betId=${input.id} result=${updated?.result} pick="${updated?.pick}"`);
      console.log(`[BetTracker][VERIFY] update: PASS — betId=${input.id} updated`);
      return updated;
    }),

  /**
   * delete — remove a bet by id.
   * Only the owner of the bet can delete it.
   */
  delete: handicapperProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.appUser.id;
      console.log(`[BetTracker][INPUT] delete: userId=${userId} betId=${input.id}`);

      const db = await getDb();
      const [existing] = await db.select().from(trackedBets).where(eq(trackedBets.id, input.id));
      if (!existing) {
        console.log(`[BetTracker][ERROR] delete: betId=${input.id} not found`);
        throw new TRPCError({ code: "NOT_FOUND", message: "Bet not found" });
      }
      if (existing.userId !== userId) {
        console.log(`[BetTracker][ERROR] delete: betId=${input.id} owned by userId=${existing.userId}, requester=${userId}`);
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot delete another user's bet" });
      }

      await db.delete(trackedBets).where(eq(trackedBets.id, input.id));
      console.log(`[BetTracker][OUTPUT] delete: SUCCESS — betId=${input.id} deleted`);
      console.log(`[BetTracker][VERIFY] delete: PASS — betId=${input.id} removed`);
      return { success: true, deletedId: input.id };
    }),

  /**
   * getSlate — fetch the daily game slate from Action Network v2 scoreboard API.
   * Served from in-memory cache (5-min TTL) after server pre-warm.
   * Returns normalized SlateGame[] sorted by start time ASC.
   */
  getSlate: handicapperProcedure
    .input(z.object({
      sport:    z.enum(["MLB", "NBA", "NHL", "NCAAM"]),
      gameDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .query(async ({ ctx, input }) => {
      console.log(`[BetTracker][INPUT] getSlate: userId=${ctx.appUser.id} sport=${input.sport} date=${input.gameDate}`);
      const start = Date.now();
      const games = await fetchAnSlate(input.sport, input.gameDate);
      const elapsed = Date.now() - start;
      console.log(`[BetTracker][OUTPUT] getSlate: ${games.length} games | sport=${input.sport} date=${input.gameDate} | elapsed=${elapsed}ms`);
      console.log(`[BetTracker][VERIFY] getSlate: ${games.length > 0 ? "PASS" : "WARN — 0 games"} | elapsed=${elapsed}ms`);
      return games.map(g => ({
        id:           g.id,
        awayTeam:     g.awayTeam,
        homeTeam:     g.homeTeam,
        awayFull:     g.awayFull,
        homeFull:     g.homeFull,
        awayNickname: g.awayNickname,
        homeNickname: g.homeNickname,
        awayLogo:     g.awayLogo,
        homeLogo:     g.homeLogo,
        awayColor:    g.awayColor,
        homeColor:    g.homeColor,
        gameTime:     g.gameTime,
        sport:        g.sport,
        gameDate:     g.gameDate,
        status:       g.status,
        odds:         g.odds,
      }));
    }),

  /**
   * getStats — aggregate stats for the current user's bets.
   */
  getStats: handicapperProcedure
    .input(z.object({
      sport:    z.enum(SPORTS).optional(),
      gameDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.appUser.id;
      console.log(`[BetTracker][INPUT] getStats: userId=${userId} sport=${input?.sport ?? "ALL"} date=${input?.gameDate ?? "ALL"}`);

      const conditions = [eq(trackedBets.userId, userId)];
      if (input?.sport)    conditions.push(eq(trackedBets.sport, input.sport));
      if (input?.gameDate) conditions.push(eq(trackedBets.gameDate, input.gameDate));

      const db = await getDb();
      const rows = await db.select().from(trackedBets).where(and(...conditions));

      let wins = 0, losses = 0, pushes = 0, pending = 0, voids = 0;
      let totalRisk = 0, totalWon = 0, totalLost = 0;

      for (const bet of rows) {
        const risk  = parseFloat(bet.risk);
        const toWin = parseFloat(bet.toWin);
        switch (bet.result) {
          case "WIN":     wins++;    totalRisk += risk; totalWon  += toWin; break;
          case "LOSS":    losses++;  totalRisk += risk; totalLost += risk;  break;
          case "PUSH":    pushes++;  break;
          case "PENDING": pending++; break;
          case "VOID":    voids++;   break;
        }
      }

      const netProfit = totalWon - totalLost;
      const roi       = totalRisk > 0 ? parseFloat(((netProfit / totalRisk) * 100).toFixed(2)) : 0;

      const stats = {
        totalBets: rows.length,
        wins, losses, pushes, pending, voids,
        gradedBets: wins + losses + pushes,
        totalRisk:  parseFloat(totalRisk.toFixed(2)),
        totalWon:   parseFloat(totalWon.toFixed(2)),
        totalLost:  parseFloat(totalLost.toFixed(2)),
        netProfit:  parseFloat(netProfit.toFixed(2)),
        roi,
      };

      console.log(`[BetTracker][OUTPUT] getStats: userId=${userId} → totalBets=${stats.totalBets} wins=${stats.wins} losses=${stats.losses} roi=${stats.roi}%`);
      return stats;
    }),
});

export type BetTrackerRouter = typeof betTrackerRouter;
