/**
 * vsinAutoRefresh.ts
 *
 * Schedules a background job that runs every 30 minutes from 6am–midnight PST.
 *
 * On each tick it scrapes the VSiN CBB betting splits page and performs a
 * FULLY IDEMPOTENT upsert for every game on the page:
 *
 *   PAST games    → ignored entirely (before today PST)
 *   TODAY games   → upsert: update book odds + sortOrder if exists, INSERT if missing
 *   FUTURE games  → upsert: update odds + sortOrder if exists, INSERT stub if missing
 *
 * This guarantees that every game on VSiN is always in the DB, regardless of
 * how the game was originally imported or whether it was missed before.
 *
 * The last refresh result is stored in memory and exposed via
 * `trpc.games.lastRefresh` so the UI can show "Last updated HH:MM".
 */

import { listGamesByDate, updateBookOdds, insertGames } from "./db";
import { scrapeVsinOdds } from "./vsinScraper";
import { fetchNcaaGames, buildStartTimeMap } from "./ncaaScoreboard";
import type { InsertGame } from "../drizzle/schema";

const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export interface RefreshResult {
  refreshedAt: string;    // ISO timestamp
  updated: number;        // games matched + updated
  inserted: number;       // new games inserted
  total: number;          // total VSiN games processed (today + future)
  gameDate: string;       // today YYYY-MM-DD (PST)
}

let lastRefreshResult: RefreshResult | null = null;

export function getLastRefreshResult(): RefreshResult | null {
  return lastRefreshResult;
}

/**
 * Returns true if two team slugs refer to the same team.
 * Handles common suffix variations: _state/_st, _connecticut/_conn_st, etc.
 * Used as a fallback when exact slug match fails (e.g. legacy rows with old slugs).
 */
function slugsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  // Normalize both: lowercase, strip non-alphanumeric except underscore
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  // Common suffix aliases
  const aliases: Record<string, string> = {
    michigan_st: "michigan_state",
    ohio_st: "ohio_state",
    penn_st: "penn_state",
    florida_st: "florida_state",
    colorado_st: "colorado_state",
    cleveland_st: "cleveland_state",
    chicago_st: "chicago_state",
    georgia_st: "georgia_state",
    youngstown_st: "youngstown_state",
    wright_st: "wright_state",
    iowa_st: "iowa_state",
    c_conn_st: "central_connecticut",
    lemoyne: "le_moyne",
    w_georgia: "west_georgia",
    liu_brooklyn: "liu",
    n_alabama: "north_alabama",
    fl_gulf_coast: "florida_gulf_coast",
    e_kentucky: "eastern_kentucky",
    n_florida: "north_florida",
    n_kentucky: "northern_kentucky",
    sc_upstate: "south_carolina_upstate",
    e_illinois: "eastern_illinois",
  };
  const resolve = (s: string) => aliases[s] ?? s;
  return resolve(na) === resolve(nb);
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

/**
 * Core refresh logic — fully idempotent upsert of all VSiN games.
 * Safe to call at any time; errors are caught and logged.
 */
export async function runVsinRefresh(): Promise<RefreshResult | null> {
  const todayStr = datePst(); // e.g. "2026-03-04"

  console.log(`[VSiNAutoRefresh] Starting refresh — today: ${todayStr}`);

  try {
    // Scrape ALL games currently on VSiN (no date filter)
    const allScraped = await scrapeVsinOdds("ALL");

    if (allScraped.length === 0) {
      console.log("[VSiNAutoRefresh] No games returned from VSiN — skipping.");
      return null;
    }

    // Partition scraped games by date — ignore past dates
    const relevantGames = allScraped.filter(g => {
      const d = yyyymmddToIso(String(g.gameDate ?? ""));
      return d >= todayStr; // today or future
    });

    console.log(
      `[VSiNAutoRefresh] Scraped: ${allScraped.length} total | ` +
      `${relevantGames.length} relevant (today + future) | ` +
      `${allScraped.length - relevantGames.length} past (ignored)`
    );

    // Group relevant games by date
    const dateSet = Array.from(new Set(relevantGames.map(g => yyyymmddToIso(String(g.gameDate ?? "")))));

    // Fetch NCAA start times for each relevant date (best-effort, non-fatal)
    const startTimeMaps = new Map<string, Map<string, string>>();
    for (const dateStr of dateSet) {
      try {
        const yyyymmdd = dateStr.replace(/-/g, "");
        const ncaaGames = await fetchNcaaGames(yyyymmdd);
        startTimeMaps.set(dateStr, buildStartTimeMap(ncaaGames));
        console.log(`[VSiNAutoRefresh] NCAA start times: ${ncaaGames.length} games for ${dateStr}`);
      } catch (ncaaErr) {
        console.warn(`[VSiNAutoRefresh] NCAA fetch failed for ${dateStr} (non-fatal):`, ncaaErr);
      }
    }

    let totalUpdated = 0;
    let totalInserted = 0;

    // Process each date group
    for (const dateStr of dateSet) {
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

        if (existingGame) {
          // UPDATE: game already in DB — update book odds, sortOrder, and start time
          await updateBookOdds(existingGame.id, {
            awayBookSpread: scraped.awaySpread,
            homeBookSpread: scraped.homeSpread,
            bookTotal: scraped.total,
            sortOrder: scraped.vsinRowIndex,
            ...(startTimeEst ? { startTimeEst } : {}),
          });
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
          };
          await insertGames([row]);
          totalInserted++;
          console.log(
            `[VSiNAutoRefresh] Inserted: ${scraped.awayTeam} @ ${scraped.homeTeam} (${dateStr}) [slugs: ${awaySlug}@${homeSlug}]`
          );
        }
      }

      console.log(
        `[VSiNAutoRefresh] ${dateStr}: ${gamesForDate.length} VSiN games → ` +
        `${gamesForDate.filter(g => existing.some(e => e.awayTeam === g.awaySlug && e.homeTeam === g.homeSlug)).length} updated, ` +
        `${gamesForDate.filter(g => !existing.some(e => e.awayTeam === g.awaySlug && e.homeTeam === g.homeSlug)).length} inserted`
      );
    }

    const result: RefreshResult = {
      refreshedAt: new Date().toISOString(),
      updated: totalUpdated,
      inserted: totalInserted,
      total: relevantGames.length,
      gameDate: todayStr,
    };

    lastRefreshResult = result;
    console.log(
      `[VSiNAutoRefresh] Done — ${totalUpdated} updated, ${totalInserted} inserted, ` +
      `${relevantGames.length} total VSiN games processed.`
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
