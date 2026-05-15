/**
 * jackMac.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * tRPC router for JACK MAC features.
 * Access is restricted to the JACK_MAC_WHITELIST: @prez, @sippi, @lucianobets.
 *
 * Procedures:
 *   jackMac.syncToSheets — scrapes all 4 RG pages and writes to Google Sheets
 */

import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { appUserProcedure } from "./appUsers";
import { syncJackMacToSheets } from "../jackMacSheetsSync";

// ─── Whitelist ────────────────────────────────────────────────────────────────

const JACK_MAC_WHITELIST = new Set(["prez", "sippi", "lucianobets"]);

// ─── jackMacProcedure — extends appUserProcedure with whitelist check ─────────

const jackMacProcedure = appUserProcedure.use(async ({ ctx, next }) => {
  const username = ctx.appUser?.username ?? "";
  if (!JACK_MAC_WHITELIST.has(username)) {
    console.warn(
      `[JackMac] [VERIFY] FAIL — @${username} is not in JACK_MAC_WHITELIST. Returning FORBIDDEN.`
    );
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Access denied: JACK MAC is restricted to authorized users only.",
    });
  }
  console.log(`[JackMac] [VERIFY] PASS — @${username} authorized for JACK MAC`);
  return next({ ctx });
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const jackMacRouter = router({
  /**
   * syncToSheets
   * Scrapes all 4 Rotogrinders THE BAT X pages and writes them to the
   * Jack Mac Google Sheet. Returns a structured result with per-tab status.
   *
   * This is a mutation (not a query) because it has side effects:
   * it writes to an external Google Sheet.
   *
   * Restricted to: @prez, @sippi, @lucianobets
   */
  syncToSheets: jackMacProcedure.mutation(async ({ ctx }) => {
    const username = ctx.appUser?.username ?? "unknown";
    console.log(`[JackMac] [INPUT] syncToSheets triggered by @${username}`);
    console.log(`[JackMac] [STEP] Starting Rotogrinders → Google Sheets sync...`);

    const result = await syncJackMacToSheets();

    console.log(
      `[JackMac] [OUTPUT] syncToSheets complete: success=${result.success} totalRows=${result.totalRowsWritten} elapsed=${result.elapsedMs}ms`
    );
    console.log(
      `[JackMac] [VERIFY] ${result.success ? "PASS" : "PARTIAL"} — sync triggered by @${username}`
    );

    return result;
  }),
});
