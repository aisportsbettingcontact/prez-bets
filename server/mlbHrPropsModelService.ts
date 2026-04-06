/**
 * mlbHrPropsModelService.ts
 *
 * Two responsibilities:
 *  1. Resolve mlbamId for every mlb_hr_props row that lacks one (MLB Stats API lookup).
 *  2. Compute per-player HR probability and EV fields:
 *       modelPHr, modelOverOdds, edgeOver, evOver, verdict
 *     using team batting splits (vs pitcher hand), pitcher hr9, and park factor.
 *
 * Calibration:
 *   P(≥1 HR) = 1 − exp(−λ)
 *   λ = (teamHr9 / 27) × woba_scale × sqrt(pitcherHr9 / LEAGUE_HR9) × parkFactor3yr × PLAYER_PA_PER_GAME
 *
 *   Dampened pitcher adjustment (sqrt) moderates extremes:
 *     pitcher_hr9=0.5 → raw_adj=0.39, dampened=0.625
 *     pitcher_hr9=1.28 → adj=1.0 (neutral)
 *     pitcher_hr9=2.0 → raw_adj=1.56, dampened=1.25
 *
 * Book source: Consensus (Action Network book_id=15) — already in anNoVigOverPct.
 */

import * as dotenv from "dotenv";
dotenv.config();

import { getDb } from "./db";
import {
  mlbHrProps,
  mlbTeamBattingSplits,
  mlbPitcherStats,
  mlbParkFactors,
  mlbLineups,
  mlbPlayers,
  games,
  type MlbHrPropRow,
} from "../drizzle/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";

const TAG = "[HrPropsModel]";

// ─── Constants ────────────────────────────────────────────────────────────────
const MLB_STATS_API = "https://statsapi.mlb.com/api/v1/sports/1/players";
const LEAGUE_WOBA = 0.318;          // 2025 MLB league wOBA
const LEAGUE_HR9  = 1.28;           // 2025 MLB league HR/9 for pitchers (career avg)
const PLAYER_PA_PER_GAME = 4.22;    // Average PA per batter per game (38 team PA / 9 batters)
const EDGE_THRESHOLD = 0.030;       // Minimum model edge to emit OVER verdict
const MIN_P_HR = 0.04;
const MAX_P_HR = 0.40;

export interface HrPropsModelResult {
  date: string;
  resolved: number;      // mlbamId newly resolved
  alreadyHad: number;    // rows that already had mlbamId
  unresolved: number;    // rows where MLB Stats API returned no match
  modeled: number;       // rows where modelPHr was computed
  edges: number;         // rows with verdict=OVER
  errors: number;        // rows that errored during computation
}

// ─── Name normalization ───────────────────────────────────────────────────────
function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // strip diacritics
    .replace(/\s+Jr\.?$|\s+Sr\.?$|\s+II$|\s+III$|\s+IV$/i, "")  // strip suffixes
    .replace(/\./g, "")
    .toLowerCase()
    .trim();
}

// ─── American odds helpers ────────────────────────────────────────────────────
function probToAmericanOdds(p: number): string {
  if (p <= 0 || p >= 1) return "N/A";
  if (p >= 0.5) {
    const odds = Math.round(-100 * p / (1 - p));
    return String(odds);
  } else {
    const odds = Math.round(100 * (1 - p) / p);
    return `+${odds}`;
  }
}

function americanOddsToProb(odds: string): number | null {
  const n = parseFloat(odds.replace("+", ""));
  if (isNaN(n)) return null;
  if (n < 0) return -n / (-n + 100);
  return 100 / (n + 100);
}

// ─── Core P(HR) computation ───────────────────────────────────────────────────
interface TeamBattingContext { hr9: number; woba: number; }
interface PitcherContext { hr9: number; }
interface ParkContext { hrFactor: number; }

function computePlayerPHr(
  teamBatting: TeamBattingContext,
  pitcher: PitcherContext,
  park: ParkContext
): number {
  // Step 1: Team HR rate per PA from batting splits
  // team_hr9 = HRs per 9 innings for this team's lineup
  // HR/PA = hr9 / 27 (27 outs per 9 innings, each out ≈ 1 PA)
  const hr_rate_per_pa = teamBatting.hr9 / 27.0;

  // Step 2: wOBA quality adjustment (team quality signal)
  const woba_scale = teamBatting.woba / LEAGUE_WOBA;

  // Step 3: Dampened pitcher HR rate adjustment (square root to moderate extremes)
  // Raw division (pitcher_hr9 / LEAGUE_HR9) is too aggressive for elite pitchers
  // (e.g. pitcher_hr9=0.5 → raw_adj=0.39, dampened=0.625)
  const pitcher_adj = Math.sqrt(pitcher.hr9 / LEAGUE_HR9);

  // Step 4: Park factor adjustment (parkFactor3yr is already a decimal multiplier)
  const park_adj = park.hrFactor;

  // Step 5: Adjusted per-PA rate
  const adj_rate = hr_rate_per_pa * woba_scale * pitcher_adj * park_adj;

  // Step 6: Poisson P(≥1 HR) for a single batter over PLAYER_PA_PER_GAME plate appearances
  const lambda = adj_rate * PLAYER_PA_PER_GAME;
  const p_hr = 1 - Math.exp(-lambda);

  // Clamp to valid range [4%, 40%]
  return Math.max(MIN_P_HR, Math.min(MAX_P_HR, p_hr));
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function resolveAndModelHrProps(gameDate: string): Promise<HrPropsModelResult> {
  console.log(`\n${TAG} ============================================================`);
  console.log(`${TAG} [INPUT] date=${gameDate}`);

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result: HrPropsModelResult = {
    date: gameDate,
    resolved: 0,
    alreadyHad: 0,
    unresolved: 0,
    modeled: 0,
    edges: 0,
    errors: 0,
  };

  // ─── STEP 1: Resolve mlbamId for rows that lack it ────────────────────────
  console.log(`${TAG} [STEP 1] Resolving mlbamId for unresolved HR prop rows`);

  // Get all HR prop rows for this date (via game join)
  const gameRows = await db
    .select({ id: games.id, awayTeam: games.awayTeam, homeTeam: games.homeTeam })
    .from(games)
    .where(and(eq(games.gameDate, gameDate), eq(games.sport, "MLB")));

  if (gameRows.length === 0) {
    console.log(`${TAG} [STATE] No MLB games found for ${gameDate}`);
    return result;
  }

  const gameIds = (gameRows as Array<{ id: number; awayTeam: string; homeTeam: string }>).map(g => g.id);
  console.log(`${TAG} [STATE] Found ${gameIds.length} MLB games for ${gameDate}`);

  // Get all HR prop rows for these games
  const allHrRows = await db
    .select()
    .from(mlbHrProps)
    .where(inArray(mlbHrProps.gameId, gameIds));

  const hrRows = allHrRows as MlbHrPropRow[];
  console.log(`${TAG} [STATE] Total HR prop rows: ${hrRows.length}`);

  if (hrRows.length === 0) {
    console.log(`${TAG} [STATE] No HR prop rows found. Run HR Props scraper first.`);
    return result;
  }

  // Separate already-resolved from unresolved
  const needsResolution = hrRows.filter(r => r.mlbamId == null);
  const alreadyResolved = hrRows.filter(r => r.mlbamId != null);
  result.alreadyHad = alreadyResolved.length;
  console.log(`${TAG} [STATE] Already have mlbamId: ${alreadyResolved.length} | Need resolution: ${needsResolution.length}`);

  if (needsResolution.length > 0) {
    // Build name lookup from mlb_players table first (fast, no API call)
    const allPlayers = await db
      .select({ mlbamId: mlbPlayers.mlbamId, name: mlbPlayers.name })
      .from(mlbPlayers)
      .where(eq(mlbPlayers.isActive, true));

    const playerNameMap = new Map<string, number>();
    for (const p of allPlayers as Array<{ mlbamId: number | null; name: string }>) {
      if (p.mlbamId) {
        playerNameMap.set(normalizeName(p.name), p.mlbamId);
      }
    }
    console.log(`${TAG} [STATE] mlb_players lookup table: ${playerNameMap.size} entries`);

    // Try MLB Stats API for any remaining unmatched
    let apiPlayers: Map<string, number> | null = null;

    for (const row of needsResolution) {
      const normalizedName = normalizeName(row.playerName);

      // Try DB lookup first
      let mlbamId = playerNameMap.get(normalizedName) ?? null;

      // Try MLB Stats API if not found in DB
      if (!mlbamId) {
        if (!apiPlayers) {
          // Lazy-load MLB Stats API roster
          try {
            const resp = await fetch(`${MLB_STATS_API}?season=2025&gameType=R`);
            if (resp.ok) {
              const data = await resp.json() as { people?: Array<{ id: number; fullName: string }> };
              apiPlayers = new Map<string, number>();
              for (const p of data.people ?? []) {
                apiPlayers.set(normalizeName(p.fullName), p.id);
              }
              console.log(`${TAG} [STATE] MLB Stats API: loaded ${apiPlayers.size} players`);
            }
          } catch (e) {
            console.warn(`${TAG} [WARN] MLB Stats API fetch failed: ${e}`);
            apiPlayers = new Map();
          }
        }
        mlbamId = apiPlayers?.get(normalizedName) ?? null;
      }

      if (mlbamId) {
        await db
          .update(mlbHrProps)
          .set({ mlbamId })
          .where(eq(mlbHrProps.id, row.id));
        result.resolved++;
      } else {
        result.unresolved++;
        console.warn(`${TAG} [WARN] Could not resolve mlbamId for: "${row.playerName}" (normalized: "${normalizedName}")`);
      }
    }

    console.log(`${TAG} [STATE] mlbamId resolution: resolved=${result.resolved} unresolved=${result.unresolved}`);
  }

  // ─── STEP 2: Load context data for model computation ─────────────────────
  console.log(`${TAG} [STEP 2] Loading batting splits, pitcher stats, park factors, lineups`);

  // Load batting splits (all teams, both hands)
  const battingSplits = await db.select().from(mlbTeamBattingSplits);
  const splitsMap = new Map<string, { L: TeamBattingContext; R: TeamBattingContext }>();
  for (const s of battingSplits as Array<{ teamAbbrev: string; hand: string; hr9: number | null; woba: number | null }>) {
    if (!s.hr9 || !s.woba) continue;
    const entry = splitsMap.get(s.teamAbbrev) ?? { L: { hr9: 1.0, woba: 0.318 }, R: { hr9: 1.0, woba: 0.318 } };
    const hand = s.hand as 'L' | 'R';
    entry[hand] = { hr9: Number(s.hr9), woba: Number(s.woba) };
    splitsMap.set(s.teamAbbrev, entry);
  }
  console.log(`${TAG} [STATE] Batting splits loaded: ${splitsMap.size} teams`);

  // Load pitcher stats (keyed by fullName lowercase)
  const pitcherStats = await db.select({ fullName: mlbPitcherStats.fullName, hr9: mlbPitcherStats.hr9, throwsHand: mlbPitcherStats.throwsHand }).from(mlbPitcherStats);
  const pitcherMap = new Map<string, { hr9: number; hand: string }>();
  for (const p of pitcherStats as Array<{ fullName: string; hr9: number | null; throwsHand: string | null }>) {
    if (p.hr9 != null) {
      pitcherMap.set(p.fullName.toLowerCase(), { hr9: Number(p.hr9), hand: p.throwsHand ?? 'R' });
    }
  }
  console.log(`${TAG} [STATE] Pitcher stats loaded: ${pitcherMap.size} pitchers`);

  // Load park factors (keyed by teamAbbrev)
  const parkFactors = await db.select({ teamAbbrev: mlbParkFactors.teamAbbrev, parkFactor3yr: mlbParkFactors.parkFactor3yr }).from(mlbParkFactors);
  const parkMap = new Map<string, ParkContext>();
  for (const p of parkFactors as Array<{ teamAbbrev: string; parkFactor3yr: number | null }>) {
    if (p.parkFactor3yr != null) {
      // parkFactor3yr is already a decimal multiplier (0.93 = pitcher-friendly, 1.07 = hitter-friendly)
      parkMap.set(p.teamAbbrev, { hrFactor: Number(p.parkFactor3yr) });
    }
  }
  console.log(`${TAG} [STATE] Park factors loaded: ${parkMap.size} parks`);

  // Load lineups for all games (to get pitcher hand)
  const lineupRows = await db
    .select()
    .from(mlbLineups)
    .where(inArray(mlbLineups.gameId, gameIds));

  const lineupMap = new Map<number, { awayPitcher: string; homePitcher: string; awayHand: string; homeHand: string }>();
  for (const l of lineupRows as Array<{ gameId: number; awayPitcherName: string | null; homePitcherName: string | null; awayPitcherHand: string | null; homePitcherHand: string | null }>) {
    lineupMap.set(l.gameId, {
      awayPitcher: l.awayPitcherName ?? '',
      homePitcher: l.homePitcherName ?? '',
      awayHand: l.awayPitcherHand ?? 'R',
      homeHand: l.homePitcherHand ?? 'R',
    });
  }

  // Also build game team map for quick lookup
  const gameTeamMap = new Map<number, { awayTeam: string; homeTeam: string }>();
  for (const g of gameRows as Array<{ id: number; awayTeam: string; homeTeam: string }>) {
    gameTeamMap.set(g.id, { awayTeam: g.awayTeam, homeTeam: g.homeTeam });
  }

  // ─── STEP 3: Reload all HR prop rows (now with mlbamId) and compute model ─
  console.log(`${TAG} [STEP 3] Computing model P(HR), modelOverOdds, edgeOver, evOver, verdict`);

  const freshRows = await db
    .select()
    .from(mlbHrProps)
    .where(inArray(mlbHrProps.gameId, gameIds));

  for (const row of freshRows as MlbHrPropRow[]) {
    try {
      const gameTeams = gameTeamMap.get(row.gameId);
      if (!gameTeams) continue;

      const lineup = lineupMap.get(row.gameId);
      const isAway = row.side === 'away';

      // Batter's team
      const batterTeam = isAway ? gameTeams.awayTeam : gameTeams.homeTeam;
      // Opposing pitcher (away batter faces home pitcher, home batter faces away pitcher)
      const pitcherName = isAway
        ? (lineup?.homePitcher ?? '')
        : (lineup?.awayPitcher ?? '');
      const pitcherHand = isAway
        ? (lineup?.homeHand ?? 'R')
        : (lineup?.awayHand ?? 'R');

      // Home team is where the game is played
      const homeTeam = gameTeams.homeTeam;

      // Get batting splits for batter's team vs pitcher hand
      const teamSplits = splitsMap.get(batterTeam);
      const teamBatting: TeamBattingContext = teamSplits
        ? (teamSplits[pitcherHand as 'L' | 'R'] ?? teamSplits['R'])
        : { hr9: 1.0, woba: LEAGUE_WOBA };

      // Get pitcher stats
      const pitcherData = pitcherMap.get(pitcherName.toLowerCase());
      const pitcher: PitcherContext = pitcherData
        ? { hr9: pitcherData.hr9 }
        : { hr9: LEAGUE_HR9 };

      // Get park factor for home team
      const park: ParkContext = parkMap.get(homeTeam) ?? { hrFactor: 1.0 };

      // Compute P(HR)
      const pHr = computePlayerPHr(teamBatting, pitcher, park);
      const modelOverOdds = probToAmericanOdds(pHr);

      // Compute edge and EV vs consensus no-vig
      const anNoVig = row.anNoVigOverPct ? parseFloat(row.anNoVigOverPct) : null;
      let edgeOver: string | null = null;
      let evOver: string | null = null;
      let verdict = 'PASS';

      if (anNoVig != null && !isNaN(anNoVig)) {
        const edge = pHr - anNoVig;
        edgeOver = (edge >= 0 ? '+' : '') + edge.toFixed(4);

        // EV = edge × (1/bookP - 1) × 100 (per $100 bet)
        const bookP = anNoVig;
        if (bookP > 0 && bookP < 1) {
          const ev = edge * ((1 / bookP) - 1) * 100;
          evOver = (ev >= 0 ? '+' : '') + ev.toFixed(2);
        }

        if (edge >= EDGE_THRESHOLD) {
          verdict = 'OVER';
          result.edges++;
        }
      }

      // Write to DB
      await db
        .update(mlbHrProps)
        .set({
          modelPHr: pHr.toFixed(4),
          modelOverOdds,
          edgeOver,
          evOver,
          verdict,
          modelRunAt: Date.now(),
        })
        .where(eq(mlbHrProps.id, row.id));

      result.modeled++;
      console.log(`${TAG} [STATE] ${row.playerName} (${batterTeam}): pHr=${pHr.toFixed(4)} modelOdds=${modelOverOdds} anNoVig=${anNoVig?.toFixed(4) ?? 'N/A'} edge=${edgeOver ?? 'N/A'} ev=${evOver ?? 'N/A'} verdict=${verdict}`);

    } catch (err: unknown) {
      result.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${TAG} [ERROR] Failed to model ${row.playerName}: ${msg}`);
    }
  }

  console.log(`\n${TAG} [OUTPUT] Modeling complete:`);
  console.log(`${TAG}   resolved=${result.resolved} alreadyHad=${result.alreadyHad} unresolved=${result.unresolved}`);
  console.log(`${TAG}   modeled=${result.modeled} edges=${result.edges} errors=${result.errors}`);
  console.log(`${TAG} [VERIFY] ${result.errors === 0 ? 'PASS' : 'FAIL'} — ${result.errors} total errors`);

  return result;
}
