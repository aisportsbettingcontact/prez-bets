/**
 * server/routers/security.ts
 *
 * Owner-only tRPC procedures for the Security Events dashboard panel.
 *
 * All procedures are gated behind ownerProcedure — only the account with
 * role="owner" can access them. No user-facing data is exposed.
 *
 * Procedures:
 *   security.events.list   — Paginated list of security events (newest first)
 *   security.events.counts — 24h rolling window counts grouped by event type
 *   security.events.prune  — Delete events older than N days (default 90)
 *
 * Logging format:
 *   [INPUT]  — incoming parameters
 *   [STEP]   — operation in progress
 *   [STATE]  — intermediate computation
 *   [OUTPUT] — result
 *   [VERIFY] — pass/fail gate
 */

import { z } from "zod";
import { router } from "../_core/trpc";
import { ownerProcedure } from "./appUsers";
import {
  getSecurityEvents,
  getSecurityEventCounts,
  pruneSecurityEvents,
} from "../db";

// ─── Input validators ─────────────────────────────────────────────────────────

const zodEventType = z
  .enum(["CSRF_BLOCK", "RATE_LIMIT", "AUTH_FAIL"])
  .optional()
  .describe("Filter by event type; omit to return all types");

const zodListInput = z.object({
  /** Max rows to return. Clamped to 500 server-side. */
  limit: z.number().int().min(1).max(500).default(200),
  /** Optional event type filter */
  eventType: zodEventType,
  /**
   * Optional lower-bound UTC ms timestamp.
   * Only events with occurredAt >= sinceMs are returned.
   * Defaults to no lower bound (all time) when omitted.
   */
  sinceMs: z.number().int().min(0).optional(),
});

const zodCountsInput = z.object({
  /**
   * UTC ms lower bound for the rolling window.
   * Defaults to now - 24h when omitted.
   */
  sinceMs: z.number().int().min(0).optional(),
});

const zodPruneInput = z.object({
  /**
   * Delete events older than this many days.
   * Must be between 7 and 365 to prevent accidental full-table wipes.
   */
  retentionDays: z.number().int().min(7).max(365).default(90),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const securityRouter = router({
  events: router({
    /**
     * List security events — newest first, owner-only.
     *
     * [INPUT]  limit, eventType, sinceMs
     * [STEP]   Validate owner session
     * [STEP]   Query security_events table with optional filters
     * [OUTPUT] SecurityEventRow[]
     * [VERIFY] Row count logged with filter context
     */
    list: ownerProcedure
      .input(zodListInput)
      .query(async ({ input }) => {
        const tag = "[tRPC][security.events.list]";
        console.log(
          `${tag} [INPUT] limit=${input.limit} type=${input.eventType ?? "ALL"}` +
          ` sinceMs=${input.sinceMs ?? "none"}`
        );

        const rows = await getSecurityEvents({
          limit: input.limit,
          eventType: input.eventType,
          sinceMs: input.sinceMs,
        });

        console.log(
          `${tag} [OUTPUT] Returned ${rows.length} rows` +
          ` | type=${input.eventType ?? "ALL"} limit=${input.limit}`
        );
        console.log(
          `${tag} [VERIFY] ${rows.length > 0 ? "PASS" : "PASS (empty — no events recorded yet)"}`
        );

        return rows;
      }),

    /**
     * Get 24h rolling window counts grouped by event type — owner-only.
     *
     * [INPUT]  sinceMs (optional, defaults to now - 24h)
     * [STEP]   Validate owner session
     * [STEP]   Aggregate COUNT(*) GROUP BY eventType
     * [OUTPUT] { CSRF_BLOCK, RATE_LIMIT, AUTH_FAIL, total }
     * [VERIFY] Total count logged
     */
    counts: ownerProcedure
      .input(zodCountsInput)
      .query(async ({ input }) => {
        const tag = "[tRPC][security.events.counts]";
        const sinceMs = input.sinceMs ?? (Date.now() - 24 * 60 * 60 * 1000);
        console.log(
          `${tag} [INPUT] sinceMs=${sinceMs} (${new Date(sinceMs).toISOString()})`
        );

        const counts = await getSecurityEventCounts(sinceMs);

        console.log(
          `${tag} [OUTPUT] total=${counts.total}` +
          ` CSRF_BLOCK=${counts.CSRF_BLOCK}` +
          ` RATE_LIMIT=${counts.RATE_LIMIT}` +
          ` AUTH_FAIL=${counts.AUTH_FAIL}`
        );
        console.log(
          `${tag} [VERIFY] ${counts.total >= 0 ? "PASS" : "FAIL — negative count"}`
        );

        return counts;
      }),

    /**
     * Prune security events older than retentionDays — owner-only.
     *
     * [INPUT]  retentionDays (7–365, default 90)
     * [STEP]   Validate owner session
     * [STEP]   DELETE WHERE occurredAt < (now - retentionDays * 86400000)
     * [OUTPUT] { deleted: number }
     * [VERIFY] Deleted count logged
     */
    prune: ownerProcedure
      .input(zodPruneInput)
      .mutation(async ({ input }) => {
        const tag = "[tRPC][security.events.prune]";
        console.log(
          `${tag} [INPUT] retentionDays=${input.retentionDays}`
        );

        const deleted = await pruneSecurityEvents(input.retentionDays);

        console.log(
          `${tag} [OUTPUT] Pruned ${deleted} rows older than ${input.retentionDays} days`
        );
        console.log(
          `${tag} [VERIFY] ${deleted >= 0 ? "PASS" : "FAIL — negative deleted count"}`
        );

        return { deleted };
      }),
  }),
});
