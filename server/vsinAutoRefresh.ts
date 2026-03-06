/**
 * vsinAutoRefresh.ts
 *
 * Schedules a background job that runs every 30 minutes from 6am–midnight PST.
 *
 * On each tick it:
 *   1. Scrapes the VSiN CBB betting splits page and upserts every game on the page
 *      (book odds + sortOrder + start time from NCAA).
 *   2. Fetches ALL NCAA DI MBB games for a rolling 7-day window (today + 6 days ahead)
 *      and inserts any that are not already in the DB (including TBA vs TBA games),
 *      using ncaaContestId as the dedup key. VSiN-matched games are skipped (already
 *      handled in step 1).
 *
 * This guarantees that every game on NCAA.com is always in the DB, regardless of
 * whether VSiN has odds for it.
 *
 * The last refresh result is stored in memory and exposed via
 * `trpc.games.lastRefresh` so the UI can show "Last updated HH:MM".
 */

import { listGamesByDate, updateBookOdds, insertGames, getGameByNcaaContestId, updateNcaaStartTime } from "./db";
import { scrapeVsinOdds } from "./vsinScraper";
import { fetchNcaaGames, buildStartTimeMap } from "./ncaaScoreboard";
import { VALID_DB_SLUGS, BY_DB_SLUG } from "../shared/ncaamTeams";
import type { InsertGame } from "../drizzle/schema";

const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// Rolling window: today through N days ahead
const NCAA_RANGE_DAYS_AHEAD = 6; // fetch today + 6 more days = 7-day window

export interface RefreshResult {
  refreshedAt: string;    // ISO timestamp
  updated: number;        // games matched + updated (VSiN)
  inserted: number;       // new games inserted (VSiN stubs)
  ncaaInserted: number;   // new NCAA-only games inserted
  total: number;          // total VSiN games processed (today + future)
  gameDate: string;       // today YYYY-MM-DD (PST)
}

let lastRefreshResult: RefreshResult | null = null;

export function getLastRefreshResult(): RefreshResult | null {
  return lastRefreshResult;
}

/**
 * Returns true if two team slugs refer to the same team.
 * Uses the registry as the canonical source — both slugs must resolve to the same
 * team entry (by dbSlug). Falls back to exact string comparison.
 */
function slugsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  // Normalize both: lowercase, strip non-alphanumeric except underscore
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  // Registry-based resolution: look up both slugs and compare canonical dbSlugs
  const teamA = BY_DB_SLUG.get(na);
  const teamB = BY_DB_SLUG.get(nb);
  if (teamA && teamB) return teamA.dbSlug === teamB.dbSlug;
  // If one is in registry and the other isn't, no match
  return false;
}

/** Returns true if the current moment is inside 6am–midnight Pacific Time. */
function isWithinActiveHours(): boolean {
  const now = new Date();
  const pstFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    hour12: false,
  });
  const hour = Number(pstFormatter.format(now)); // 0–23
  return hour >= 6 && hour < 24;
}

/** Returns a date string as YYYY-MM-DD in Pacific Time. */
function datePst(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const str = now.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }); // "MM/DD/YYYY"
  const [mm, dd, yyyy] = str.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

/** Convert YYYYMMDD string to YYYY-MM-DD */
function yyyymmddToIso(s: string): string {
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** Generate all dates in a range [start, end] inclusive as YYYY-MM-DD strings */
function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + "T00:00:00Z");
  const endDate = new Date(end + "T00:00:00Z");
  while (cur <= endDate) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cur.getUTCDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Core refresh logic — fully idempotent upsert of all VSiN games,
 * plus insertion of all NCAA games for a rolling 7-day window (today + 6 days ahead).
 * Safe to call at any time; errors are caught and logged.
 */
export async function runVsinRefresh(): Promise<RefreshResult | null> {
  const todayStr = datePst(); // e.g. "2026-03-04"

  console.log(`[VSiNAutoRefresh] Starting refresh — today: ${todayStr}`);

  try {
    // ── STEP 1: VSiN odds upsert ──────────────────────────────────────────────

    // Scrape ALL games currently on VSiN (no date filter)
    const allScraped = await scrapeVsinOdds("ALL");

    if (allScraped.length === 0) {
      console.log("[VSiNAutoRefresh] No games returned from VSiN — skipping VSiN step.");
    }

    // Partition scraped games by date — ignore past dates AND non-365-team games
    const relevantGames = allScraped.filter(g => {
      const d = yyyymmddToIso(String(g.gameDate ?? ""));
      if (d < todayStr) return false; // ignore past
      // Filter: both teams must be in the 365-team registry
      if (!VALID_DB_SLUGS.has(g.awaySlug) || !VALID_DB_SLUGS.has(g.homeSlug)) {
        console.log(`[VSiNAutoRefresh] Skipping non-D1 game: ${g.awaySlug} @ ${g.homeSlug}`);
        return false;
      }
      return true;
    });

    console.log(
      `[VSiNAutoRefresh] VSiN scraped: ${allScraped.length} total | ` +
      `${relevantGames.length} relevant (today + future) | ` +
      `${allScraped.length - relevantGames.length} past (ignored)`
    );

    // Group relevant games by date
    const vsinDateSet = Array.from(new Set(relevantGames.map(g => yyyymmddToIso(String(g.gameDate ?? "")))));

    // Fetch NCAA start times for each relevant VSiN date (best-effort, non-fatal)
    const startTimeMaps = new Map<string, Map<string, string>>();
    const ncaaGamesByDate = new Map<string, Awaited<ReturnType<typeof fetchNcaaGames>>>();

    // Fetch NCAA data for a rolling window: today through N days ahead
    const rangeEnd = datePst(NCAA_RANGE_DAYS_AHEAD);
    const allDates = dateRange(todayStr, rangeEnd);
    for (const dateStr of allDates) {
      try {
        const yyyymmdd = dateStr.replace(/-/g, "");
        const ncaaGames = await fetchNcaaGames(yyyymmdd);
        startTimeMaps.set(dateStr, buildStartTimeMap(ncaaGames));
        ncaaGamesByDate.set(dateStr, ncaaGames);
        console.log(`[VSiNAutoRefresh] NCAA: ${ncaaGames.length} games for ${dateStr}`);
      } catch (ncaaErr) {
        console.warn(`[VSiNAutoRefresh] NCAA fetch failed for ${dateStr} (non-fatal):`, ncaaErr);
      }
    }

    let totalUpdated = 0;
    let totalInserted = 0;

    // Process each VSiN date group
    for (const dateStr of vsinDateSet) {
      const gamesForDate = relevantGames.filter(
        g => yyyymmddToIso(String(g.gameDate ?? "")) === dateStr
      );

      // Load existing DB games for this date
      const existing = await listGamesByDate(dateStr);
      const startTimeMap = startTimeMaps.get(dateStr);

      for (const scraped of gamesForDate) {
        // Use href-derived slugs (deterministic) instead of fuzzy name matching
        const awaySlug = scraped.awaySlug;
        const homeSlug = scraped.homeSlug;

        // Look for a matching existing game by slug.
        // Primary: exact slug match.
        // Fallback: fuzzy match by normalizing both sides (handles legacy rows with old slugs).
        // This prevents duplicate inserts when slug aliases are updated.
        const existingGame = existing.find(
          e => e.awayTeam === awaySlug && e.homeTeam === homeSlug
        ) ?? existing.find(
          e => slugsMatch(e.awayTeam, awaySlug) && slugsMatch(e.homeTeam, homeSlug)
        );

        // Resolve start time from NCAA data
        const startTimeKey = `${awaySlug}@${homeSlug}`;
        const startTimeEst = startTimeMap?.get(startTimeKey);

        // Find the NCAA contestId for this matchup (to store for dedup)
        const ncaaGame = ncaaGamesByDate.get(dateStr)?.find(
          g => g.awaySeoname === awaySlug && g.homeSeoname === homeSlug
        );
        const ncaaContestId = ncaaGame?.contestId ?? null;

        if (existingGame) {
          // UPDATE: game already in DB — update book odds, sortOrder, start time, and contestId
          await updateBookOdds(existingGame.id, {
            awayBookSpread: scraped.awaySpread,
            homeBookSpread: scraped.homeSpread,
            bookTotal: scraped.total,
            sortOrder: scraped.vsinRowIndex,
            ...(startTimeEst ? { startTimeEst } : {}),
          });
          // Also update ncaaContestId if we found one and it's not set yet
          if (ncaaContestId && !existingGame.ncaaContestId) {
            await updateNcaaStartTime(existingGame.id, {
              startTimeEst: startTimeEst ?? existingGame.startTimeEst,
              ncaaContestId,
            });
          }
          totalUpdated++;
        } else {
          // INSERT: game not in DB — create as unpublished stub
          const row: InsertGame = {
            fileId: 0,
            gameDate: dateStr,
            startTimeEst: startTimeEst ?? "TBD",
            awayTeam: awaySlug,
            homeTeam: homeSlug,
            awayBookSpread: scraped.awaySpread !== null ? String(scraped.awaySpread) : null,
            homeBookSpread: scraped.homeSpread !== null ? String(scraped.homeSpread) : null,
            bookTotal: scraped.total !== null ? String(scraped.total) : null,
            awayModelSpread: null,
            homeModelSpread: null,
            modelTotal: null,
            spreadEdge: null,
            spreadDiff: null,
            totalEdge: null,
            totalDiff: null,
            sport: "NCAAM",
            gameType: "regular_season",
            conference: null,
            publishedToFeed: false,
            rotNums: null,
            sortOrder: scraped.vsinRowIndex,
            ncaaContestId: ncaaContestId ?? null,
          };
          await insertGames([row]);
          totalInserted++;
          console.log(
            `[VSiNAutoRefresh] Inserted VSiN: ${scraped.awayTeam} @ ${scraped.homeTeam} (${dateStr}) [slugs: ${awaySlug}@${homeSlug}]`
          );
        }
      }

      console.log(
        `[VSiNAutoRefresh] ${dateStr}: ${gamesForDate.length} VSiN games → ` +
        `${gamesForDate.filter(g => existing.some(e => e.awayTeam === g.awaySlug && e.homeTeam === g.homeSlug)).length} updated, ` +
        `${gamesForDate.filter(g => !existing.some(e => e.awayTeam === g.awaySlug && e.homeTeam === g.homeSlug)).length} inserted`
      );
    }

    // ── STEP 2: NCAA-only game insertion (rolling 7-day window) ─────────────
    // Insert any NCAA game that isn't already in the DB (by contestId or slug match).
    // This covers games that VSiN doesn't have odds for (including TBA vs TBA).

    let ncaaInserted = 0;

    for (const dateStr of allDates) {
      // Only process today and future dates
      if (dateStr < todayStr) continue;

      const ncaaGames = ncaaGamesByDate.get(dateStr) ?? [];
      if (ncaaGames.length === 0) continue;

      // Load existing DB games for this date (fresh after VSiN step)
      const existing = await listGamesByDate(dateStr);

      for (const ncaaGame of ncaaGames) {
        const { contestId, awaySeoname, homeSeoname, startTimeEst } = ncaaGame;

        // Skip if either team is not in the 365-team registry
        if (!VALID_DB_SLUGS.has(awaySeoname) || !VALID_DB_SLUGS.has(homeSeoname)) {
          if (awaySeoname !== "tba" && homeSeoname !== "tba") {
            console.log(`[VSiNAutoRefresh] Skipping non-D1 NCAA game: ${awaySeoname} @ ${homeSeoname}`);
          }
          continue;
        }

        // Skip if already in DB by contestId
        const byContestId = await getGameByNcaaContestId(contestId);
        if (byContestId) continue;

        // Skip if already in DB by slug match (VSiN inserted it without contestId)
        const bySlug = existing.find(
          e => slugsMatch(e.awayTeam, awaySeoname) && slugsMatch(e.homeTeam, homeSeoname)
        );
        if (bySlug) {
          // Update the contestId on the existing row so future lookups are fast
          if (!bySlug.ncaaContestId) {
            await updateNcaaStartTime(bySlug.id, {
              startTimeEst: startTimeEst !== "TBD" ? startTimeEst : bySlug.startTimeEst,
              ncaaContestId: contestId,
            });
          }
          continue;
        }

        // Insert as NCAA-only stub (no VSiN odds, sortOrder = 9999 so it sorts after VSiN games)
        const row: InsertGame = {
          fileId: 0,
          gameDate: dateStr,
          startTimeEst: startTimeEst ?? "TBD",
          awayTeam: awaySeoname,
          homeTeam: homeSeoname,
          awayBookSpread: null,
          homeBookSpread: null,
          bookTotal: null,
          awayModelSpread: null,
          homeModelSpread: null,
          modelTotal: null,
          spreadEdge: null,
          spreadDiff: null,
          totalEdge: null,
          totalDiff: null,
          sport: "NCAAM",
          gameType: "regular_season",
          conference: null,
          publishedToFeed: false,
          rotNums: null,
          sortOrder: 9999,
          ncaaContestId: contestId,
        };
        await insertGames([row]);
        ncaaInserted++;
        console.log(
          `[VSiNAutoRefresh] Inserted NCAA-only: ${awaySeoname} @ ${homeSeoname} (${dateStr}) [contestId: ${contestId}]`
        );
      }
    }

    const result: RefreshResult = {
      refreshedAt: new Date().toISOString(),
      updated: totalUpdated,
      inserted: totalInserted,
      ncaaInserted,
      total: relevantGames.length,
      gameDate: todayStr,
    };

    lastRefreshResult = result;
    console.log(
      `[VSiNAutoRefresh] Done — ${totalUpdated} VSiN updated, ${totalInserted} VSiN inserted, ` +
      `${ncaaInserted} NCAA-only inserted.`
    );
    return result;
  } catch (err) {
    console.error("[VSiNAutoRefresh] Refresh failed:", err);
    return null;
  }
}

/**
 * Start the 30-minute auto-refresh scheduler.
 * Fires immediately if inside the active window, then every 30 minutes.
 */
export function startVsinAutoRefresh() {
  if (isWithinActiveHours()) {
    void runVsinRefresh();
  } else {
    console.log("[VSiNAutoRefresh] Outside active hours (6am–midnight PST) — waiting for next tick.");
  }

  setInterval(() => {
    if (isWithinActiveHours()) {
      void runVsinRefresh();
    } else {
      console.log("[VSiNAutoRefresh] Tick skipped — outside active hours (6am–midnight PST).");
    }
  }, INTERVAL_MS);

  console.log("[VSiNAutoRefresh] Scheduler started — every 30 min (6am–midnight PST).");
}
