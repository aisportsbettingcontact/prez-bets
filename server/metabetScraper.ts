/**
 * metabetScraper.ts
 *
 * Fetches spread odds, O/U odds, and moneyline odds from the MetaBet odds
 * board API used by VSiN's odds page (vsin.com/odds/).
 *
 * API endpoint:
 *   https://metabet.static.api.areyouwatchingthis.com/api/odds.json
 *     ?apiKey=219f64094f67ed781035f5f7a08840fc
 *     &includeDonBestData
 *     &leagueCode=<CODE>
 *
 * Supported league codes:
 *   BKC  = NCAAB (College Basketball)
 *   BKP  = NBA
 *   HKN  = NHL
 *
 * Provider strategy:
 *   All leagues use DRAFTKINGS for spread, O/U, and ML odds.
 *   DraftKings is 100% coverage for today's games across all three leagues
 *   and always uses standard puck lines (±1.5) for NHL.
 *   If DRAFTKINGS is unavailable for a game, all odds fields are null.
 *
 * The API returns odds in European decimal format.  This module converts
 * them to American format (e.g. 1.7299 → "-137", 2.14 → "+114").
 *
 * Spread values are rounded to the nearest 0.5 before returning.
 * O/U totals are also rounded to the nearest 0.5.
 *
 * Team matching uses team1Initials / team2Initials (e.g. "LAK", "NYI") and
 * team1Name / team1Nickname / team2Name / team2Nickname for downstream matching.
 */

export type MetabetLeagueCode = "BKC" | "BKP" | "HKN";

export interface MetabetConsensusOdds {
  /** MetaBet internal game ID */
  gameId: number;
  /** Away team city, e.g. "Los Angeles" */
  awayCity: string;
  /** Away team name/nickname, e.g. "Kings" */
  awayName: string;
  /** Away team initials/abbreviation, e.g. "LAK" */
  awayInitials: string;
  /** Home team city */
  homeCity: string;
  /** Home team name/nickname */
  homeName: string;
  /** Home team initials/abbreviation */
  homeInitials: string;
  /**
   * Away team puck/spread line rounded to nearest 0.5, e.g. -1.5 or +4.5.
   * null if no DraftKings data available.
   */
  awaySpread: number | null;
  /** Home team puck/spread line (mirror of awaySpread), e.g. +1.5 or -4.5 */
  homeSpread: number | null;
  /**
   * Away team spread/puck-line juice in American format, e.g. "-225" or "+185".
   * null if not available.
   */
  awaySpreadOdds: string | null;
  /** Home team spread/puck-line juice in American format */
  homeSpreadOdds: string | null;
  /**
   * Over/Under total rounded to nearest 0.5, e.g. 5.5 or 233.5.
   * null if not available.
   */
  total: number | null;
  /** Over odds in American format, e.g. "-110" or "+104" */
  overOdds: string | null;
  /** Under odds in American format, e.g. "-110" or "-126" */
  underOdds: string | null;
  /** Away team moneyline in American format, e.g. "+123" or "-180" */
  awayML: string | null;
  /** Home team moneyline in American format */
  homeML: string | null;
  /** Unix timestamp (ms) of the game start time */
  gameTimestamp: number;
}

// ─── Raw API types ────────────────────────────────────────────────────────────

interface MetabetOddsEntry {
  provider: string;
  spread?: number;
  spreadLine1?: number;  // away spread odds (decimal)
  spreadLine2?: number;  // home spread odds (decimal)
  overUnder?: number;
  overUnderLineOver?: number;
  overUnderLineUnder?: number;
  moneyLine1?: number;   // away ML (decimal)
  moneyLine2?: number;   // home ML (decimal)
}

interface MetabetGame {
  gameID: number;
  date: number;
  team1City: string;
  team1Name?: string;      // NBA / NHL
  team1Nickname?: string;  // NCAAB
  team1Initials: string;
  team2City: string;
  team2Name?: string;      // NBA / NHL
  team2Nickname?: string;  // NCAAB
  team2Initials: string;
  odds: MetabetOddsEntry[];
}

interface MetabetApiResponse {
  meta: { code: number; count: number };
  results: MetabetGame[];
}

// ─── Conversion helpers ───────────────────────────────────────────────────────

/**
 * Converts a European decimal odd to American format.
 * decimal >= 2.0  → positive American  e.g. 2.14 → "+114"
 * decimal <  2.0  → negative American  e.g. 1.73 → "-137"
 * Returns null for invalid / missing values.
 */
export function decimalToAmerican(d: number | undefined | null): string | null {
  if (d == null || isNaN(d) || d <= 1) return null;
  if (d >= 2.0) {
    return `+${Math.round((d - 1) * 100)}`;
  } else {
    return `${Math.round(-100 / (d - 1))}`;
  }
}

/**
 * Rounds a spread/total value to the nearest 0.5.
 * e.g. -1.16667 → -1.0,  1.375 → 1.5,  233.571 → 233.5
 */
export function roundToHalf(v: number | undefined | null): number | null {
  if (v == null || isNaN(v)) return null;
  return Math.round(v * 2) / 2;
}

// ─── Main scraper ─────────────────────────────────────────────────────────────

const METABET_API_KEY = "219f64094f67ed781035f5f7a08840fc";
const METABET_BASE =
  "https://metabet.static.api.areyouwatchingthis.com/api/odds.json";

/** The single provider used for all leagues */
const ODDS_PROVIDER = "DRAFTKINGS";

/**
 * Fetches DraftKings odds from the MetaBet API for a given league.
 *
 * @param leagueCode - "BKC" (NCAAB), "BKP" (NBA), or "HKN" (NHL)
 * @returns Array of MetabetConsensusOdds, one per game that has a DRAFTKINGS entry.
 *          Games without DraftKings odds are skipped.
 */
export async function fetchMetabetConsensusOdds(
  leagueCode: MetabetLeagueCode
): Promise<MetabetConsensusOdds[]> {
  const url = `${METABET_BASE}?apiKey=${METABET_API_KEY}&includeDonBestData&leagueCode=${leagueCode}`;

  console.log(`[MetaBet] Fetching ${leagueCode} DraftKings odds from MetaBet API...`);

  const resp = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://vsin.com/",
      Origin: "https://vsin.com",
    },
  });

  if (!resp.ok) {
    throw new Error(
      `[MetaBet] API request failed for ${leagueCode}: HTTP ${resp.status}`
    );
  }

  const data = (await resp.json()) as MetabetApiResponse;

  if (!data?.results || !Array.isArray(data.results)) {
    throw new Error(
      `[MetaBet] Unexpected API response shape for ${leagueCode}`
    );
  }

  const results: MetabetConsensusOdds[] = [];

  for (const game of data.results) {
    const dk = game.odds?.find((o) => o.provider === ODDS_PROVIDER);
    // Skip games with no DraftKings entry
    if (!dk) continue;

    const rawSpread = dk.spread;
    const awaySpread = roundToHalf(rawSpread);
    const homeSpread = awaySpread !== null && rawSpread != null
      ? roundToHalf(-rawSpread)
      : null;

    // NCAAB uses team1Nickname; NBA/NHL use team1Name
    const awayName = game.team1Name ?? game.team1Nickname ?? "";
    const homeName = game.team2Name ?? game.team2Nickname ?? "";

    results.push({
      gameId: game.gameID,
      awayCity: game.team1City ?? "",
      awayName,
      awayInitials: game.team1Initials ?? "",
      homeCity: game.team2City ?? "",
      homeName,
      homeInitials: game.team2Initials ?? "",
      awaySpread,
      homeSpread,
      awaySpreadOdds: decimalToAmerican(dk.spreadLine1),
      homeSpreadOdds: decimalToAmerican(dk.spreadLine2),
      total: roundToHalf(dk.overUnder),
      overOdds: decimalToAmerican(dk.overUnderLineOver),
      underOdds: decimalToAmerican(dk.overUnderLineUnder),
      awayML: decimalToAmerican(dk.moneyLine1),
      homeML: decimalToAmerican(dk.moneyLine2),
      gameTimestamp: game.date,
    });
  }

  console.log(
    `[MetaBet] ${leagueCode}: ${results.length} games with DraftKings odds ` +
      `(${data.results.length} total from API)`
  );

  return results;
}
