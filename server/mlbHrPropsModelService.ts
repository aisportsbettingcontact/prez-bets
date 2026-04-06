/**
 * mlbHrPropsModelService.ts
 *
 * Resolves mlbamId for all HR prop players (via MLB Stats API + mlb_players table)
 * and computes per-player HR probability, model odds, edge, EV, and verdict.
 *
 * Computation model:
 *   hr_rate_per_pa = team_hr9 / 27.0
 *   woba_scale     = team_woba / LEAGUE_WOBA
 *   pitcher_adj    = sqrt(pitcher_hr9 / LEAGUE_HR9)   [dampened to moderate extremes]
 *   park_adj       = parkFactor3yr                     [already a decimal multiplier]
 *   adj_rate       = hr_rate_per_pa * woba_scale * pitcher_adj * park_adj
 *   lambda         = adj_rate * PLAYER_PA_PER_GAME
 *   p_hr           = 1 - exp(-lambda)                  [Poisson P(≥1 HR)]
 *
 * Book source: Consensus (Action Network book_id=15) — anNoVigOverPct is the
 * consensus no-vig implied probability for the OVER.
 *
 * Edge  = modelPHr - anNoVigOverPct
 * EV    = (edge / (1 - modelPHr)) * 100  [per-unit EV on $100 bet]
 * Verdict = "OVER" if edge >= EDGE_THRESHOLD, else "PASS"
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
  games,
} from "../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";

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
  alreadyHad: number;    // mlbamId already populated
  unresolved: number;    // could not resolve
  modeled: number;       // rows with modelPHr written
  edges: number;         // rows with verdict=OVER
  errors: number;
}

// ─── Internal types ───────────────────────────────────────────────────────────
interface TeamBattingContext {
  hr9: number;
  woba: number;
}

interface PitcherContext {
  hr9: number;
}

interface ParkContext {
  hrFactor: number;
}

// ─── MLB Stats API name normalization ─────────────────────────────────────────
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // strip diacritics
    .replace(/\s+jr\.?$|\s+sr\.?$|\s+ii$|\s+iii$|\s+iv$/i, "")  // strip suffixes
    .replace(/[^a-z\s]/g, "")
    .trim();
}

// ─── Fetch all active MLB player IDs from MLB Stats API ───────────────────────
async function fetchMlbamIdMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const url = `${MLB_STATS_API}?season=2025&gameType=R`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { people?: Array<{ id: number; fullName: string }> };
    for (const p of data.people ?? []) {
      const key = normalizeName(p.fullName);
      map.set(key, p.id);
    }
    console.log(`${TAG} [STATE] MLB Stats API: loaded ${map.size} players`);
  } catch (err) {
    console.error(`${TAG} [ERROR] MLB Stats API fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return map;
}

// ─── Poisson P(≥1 HR) computation ────────────────────────────────────────────
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

// ─── American odds from probability ──────────────────────────────────────────
function probToAmericanOdds(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  if (p >= 0.5) return Math.round(-(p / (1 - p)) * 100);
  return Math.round(((1 - p) / p) * 100);
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function resolveAndModelHrProps(gameDate: string): Promise<HrPropsModelResult> {
  console.log(`\n${TAG} ============================================================`);
  console.log(`${TAG} [INPUT] date=${gameDate}`);

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let resolved = 0, alreadyHad = 0, unresolved = 0, modeled = 0, edges = 0, errors = 0;

  // ── Step 1: Load all April 5 game IDs ──────────────────────────────────────
  console.log(`${TAG} [STEP 1] Loading games for ${gameDate}`);
  const gameRows = await db
    .select({ id: games.id, awayTeam: games.awayTeam, homeTeam: games.homeTeam,
              awayStartingPitcher: games.awayStartingPitcher,
              homeStartingPitcher: games.homeStartingPitcher })
    .from(games)
    .where(and(eq(games.gameDate, gameDate), eq(games.sport, "MLB")));

  const gameIds = (gameRows as Array<{ id: number }>).map(g => g.id);
  console.log(`${TAG} [STATE] Found ${gameRows.length} MLB games, ids=[${gameIds.join(",")}]`);

  if (gameIds.length === 0) {
    console.log(`${TAG} [OUTPUT] No games found for ${gameDate}`);
    return { date: gameDate, resolved, alreadyHad, unresolved, modeled, edges, errors };
  }

  // ── Step 2: Load all HR prop rows for these games ──────────────────────────
  console.log(`${TAG} [STEP 2] Loading HR props for ${gameIds.length} games`);
  const hrRows = await db
    .select()
    .from(mlbHrProps)
    .where(
      gameIds.length === 1
        ? eq(mlbHrProps.gameId, gameIds[0])
        : inArray(mlbHrProps.gameId, gameIds)
    );

  console.log(`${TAG} [STATE] HR prop rows: ${hrRows.length}`);
  if (hrRows.length === 0) {
    console.log(`${TAG} [OUTPUT] No HR props found for ${gameDate}`);
    return { date: gameDate, resolved, alreadyHad, unresolved, modeled, edges, errors };
  }

  // ── Step 3: Resolve mlbamId ─────────────────────────────────────────────────
  console.log(`${TAG} [STEP 3] Resolving mlbamId`);

  // 3a: Separate already-resolved from unresolved
  type HrRow = typeof hrRows[0] & { id: number; playerName: string; mlbamId: number | null; gameId: number; side: string; teamAbbrev: string };
  const needsResolution = (hrRows as HrRow[]).filter(r => r.mlbamId == null);
  const alreadyResolved = (hrRows as HrRow[]).filter(r => r.mlbamId != null);
  alreadyHad = alreadyResolved.length;
  console.log(`${TAG} [STATE] Already resolved: ${alreadyHad}, needs resolution: ${needsResolution.length}`);

  if (needsResolution.length > 0) {
    // 3b: Fetch MLB Stats API player map
    const apiMap = await fetchMlbamIdMap();

    for (const row of needsResolution) {
      const key = normalizeName(row.playerName);
      const mlbamId = apiMap.get(key) ?? null;

      if (mlbamId != null) {
        try {
          await db.update(mlbHrProps).set({ mlbamId }).where(eq(mlbHrProps.id, row.id));
          row.mlbamId = mlbamId;
          resolved++;
        } catch (err) {
          console.error(`${TAG} [ERROR] Failed to update mlbamId for ${row.playerName}: ${err instanceof Error ? err.message : String(err)}`);
          errors++;
        }
      } else {
        console.warn(`${TAG} [WARN] Could not resolve mlbamId for "${row.playerName}" (key="${key}")`);
        unresolved++;
      }
    }
  }

  console.log(`${TAG} [STATE] mlbamId resolution: resolved=${resolved} alreadyHad=${alreadyHad} unresolved=${unresolved}`);

  // ── Step 4: Load context data ───────────────────────────────────────────────
  console.log(`${TAG} [STEP 4] Loading batting splits, pitcher stats, park factors, lineups`);

  // 4a: Team batting splits (keyed by teamAbbrev + hand)
  const battingSplits = await db.select().from(mlbTeamBattingSplits);
  type SplitRow = { teamAbbrev: string; hand: string; hr9: number | null; woba: number | null };
  const splitMap = new Map<string, TeamBattingContext>();
  for (const s of battingSplits as SplitRow[]) {
    const key = `${s.teamAbbrev}:${s.hand}`;
    if (s.hr9 != null && s.woba != null) {
      splitMap.set(key, { hr9: Number(s.hr9), woba: Number(s.woba) });
    }
  }
  // Also build a combined (vs-all) fallback by averaging L+R
  const teamAvgMap = new Map<string, TeamBattingContext>();
  const teamKeys = Array.from(new Set((battingSplits as SplitRow[]).map(s => s.teamAbbrev)));
  for (const team of teamKeys) {
    const lSplit = splitMap.get(`${team}:L`);
    const rSplit = splitMap.get(`${team}:R`);
    if (lSplit && rSplit) {
      teamAvgMap.set(team, {
        hr9: (lSplit.hr9 + rSplit.hr9) / 2,
        woba: (lSplit.woba + rSplit.woba) / 2,
      });
    } else if (lSplit) {
      teamAvgMap.set(team, lSplit);
    } else if (rSplit) {
      teamAvgMap.set(team, rSplit);
    }
  }
  console.log(`${TAG} [STATE] Batting splits loaded: ${splitMap.size} entries, ${teamAvgMap.size} teams`);

  // 4b: Pitcher stats (keyed by fullName lowercase)
  const pitcherStats = await db.select({ fullName: mlbPitcherStats.fullName, hr9: mlbPitcherStats.hr9 }).from(mlbPitcherStats);
  type PitcherRow = { fullName: string; hr9: number | null };
  const pitcherMap = new Map<string, PitcherContext>();
  for (const p of pitcherStats as PitcherRow[]) {
    if (p.hr9 != null) {
      pitcherMap.set(p.fullName.toLowerCase(), { hr9: Number(p.hr9) });
    }
  }
  console.log(`${TAG} [STATE] Pitcher stats loaded: ${pitcherMap.size} pitchers`);

  // 4c: Park factors (keyed by teamAbbrev)
  const parkFactors = await db.select({ teamAbbrev: mlbParkFactors.teamAbbrev, parkFactor3yr: mlbParkFactors.parkFactor3yr }).from(mlbParkFactors);
  type ParkRow = { teamAbbrev: string; parkFactor3yr: number | null };
  const parkMap = new Map<string, ParkContext>();
  for (const p of parkFactors as ParkRow[]) {
    if (p.parkFactor3yr != null) {
      // parkFactor3yr is already a decimal multiplier (0.93 = pitcher-friendly, 1.07 = hitter-friendly)
      parkMap.set(p.teamAbbrev, { hrFactor: Number(p.parkFactor3yr) });
    }
  }
  console.log(`${TAG} [STATE] Park factors loaded: ${parkMap.size} parks`);

  // 4d: Lineups (keyed by gameId) — for pitcher hand to select correct batting split
  const lineupRows = await db.select().from(mlbLineups).where(inArray(mlbLineups.gameId, gameIds));
  type LineupRow = { gameId: number; awayPitcherName: string | null; awayPitcherHand: string | null; homePitcherName: string | null; homePitcherHand: string | null };
  const lineupMap = new Map<number, LineupRow>();
  for (const l of lineupRows as LineupRow[]) {
    lineupMap.set(l.gameId, l);
  }
  console.log(`${TAG} [STATE] Lineups loaded: ${lineupMap.size} games`);

  // Build game context map: gameId → { awayTeam, homeTeam, awayPitcher, homePitcher }
  type GameCtx = { awayTeam: string; homeTeam: string; awayPitcherName: string | null; homePitcherName: string | null; awayPitcherHand: string | null; homePitcherHand: string | null };
  const gameCtxMap = new Map<number, GameCtx>();
  for (const g of gameRows as Array<{ id: number; awayTeam: string; homeTeam: string; awayStartingPitcher: string | null; homeStartingPitcher: string | null }>) {
    const lineup = lineupMap.get(g.id);
    gameCtxMap.set(g.id, {
      awayTeam: g.awayTeam,
      homeTeam: g.homeTeam,
      awayPitcherName: lineup?.awayPitcherName ?? g.awayStartingPitcher ?? null,
      homePitcherName: lineup?.homePitcherName ?? g.homeStartingPitcher ?? null,
      awayPitcherHand: lineup?.awayPitcherHand ?? null,
      homePitcherHand: lineup?.homePitcherHand ?? null,
    });
  }

  // ── Step 5: Compute model values for each HR prop row ──────────────────────
  console.log(`${TAG} [STEP 5] Computing modelPHr, modelOverOdds, edgeOver, evOver, verdict`);

  const allRows = await db
    .select()
    .from(mlbHrProps)
    .where(
      gameIds.length === 1
        ? eq(mlbHrProps.gameId, gameIds[0])
        : inArray(mlbHrProps.gameId, gameIds)
    );

  for (const row of allRows as HrRow[]) {
    try {
      const ctx = gameCtxMap.get(row.gameId);
      if (!ctx) {
        console.warn(`${TAG} [WARN] No game context for gameId=${row.gameId}`);
        continue;
      }

      // Determine which side this player is on
      const isAway = row.side === "away";
      const battingTeam = isAway ? ctx.awayTeam : ctx.homeTeam;
      const opposingPitcherName = isAway ? ctx.homePitcherName : ctx.awayPitcherName;
      const opposingPitcherHand = isAway ? ctx.homePitcherHand : ctx.awayPitcherHand;
      const homeTeam = ctx.homeTeam;

      // Get batting context (prefer hand-specific split if pitcher hand known)
      let batting: TeamBattingContext | undefined;
      if (opposingPitcherHand) {
        batting = splitMap.get(`${battingTeam}:${opposingPitcherHand}`);
      }
      if (!batting) {
        batting = teamAvgMap.get(battingTeam);
      }
      if (!batting) {
        batting = { hr9: 1.0, woba: LEAGUE_WOBA };  // league average fallback
      }

      // Get pitcher context
      let pitcher: PitcherContext = { hr9: LEAGUE_HR9 };  // league average fallback
      if (opposingPitcherName) {
        const pitcherKey = opposingPitcherName.toLowerCase();
        pitcher = pitcherMap.get(pitcherKey) ?? { hr9: LEAGUE_HR9 };
      }

      // Get park context
      const park: ParkContext = parkMap.get(homeTeam) ?? { hrFactor: 1.0 };

      // Compute P(HR)
      const modelPHr = computePlayerPHr(batting, pitcher, park);
      const modelOverOdds = probToAmericanOdds(modelPHr);

      // Compute edge and EV
      const anNoVig = row.anNoVigOverPct != null ? Number(row.anNoVigOverPct) : null;
      let edgeOver: number | null = null;
      let evOver: number | null = null;
      let verdict = "PASS";

      if (anNoVig != null && anNoVig > 0) {
        edgeOver = parseFloat((modelPHr - anNoVig).toFixed(4));
        // EV = (edge / (1 - modelPHr)) * 100 — represents per-unit return on $100
        evOver = parseFloat(((edgeOver / (1 - modelPHr)) * 100).toFixed(2));
        if (edgeOver >= EDGE_THRESHOLD) {
          verdict = "OVER";
          edges++;
        }
      }

      // Write to DB
      await db.update(mlbHrProps)
        .set({
          modelPHr: parseFloat(modelPHr.toFixed(4)),
          modelOverOdds,
          edgeOver,
          evOver,
          verdict,
        })
        .where(eq(mlbHrProps.id, row.id));

      modeled++;

      const edgeStr = edgeOver != null ? (edgeOver >= 0 ? `+${edgeOver.toFixed(4)}` : edgeOver.toFixed(4)) : "N/A";
      const evStr = evOver != null ? (evOver >= 0 ? `+${evOver.toFixed(2)}` : evOver.toFixed(2)) : "N/A";
      const noVigStr = anNoVig != null ? anNoVig.toFixed(4) : "N/A";
      console.log(`${TAG} [STATE] ${row.playerName} (${battingTeam}): pHr=${modelPHr.toFixed(4)} modelOdds=${modelOverOdds > 0 ? "+" : ""}${modelOverOdds} anNoVig=${noVigStr} edge=${edgeStr} ev=${evStr} verdict=${verdict}`);

    } catch (err) {
      errors++;
      console.error(`${TAG} [ERROR] Failed to model ${(row as HrRow).playerName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\n${TAG} [OUTPUT] Modeling complete:`);
  console.log(`${TAG}   resolved=${resolved} alreadyHad=${alreadyHad} unresolved=${unresolved}`);
  console.log(`${TAG}   modeled=${modeled} edges=${edges} errors=${errors}`);
  console.log(`${TAG} [VERIFY] ${errors === 0 ? "PASS" : "FAIL"} — ${errors} total errors`);

  return { date: gameDate, resolved, alreadyHad, unresolved, modeled, edges, errors };
}
