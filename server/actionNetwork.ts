/**
 * actionNetwork.ts — Action Network v2 Scoreboard Slate Fetcher
 *
 * Fetches the daily game slate for a given sport + date from:
 *   https://api.actionnetwork.com/web/v2/scoreboard/{sport}?bookIds=...&date=YYYYMMDD&periods=event
 *
 * Performance strategy:
 *   1. In-memory cache keyed by "SPORT:YYYY-MM-DD" — 5-minute TTL
 *   2. In-flight deduplication: concurrent requests for the same key share one fetch
 *   3. Pre-warm: server startup calls prewarmSlateCache() for today's date across all sports
 *
 * Logging convention:
 *   [AN][INPUT]  — raw parameters received
 *   [AN][STEP]   — operation in progress
 *   [AN][STATE]  — intermediate computed values
 *   [AN][OUTPUT] — final result
 *   [AN][VERIFY] — validation pass/fail
 *   [AN][CACHE]  — cache hit / miss / evict
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

/** All sports we pre-warm on startup */
const PREWARM_SPORTS = ["MLB", "NHL", "NBA", "NCAAM"] as const;

/**
 * Book IDs to include in the request.
 * Minimal set: only what we need to confirm game existence.
 * Fewer bookIds = smaller response = faster parse.
 */
const BOOK_IDS = "15,68";  // DK NJ (15) + DK (68) — sufficient for slate population

const AN_BASE = "https://api.actionnetwork.com/web/v2/scoreboard";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json",
};

/** Cache TTL: 5 minutes in ms */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Fetch timeout: 8 seconds */
const FETCH_TIMEOUT_MS = 8_000;

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

interface CacheEntry {
  games:     SlateGame[];
  fetchedAt: number;   // Date.now() when cached
}

// ─── In-memory cache ──────────────────────────────────────────────────────────

/** Primary cache: "SPORT:YYYY-MM-DD" → CacheEntry */
const slateCache = new Map<string, CacheEntry>();

/** In-flight deduplication: "SPORT:YYYY-MM-DD" → Promise<SlateGame[]> */
const inFlight = new Map<string, Promise<SlateGame[]>>();

function cacheKey(sport: string, dateStr: string): string {
  return `${sport.toUpperCase()}:${dateStr}`;
}

function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

/** Evict all expired entries (called before each cache write) */
function evictExpired(): void {
  let evicted = 0;
  for (const [k, v] of Array.from(slateCache.entries())) {
    if (!isCacheValid(v)) {
      slateCache.delete(k);
      evicted++;
    }
  }
  if (evicted > 0) {
    console.log(`[AN][CACHE] Evicted ${evicted} expired entries | remaining=${slateCache.size}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a UTC ISO string to EST time string "H:MM AM/PM"
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
    return dt.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  } catch {
    return utcStr.slice(0, 10);
  }
}

/**
 * Today's date in EST as "YYYY-MM-DD"
 */
export function todayEstDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

// ─── Core fetch (no cache) ────────────────────────────────────────────────────

async function fetchAnSlateRaw(sport: string, dateStr: string): Promise<SlateGame[]> {
  const slug = AN_SPORT_SLUG[sport.toUpperCase()];
  if (!slug) {
    console.error(`[AN][ERROR] Unknown sport="${sport}" — no AN slug mapping`);
    return [];
  }

  const anDate = dateStr.replace(/-/g, "");
  const url = `${AN_BASE}/${slug}?bookIds=${BOOK_IDS}&date=${anDate}&periods=event`;

  console.log(`[AN][STEP]  Fetching: ${url}`);

  let raw: Record<string, unknown>;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const resp = await fetch(url, { headers: FETCH_HEADERS, signal: controller.signal });
    clearTimeout(timer);

    console.log(`[AN][STATE] HTTP status=${resp.status} sport=${sport} date=${dateStr}`);

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`[AN][ERROR] Non-OK: status=${resp.status} body=${body.slice(0, 200)}`);
      return [];
    }

    raw = (await resp.json()) as Record<string, unknown>;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.error(`[AN][ERROR] Fetch timeout after ${FETCH_TIMEOUT_MS}ms for sport=${sport} date=${dateStr}`);
    } else {
      console.error(`[AN][ERROR] Fetch failed: ${err}`);
    }
    return [];
  }

  const games = (raw.games as Record<string, unknown>[]) ?? [];
  console.log(`[AN][STATE] Raw games count=${games.length} sport=${sport} date=${dateStr}`);

  if (games.length === 0) {
    console.log(`[AN][OUTPUT] No games for sport=${sport} date=${dateStr}`);
    return [];
  }

  // ── Parse ─────────────────────────────────────────────────────────────────
  const result: SlateGame[] = [];
  let parseErrors = 0;

  for (const g of games) {
    try {
      const id         = g.id as number;
      const startUtc   = g.start_time as string;
      const status     = (g.status as string) ?? "scheduled";
      const awayTeamId = g.away_team_id as number;
      const homeTeamId = g.home_team_id as number;

      const teams = (g.teams as Record<string, unknown>[]) ?? [];
      const teamMap = new Map<number, Record<string, unknown>>();
      for (const t of teams) teamMap.set(t.id as number, t);

      const away = teamMap.get(awayTeamId);
      const home = teamMap.get(homeTeamId);

      if (!away || !home) {
        console.warn(`[AN][STATE] game id=${id}: missing team — awayId=${awayTeamId} homeId=${homeTeamId}`);
        parseErrors++;
        continue;
      }

      result.push({
        id,
        awayTeam: (away.abbr as string) || (away.short_name as string) || "?",
        homeTeam: (home.abbr as string) || (home.short_name as string) || "?",
        awayFull: (away.full_name as string) || (away.abbr as string) || "?",
        homeFull: (home.full_name as string) || (home.abbr as string) || "?",
        gameTime: utcToEstTime(startUtc),
        startUtc,
        sport:    sport.toUpperCase(),
        gameDate: utcToEstDate(startUtc),
        status,
      });
    } catch (err) {
      console.error(`[AN][ERROR] Parse error on game: ${err}`);
      parseErrors++;
    }
  }

  result.sort((a, b) => a.startUtc.localeCompare(b.startUtc));

  console.log(`[AN][OUTPUT] Parsed ${result.length} games | sport=${sport} date=${dateStr} | errors=${parseErrors}`);
  console.log(`[AN][VERIFY] ${parseErrors === 0 ? "PASS" : "WARN"} — ${parseErrors} parse errors`);

  result.forEach((g, i) => {
    console.log(`[AN][OUTPUT]   [${i + 1}] id=${g.id} ${g.awayTeam} @ ${g.homeTeam} | ${g.gameTime} ET | status=${g.status}`);
  });

  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch the daily slate from Action Network — with in-memory cache + in-flight dedup.
 *
 * @param sport   - "MLB" | "NHL" | "NBA" | "NCAAM"
 * @param dateStr - "YYYY-MM-DD" (EST date)
 * @returns       - Sorted SlateGame[] (by start time ASC), served from cache when fresh
 */
export async function fetchAnSlate(sport: string, dateStr: string): Promise<SlateGame[]> {
  const key = cacheKey(sport, dateStr);

  console.log(`[AN][INPUT] fetchAnSlate: sport=${sport} date=${dateStr} key=${key}`);

  // ── Cache hit ──────────────────────────────────────────────────────────────
  const cached = slateCache.get(key);
  if (cached && isCacheValid(cached)) {
    const ageMs = Date.now() - cached.fetchedAt;
    console.log(`[AN][CACHE] HIT key=${key} | age=${ageMs}ms | games=${cached.games.length}`);
    return cached.games;
  }

  // ── In-flight dedup ────────────────────────────────────────────────────────
  const existing = inFlight.get(key);
  if (existing) {
    console.log(`[AN][CACHE] IN-FLIGHT dedup key=${key} — awaiting existing request`);
    return existing;
  }

  // ── Cache miss — fetch ─────────────────────────────────────────────────────
  console.log(`[AN][CACHE] MISS key=${key} — initiating fetch`);

  const promise = fetchAnSlateRaw(sport, dateStr).then(games => {
    evictExpired();
    slateCache.set(key, { games, fetchedAt: Date.now() });
    inFlight.delete(key);
    console.log(`[AN][CACHE] STORED key=${key} | games=${games.length} | TTL=${CACHE_TTL_MS / 1000}s`);
    return games;
  }).catch(err => {
    inFlight.delete(key);
    console.error(`[AN][ERROR] fetchAnSlateRaw threw: ${err}`);
    return [] as SlateGame[];
  });

  inFlight.set(key, promise);
  return promise;
}

/**
 * Pre-warm the slate cache for today's date across all 4 sports in parallel.
 * Called once on server startup to eliminate cold-start latency for the first user.
 */
export async function prewarmSlateCache(): Promise<void> {
  const today = todayEstDate();
  console.log(`[AN][CACHE] Pre-warming slate cache for date=${today} sports=${PREWARM_SPORTS.join(",")}`);

  const start = Date.now();
  const results = await Promise.allSettled(
    PREWARM_SPORTS.map(sport => fetchAnSlate(sport, today))
  );

  let totalGames = 0;
  results.forEach((r, i) => {
    const sport = PREWARM_SPORTS[i];
    if (r.status === "fulfilled") {
      totalGames += r.value.length;
      console.log(`[AN][CACHE] Pre-warm OK: sport=${sport} games=${r.value.length}`);
    } else {
      console.error(`[AN][CACHE] Pre-warm FAIL: sport=${sport} reason=${r.reason}`);
    }
  });

  const elapsed = Date.now() - start;
  console.log(`[AN][CACHE] Pre-warm complete | elapsed=${elapsed}ms | totalGames=${totalGames} | cacheSize=${slateCache.size}`);
}

/**
 * Manually invalidate a specific cache entry (e.g., after a date change).
 */
export function invalidateSlateCache(sport: string, dateStr: string): void {
  const key = cacheKey(sport, dateStr);
  const existed = slateCache.delete(key);
  console.log(`[AN][CACHE] Invalidate key=${key} | existed=${existed}`);
}
