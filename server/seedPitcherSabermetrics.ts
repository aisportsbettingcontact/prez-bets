/**
 * seedPitcherSabermetrics.ts
 *
 * Fetches FIP, xFIP, FIP-, ERA-, WAR, and throwing hand for every pitcher
 * already in the mlb_pitcher_stats table, then upserts those fields.
 *
 * Data sources:
 *   - Sabermetrics: GET /api/v1/people/{id}/stats?stats=sabermetrics&group=pitching&season=2025
 *   - Handedness:   GET /api/v1/people/{id}
 *
 * Execution model:
 *   - Reads all rows from mlb_pitcher_stats to get mlbamId list
 *   - Fetches sabermetrics + bio in parallel (concurrency=10)
 *   - Upserts fip, xfip, fipMinus, eraMinus, war, throwsHand columns
 *   - Full structured logging at every stage
 *
 * Usage:
 *   npx tsx server/seedPitcherSabermetrics.ts
 */

import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { mlbPitcherStats } from "../drizzle/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SaberRow {
  mlbamId: number;
  fip: number | null;
  xfip: number | null;
  fipMinus: number | null;
  eraMinus: number | null;
  war: number | null;
  throwsHand: string | null;
}

// ─── MLB API Helpers ──────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/**
 * Fetch sabermetrics (FIP, xFIP, etc.) for a pitcher in a given season.
 * Returns null for all fields if no data available.
 */
async function fetchSabermetrics(
  mlbamId: number,
  season: number
): Promise<{ fip: number | null; xfip: number | null; fipMinus: number | null; eraMinus: number | null; war: number | null }> {
  const url = `https://statsapi.mlb.com/api/v1/people/${mlbamId}/stats?stats=sabermetrics&group=pitching&season=${season}`;
  try {
    const data = await fetchJson(url);
    const splits = data?.stats?.[0]?.splits ?? [];
    if (splits.length === 0) {
      return { fip: null, xfip: null, fipMinus: null, eraMinus: null, war: null };
    }
    const st = splits[0].stat;
    return {
      fip: typeof st.fip === "number" ? st.fip : null,
      xfip: typeof st.xfip === "number" ? st.xfip : null,
      fipMinus: typeof st.fipMinus === "number" ? st.fipMinus : null,
      eraMinus: typeof st.eraMinus === "number" ? st.eraMinus : null,
      war: typeof st.war === "number" ? st.war : null,
    };
  } catch (e: any) {
    console.warn(`  [WARN] Sabermetrics fetch failed for mlbamId=${mlbamId}: ${e.message}`);
    return { fip: null, xfip: null, fipMinus: null, eraMinus: null, war: null };
  }
}

/**
 * Fetch pitcher throwing hand from bio endpoint.
 * Returns null if not available.
 */
async function fetchThrowsHand(mlbamId: number): Promise<string | null> {
  const url = `https://statsapi.mlb.com/api/v1/people/${mlbamId}`;
  try {
    const data = await fetchJson(url);
    const code = data?.people?.[0]?.pitchHand?.code ?? null;
    return code; // 'R', 'L', or 'S'
  } catch (e: any) {
    console.warn(`  [WARN] Bio fetch failed for mlbamId=${mlbamId}: ${e.message}`);
    return null;
  }
}

// ─── Concurrency Pool ─────────────────────────────────────────────────────────

async function runConcurrent<T>(
  items: T[],
  fn: (item: T, idx: number) => Promise<void>,
  concurrency: number
): Promise<void> {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function seedPitcherSabermetrics(): Promise<{
  total: number;
  updated: number;
  noSaberData: number;
  noHandData: number;
  errors: number;
}> {
  const db = await getDb();
  const now = Date.now();

  // ── Step 1: Load all pitchers from DB ──────────────────────────────────────
  console.log("[INPUT] Loading all pitchers from mlb_pitcher_stats...");
  const allPitchers = await db.select({
    id: mlbPitcherStats.id,
    mlbamId: mlbPitcherStats.mlbamId,
    fullName: mlbPitcherStats.fullName,
    teamAbbrev: mlbPitcherStats.teamAbbrev,
  }).from(mlbPitcherStats);

  console.log(`[STATE] Loaded ${allPitchers.length} pitchers from DB`);

  // Deduplicate by mlbamId (same pitcher may appear for multiple teams)
  const uniqueByMlbamId = new Map<number, typeof allPitchers[0]>();
  for (const p of allPitchers) {
    if (!uniqueByMlbamId.has(p.mlbamId)) uniqueByMlbamId.set(p.mlbamId, p);
  }
  const uniquePitchers = Array.from(uniqueByMlbamId.values());
  console.log(`[STATE] Unique mlbamIds: ${uniquePitchers.length} (deduped from ${allPitchers.length} rows)`);

  // ── Step 2: Fetch sabermetrics + handedness for each unique pitcher ─────────
  const results: SaberRow[] = [];
  let fetchErrors = 0;
  let noSaberData = 0;
  let noHandData = 0;

  console.log(`[STEP] Fetching sabermetrics + handedness for ${uniquePitchers.length} pitchers (concurrency=10)...`);

  await runConcurrent(uniquePitchers, async (pitcher, i) => {
    const { mlbamId, fullName } = pitcher;
    const prefix = `  [${i + 1}/${uniquePitchers.length}] ${fullName} (${mlbamId})`;

    try {
      // Fetch both in parallel
      const [saber, hand] = await Promise.all([
        fetchSabermetrics(mlbamId, 2025),
        fetchThrowsHand(mlbamId),
      ]);

      const hasSaber = saber.fip !== null || saber.xfip !== null;
      if (!hasSaber) {
        noSaberData++;
        console.log(`${prefix} — ⚠ No 2025 sabermetrics data`);
      } else {
        console.log(`${prefix} — ✓ FIP=${saber.fip?.toFixed(2)} xFIP=${saber.xfip?.toFixed(2)} FIP-=${saber.fipMinus?.toFixed(1)} ERA-=${saber.eraMinus?.toFixed(1)} WAR=${saber.war?.toFixed(2)} hand=${hand}`);
      }

      if (!hand) {
        noHandData++;
        console.log(`${prefix} — ⚠ No handedness data`);
      }

      results.push({
        mlbamId,
        fip: saber.fip,
        xfip: saber.xfip,
        fipMinus: saber.fipMinus,
        eraMinus: saber.eraMinus,
        war: saber.war,
        throwsHand: hand,
      });
    } catch (e: any) {
      fetchErrors++;
      console.error(`${prefix} — ✗ FETCH ERROR: ${e.message}`);
      results.push({
        mlbamId,
        fip: null, xfip: null, fipMinus: null, eraMinus: null, war: null,
        throwsHand: null,
      });
    }
  }, 10);

  console.log(`[STATE] Fetch complete: ${results.length} results, ${noSaberData} no-saber, ${noHandData} no-hand, ${fetchErrors} errors`);

  // ── Step 3: Build lookup map from mlbamId → saber row ─────────────────────
  const saberMap = new Map<number, SaberRow>();
  for (const r of results) saberMap.set(r.mlbamId, r);

  // ── Step 4: Upsert all DB rows (including duplicates by team) ─────────────
  console.log(`[STEP] Upserting sabermetrics into ${allPitchers.length} DB rows...`);
  let updated = 0;
  let upsertErrors = 0;

  for (const pitcher of allPitchers) {
    const saber = saberMap.get(pitcher.mlbamId);
    if (!saber) continue;

    try {
      await db.update(mlbPitcherStats)
        .set({
          fip: saber.fip,
          xfip: saber.xfip,
          fipMinus: saber.fipMinus,
          eraMinus: saber.eraMinus,
          war: saber.war,
          throwsHand: saber.throwsHand,
          lastFetchedAt: now,
        })
        .where(eq(mlbPitcherStats.id, pitcher.id));
      updated++;
    } catch (e: any) {
      upsertErrors++;
      console.error(`  [ERROR] DB upsert failed for ${pitcher.fullName} (${pitcher.mlbamId}): ${e.message}`);
    }
  }

  // ── Step 5: Validation summary ─────────────────────────────────────────────
  console.log("\n[OUTPUT] Sabermetrics seed complete:");
  console.log(`  Total DB rows:     ${allPitchers.length}`);
  console.log(`  Unique pitchers:   ${uniquePitchers.length}`);
  console.log(`  DB rows updated:   ${updated}`);
  console.log(`  No saber data:     ${noSaberData}`);
  console.log(`  No hand data:      ${noHandData}`);
  console.log(`  Fetch errors:      ${fetchErrors}`);
  console.log(`  DB upsert errors:  ${upsertErrors}`);

  // Verify a sample
  const sample = await db.select({
    fullName: mlbPitcherStats.fullName,
    fip: mlbPitcherStats.fip,
    xfip: mlbPitcherStats.xfip,
    throwsHand: mlbPitcherStats.throwsHand,
    war: mlbPitcherStats.war,
  }).from(mlbPitcherStats).limit(5);

  console.log("\n[VERIFY] Sample rows after update:");
  for (const r of sample) {
    console.log(`  ${r.fullName}: FIP=${r.fip?.toFixed(2) ?? 'null'} xFIP=${r.xfip?.toFixed(2) ?? 'null'} hand=${r.throwsHand ?? 'null'} WAR=${r.war?.toFixed(2) ?? 'null'}`);
  }

  const totalErrors = fetchErrors + upsertErrors;
  if (totalErrors === 0) {
    console.log("[VERIFY] ✅ PASS — 0 errors");
  } else {
    console.log(`[VERIFY] ⚠ ${totalErrors} total errors encountered`);
  }

  return {
    total: allPitchers.length,
    updated,
    noSaberData,
    noHandData,
    errors: totalErrors,
  };
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  seedPitcherSabermetrics()
    .then((r) => {
      console.log("\n[DONE]", r);
      process.exit(0);
    })
    .catch((e) => {
      console.error("[FATAL]", e);
      process.exit(1);
    });
}
