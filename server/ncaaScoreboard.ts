/**
 * NCAA Scoreboard API scraper
 * Fetches game start times (in EST) from the NCAA GraphQL API.
 * No authentication required — public endpoint.
 *
 * Team resolution: NCAA seonames (hyphen format, e.g. "michigan-st") are
 * looked up directly in the 365-team registry (BY_NCAA_SLUG). If a seoname
 * is not in the registry, the team is not one of the 365 tracked teams and
 * will be filtered out downstream by VALID_DB_SLUGS.
 */

import { BY_NCAA_SLUG } from "../shared/ncaamTeams";

const NCAA_API = "https://sdataprod.ncaa.com/";
const GET_CONTESTS_SHA =
  "7287cda610a9326931931080cb3a604828febe6fe3c9016a7e4a36db99efdb7c";

export interface NcaaGame {
  /** NCAA contest ID — unique per game, used as dedup key */
  contestId: string;
  /** DB-style slug for away team, e.g. "ohio_state" ("tba" if unknown) */
  awaySeoname: string;
  /** DB-style slug for home team, e.g. "penn_state" ("tba" if unknown) */
  homeSeoname: string;
  /** Start time in ET as "HH:MM", e.g. "19:30" (DST-aware) */
  startTimeEst: string;
  /** Whether the start time is confirmed (not TBA) */
  hasStartTime: boolean;
  /** Unix epoch in seconds (UTC) */
  startTimeEpoch: number;
}

function toNcaaDate(yyyymmdd: string): string {
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return `${m}/${d}/${y}`;
}

/** Convert a Unix epoch (seconds) to "HH:MM" in Eastern Time (DST-aware). */
function epochToEt(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d); // e.g. "19:30"
}

/**
 * Convert an NCAA seoname (hyphen format) to a DB slug.
 * The 365-team registry (BY_NCAA_SLUG) is the sole source of truth.
 * If the seoname is not in the registry, the raw seoname is returned
 * (with hyphens replaced by underscores) — it will be filtered out
 * downstream by VALID_DB_SLUGS.
 */
function ncaaSlugToDb(seoname: string): string {
  const team = BY_NCAA_SLUG.get(seoname);
  if (team) return team.dbSlug;
  // Not in registry — return as-is (will be filtered by VALID_DB_SLUGS)
  return seoname.replace(/-/g, "_");
}

export async function fetchNcaaGames(dateYYYYMMDD: string): Promise<NcaaGame[]> {
  const contestDate = toNcaaDate(dateYYYYMMDD);
  const seasonYear = parseInt(dateYYYYMMDD.slice(0, 4)) - 1;

  const variables = { sportCode: "MBB", divisionId: 1, contestDate, seasonYear };
  const extensions = { persistedQuery: { version: 1, sha256Hash: GET_CONTESTS_SHA } };
  const url = `${NCAA_API}?variables=${encodeURIComponent(JSON.stringify(variables))}&extensions=${encodeURIComponent(JSON.stringify(extensions))}`;

  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Origin: "https://www.ncaa.com",
      Referer: "https://www.ncaa.com/",
      Accept: "application/json",
    },
  });

  if (!resp.ok) throw new Error(`NCAA API returned HTTP ${resp.status}`);

  const data = await resp.json();
  const contests: any[] = data?.data?.contests ?? [];

  const games: NcaaGame[] = [];
  for (const c of contests) {
    const away = c.teams?.find((t: any) => !t.isHome);
    const home = c.teams?.find((t: any) => t.isHome);
    if (!away || !home) continue;

    // Resolve start time — prefer the confirmed startTime string from NCAA;
    // fall back to epoch conversion (DST-aware). NCAA sometimes sets
    // hasStartTime=false even when the epoch is valid.
    let startTimeEst: string;
    if (c.startTime && c.hasStartTime) {
      startTimeEst = c.startTime;
    } else if (c.startTimeEpoch) {
      startTimeEst = epochToEt(c.startTimeEpoch);
    } else {
      startTimeEst = "TBD";
    }

    // Handle TBA teams — keep as "tba" slug
    const awaySeoname = away.seoname === "tba" ? "tba" : ncaaSlugToDb(away.seoname);
    const homeSeoname = home.seoname === "tba" ? "tba" : ncaaSlugToDb(home.seoname);

    games.push({
      contestId: String(c.contestId),
      awaySeoname,
      homeSeoname,
      startTimeEst,
      hasStartTime: c.hasStartTime ?? false,
      startTimeEpoch: c.startTimeEpoch,
    });
  }

  return games;
}

export function buildStartTimeMap(games: NcaaGame[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const g of games) {
    map.set(`${g.awaySeoname}@${g.homeSeoname}`, g.startTimeEst);
  }
  return map;
}
