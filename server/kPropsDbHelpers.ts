/**
 * kPropsDbHelpers.ts
 *
 * Helper functions for updating mlb_strikeout_props rows with live AN line data.
 * Called by MLBCycle every 10 minutes to keep book lines fresh.
 *
 * Matching strategy:
 *   1. Primary: exact pitcherName match (case-insensitive) within gameDate window
 *   2. Fallback: last-name match within same team + gameDate
 *
 * Logging format:
 *   [KPropsDB][STEP]   operation description
 *   [KPropsDB][STATE]  intermediate state
 *   [KPropsDB][OUTPUT] result
 *   [KPropsDB][WARN]   non-fatal warning
 *   [KPropsDB][ERROR]  fatal error
 */

import { getDb } from "./db";
import { mlbStrikeoutProps, games } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import type { ANKPropsResult } from "./anKPropsService";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UpdateKPropsResult {
  updated: number;
  notFound: number;
  errors: number;
  details: Array<{
    pitcherName: string;
    anLine: number;
    matched: boolean;
    matchType?: "exact" | "lastName";
  }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z\s]/g, "");
}

function getLastName(name: string): string {
  const parts = normalizeName(name).split(/\s+/);
  return parts[parts.length - 1];
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Update mlb_strikeout_props rows with live AN line data.
 * Matches by pitcherName (case-insensitive) within the given gameDate.
 */
export async function updateKPropsFromAN(
  anResult: ANKPropsResult,
  gameDate: string
): Promise<UpdateKPropsResult> {
  console.log(
    `[KPropsDB][STEP] Updating K-props from AN for date=${gameDate} | ${anResult.props.length} AN props`
  );

  const db = await getDb();

  // Fetch all K-prop rows for this date
  const existingRows = await db
    .select({
      id: mlbStrikeoutProps.id,
      pitcherName: mlbStrikeoutProps.pitcherName,
      side: mlbStrikeoutProps.side,
      gameId: mlbStrikeoutProps.gameId,
    })
    .from(mlbStrikeoutProps)
    .innerJoin(games, eq(mlbStrikeoutProps.gameId, games.id))
    .where(eq(games.gameDate, gameDate));

  console.log(
    `[KPropsDB][STATE] Found ${existingRows.length} K-prop rows in DB for ${gameDate}`
  );

  const result: UpdateKPropsResult = {
    updated: 0,
    notFound: 0,
    errors: 0,
    details: [],
  };

  // Build a map of existing rows by normalized pitcher name
  const rowsByName = new Map<string, typeof existingRows[0]>();
  const rowsByLastName = new Map<string, typeof existingRows[0]>();
  for (const row of existingRows) {
    rowsByName.set(normalizeName(row.pitcherName), row);
    rowsByLastName.set(getLastName(row.pitcherName), row);
  }

  // Process each AN prop
  // AN props come in pairs (OVER + UNDER) — we only need to process each pitcher once
  const processedPitchers = new Set<string>();

  for (const anProp of anResult.props) {
    const anName = anProp.pitcherName;
    const anNameNorm = normalizeName(anName);

    // Skip if we already processed this pitcher (avoid double-update for OVER/UNDER pair)
    if (processedPitchers.has(anNameNorm)) continue;
    processedPitchers.add(anNameNorm);

    // Find matching DB row
    let matchedRow = rowsByName.get(anNameNorm);
    let matchType: "exact" | "lastName" = "exact";

    if (!matchedRow) {
      // Fallback: last name match
      const lastName = getLastName(anName);
      matchedRow = rowsByLastName.get(lastName);
      matchType = "lastName";
    }

    if (!matchedRow) {
      console.log(
        `[KPropsDB][WARN] No DB row found for AN pitcher: ${anName} (normalized: ${anNameNorm})`
      );
      result.notFound++;
      result.details.push({ pitcherName: anName, anLine: anProp.line, matched: false });
      continue;
    }

    // Find the AN prop for this pitcher (one entry per pitcher with both odds)
    const anPropFull = anResult.props.find(
      (p) => normalizeName(p.pitcherName) === anNameNorm
    ) ?? anResult.props.find(
      (p) => getLastName(p.pitcherName) === getLastName(anName)
    );

    if (!anPropFull) {
      result.notFound++;
      continue;
    }

    const line = anPropFull.line;
    const overOdds = anPropFull.overOdds;
    const underOdds = anPropFull.underOdds;
    const noVigOverPct = anPropFull.noVigOverPct;
    const anPlayerId = anPropFull.anPlayerId;

    // Update all rows for this pitcher (both OVER and UNDER sides)
    const matchingRows = existingRows.filter(
      (r: typeof existingRows[0]) =>
        normalizeName(r.pitcherName) === anNameNorm ||
        getLastName(r.pitcherName) === getLastName(anName)
    );

    for (const row of matchingRows) {
      try {
        const dbUpdate = await getDb();
        await dbUpdate
          .update(mlbStrikeoutProps)
          .set({
            bookLine: line.toString(),
            bookOverOdds: overOdds !== null ? String(overOdds) : null,
            bookUnderOdds: underOdds !== null ? String(underOdds) : null,
            anNoVigOverPct: noVigOverPct !== null ? noVigOverPct.toFixed(4) : null,
            anPlayerId: anPlayerId !== null ? Number(anPlayerId) : null,
          })
          .where(eq(mlbStrikeoutProps.id, row.id));

        result.updated++;
        console.log(
          `[KPropsDB][OUTPUT] Updated ${row.pitcherName} (${row.side}) | line=${line} | overOdds=${overOdds} | underOdds=${underOdds} | noVig=${noVigOverPct?.toFixed(3)} | matchType=${matchType}`
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const cause = (err as { cause?: unknown })?.cause;
        const causeMsg = cause instanceof Error ? ` | cause: ${cause.message}` : '';
        console.error(`[KPropsDB][ERROR] Failed to update row ${row.id}: ${msg}${causeMsg}`);
        result.errors++;
      }
    }

    result.details.push({
      pitcherName: anName,
      anLine: line,
      matched: true,
      matchType,
    });
  }

  console.log(
    `[KPropsDB][OUTPUT] AN update complete: updated=${result.updated} notFound=${result.notFound} errors=${result.errors}`
  );

  return result;
}
