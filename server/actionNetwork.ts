/**
 * actionNetwork.ts — Action Network v2 Scoreboard Slate Fetcher
 *
 * Fetches the daily game slate for a given sport + date from:
 *   https://api.actionnetwork.com/web/v2/scoreboard/{sport}?bookIds=...&date=YYYYMMDD&periods=event
 *
 * Returns a normalized SlateGame[] array ready for the BetTracker matchup selector.
 *
 * Logging convention:
 *   [AN][INPUT]  — raw parameters received
 *   [AN][STEP]   — operation in progress
 *   [AN][STATE]  — intermediate computed values
 *   [AN][OUTPUT] — final result
 *   [AN][VERIFY] — validation pass/fail
 *   [AN][ERROR]  — failure with context
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** AN sport slug map — BetTracker sport → AN URL slug */
const AN_SPORT_SLUG: Record<string, string> = {
  MLB:   "mlb",
  NHL:   "nhl",
  NBA:   "nba",
  NCAAM: "ncaab",
  NFL:   "nfl",
};

/**
 * Book IDs to include in the request.
 * 15 = DraftKings NJ (primary), plus a broad set for completeness.
 */
const BOOK_IDS = "15,30,385,346,68,1922,2986,367,2293,79,2988,75";

const AN_BASE = "https://api.actionnetwork.com/web/v2/scoreboard";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SlateGame {
  id:        number;   // AN game id
  awayTeam:  string;   // e.g. "ARI"
  homeTeam:  string;   // e.g. "BAL"
  awayFull:  string;   // e.g. "Arizona Diamondbacks"
  homeFull:  string;   // e.g. "Baltimore Orioles"
  gameTime:  string;   // e.g. "6:35 PM" (EST)
  startUtc:  string;   // ISO UTC string
  sport:     string;   // "MLB" | "NHL" | "NBA" | "NCAAM"
  gameDate:  string;   // "YYYY-MM-DD" (EST date)
  status:    string;   // "scheduled" | "in_progress" | "complete" | etc.
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a UTC ISO string to EST time string "H:MM AM/PM"
 * Uses Intl.DateTimeFormat for deterministic output.
 */
function utcToEstTime(utcStr: string): string {
  try {
    const dt = new Date(utcStr);
    return dt.toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour:     "numeric",
      minute:   "2-digit",
      hour12:   true,
    });
  } catch {
    return utcStr;
  }
}

/**
 * Convert a UTC ISO string to EST date string "YYYY-MM-DD"
 */
function utcToEstDate(utcStr: string): string {
  try {
    const dt = new Date(utcStr);
    const parts = dt.toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD
    return parts;
  } catch {
    return utcStr.slice(0, 10);
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Fetch the daily slate from Action Network v2 scoreboard API.
 *
 * @param sport   - "MLB" | "NHL" | "NBA" | "NCAAM"
 * @param dateStr - "YYYY-MM-DD" (EST date)
 * @returns       - Sorted array of SlateGame (by start time ASC)
 */
export async function fetchAnSlate(sport: string, dateStr: string): Promise<SlateGame[]> {
  const slug = AN_SPORT_SLUG[sport.toUpperCase()];
  if (!slug) {
    console.error(`[AN][ERROR] Unknown sport="${sport}" — no AN slug mapping`);
    return [];
  }

  // Convert YYYY-MM-DD → YYYYMMDD for AN API
  const anDate = dateStr.replace(/-/g, "");

  const url = `${AN_BASE}/${slug}?bookIds=${BOOK_IDS}&date=${anDate}&periods=event`;

  console.log(`[AN][INPUT] fetchAnSlate: sport=${sport} slug=${slug} date=${dateStr} anDate=${anDate}`);
  console.log(`[AN][STEP]  Fetching: ${url}`);

  let raw: Record<string, unknown>;
  try {
    const resp = await fetch(url, { headers: FETCH_HEADERS });
    console.log(`[AN][STATE] HTTP status=${resp.status} for ${url}`);

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[AN][ERROR] Non-OK response: status=${resp.status} body=${body.slice(0, 200)}`);
      return [];
    }

    raw = (await resp.json()) as Record<string, unknown>;
  } catch (err) {
    console.error(`[AN][ERROR] Fetch failed: ${err}`);
    return [];
  }

  const games = (raw.games as Record<string, unknown>[]) ?? [];
  console.log(`[AN][STATE] Raw games count=${games.length} for sport=${sport} date=${dateStr}`);

  if (games.length === 0) {
    console.log(`[AN][OUTPUT] No games found for sport=${sport} date=${dateStr}`);
    return [];
  }

  // ── Parse each game ──────────────────────────────────────────────────────
  const result: SlateGame[] = [];
  let parseErrors = 0;

  for (const g of games) {
    try {
      const id         = g.id as number;
      const startUtc   = g.start_time as string;
      const status     = (g.status as string) ?? "scheduled";
      const awayTeamId = g.away_team_id as number;
      const homeTeamId = g.home_team_id as number;

      // teams is an array of team objects embedded in each game
      const teams = (g.teams as Record<string, unknown>[]) ?? [];
      const teamMap = new Map<number, Record<string, unknown>>();
      for (const t of teams) {
        teamMap.set(t.id as number, t);
      }

      const away = teamMap.get(awayTeamId);
      const home = teamMap.get(homeTeamId);

      if (!away || !home) {
        console.warn(`[AN][STATE] game id=${id}: missing team data — awayId=${awayTeamId} homeId=${homeTeamId} teamsLen=${teams.length}`);
        parseErrors++;
        continue;
      }

      const awayAbbr = (away.abbr as string) || (away.short_name as string) || "?";
      const homeAbbr = (home.abbr as string) || (home.short_name as string) || "?";
      const awayFull = (away.full_name as string) || awayAbbr;
      const homeFull = (home.full_name as string) || homeAbbr;
      const gameTime = utcToEstTime(startUtc);
      const gameDate = utcToEstDate(startUtc);

      result.push({
        id,
        awayTeam: awayAbbr,
        homeTeam: homeAbbr,
        awayFull,
        homeFull,
        gameTime,
        startUtc,
        sport:    sport.toUpperCase(),
        gameDate,
        status,
      });
    } catch (err) {
      console.error(`[AN][ERROR] Failed to parse game: ${err}`);
      parseErrors++;
    }
  }

  // Sort by start time ASC
  result.sort((a, b) => a.startUtc.localeCompare(b.startUtc));

  console.log(`[AN][OUTPUT] Parsed ${result.length} games for sport=${sport} date=${dateStr} | parseErrors=${parseErrors}`);
  console.log(`[AN][VERIFY] ${parseErrors === 0 ? "PASS" : "WARN"} — ${parseErrors} parse errors`);

  // Log the full slate for traceability
  result.forEach((g, i) => {
    console.log(`[AN][OUTPUT]   [${i + 1}] id=${g.id} ${g.awayTeam} @ ${g.homeTeam} | ${g.gameTime} EST | status=${g.status}`);
  });

  return result;
}
