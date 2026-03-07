/**
 * VSiN NBA Betting Splits Scraper
 *
 * Mirrors the NCAAM vsinScraper.ts but targets the NBA betting splits page:
 *   https://data.vsin.com/nba/betting-splits/
 *
 * Auth flow: same Piano ID JWT as NCAAM scraper (shared token cache).
 *
 * Table structure: identical to NCAAM — freezetable with 10 <td> cells per row.
 *   [0] team names (away + home via anchors), [1] spread, [4] total
 *
 * Game ID format: "20260306NBA00064" (YYYYMMDD + "NBA" + number)
 * Team href format: "/nba/teams/dallas-mavericks"
 *
 * VSiN href aliases (live page uses shortened forms):
 *   "la-clippers"  → "los-angeles-clippers"
 *   "la-lakers"    → "los-angeles-lakers"
 * These are resolved via VSIN_HREF_ALIASES from the registry.
 */

import * as cheerio from "cheerio";
import { ENV } from "./_core/env";
import { NBA_BY_VSIN_SLUG, VSIN_HREF_ALIASES } from "../shared/nbaTeams";

export interface NbaScrapedOdds {
  awayTeam: string;   // display name from VSiN anchor text
  homeTeam: string;   // display name from VSiN anchor text
  awaySlug: string;   // DB slug derived from href
  homeSlug: string;   // DB slug derived from href
  awaySpread: number | null;
  homeSpread: number | null;
  total: number | null;
  /** 0-based position of this game on the VSiN page (used for sortOrder) */
  vsinRowIndex: number;
  /** Date of the game as YYYYMMDD string, e.g. "20260306" */
  gameDate: string;
}

// Share the token cache with the NCAAM scraper (same Piano ID account)
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Logs into VSiN via Piano ID and returns a JWT access token.
 * Token is cached and reused until it expires.
 */
async function getVsinAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && tokenExpiry > now + 5 * 60 * 1000) {
    return cachedToken;
  }

  const email = ENV.vsinEmail;
  const password = ENV.vsinPassword;

  if (!email || !password) {
    throw new Error("VSiN credentials not configured (VSIN_EMAIL / VSIN_PASSWORD)");
  }

  console.log("[VSiN-NBA] Logging in via Piano ID...");

  const resp = await fetch(
    "https://auth.vsin.com/id/api/v1/identity/login/token?aid=N1owYIiApu&lang=en_US",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://auth.vsin.com",
        "Referer": "https://auth.vsin.com/id/",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        password,
        remember: true,
        login: email,
        loginType: "email",
      }),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Piano ID login failed (${resp.status}): ${text.substring(0, 200)}`);
  }

  const data = (await resp.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };

  if (!data.access_token) {
    throw new Error(`Piano ID login returned no token: ${JSON.stringify(data).substring(0, 200)}`);
  }

  cachedToken = data.access_token;
  tokenExpiry = now + (data.expires_in ?? 2592000) * 1000;

  console.log(`[VSiN-NBA] Login successful, token expires in ${data.expires_in ?? "unknown"}s`);
  return cachedToken;
}

/**
 * Fetches the VSiN NBA betting splits page HTML.
 */
async function fetchNbaVsinPage(): Promise<string> {
  const token = await getVsinAccessToken();

  const resp = await fetch(
    "https://data.vsin.com/nba/betting-splits/",
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Cookie": `__utp=${token}`,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://vsin.com/",
      },
    }
  );

  if (!resp.ok) {
    throw new Error(`VSiN NBA page fetch failed (${resp.status})`);
  }

  return resp.text();
}

/**
 * Converts a VSiN NBA href slug to a DB slug.
 * e.g. "/nba/teams/dallas-mavericks" → "dallas_mavericks"
 *      "/nba/teams/la-clippers"      → "los_angeles_clippers" (via alias)
 */
function nbaHrefToDbSlug(href: string): string {
  const parts = href.split("/");
  const raw = parts[parts.length - 1].toLowerCase();
  // Resolve alias first (e.g. "la-clippers" → "los-angeles-clippers")
  const canonical = VSIN_HREF_ALIASES[raw] ?? raw;
  // Registry lookup
  const team = NBA_BY_VSIN_SLUG.get(canonical);
  if (team) return team.dbSlug;
  // Fallback: replace hyphens with underscores
  return canonical.replace(/-/g, "_");
}

/**
 * Parses a spread value from anchor link text.
 * Examples: "+2.5", "-3.5", "PK"
 */
function parseSpread(text: string): number | null {
  if (!text) return null;
  const clean = text.trim().replace(/\s+/g, "");
  if (clean.toLowerCase() === "pk" || clean.toLowerCase() === "pick") return 0;
  const match = clean.match(/^([+-]?\d+\.?\d*)/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  if (isNaN(val) || Math.abs(val) > 60) return null;
  return val;
}

/**
 * Parses a total value from anchor link text.
 * NBA totals are typically 200–260.
 */
function parseTotal(text: string): number | null {
  if (!text) return null;
  const clean = text.trim().replace(/\s+/g, "");
  const match = clean.match(/^(\d{2,3}\.?\d*)/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  if (isNaN(val) || val < 150 || val > 300) return null;
  return val;
}

/**
 * Extracts visible text from anchor links within a td, filtering out collapsed content.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAnchorTexts($: cheerio.CheerioAPI, td: any): string[] {
  const texts: string[] = [];
  $(td)
    .find("a")
    .each((_i, el) => {
      if ($(el).closest(".collapse").length > 0) return;
      const text = $(el).text().trim();
      if (text) texts.push(text);
    });
  return texts;
}

/**
 * Extracts the game date (YYYYMMDD) from the game_id data attribute.
 * NBA game IDs look like: "20260306NBA00064"
 */
function extractGameDate(gameId: string): string | null {
  const match = gameId.match(/^(\d{8})/);
  return match ? match[1] : null;
}

/**
 * Parses game rows from the VSiN NBA betting splits table.
 */
function parseNbaGames(
  $: cheerio.CheerioAPI,
  dateLabel: string,
  startTime: number
): NbaScrapedOdds[] {
  const results: NbaScrapedOdds[] = [];

  $("table.freezetable tr").each((_i, tr) => {
    const tds = $(tr).find("td").toArray();
    if (tds.length < 10) return;

    // Extract team anchors from td[0]
    const teamAnchors = $(tds[0])
      .find('a.txt-color-vsinred[href*="/teams/"]')
      .toArray()
      .filter((a) => $(a).closest(".collapse").length === 0);

    if (teamAnchors.length < 2) return;

    // Get game ID to extract date
    let gameId: string | null = null;
    $(tds[0])
      .find("[data-param2]")
      .each((_j, el) => {
        if (!gameId && $(el).closest(".collapse").length === 0) {
          gameId = $(el).attr("data-param2") || null;
        }
      });

    if (!gameId) return;

    const gameDate = extractGameDate(gameId);
    if (!gameDate) return;

    // Filter by requested date — pass "ALL" to return every date
    if (dateLabel !== "ALL" && gameDate !== dateLabel) return;

    const awayTeam = $(teamAnchors[0]).text().trim();
    const homeTeam = $(teamAnchors[1]).text().trim();
    if (!awayTeam || !homeTeam) return;

    const awayHref = $(teamAnchors[0]).attr("href") || "";
    const homeHref = $(teamAnchors[1]).attr("href") || "";
    const awaySlug = awayHref ? nbaHrefToDbSlug(awayHref) : awayTeam.toLowerCase().replace(/\s+/g, "_");
    const homeSlug = homeHref ? nbaHrefToDbSlug(homeHref) : homeTeam.toLowerCase().replace(/\s+/g, "_");

    // Spread from td[1]
    const spreadTexts = getAnchorTexts($, tds[1]);
    const awaySpread = spreadTexts.length > 0 ? parseSpread(spreadTexts[0]) : null;
    const homeSpread = spreadTexts.length > 1 ? parseSpread(spreadTexts[1]) : null;

    // Total from td[4]
    const totalTexts = getAnchorTexts($, tds[4]);
    const total = totalTexts.length > 0 ? parseTotal(totalTexts[0]) : null;

    results.push({
      awayTeam,
      homeTeam,
      awaySlug,
      homeSlug,
      awaySpread,
      homeSpread,
      total,
      vsinRowIndex: results.length,
      gameDate,
    });
  });

  console.log(
    `[VSiN-NBA] Parsed ${results.length} NBA games for ${dateLabel} in ${Date.now() - startTime}ms`
  );

  return results;
}

/**
 * Scrapes the VSiN NBA betting splits page for games on a given date.
 * @param dateLabel - Date string in YYYYMMDD format, or "ALL" for all dates.
 */
export async function scrapeNbaVsinOdds(dateLabel: string): Promise<NbaScrapedOdds[]> {
  const startTime = Date.now();
  console.log(`[VSiN-NBA] Starting scrape for date: ${dateLabel}`);

  const html = await fetchNbaVsinPage();
  console.log(`[VSiN-NBA] Page fetched in ${Date.now() - startTime}ms (${html.length} bytes)`);

  const $ = cheerio.load(html);
  const table = $("table.freezetable");

  if (!table.length) {
    // Session may have expired — clear cached token and retry once
    console.warn("[VSiN-NBA] No table found — clearing cached token and retrying login");
    cachedToken = null;
    tokenExpiry = 0;
    const html2 = await fetchNbaVsinPage();
    const $2 = cheerio.load(html2);
    if (!$2("table.freezetable").length) {
      throw new Error("[VSiN-NBA] No betting splits table found after re-login. Page may be behind paywall.");
    }
    return parseNbaGames($2, dateLabel, startTime);
  }

  return parseNbaGames($, dateLabel, startTime);
}
