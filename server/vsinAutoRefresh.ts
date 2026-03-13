/**
 * vsinAutoRefresh.ts
 *
 * Schedules a background job that runs every 30 minutes from 6am–midnight PST.
 *
 * On each tick it:
 *   1. Scrapes the VSiN CBB (NCAAM) betting splits page and upserts every game.
 *   2. Scrapes the VSiN NBA betting splits page and upserts every NBA game.
 *   3. Fetches ALL NCAA DI MBB games for a rolling 7-day window and inserts
 *      any that are not already in the DB (NCAA-only games without VSiN odds).
 *   4. Fetches NBA schedule for a rolling 7-day window and inserts any NBA games
 *      not already in the DB (NBA-only games without VSiN odds).
 *
 * The last refresh result is stored in memory and exposed via
 * `trpc.games.lastRefresh` so the UI can show "Last updated HH:MM".
 */

import { listGamesByDate, updateBookOdds, insertGames, getGameByNcaaContestId, updateNcaaStartTime } from "./db";
import { scrapeVsinOdds } from "./vsinScraper";
import { scrapeNbaVsinOdds } from "./nbaVsinScraper";
import { scrapeNhlVsinOdds, type NhlScrapedOdds } from "./nhlVsinScraper";
import { fetchNcaaGames, buildStartTimeMap } from "./ncaaScoreboard";
import { fetchNbaGamesForDate, buildNbaStartTimeMap, fetchNbaLiveScores } from "./nbaScoreboard";
import { fetchNhlGamesForRange, buildNhlStartTimeMap, buildNhlGameMap, fetchNhlLiveScores, type NhlScheduleGame } from "./nhlSchedule";
import { VALID_DB_SLUGS, BY_DB_SLUG } from "../shared/ncaamTeams";
import { NBA_VALID_DB_SLUGS } from "../shared/nbaTeams";
import { NHL_VALID_DB_SLUGS, NHL_BY_ABBREV, NHL_BY_DB_SLUG } from "../shared/nhlTeams";
import { NBA_BY_DB_SLUG } from "../shared/nbaTeams";
import { fetchMetabetConsensusOdds, type MetabetConsensusOdds } from "./metabetScraper";
import type { InsertGame } from "../drizzle/schema";

const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// Rolling window: today through N days ahead
const RANGE_DAYS_AHEAD = 6; // fetch today + 6 more days = 7-day window

export interface RefreshResult {
  refreshedAt: string;       // ISO timestamp of last VSiN odds/splits refresh
  scoresRefreshedAt: string; // ISO timestamp of last score refresh (NCAAM + NBA)
  updated: number;           // NCAAM games matched + updated (VSiN)
  inserted: number;          // new NCAAM games inserted (VSiN stubs)
  ncaaInserted: number;      // new NCAA-only games inserted
  nbaUpdated: number;        // NBA games matched + updated (VSiN)
  nbaInserted: number;       // new NBA games inserted (VSiN stubs)
  nbaScheduleInserted: number; // new NBA-only games inserted from schedule
  total: number;             // total NCAAM VSiN games processed
  nbaTotal: number;          // total NBA VSiN games processed
  nhlUpdated: number;        // NHL games matched + updated (VSiN)
  nhlInserted: number;       // new NHL games inserted (VSiN stubs)
  nhlScheduleInserted: number; // new NHL-only games inserted from schedule
  nhlTotal: number;          // total NHL VSiN games processed
  gameDate: string;          // today YYYY-MM-DD (PST)
}

let lastRefreshResult: RefreshResult | null = null;
let lastScoresRefreshedAt: string = new Date().toISOString();

export function getLastRefreshResult(): RefreshResult | null {
  return lastRefreshResult;
}

/**
 * Returns true if two team slugs refer to the same team.
 * Uses the registry as the canonical source.
 */
function slugsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  const teamA = BY_DB_SLUG.get(na);
  const teamB = BY_DB_SLUG.get(nb);
  if (teamA && teamB) return teamA.dbSlug === teamB.dbSlug;
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
  const hour = Number(pstFormatter.format(now));
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
  });
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

// ─── MetaBet DraftKings odds helpers ─────────────────────────────────────────

/**
 * Normalizes a team name to a slug-like key for fuzzy matching.
 * e.g. "St. John's" → "st_johns", "North Texas" → "north_texas"
 */
function normalizeToSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_");
}

/**
 * Applies DraftKings spread odds and O/U odds from MetaBet to existing DB games.
 * Matches MetaBet games to DB games by team identity, then calls updateBookOdds
 * to write awaySpreadOdds, homeSpreadOdds, overOdds, underOdds.
 *
 * @param sport - "NCAAM" | "NBA" | "NHL"
 * @param dateStr - YYYY-MM-DD date to update
 * @param metabetGames - DraftKings odds from MetaBet API
 */
async function applyMetabetOdds(
  sport: "NCAAM" | "NBA" | "NHL",
  dateStr: string,
  metabetGames: MetabetConsensusOdds[]
): Promise<{ updated: number; skipped: number }> {
  if (metabetGames.length === 0) return { updated: 0, skipped: 0 };

  const existing = await listGamesByDate(dateStr, sport);
  if (existing.length === 0) return { updated: 0, skipped: 0 };

  let updated = 0;
  let skipped = 0;

  for (const mb of metabetGames) {
    let dbGame = null;

    if (sport === "NHL") {
      // NHL: match by 3-letter abbreviation (e.g. "LAK", "NYI")
      // MetaBet uses standard NHL abbreviations that match our abbrev field
      const awayTeam = NHL_BY_ABBREV.get(mb.awayInitials);
      const homeTeam = NHL_BY_ABBREV.get(mb.homeInitials);
      if (awayTeam && homeTeam) {
        dbGame = existing.find(
          e => e.awayTeam === awayTeam.dbSlug && e.homeTeam === homeTeam.dbSlug
        );
      }
      // Fallback: try non-standard initials (e.g. "NJ" → "new_jersey_devils", "SJ" → "san_jose_sharks", "VGS" → "vegas_golden_knights")
      if (!dbGame) {
        const NHL_INITIALS_OVERRIDES: Record<string, string> = {
          "NJ": "new_jersey_devils",
          "SJ": "san_jose_sharks",
          "VGS": "vegas_golden_knights",
          "TB": "tampa_bay_lightning",
          "UTA": "utah_mammoth",
        };
        const awaySlug = NHL_INITIALS_OVERRIDES[mb.awayInitials] ?? NHL_BY_ABBREV.get(mb.awayInitials)?.dbSlug;
        const homeSlug = NHL_INITIALS_OVERRIDES[mb.homeInitials] ?? NHL_BY_ABBREV.get(mb.homeInitials)?.dbSlug;
        if (awaySlug && homeSlug) {
          dbGame = existing.find(e => e.awayTeam === awaySlug && e.homeTeam === homeSlug);
        }
      }
    } else if (sport === "NBA") {
      // NBA: match by city+name (e.g. "Memphis Grizzlies" → "memphis_grizzlies")
      const awayKey = normalizeToSlug(`${mb.awayCity} ${mb.awayName}`);
      const homeKey = normalizeToSlug(`${mb.homeCity} ${mb.homeName}`);
      // Try direct DB slug match first
      dbGame = existing.find(
        e => normalizeToSlug(e.awayTeam.replace(/_/g, " ")) === awayKey.replace(/_/g, " ") &&
             normalizeToSlug(e.homeTeam.replace(/_/g, " ")) === homeKey.replace(/_/g, " ")
      );
      if (!dbGame) {
        // Try matching via NBA_BY_DB_SLUG city+name
        dbGame = existing.find(e => {
          const awayTeam = NBA_BY_DB_SLUG.get(e.awayTeam);
          const homeTeam = NBA_BY_DB_SLUG.get(e.homeTeam);
          if (!awayTeam || !homeTeam) return false;
          return normalizeToSlug(awayTeam.name) === awayKey &&
                 normalizeToSlug(homeTeam.name) === homeKey;
        });
      }
    } else {
      // NCAAM: match by city (school name) + nickname
      // MetaBet city = school name (e.g. "Tennessee"), name = nickname (e.g. "Volunteers")
      // DB slug is the vsinSlug with hyphens → underscores
      // Try: normalize city to slug and look up by vsinSlug
      const awayVsinSlug = normalizeToSlug(mb.awayCity).replace(/_/g, "-");
      const homeVsinSlug = normalizeToSlug(mb.homeCity).replace(/_/g, "-");
      // Look up in NCAAM registry by vsinSlug
      const { BY_VSIN_SLUG: NCAAM_BY_VSIN } = await import("../shared/ncaamTeams");
      const awayTeam = NCAAM_BY_VSIN.get(awayVsinSlug);
      const homeTeam = NCAAM_BY_VSIN.get(homeVsinSlug);
      if (awayTeam && homeTeam) {
        dbGame = existing.find(
          e => e.awayTeam === awayTeam.dbSlug && e.homeTeam === homeTeam.dbSlug
        );
      }
      // Fallback: fuzzy match by normalized city slug against DB slug
      if (!dbGame) {
        const awayDbSlug = normalizeToSlug(mb.awayCity);
        const homeDbSlug = normalizeToSlug(mb.homeCity);
        dbGame = existing.find(
          e => e.awayTeam.startsWith(awayDbSlug.split("_")[0]) &&
               e.homeTeam.startsWith(homeDbSlug.split("_")[0])
        );
      }
    }

    if (!dbGame) {
      console.log(
        `[MetaBet][${sport}] NO_MATCH: ${mb.awayCity} ${mb.awayName} (${mb.awayInitials}) @ ` +
        `${mb.homeCity} ${mb.homeName} (${mb.homeInitials}) on ${dateStr}`
      );
      skipped++;
      continue;
    }

    await updateBookOdds(dbGame.id, {
      awayBookSpread: null,   // don't overwrite VSiN spread values
      homeBookSpread: null,
      bookTotal: null,
      awaySpreadOdds: mb.awaySpreadOdds,
      homeSpreadOdds: mb.homeSpreadOdds,
      overOdds: mb.overOdds,
      underOdds: mb.underOdds,
    });
    updated++;
    console.log(
      `[MetaBet][${sport}] Updated: ${dbGame.awayTeam} @ ${dbGame.homeTeam} (${dateStr}) | ` +
      `spreadOdds=${mb.awaySpreadOdds}/${mb.homeSpreadOdds} ` +
      `overOdds=${mb.overOdds} underOdds=${mb.underOdds}`
    );
  }

  return { updated, skipped };
}

/**
 * Fetches MetaBet DraftKings odds for a sport and applies them to today's games.
 * Non-fatal — errors are caught and logged.
 */
async function runMetabetOddsUpdate(
  sport: "NCAAM" | "NBA" | "NHL",
  leagueCode: "BKC" | "BKP" | "HKN",
  todayStr: string
): Promise<void> {
  try {
    const mbGames = await fetchMetabetConsensusOdds(leagueCode);
    // Filter to today's games only (MetaBet returns rolling history)
    const todayStart = new Date(todayStr + "T00:00:00-08:00").getTime(); // PST midnight
    const tomorrowStart = todayStart + 86400000;
    const todayGames = mbGames.filter(
      g => g.gameTimestamp >= todayStart && g.gameTimestamp < tomorrowStart
    );
    console.log(
      `[MetaBet][${sport}] ${todayGames.length} games for today (${todayStr}) ` +
      `out of ${mbGames.length} total from API`
    );
    const result = await applyMetabetOdds(sport, todayStr, todayGames);
    console.log(
      `[MetaBet][${sport}] Done: ${result.updated} updated, ${result.skipped} skipped`
    );
  } catch (err) {
    console.error(`[MetaBet][${sport}] Odds update failed (non-fatal):`, err);
  }
}

// ─── NCAAM refresh ────────────────────────────────────────────────────────────

async function refreshNcaam(todayStr: string, allDates: string[]): Promise<{
  updated: number;
  inserted: number;
  ncaaInserted: number;
  total: number;
}> {
  // Scrape ALL NCAAM games currently on VSiN
  const allScraped = await scrapeVsinOdds("ALL");

  if (allScraped.length === 0) {
    console.log("[VSiNAutoRefresh] No NCAAM games returned from VSiN — skipping NCAAM step.");
    return { updated: 0, inserted: 0, ncaaInserted: 0, total: 0 };
  }

  // Filter: only today+future, only 365-team registry
  const relevantGames = allScraped.filter(g => {
    const d = yyyymmddToIso(String(g.gameDate ?? ""));
    if (d < todayStr) return false;
    if (!VALID_DB_SLUGS.has(g.awaySlug) || !VALID_DB_SLUGS.has(g.homeSlug)) {
      console.log(`[VSiNAutoRefresh] Skipping non-D1 NCAA game: ${g.awaySlug} @ ${g.homeSlug}`);
      return false;
    }
    return true;
  });

  console.log(
    `[VSiNAutoRefresh] NCAAM VSiN: ${allScraped.length} total | ` +
    `${relevantGames.length} relevant | ` +
    `${allScraped.length - relevantGames.length} past/non-D1 (ignored)`
  );

  const vsinDateSet = Array.from(new Set(relevantGames.map(g => yyyymmddToIso(String(g.gameDate ?? "")))));

  // Fetch NCAA start times for each relevant date
  const startTimeMaps = new Map<string, Map<string, string>>();
  const ncaaGamesByDate = new Map<string, Awaited<ReturnType<typeof fetchNcaaGames>>>();

  const rangeEnd = datePst(RANGE_DAYS_AHEAD);
  for (const dateStr of allDates) {
    try {
      const yyyymmdd = dateStr.replace(/-/g, "");
      const ncaaGames = await fetchNcaaGames(yyyymmdd);

      // NCAA API already places midnight ET games (00:00 ET) under the correct
      // calendar date — no next-day pull-back adjustment needed.
      startTimeMaps.set(dateStr, buildStartTimeMap(ncaaGames));
      ncaaGamesByDate.set(dateStr, ncaaGames);
      console.log(`[VSiNAutoRefresh] NCAA: ${ncaaGames.length} games for ${dateStr}`);
    } catch (ncaaErr) {
      console.warn(`[VSiNAutoRefresh] NCAA fetch failed for ${dateStr} (non-fatal):`, ncaaErr);
    }
  }

  let totalUpdated = 0;
  let totalInserted = 0;

  for (const dateStr of vsinDateSet) {
    const gamesForDate = relevantGames.filter(
      g => yyyymmddToIso(String(g.gameDate ?? "")) === dateStr
    );

    const existing = await listGamesByDate(dateStr, "NCAAM");
    const startTimeMap = startTimeMaps.get(dateStr);

    for (const scraped of gamesForDate) {
      const awaySlug = scraped.awaySlug;
      const homeSlug = scraped.homeSlug;

      const existingGameCanonical = existing.find(
        e => e.awayTeam === awaySlug && e.homeTeam === homeSlug
      ) ?? existing.find(
        e => slugsMatch(e.awayTeam, awaySlug) && slugsMatch(e.homeTeam, homeSlug)
      );
      // VSiN sometimes lists teams in reversed order vs NCAA.com — track if reversed
      const existingGameReversed = !existingGameCanonical ? existing.find(
        e => slugsMatch(e.awayTeam, homeSlug) && slugsMatch(e.homeTeam, awaySlug)
      ) : undefined;
      const existingGame = existingGameCanonical ?? existingGameReversed;
      // isReversedMatch=true means DB stores [bethune_cookman @ prairie_view] but VSiN scraped [prairie_view @ bethune_cookman]
      // In this case we MUST swap all team-directional odds before writing to DB
      const isReversedMatch = !existingGameCanonical && !!existingGameReversed;

      const startTimeKey = `${awaySlug}@${homeSlug}`;
      const startTimeEst = startTimeMap?.get(startTimeKey);

      // Look up NCAA game data — check both canonical and reversed team order
      // because VSiN sometimes lists teams in opposite home/away order vs NCAA.com
      const ncaaGamesForDate = ncaaGamesByDate.get(dateStr) ?? [];
      const ncaaGame = ncaaGamesForDate.find(
        g => g.awaySeoname === awaySlug && g.homeSeoname === homeSlug
      ) ?? ncaaGamesForDate.find(
        // Reversed order: VSiN away=X home=Y but NCAA has away=Y home=X
        g => g.awaySeoname === homeSlug && g.homeSeoname === awaySlug
      ) ?? ncaaGamesForDate.find(
        // Fuzzy slug match (handles minor slug format differences)
        g => slugsMatch(g.awaySeoname, awaySlug) && slugsMatch(g.homeSeoname, homeSlug)
      ) ?? ncaaGamesForDate.find(
        // Fuzzy + reversed
        g => slugsMatch(g.awaySeoname, homeSlug) && slugsMatch(g.homeSeoname, awaySlug)
      );

      const ncaaContestId = ncaaGame?.contestId ?? null;
      const ncaaGameStatus = ncaaGame?.gameStatus;

      // Detailed merge decision logging
      const matchType = !ncaaGame ? 'NO_NCAA_MATCH'
        : (ncaaGame.awaySeoname === awaySlug ? 'EXACT' : 'REVERSED');
      console.log(
        `[VSiNAutoRefresh][MERGE] ${awaySlug}@${homeSlug} (${dateStr}) | ` +
        `existingGame=${existingGame ? existingGame.id : 'NEW'} | ` +
        `ncaaMatch=${matchType} | ` +
        `startTime=${startTimeEst ?? 'TBD'} | ` +
        `contestId=${ncaaContestId ?? 'null'} | ` +
        `status=${ncaaGameStatus ?? 'null'}`
      );

      if (existingGame) {
        // ─── REVERSED-MATCH ODDS SWAP ────────────────────────────────────────────
        // When VSiN lists teams in opposite order vs DB (which uses NCAA ordering),
        // the scraped "away" odds actually belong to the DB "home" team and vice versa.
        // Example: DB has bethune_cookman(AWAY) @ prairie_view(HOME)
        //          VSiN has prairie_view(AWAY, +5.5) @ bethune_cookman(HOME, -5.5)
        //          Without swap: bethune_cookman gets +5.5 ← WRONG (they are the favorite)
        //          With swap:    bethune_cookman gets -5.5 ← CORRECT
        //
        // Swap logic:
        //   awaySpread ↔ homeSpread  (spread is team-directional)
        //   awayML ↔ homeML          (ML is team-directional)
        //   spreadAwayBetsPct → 100 - value (VSiN away% becomes DB home%)
        //   spreadAwayMoneyPct → 100 - value
        //   mlAwayBetsPct → 100 - value
        //   mlAwayMoneyPct → 100 - value
        //   totalOverBetsPct, totalOverMoneyPct → unchanged (not team-specific)
        const oddsToWrite = isReversedMatch ? {
          awayBookSpread: scraped.homeSpread,   // VSiN home spread → DB away spread
          homeBookSpread: scraped.awaySpread,   // VSiN away spread → DB home spread
          bookTotal: scraped.total,
          sortOrder: scraped.vsinRowIndex,
          ...(startTimeEst ? { startTimeEst } : {}),
          spreadAwayBetsPct: scraped.spreadAwayBetsPct !== null ? 100 - scraped.spreadAwayBetsPct : null,
          spreadAwayMoneyPct: scraped.spreadAwayMoneyPct !== null ? 100 - scraped.spreadAwayMoneyPct : null,
          totalOverBetsPct: scraped.totalOverBetsPct,
          totalOverMoneyPct: scraped.totalOverMoneyPct,
          awayML: scraped.homeML,               // VSiN home ML → DB away ML
          homeML: scraped.awayML,               // VSiN away ML → DB home ML
          mlAwayBetsPct: scraped.mlAwayBetsPct !== null ? 100 - scraped.mlAwayBetsPct : null,
          mlAwayMoneyPct: scraped.mlAwayMoneyPct !== null ? 100 - scraped.mlAwayMoneyPct : null,
        } : {
          awayBookSpread: scraped.awaySpread,
          homeBookSpread: scraped.homeSpread,
          bookTotal: scraped.total,
          sortOrder: scraped.vsinRowIndex,
          ...(startTimeEst ? { startTimeEst } : {}),
          // NCAAM betting splits (8 fields: spread + total + ML)
          spreadAwayBetsPct: scraped.spreadAwayBetsPct,
          spreadAwayMoneyPct: scraped.spreadAwayMoneyPct,
          totalOverBetsPct: scraped.totalOverBetsPct,
          totalOverMoneyPct: scraped.totalOverMoneyPct,
          awayML: scraped.awayML,
          homeML: scraped.homeML,
          mlAwayBetsPct: scraped.mlAwayBetsPct,
          mlAwayMoneyPct: scraped.mlAwayMoneyPct,
        };
        if (isReversedMatch) {
          console.log(
            `[VSiNAutoRefresh][REVERSED_SWAP] ${awaySlug}@${homeSlug} → DB is ${existingGame.awayTeam}@${existingGame.homeTeam} | ` +
            `Swapping: awaySpread ${scraped.awaySpread}→${oddsToWrite.awayBookSpread}, homeSpread ${scraped.homeSpread}→${oddsToWrite.homeBookSpread} | ` +
            `awayML ${scraped.awayML}→${oddsToWrite.awayML}, homeML ${scraped.homeML}→${oddsToWrite.homeML} | ` +
            `spreadAwayBets% ${scraped.spreadAwayBetsPct}→${oddsToWrite.spreadAwayBetsPct} | ` +
            `mlAwayBets% ${scraped.mlAwayBetsPct}→${oddsToWrite.mlAwayBetsPct}`
          );
        }
        await updateBookOdds(existingGame.id, oddsToWrite);
        // Always update gameStatus, scores, and clock when we have NCAA data
        await updateNcaaStartTime(existingGame.id, {
          startTimeEst: startTimeEst ?? existingGame.startTimeEst,
          ncaaContestId: ncaaContestId ?? existingGame.ncaaContestId ?? '',
          ...(ncaaGameStatus ? { gameStatus: ncaaGameStatus } : {}),
          awayScore: ncaaGame?.awayScore ?? null,
          homeScore: ncaaGame?.homeScore ?? null,
          gameClock: ncaaGame?.gameClock ?? null,
        });
        totalUpdated++;
      } else {
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
          gameStatus: ncaaGameStatus ?? 'upcoming',
          awayScore: ncaaGame?.awayScore ?? null,
          homeScore: ncaaGame?.homeScore ?? null,
          gameClock: ncaaGame?.gameClock ?? null,
          // NCAAM betting splits (8 fields: spread + total + ML) — include on insert
          spreadAwayBetsPct: scraped.spreadAwayBetsPct,
          spreadAwayMoneyPct: scraped.spreadAwayMoneyPct,
          totalOverBetsPct: scraped.totalOverBetsPct,
          totalOverMoneyPct: scraped.totalOverMoneyPct,
          awayML: scraped.awayML,
          homeML: scraped.homeML,
          mlAwayBetsPct: scraped.mlAwayBetsPct,
          mlAwayMoneyPct: scraped.mlAwayMoneyPct,
        };
        await insertGames([row]);
        totalInserted++;
        console.log(
          `[VSiNAutoRefresh] Inserted NCAAM VSiN: ${scraped.awayTeam} @ ${scraped.homeTeam} (${dateStr})`
        );
      }
    }
  }

  // NCAA-only game insertion (rolling 7-day window)
  let ncaaInserted = 0;

  for (const dateStr of allDates) {
    if (dateStr < todayStr) continue;

    const ncaaGames = ncaaGamesByDate.get(dateStr) ?? [];
    if (ncaaGames.length === 0) continue;

    const existing = await listGamesByDate(dateStr, "NCAAM");

    for (const ncaaGame of ncaaGames) {
      const { contestId, awaySeoname, homeSeoname, startTimeEst, gameStatus } = ncaaGame;

      if (!VALID_DB_SLUGS.has(awaySeoname) || !VALID_DB_SLUGS.has(homeSeoname)) {
        if (awaySeoname !== "tba" && homeSeoname !== "tba") {
          console.log(`[VSiNAutoRefresh] Skipping non-D1 NCAA game: ${awaySeoname} @ ${homeSeoname}`);
        }
        continue;
      }

      // The NCAA API returns midnight ET games under the correct calendar date.
      // No date adjustment needed — store as-is.
      const effectiveDateStr = dateStr;

      const byContestId = await getGameByNcaaContestId(contestId);
      if (byContestId) {
        console.log(
          `[VSiNAutoRefresh][NCAA-ONLY] SKIP by contestId=${contestId}: ` +
          `${awaySeoname}@${homeSeoname} (${dateStr}) → DB id=${byContestId.id}`
        );
        continue;
      }

      const existingForEffectiveDate = existing;
      const bySlugCanonical = existingForEffectiveDate.find(
        e => slugsMatch(e.awayTeam, awaySeoname) && slugsMatch(e.homeTeam, homeSeoname)
      );
      const bySlugReversed = !bySlugCanonical ? existingForEffectiveDate.find(
        // Also check reversed order — VSiN may have inserted the game with swapped teams
        e => slugsMatch(e.awayTeam, homeSeoname) && slugsMatch(e.homeTeam, awaySeoname)
      ) : undefined;
      const bySlug = bySlugCanonical ?? bySlugReversed;

      if (bySlug) {
        const matchDir = bySlugReversed ? 'REVERSED' : 'CANONICAL';
        console.log(
          `[VSiNAutoRefresh][NCAA-ONLY] UPDATE ${matchDir} match: ` +
          `${awaySeoname}@${homeSeoname} (${dateStr}) → DB id=${bySlug.id} ` +
          `(DB: ${bySlug.awayTeam}@${bySlug.homeTeam}) | ` +
          `startTime=${startTimeEst} | status=${gameStatus} | ` +
          `score=${ncaaGame.awayScore}-${ncaaGame.homeScore}`
        );
        // Always update gameStatus, scores, and clock; also patch ncaaContestId if missing
        await updateNcaaStartTime(bySlug.id, {
          startTimeEst: startTimeEst !== "TBD" ? startTimeEst : bySlug.startTimeEst,
          ncaaContestId: bySlug.ncaaContestId ?? contestId,
          gameStatus,
          awayScore: ncaaGame.awayScore ?? null,
          homeScore: ncaaGame.homeScore ?? null,
          gameClock: ncaaGame.gameClock ?? null,
        });
        continue;
      }

      console.log(
        `[VSiNAutoRefresh][NCAA-ONLY] INSERT new: ${awaySeoname}@${homeSeoname} (${dateStr}) | ` +
        `contestId=${contestId} | startTime=${startTimeEst} | status=${gameStatus}`
      );

      const row: InsertGame = {
        fileId: 0,
        gameDate: effectiveDateStr,
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
          gameStatus,
          awayScore: ncaaGame.awayScore ?? null,
          homeScore: ncaaGame.homeScore ?? null,
          gameClock: ncaaGame.gameClock ?? null,
        };
      await insertGames([row]);
      ncaaInserted++;
      console.log(
        `[VSiNAutoRefresh] Inserted NCAA-only: ${awaySeoname} @ ${homeSeoname} (${dateStr})`
      );
    }
  }

  return { updated: totalUpdated, inserted: totalInserted, ncaaInserted, total: relevantGames.length };
}

// ─── NBA refresh ──────────────────────────────────────────────────────────────

async function refreshNba(todayStr: string, allDates: string[]): Promise<{
  updated: number;
  inserted: number;
  scheduleInserted: number;
  total: number;
}> {
  // Scrape ALL NBA games currently on VSiN
  let allScraped;
  try {
    allScraped = await scrapeNbaVsinOdds("ALL");
  } catch (err) {
    console.error("[VSiNAutoRefresh] NBA VSiN scrape failed (non-fatal):", err);
    return { updated: 0, inserted: 0, scheduleInserted: 0, total: 0 };
  }

  if (allScraped.length === 0) {
    console.log("[VSiNAutoRefresh] No NBA games returned from VSiN — skipping NBA VSiN step.");
  }

  // Filter: only today+future, only 30-team registry
  const relevantGames = allScraped.filter(g => {
    const d = yyyymmddToIso(String(g.gameDate ?? ""));
    if (d < todayStr) return false;
    if (!NBA_VALID_DB_SLUGS.has(g.awaySlug) || !NBA_VALID_DB_SLUGS.has(g.homeSlug)) {
      console.log(`[VSiNAutoRefresh] Skipping unknown NBA team: ${g.awaySlug} @ ${g.homeSlug}`);
      return false;
    }
    return true;
  });

  console.log(
    `[VSiNAutoRefresh] NBA VSiN: ${allScraped.length} total | ` +
    `${relevantGames.length} relevant | ` +
    `${allScraped.length - relevantGames.length} past/unknown (ignored)`
  );

  // Fetch NBA schedule start times for each date in the rolling window
  const nbaStartTimeMaps = new Map<string, Map<string, string>>();
  const nbaGamesByDate = new Map<string, Awaited<ReturnType<typeof fetchNbaGamesForDate>>>();

  for (const dateStr of allDates) {
    try {
      const nbaGames = await fetchNbaGamesForDate(dateStr);
      nbaStartTimeMaps.set(dateStr, buildNbaStartTimeMap(nbaGames));
      nbaGamesByDate.set(dateStr, nbaGames);
      if (nbaGames.length > 0) {
        console.log(`[VSiNAutoRefresh] NBA schedule: ${nbaGames.length} games for ${dateStr}`);
      }
    } catch (err) {
      console.warn(`[VSiNAutoRefresh] NBA schedule fetch failed for ${dateStr} (non-fatal):`, err);
    }
  }

  let totalUpdated = 0;
  let totalInserted = 0;

  const vsinDateSet = Array.from(new Set(relevantGames.map(g => yyyymmddToIso(String(g.gameDate ?? "")))));

  for (const dateStr of vsinDateSet) {
    const gamesForDate = relevantGames.filter(
      g => yyyymmddToIso(String(g.gameDate ?? "")) === dateStr
    );

    const existing = await listGamesByDate(dateStr, "NBA");
    const startTimeMap = nbaStartTimeMaps.get(dateStr);

    for (const scraped of gamesForDate) {
      const awaySlug = scraped.awaySlug;
      const homeSlug = scraped.homeSlug;

      const existingGame = existing.find(
        e => e.awayTeam === awaySlug && e.homeTeam === homeSlug
      );

      const startTimeKey = `${awaySlug}@${homeSlug}`;
      const startTimeEst = startTimeMap?.get(startTimeKey);

      if (existingGame) {
        await updateBookOdds(existingGame.id, {
          awayBookSpread: scraped.awaySpread,
          homeBookSpread: scraped.homeSpread,
          bookTotal: scraped.total,
          sortOrder: scraped.vsinRowIndex,
          ...(startTimeEst ? { startTimeEst } : {}),
          // NBA betting splits (6 fields + ML odds)
          spreadAwayBetsPct: scraped.spreadAwayBetsPct,
          spreadAwayMoneyPct: scraped.spreadAwayMoneyPct,
          totalOverBetsPct: scraped.totalOverBetsPct,
          totalOverMoneyPct: scraped.totalOverMoneyPct,
          mlAwayBetsPct: scraped.mlAwayBetsPct,
          mlAwayMoneyPct: scraped.mlAwayMoneyPct,
          awayML: scraped.awayML,
          homeML: scraped.homeML,
        });
        totalUpdated++;
      } else {
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
          sport: "NBA",
          gameType: "regular_season",
          conference: null,
          publishedToFeed: false,
          rotNums: null,
          sortOrder: scraped.vsinRowIndex,
          ncaaContestId: null,
          // NBA betting splits
          spreadAwayBetsPct: scraped.spreadAwayBetsPct,
          spreadAwayMoneyPct: scraped.spreadAwayMoneyPct,
          totalOverBetsPct: scraped.totalOverBetsPct,
          totalOverMoneyPct: scraped.totalOverMoneyPct,
          mlAwayBetsPct: scraped.mlAwayBetsPct,
          mlAwayMoneyPct: scraped.mlAwayMoneyPct,
          awayML: scraped.awayML,
          homeML: scraped.homeML,
        };
        await insertGames([row]);
        totalInserted++;
        console.log(
          `[VSiNAutoRefresh] Inserted NBA VSiN: ${scraped.awayTeam} @ ${scraped.homeTeam} (${dateStr})`
        );
      }
    }
  }

  // NBA schedule-only game insertion (rolling 7-day window)
  // Insert any NBA game from the schedule that isn't already in the DB
  let scheduleInserted = 0;

  for (const dateStr of allDates) {
    if (dateStr < todayStr) continue;

    const nbaGames = nbaGamesByDate.get(dateStr) ?? [];
    if (nbaGames.length === 0) continue;

    const existing = await listGamesByDate(dateStr, "NBA");

    for (const nbaGame of nbaGames) {
      const { awayDbSlug, homeDbSlug, startTimeEst, gameId } = nbaGame;

      // Skip if already in DB by slug match
      const bySlug = existing.find(
        e => e.awayTeam === awayDbSlug && e.homeTeam === homeDbSlug
      );
      if (bySlug) continue;

      // Also skip if already in DB by ncaaContestId (reusing the field for NBA game IDs)
      const byGameId = await getGameByNcaaContestId(gameId);
      if (byGameId) continue;

      const row: InsertGame = {
        fileId: 0,
        gameDate: dateStr,
        startTimeEst: startTimeEst ?? "TBD",
        awayTeam: awayDbSlug,
        homeTeam: homeDbSlug,
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
        sport: "NBA",
        gameType: "regular_season",
        conference: null,
        publishedToFeed: false,
        rotNums: null,
        sortOrder: 9999,
        ncaaContestId: gameId, // store NBA game ID in ncaaContestId for dedup
      };
      await insertGames([row]);
      scheduleInserted++;
      console.log(
        `[VSiNAutoRefresh] Inserted NBA schedule-only: ${awayDbSlug} @ ${homeDbSlug} (${dateStr})`
      );
    }
  }

  return { updated: totalUpdated, inserted: totalInserted, scheduleInserted, total: relevantGames.length };
}

// ─── NHL Refresh ─────────────────────────────────────────────────────────────

/**
 * Scrapes VSiN NHL betting splits, fetches NHL.com schedule, and upserts all
 * NHL games into the DB. Mirrors refreshNba exactly but uses NHL-specific
 * scrapers, slugs, and sport="NHL".
 */
async function refreshNhl(todayStr: string, allDates: string[]): Promise<{
  updated: number;
  inserted: number;
  scheduleInserted: number;
  total: number;
}> {
  // ── Step 1: Scrape all NHL games from VSiN ───────────────────────────────
  let allScraped: NhlScrapedOdds[] = [];
  try {
    allScraped = await scrapeNhlVsinOdds("ALL");
  } catch (err) {
    console.error("[VSiNAutoRefresh] NHL VSiN scrape failed (non-fatal):", err);
    allScraped = [];
  }

  // Filter to only games with valid DB slugs
  const relevantGames = allScraped.filter(
    (g) => NHL_VALID_DB_SLUGS.has(g.awaySlug) && NHL_VALID_DB_SLUGS.has(g.homeSlug)
  );

  console.log(
    `[VSiNAutoRefresh] NHL VSiN: ${allScraped.length} total scraped, ` +
    `${relevantGames.length} with valid DB slugs`
  );

  // ── Step 2: Fetch NHL schedule for the rolling 7-day window ─────────────
  const rangeEnd = allDates[allDates.length - 1];
  let nhlScheduleGames: NhlScheduleGame[] = [];
  try {
    nhlScheduleGames = await fetchNhlGamesForRange(todayStr, rangeEnd);
  } catch (err) {
    console.warn("[VSiNAutoRefresh] NHL schedule fetch failed (non-fatal):", err);
    nhlScheduleGames = [];
  }

  // Build per-date start time maps from the schedule
  const nhlStartTimeMaps = new Map<string, Map<string, string>>();
  for (const dateStr of allDates) {
    const gamesOnDate = nhlScheduleGames.filter((g) => g.gameDateEst === dateStr);
    nhlStartTimeMaps.set(dateStr, buildNhlStartTimeMap(gamesOnDate));
  }

  // Build a per-date lookup for NHL schedule games (for schedule-only insertion)
  const nhlGamesByDate = new Map<string, typeof nhlScheduleGames>();
  for (const g of nhlScheduleGames) {
    const list = nhlGamesByDate.get(g.gameDateEst) ?? [];
    list.push(g);
    nhlGamesByDate.set(g.gameDateEst, list);
  }

  // ── Step 3: Upsert VSiN games into DB ────────────────────────────────────
  let totalUpdated = 0;
  let totalInserted = 0;

  // Group scraped games by date
  const vsinDatesSet = new Set<string>();
  for (const g of relevantGames) vsinDatesSet.add(yyyymmddToIso(String(g.gameDate ?? "")));
  const vsinDates = Array.from(vsinDatesSet);

  for (const dateStr of vsinDates) {
    const gamesForDate = relevantGames.filter(
      (g) => yyyymmddToIso(String(g.gameDate ?? "")) === dateStr
    );
    const existing = await listGamesByDate(dateStr, "NHL");
    const startTimeMap = nhlStartTimeMaps.get(dateStr);

    for (const scraped of gamesForDate) {
      const awaySlug = scraped.awaySlug;
      const homeSlug = scraped.homeSlug;
      const existingGame = existing.find(
        (e) => e.awayTeam === awaySlug && e.homeTeam === homeSlug
      );
      const startTimeKey = `${awaySlug}@${homeSlug}`;
      const startTimeEst = startTimeMap?.get(startTimeKey);

      if (existingGame) {
        // Update existing game with fresh VSiN odds + splits
        await updateBookOdds(existingGame.id, {
          awayBookSpread: scraped.awaySpread,
          homeBookSpread: scraped.homeSpread,
          bookTotal: scraped.total,
          sortOrder: scraped.vsinRowIndex,
          ...(startTimeEst ? { startTimeEst } : {}),
          spreadAwayBetsPct: scraped.spreadAwayBetsPct,
          spreadAwayMoneyPct: scraped.spreadAwayMoneyPct,
          totalOverBetsPct: scraped.totalOverBetsPct,
          totalOverMoneyPct: scraped.totalOverMoneyPct,
          mlAwayBetsPct: scraped.mlAwayBetsPct,
          mlAwayMoneyPct: scraped.mlAwayMoneyPct,
          awayML: scraped.awayML,
          homeML: scraped.homeML,
        });
        totalUpdated++;
        console.log(
          `[VSiNAutoRefresh] Updated NHL VSiN: ${scraped.awayTeam} @ ${scraped.homeTeam} ` +
          `(${dateStr}) spread=${scraped.awaySpread}/${scraped.homeSpread} total=${scraped.total} ` +
          `awayML=${scraped.awayML ?? "?"} homeML=${scraped.homeML ?? "?"}`
        );
      } else {
        // Insert new game stub from VSiN
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
          sport: "NHL",
          gameType: "regular_season",
          conference: null,
          publishedToFeed: false,
          rotNums: null,
          sortOrder: scraped.vsinRowIndex,
          ncaaContestId: null,
          spreadAwayBetsPct: scraped.spreadAwayBetsPct,
          spreadAwayMoneyPct: scraped.spreadAwayMoneyPct,
          totalOverBetsPct: scraped.totalOverBetsPct,
          totalOverMoneyPct: scraped.totalOverMoneyPct,
          mlAwayBetsPct: scraped.mlAwayBetsPct,
          mlAwayMoneyPct: scraped.mlAwayMoneyPct,
          awayML: scraped.awayML,
          homeML: scraped.homeML,
        };
        await insertGames([row]);
        totalInserted++;
        console.log(
          `[VSiNAutoRefresh] Inserted NHL VSiN: ${scraped.awayTeam} @ ${scraped.homeTeam} (${dateStr})`
        );
      }
    }
  }

  // ── Step 4: Insert schedule-only NHL games (no VSiN odds yet) ────────────
  let scheduleInserted = 0;
  for (const dateStr of allDates) {
    if (dateStr < todayStr) continue;
    const nhlGames = nhlGamesByDate.get(dateStr) ?? [];
    if (nhlGames.length === 0) continue;
    const existing = await listGamesByDate(dateStr, "NHL");

    for (const nhlGame of nhlGames) {
      const { awayDbSlug, homeDbSlug, startTimeEst, gameId } = nhlGame;

      // Skip if already in DB by slug match
      const bySlug = existing.find(
        (e) => e.awayTeam === awayDbSlug && e.homeTeam === homeDbSlug
      );
      if (bySlug) continue;

      // Skip if already in DB by game ID (stored in ncaaContestId for dedup)
      const byGameId = await getGameByNcaaContestId(String(gameId));
      if (byGameId) continue;

      const row: InsertGame = {
        fileId: 0,
        gameDate: dateStr,
        startTimeEst: startTimeEst ?? "TBD",
        awayTeam: awayDbSlug,
        homeTeam: homeDbSlug,
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
        sport: "NHL",
        gameType: "regular_season",
        conference: null,
        publishedToFeed: false,
        rotNums: null,
        sortOrder: 9999,
        ncaaContestId: String(gameId), // store NHL game ID for dedup
      };
      await insertGames([row]);
      scheduleInserted++;
      console.log(
        `[VSiNAutoRefresh] Inserted NHL schedule-only: ${awayDbSlug} @ ${homeDbSlug} (${dateStr})`
      );
    }
  }

  return { updated: totalUpdated, inserted: totalInserted, scheduleInserted, total: relevantGames.length };
}

// ─── Main refresh orchestrator ─────────────────────────────────────────────────

/**
 * Core refresh logic — fully idempotent upsert of all VSiN games (NCAAM + NBA),
 * plus insertion of all schedule-only games for a rolling 7-day window.
 * Safe to call at any time; errors are caught and logged.
 */
export async function runVsinRefresh(): Promise<RefreshResult | null> {
  const todayStr = datePst();

  console.log(`[VSiNAutoRefresh] Starting refresh — today: ${todayStr}`);

  try {
    const rangeEnd = datePst(RANGE_DAYS_AHEAD);
    const allDates = dateRange(todayStr, rangeEnd);

    // Run NCAAM, NBA, and NHL refreshes in sequence (share the same VSiN token)
    const ncaamResult = await refreshNcaam(todayStr, allDates);
    const nbaResult = await refreshNba(todayStr, allDates);
    const nhlResult = await refreshNhl(todayStr, allDates);
    console.log(
      `[VSiNAutoRefresh] NHL refresh complete: updated=${nhlResult.updated} ` +
      `inserted=${nhlResult.inserted} scheduleInserted=${nhlResult.scheduleInserted} ` +
      `total=${nhlResult.total}`
    );

    // Apply DraftKings spread odds + O/U odds from MetaBet for all three leagues
    // Runs after VSiN upserts so DB rows exist before we try to update them
    await runMetabetOddsUpdate("NCAAM", "BKC", todayStr);
    await runMetabetOddsUpdate("NBA", "BKP", todayStr);
    await runMetabetOddsUpdate("NHL", "HKN", todayStr);
    const result: RefreshResult = {
      refreshedAt: new Date().toISOString(),
      scoresRefreshedAt: lastScoresRefreshedAt,
      updated: ncaamResult.updated,
      inserted: ncaamResult.inserted,
      ncaaInserted: ncaamResult.ncaaInserted,
      nbaUpdated: nbaResult.updated,
      nbaInserted: nbaResult.inserted,
      nbaScheduleInserted: nbaResult.scheduleInserted,
      total: ncaamResult.total,
      nbaTotal: nbaResult.total,
      nhlUpdated: nhlResult.updated,
      nhlInserted: nhlResult.inserted,
      nhlScheduleInserted: nhlResult.scheduleInserted,
      nhlTotal: nhlResult.total,
      gameDate: todayStr,
    };

    lastRefreshResult = result;
    console.log(
      `[VSiNAutoRefresh] Done — ` +
      `NCAAM: ${ncaamResult.updated} updated, ${ncaamResult.inserted} inserted, ${ncaamResult.ncaaInserted} NCAA-only | ` +
      `NBA: ${nbaResult.updated} updated, ${nbaResult.inserted} inserted, ${nbaResult.scheduleInserted} schedule-only`
    );
    return result;
  } catch (err) {
    console.error("[VSiNAutoRefresh] Refresh failed:", err);
    return null;
  }
}

/**
 * Score-only refresh: re-fetches NCAA scoreboard for today and updates
 * awayScore, homeScore, gameClock, and gameStatus for all NCAAM games.
 * Runs every 5 minutes so live scores stay current.
 */
async function refreshNcaamScores(): Promise<void> {
  const todayStr = datePst();
  try {
    const yyyymmdd = todayStr.replace(/-/g, "");
    const ncaaGames = await fetchNcaaGames(yyyymmdd);

    // Also fetch next-day midnight games (stored under today's date in DB)
    const nextDay = new Date(todayStr + "T00:00:00Z");
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const nextDayYyyymmdd = nextDay.toISOString().slice(0, 10).replace(/-/g, "");
    try {
      const nextDayGames = await fetchNcaaGames(nextDayYyyymmdd);
      const midnightGames = nextDayGames.filter(g => g.startTimeEst === "00:00");
      ncaaGames.push(...midnightGames);
    } catch {
      // Non-fatal
    }

    const existing = await listGamesByDate(todayStr, "NCAAM");

    let updated = 0;
    for (const ncaaGame of ncaaGames) {
      // Match priority: (1) ncaaContestId exact, (2) canonical slug, (3) reversed slug
      // Reversed slug handles cases where VSiN inserted the game with swapped home/away
      const dbGame = existing.find(
        g => g.ncaaContestId === ncaaGame.contestId
      ) ?? existing.find(
        g => slugsMatch(g.awayTeam, ncaaGame.awaySeoname) && slugsMatch(g.homeTeam, ncaaGame.homeSeoname)
      ) ?? existing.find(
        g => slugsMatch(g.awayTeam, ncaaGame.homeSeoname) && slugsMatch(g.homeTeam, ncaaGame.awaySeoname)
      );
      if (!dbGame) {
        console.log(
          `[ScoreRefresh][NCAAM] NO_MATCH: ${ncaaGame.awaySeoname}@${ncaaGame.homeSeoname} ` +
          `contestId=${ncaaGame.contestId} — not in DB for ${todayStr}`
        );
        continue;
      }
      const matchType = dbGame.ncaaContestId === ncaaGame.contestId ? 'CONTEST_ID'
        : (slugsMatch(dbGame.awayTeam, ncaaGame.awaySeoname) ? 'CANONICAL' : 'REVERSED');
      console.log(
        `[ScoreRefresh][NCAAM] ${matchType}: ${ncaaGame.awaySeoname}@${ncaaGame.homeSeoname} ` +
        `→ DB id=${dbGame.id} (${dbGame.awayTeam}@${dbGame.homeTeam}) | ` +
        `status=${ncaaGame.gameStatus} score=${ncaaGame.awayScore}-${ncaaGame.homeScore} clock=${ncaaGame.gameClock}`
      );

      await updateNcaaStartTime(dbGame.id, {
        startTimeEst: dbGame.startTimeEst,
        ncaaContestId: dbGame.ncaaContestId ?? ncaaGame.contestId,
        gameStatus: ncaaGame.gameStatus,
        awayScore: ncaaGame.awayScore ?? null,
        homeScore: ncaaGame.homeScore ?? null,
        gameClock: ncaaGame.gameClock ?? null,
      });
      updated++;
    }
    console.log(`[ScoreRefresh] Updated scores for ${updated} NCAAM games (${todayStr})`);
  } catch (err) {
    console.warn("[ScoreRefresh] Score refresh failed (non-fatal):", err);
  }
}

const SCORE_INTERVAL_MS = 15 * 1000; // 15 seconds

/**
 * Refreshes NBA live/final scores and game status from the NBA live scoreboard API.
 * Runs every 15 seconds so live scores stay current.
 */
async function refreshNbaScores(): Promise<void> {
  const todayStr = datePst();
  try {
    const liveGames = await fetchNbaLiveScores();
    const existing = await listGamesByDate(todayStr, "NBA");

    let updated = 0;
    for (const liveGame of liveGames) {
      // Match by away+home DB slugs
      const dbGame = existing.find(
        g => g.awayTeam === liveGame.awayDbSlug && g.homeTeam === liveGame.homeDbSlug
      );
      if (!dbGame) continue;

      // Only update if status or scores have changed
      const statusChanged = dbGame.gameStatus !== liveGame.gameStatus;
      const scoresChanged =
        dbGame.awayScore !== liveGame.awayScore ||
        dbGame.homeScore !== liveGame.homeScore ||
        dbGame.gameClock !== liveGame.gameClock;

      if (!statusChanged && !scoresChanged) continue;

      await updateNcaaStartTime(dbGame.id, {
        startTimeEst: dbGame.startTimeEst,
        ncaaContestId: dbGame.ncaaContestId ?? '',
        gameStatus: liveGame.gameStatus,
        awayScore: liveGame.awayScore,
        homeScore: liveGame.homeScore,
        gameClock: liveGame.gameClock,
      });
      updated++;
    }
    console.log(`[ScoreRefresh] Updated scores for ${updated} NBA games (${todayStr})`);
  } catch (err) {
    console.warn("[ScoreRefresh] NBA score refresh failed (non-fatal):", err);
  }
}

async function refreshNhlScores(): Promise<void> {
  const todayStr = datePst();
  try {
    const liveGames = await fetchNhlLiveScores();
    const existing = await listGamesByDate(todayStr, "NHL");
    let updated = 0;
    for (const liveGame of liveGames) {
      // Match by away+home DB slugs
      const dbGame = existing.find(
        (g) => g.awayTeam === liveGame.awayDbSlug && g.homeTeam === liveGame.homeDbSlug
      );
      if (!dbGame) continue;
      // Only update if status or scores have changed
      const statusChanged = dbGame.gameStatus !== liveGame.gameState;
      const scoresChanged =
        dbGame.awayScore !== liveGame.awayScore ||
        dbGame.homeScore !== liveGame.homeScore ||
        dbGame.gameClock !== liveGame.gameClock;
      if (!statusChanged && !scoresChanged) continue;
      await updateNcaaStartTime(dbGame.id, {
        startTimeEst: dbGame.startTimeEst,
        ncaaContestId: dbGame.ncaaContestId ?? "",
        gameStatus: liveGame.gameState,
        awayScore: liveGame.awayScore,
        homeScore: liveGame.homeScore,
        gameClock: liveGame.gameClock,
      });
      updated++;
    }
    console.log(`[ScoreRefresh] Updated scores for ${updated} NHL games (${todayStr})`);
  } catch (err) {
    console.warn("[ScoreRefresh] NHL score refresh failed (non-fatal):", err);
  }
}

/**
 * Runs NCAAM, NBA, and NHL score refreshes immediately.
 * Exported so it can be triggered manually from the admin panel.
 */
export async function refreshAllScoresNow(): Promise<void> {
  await Promise.allSettled([refreshNcaamScores(), refreshNbaScores(), refreshNhlScores()]);
  lastScoresRefreshedAt = new Date().toISOString();
  // Patch scoresRefreshedAt into the last refresh result so the UI can show it
  if (lastRefreshResult) {
    lastRefreshResult = { ...lastRefreshResult, scoresRefreshedAt: lastScoresRefreshedAt };
  }
}

/**
 * Start the 30-minute auto-refresh scheduler.
 * Fires immediately if inside the active window, then every 30 minutes.
 * Also starts a separate 5-minute score-only refresh for live/final scores.
 * Score refresh fires immediately on startup so scores are never stale after a restart.
 */
export function startVsinAutoRefresh() {
  if (isWithinActiveHours()) {
    void runVsinRefresh();
  } else {
    console.log("[VSiNAutoRefresh] Outside active hours (6am–midnight PST) — waiting for next tick.");
  }

  // Fire score refresh immediately on startup (don't wait for first 5-min tick)
  void refreshAllScoresNow();

  setInterval(() => {
    if (isWithinActiveHours()) {
      void runVsinRefresh();
    } else {
      console.log("[VSiNAutoRefresh] Tick skipped — outside active hours (6am–midnight PST).");
    }
  }, INTERVAL_MS);

  // 5-minute score refresh (runs independently of the 30-min full refresh)
  setInterval(() => {
    if (isWithinActiveHours()) {
      void refreshNcaamScores();
      void refreshNbaScores();
      void refreshNhlScores();
    }
  }, SCORE_INTERVAL_MS);

  console.log("[VSiNAutoRefresh] Scheduler started — every 30 min (6am–midnight PST) + score refresh every 5 min.");
}
