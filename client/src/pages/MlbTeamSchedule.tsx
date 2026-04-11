/**
 * MlbTeamSchedule.tsx — 2026 MLB Team Schedule Page
 *
 * Display changes (2026-04-11 rev-2):
 *   1. O/U stat: plain numbers — "{overs}–{unders}–{pushes}" (no O/U/P suffix)
 *   2. Date column: MM/DD format, single-digit month (3/31 not 03/31)
 *   3. LOC → LOCATION header; values: Away | Home | Neutral
 *   4. OPP column: logo only (no abbreviation or name text)
 *   5. Score: team's score first, then opponent's (already correct logic)
 *   6. COV → COVER header; values: Y (covered) | N (did not cover) | — (push/null)
 *   7. ML column: always white font (no color coding)
 *   8. No horizontal scroll — table fits viewport at all times via column compression
 *      and viewport-relative font/padding sizing
 *
 * Status partitioning:
 *   - "complete"   → Completed Games section
 *   - "scheduled" / "inprogress" → Upcoming / Live section
 *   - "postponed"  → HIDDEN from both sections (no score, no valid time)
 *
 * Logging: [MlbTeamSchedule][TAG] structured console logs throughout.
 *
 * Data source: mlb_schedule_history (Action Network DK NJ API)
 * Season filter: 2026-03-26 → present (enforced in backend service)
 */

import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { MLB_BY_AN_SLUG } from "@shared/mlbTeams";
import { ArrowLeft, RefreshCw, Calendar, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduleGame {
  id: number;
  anGameId: number;
  gameDate: string;        // "YYYY-MM-DD"
  startTimeUtc: string;   // ISO-8601 UTC
  gameStatus: string;     // "complete" | "scheduled" | "inprogress" | "postponed"
  awaySlug: string;
  awayAbbr: string;
  awayName: string;
  awayTeamId: number;
  awayScore: number | null;
  homeSlug: string;
  homeAbbr: string;
  homeName: string;
  homeTeamId: number;
  homeScore: number | null;
  dkAwayRunLine: string | null;
  dkAwayRunLineOdds: string | null;
  dkHomeRunLine: string | null;
  dkHomeRunLineOdds: string | null;
  dkTotal: string | null;
  dkOverOdds: string | null;
  dkUnderOdds: string | null;
  dkAwayML: string | null;
  dkHomeML: string | null;
  awayRunLineCovered: boolean | null;
  homeRunLineCovered: boolean | null;
  totalResult: string | null;   // "OVER" | "UNDER" | "PUSH" | null
  awayWon: boolean | null;
  isNeutralSite?: boolean;       // optional — future neutral-site games
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_COMPLETE   = "complete";
const STATUS_POSTPONED  = "postponed";

const isCompleteGame  = (g: ScheduleGame) => g.gameStatus === STATUS_COMPLETE;
const isUpcomingGame  = (g: ScheduleGame) =>
  g.gameStatus !== STATUS_COMPLETE && g.gameStatus !== STATUS_POSTPONED;

// ─── Date formatter: MM/DD, single-digit month ────────────────────────────────
// March 31 → "3/31"   |   October 4 → "10/4"
// Rule: single-digit month for Mar–Sep (months 3–9), double-digit for Oct–Nov (10–11)
function fmtDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}/${d}`;
}

// ─── Start time formatter ─────────────────────────────────────────────────────
function fmtTime(utcIso: string): string {
  const d = new Date(utcIso);
  return (
    d.toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }) + " ET"
  );
}

// ─── Run line formatter ───────────────────────────────────────────────────────
// "+1.5 (-194)" | "-1.5 (+153)" | "—"
function fmtRunLine(value: string | null, odds: string | null): string {
  if (!value) return "—";
  const v = parseFloat(value);
  const sign = v >= 0 ? "+" : "";
  const line = `${sign}${v}`;
  return odds ? `${line} (${odds})` : line;
}

// ─── Total formatter ──────────────────────────────────────────────────────────
// "8.5 (-115/-105)" | "—"
function fmtTotal(
  total: string | null,
  overOdds: string | null,
  underOdds: string | null
): string {
  if (!total) return "—";
  const t = parseFloat(total);
  if (!overOdds && !underOdds) return String(t);
  return `${t} (${overOdds ?? "—"}/${underOdds ?? "—"})`;
}

// ─── Badge ────────────────────────────────────────────────────────────────────

type BadgeVariant = "win" | "loss" | "push" | "neutral";

const BADGE_CLS: Record<BadgeVariant, string> = {
  win:     "bg-green-500/20 text-green-400 border-green-500/30",
  loss:    "bg-red-500/20 text-red-400 border-red-500/30",
  push:    "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  neutral: "bg-gray-700/40 text-gray-500 border-gray-600/20",
};

function Badge({ label, variant }: { label: string; variant: BadgeVariant }) {
  return (
    <span
      className={cn(
        // Base: tiny, bold, mono, rounded, border
        "inline-flex items-center justify-center rounded border font-mono font-bold tracking-wide whitespace-nowrap",
        // Responsive sizing: 8px on mobile, 9px on sm+
        "text-[8px] sm:text-[9px] px-[3px] sm:px-1 py-[1px]",
        BADGE_CLS[variant]
      )}
    >
      {label}
    </span>
  );
}

// ─── Schedule Row ─────────────────────────────────────────────────────────────

function ScheduleRow({
  game,
  teamSlug,
  isUpcoming,
}: {
  game: ScheduleGame;
  teamSlug: string;
  isUpcoming: boolean;
}) {
  // ── Perspective: is the team we're viewing the away or home team? ──────────
  const isAway = game.awaySlug === teamSlug;

  // ── Opponent info ──────────────────────────────────────────────────────────
  const oppSlug   = isAway ? game.homeSlug   : game.awaySlug;
  const oppTeamId = isAway ? game.homeTeamId : game.awayTeamId;
  const oppAbbr   = isAway ? game.homeAbbr   : game.awayAbbr;
  const oppTeam   = MLB_BY_AN_SLUG.get(oppSlug);
  const oppLogo   = oppTeam?.logoUrl ?? `https://www.mlbstatic.com/team-logos/${oppTeamId}.svg`;

  // ── Scores (team first, then opponent) ────────────────────────────────────
  const myScore  = isAway ? game.awayScore : game.homeScore;
  const oppScore = isAway ? game.homeScore : game.awayScore;

  // ── Odds (from team's perspective) ────────────────────────────────────────
  const myRunLine     = isAway ? game.dkAwayRunLine     : game.dkHomeRunLine;
  const myRunLineOdds = isAway ? game.dkAwayRunLineOdds : game.dkHomeRunLineOdds;
  const myML          = isAway ? game.dkAwayML          : game.dkHomeML;
  const myCovered     = isAway ? game.awayRunLineCovered : game.homeRunLineCovered;

  // ── W/L (from team's perspective) ─────────────────────────────────────────
  const myWon = game.awayWon != null
    ? (isAway ? game.awayWon : !game.awayWon)
    : null;

  // ── LOCATION: Away | Home | Neutral ───────────────────────────────────────
  const location = game.isNeutralSite
    ? "Neutral"
    : isAway ? "Away" : "Home";
  const locVariant = game.isNeutralSite
    ? "neutral"
    : isAway ? "away" : "home";

  // ── Score / Time display ───────────────────────────────────────────────────
  const isComplete  = game.gameStatus === STATUS_COMPLETE;
  const isScheduled = game.gameStatus === "scheduled";

  const scoreDisplay =
    isComplete && myScore != null && oppScore != null
      ? `${myScore}–${oppScore}`
      : isScheduled
      ? fmtTime(game.startTimeUtc)
      : "Live";

  // ── W/L badge ─────────────────────────────────────────────────────────────
  const wlVariant: BadgeVariant = myWon === true ? "win" : myWon === false ? "loss" : "neutral";
  const wlLabel = myWon === true ? "W" : myWon === false ? "L" : "—";

  // ── COVER badge: Y | N | — (push = neutral dash) ──────────────────────────
  // myCovered: true=covered, false=did not cover, null=push or no odds
  const covVariant: BadgeVariant =
    myCovered === true ? "win" : myCovered === false ? "loss" : "neutral";
  const covLabel = myCovered === true ? "Y" : myCovered === false ? "N" : "—";

  // ── O/U badge ─────────────────────────────────────────────────────────────
  const ouVariant: BadgeVariant =
    game.totalResult === "OVER"  ? "win"
    : game.totalResult === "UNDER" ? "loss"
    : game.totalResult === "PUSH"  ? "push"
    : "neutral";
  const ouLabel = game.totalResult ?? "—";

  // ── Cell base classes ──────────────────────────────────────────────────────
  // px-1 on mobile, px-2 on sm+; py-1.5 always — keeps rows compact
  const cell = "px-1 sm:px-2 py-1.5";
  const mono = "font-mono text-[8px] sm:text-[9px]";

  return (
    <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">

      {/* DATE: MM/DD */}
      <td className={cn(cell, mono, "text-gray-400 whitespace-nowrap")}>
        {fmtDate(game.gameDate)}
      </td>

      {/* LOCATION: Away | Home | Neutral */}
      <td className={cn(cell, "text-center")}>
        <span
          className={cn(
            "inline-block rounded font-mono font-bold whitespace-nowrap",
            "text-[7px] sm:text-[8px] px-[3px] sm:px-1 py-[1px]",
            locVariant === "away"
              ? "bg-blue-500/20 text-blue-400"
              : locVariant === "home"
              ? "bg-purple-500/20 text-purple-400"
              : "bg-gray-500/20 text-gray-400"
          )}
        >
          {location}
        </span>
      </td>

      {/* OPP: logo only */}
      <td className={cn(cell, "text-center")}>
        <img
          src={oppLogo}
          alt={oppAbbr}
          className="w-5 h-5 sm:w-6 sm:h-6 object-contain mx-auto"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      </td>

      {/* SCORE / TIME */}
      <td className={cn(cell, "text-center")}>
        <span
          className={cn(
            mono, "font-bold",
            isComplete
              ? myWon ? "text-green-400" : "text-red-400"
              : "text-gray-400"
          )}
        >
          {scoreDisplay}
        </span>
      </td>

      {/* W/L */}
      <td className={cn(cell, "text-center")}>
        {isUpcoming
          ? <span className={cn(mono, "text-gray-600")}>—</span>
          : <Badge label={wlLabel} variant={wlVariant} />
        }
      </td>

      {/* RUN LINE */}
      <td className={cn(cell)}>
        <span className={cn(mono, "text-gray-300 whitespace-nowrap")}>
          {fmtRunLine(myRunLine, myRunLineOdds)}
        </span>
      </td>

      {/* COVER: Y | N | — */}
      <td className={cn(cell, "text-center")}>
        {isUpcoming
          ? <span className={cn(mono, "text-gray-600")}>—</span>
          : <Badge label={covLabel} variant={covVariant} />
        }
      </td>

      {/* TOTAL */}
      <td className={cn(cell)}>
        <span className={cn(mono, "text-gray-300 whitespace-nowrap")}>
          {fmtTotal(game.dkTotal, game.dkOverOdds, game.dkUnderOdds)}
        </span>
      </td>

      {/* O/U */}
      <td className={cn(cell, "text-center")}>
        {isUpcoming
          ? <span className={cn(mono, "text-gray-600")}>—</span>
          : <Badge label={ouLabel} variant={ouVariant} />
        }
      </td>

      {/* ML — always white */}
      <td className={cn(cell, "text-center")}>
        <span className={cn(mono, "font-bold text-white")}>
          {myML ?? "—"}
        </span>
      </td>

    </tr>
  );
}

// ─── Stats Summary ────────────────────────────────────────────────────────────
// Single row: RECORD · RL COVER · O/U · GAMES
// O/U: plain numbers — "6–5–2" (overs–unders–pushes), pushes shown only when > 0

function StatsSummary({
  games,
  teamSlug,
}: {
  games: ScheduleGame[];
  teamSlug: string;
}) {
  const completed = games.filter(isCompleteGame);
  if (!completed.length) return null;

  // W/L
  const wins = completed.filter((g) => {
    const ia = g.awaySlug === teamSlug;
    return ia ? g.awayWon === true : g.awayWon === false;
  }).length;
  const losses = completed.length - wins;

  // RL Cover (explicit true/false — null = push, excluded from both)
  const covered = completed.filter((g) => {
    const ia = g.awaySlug === teamSlug;
    return ia ? g.awayRunLineCovered === true : g.homeRunLineCovered === true;
  }).length;
  const notCovered = completed.filter((g) => {
    const ia = g.awaySlug === teamSlug;
    return ia ? g.awayRunLineCovered === false : g.homeRunLineCovered === false;
  }).length;

  // O/U — plain numbers
  const overs  = completed.filter((g) => g.totalResult === "OVER").length;
  const unders = completed.filter((g) => g.totalResult === "UNDER").length;
  const ouPush = completed.filter((g) => g.totalResult === "PUSH").length;

  console.log(
    `[MlbTeamSchedule][StatsSummary] [OUTPUT]` +
    ` team="${teamSlug}"` +
    ` | record=${wins}-${losses}` +
    ` | rlCover=${covered}-${notCovered}` +
    ` | ou=${overs}-${unders}-${ouPush}` +
    ` | games=${completed.length}`
  );

  const stats: Array<{ label: string; node: React.ReactNode }> = [
    {
      label: "RECORD",
      node: (
        <span className="font-mono text-[11px] sm:text-sm font-bold text-white">
          {wins}–{losses}
        </span>
      ),
    },
    {
      label: "RL COVER",
      node: (
        <span className="font-mono text-[11px] sm:text-sm font-bold">
          <span className="text-green-400">{covered}</span>
          <span className="text-gray-500 mx-0.5">–</span>
          <span className="text-red-400">{notCovered}</span>
        </span>
      ),
    },
    {
      label: "O/U",
      node: (
        <span className="font-mono text-[11px] sm:text-sm font-bold">
          <span className="text-green-400">{overs}</span>
          <span className="text-gray-500 mx-0.5">–</span>
          <span className="text-red-400">{unders}</span>
          {ouPush > 0 && (
            <>
              <span className="text-gray-500 mx-0.5">–</span>
              <span className="text-yellow-400">{ouPush}</span>
            </>
          )}
        </span>
      ),
    },
    {
      label: "GAMES",
      node: (
        <span className="font-mono text-[11px] sm:text-sm font-bold text-white">
          {completed.length}
        </span>
      ),
    },
  ];

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4 overflow-x-auto pb-0.5">
      {stats.map(({ label, node }) => (
        <div
          key={label}
          className="flex items-center gap-1 sm:gap-1.5 bg-white/5 rounded-lg px-2 sm:px-3 py-1.5 flex-shrink-0"
        >
          <span className="text-[8px] sm:text-[9px] text-gray-400 font-mono whitespace-nowrap">
            {label}
          </span>
          {node}
        </div>
      ))}
    </div>
  );
}

// ─── Schedule Table ───────────────────────────────────────────────────────────
// NO overflow-x-auto / NO minWidth — table must fit viewport at all times.
// Column widths are controlled by content compression (tiny fonts, minimal padding).

function ScheduleTable({
  games,
  teamSlug,
  isUpcoming,
}: {
  games: ScheduleGame[];
  teamSlug: string;
  isUpcoming: boolean;
}) {
  // Header cell base
  const th = "px-1 sm:px-2 py-1.5 text-[7px] sm:text-[8px] font-bold text-gray-500 font-mono tracking-widest whitespace-nowrap";

  return (
    <div className="rounded-lg border border-white/10 w-full">
      <table className="w-full table-fixed text-left">
        <colgroup>
          {/* DATE */}     <col style={{ width: "9%" }} />
          {/* LOCATION */} <col style={{ width: "11%" }} />
          {/* OPP */}      <col style={{ width: "7%" }} />
          {/* SCORE/TIME */}<col style={{ width: "13%" }} />
          {/* W/L */}      <col style={{ width: "6%" }} />
          {/* RUN LINE */} <col style={{ width: "19%" }} />
          {/* COVER */}    <col style={{ width: "7%" }} />
          {/* TOTAL */}    <col style={{ width: "19%" }} />
          {/* O/U */}      <col style={{ width: "7%" }} />
          {/* ML */}       <col style={{ width: "7%" }} />
        </colgroup>
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03]">
            <th className={th}>DATE</th>
            <th className={cn(th, "text-center")}>LOCATION</th>
            <th className={cn(th, "text-center")}>OPP</th>
            <th className={cn(th, "text-center")}>{isUpcoming ? "TIME" : "SCORE"}</th>
            <th className={cn(th, "text-center")}>W/L</th>
            <th className={th}>RUN LINE</th>
            <th className={cn(th, "text-center")}>COVER</th>
            <th className={th}>TOTAL</th>
            <th className={cn(th, "text-center")}>O/U</th>
            <th className={cn(th, "text-center")}>ML</th>
          </tr>
        </thead>
        <tbody>
          {games.map((game) => (
            <ScheduleRow
              key={game.anGameId}
              game={game}
              teamSlug={teamSlug}
              isUpcoming={isUpcoming}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

import React from "react";

export default function MlbTeamSchedule() {
  const params = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const teamSlug = params.slug ?? "";

  const teamInfo = MLB_BY_AN_SLUG.get(teamSlug);

  const { data, isLoading, error, refetch, isFetching } =
    trpc.mlbSchedule.getTeamSchedule.useQuery(
      { teamSlug },
      { enabled: !!teamSlug, staleTime: 2 * 60 * 1000 }
    );

  const games = (data?.games ?? []) as ScheduleGame[];

  // ── Status partitioning ──────────────────────────────────────────────────────
  // CRITICAL: postponed games are excluded from BOTH sections.
  const completedGames  = games.filter(isCompleteGame);
  const upcomingGames   = games.filter(isUpcomingGame);
  const postponedCount  = games.filter((g) => g.gameStatus === STATUS_POSTPONED).length;

  console.log(
    `[MlbTeamSchedule] [STATE] team="${teamSlug}"` +
    ` | total=${games.length}` +
    ` | complete=${completedGames.length}` +
    ` | upcoming=${upcomingGames.length}` +
    ` | postponed=${postponedCount} (hidden — no score/time/result)`
  );

  if (!teamSlug) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
        <p className="text-gray-400 font-mono text-sm">No team specified.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">

      {/* ── Sticky Header ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#0a0e1a]/95 backdrop-blur-sm border-b border-white/10">
        <div className="w-full px-2 sm:px-4 py-2 sm:py-3 flex items-center gap-2">

          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/feed")}
            className="text-gray-400 hover:text-white gap-1 -ml-1 px-2 flex-shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="text-[10px] font-mono">BACK</span>
          </Button>

          {teamInfo && (
            <img
              src={teamInfo.logoUrl}
              alt={teamInfo.abbrev}
              className="w-6 h-6 sm:w-8 sm:h-8 object-contain flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}

          <div className="flex-1 min-w-0">
            <h1 className="text-[11px] sm:text-sm font-bold text-white font-mono tracking-wide truncate leading-tight">
              {teamInfo?.name ?? teamSlug.replace(/-/g, " ").toUpperCase()}
            </h1>
            <p className="text-[8px] sm:text-[10px] text-gray-500 font-mono leading-tight">
              2026 MLB SCHEDULE
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-gray-400 hover:text-white flex-shrink-0 px-2"
          >
            <RefreshCw className={cn("w-3 h-3 sm:w-3.5 sm:h-3.5", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="w-full px-2 sm:px-4 py-3 sm:py-5">

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <RefreshCw className="w-5 h-5 text-blue-400 animate-spin mx-auto mb-3" />
              <p className="text-gray-400 font-mono text-xs">Loading schedule...</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
            <p className="text-red-400 font-mono text-xs">
              Error loading schedule: {error.message}
            </p>
          </div>
        )}

        {/* No data */}
        {!isLoading && !error && games.length === 0 && (
          <div className="text-center py-16">
            <Calendar className="w-7 h-7 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 font-mono text-xs">No 2026 schedule data available.</p>
            <p className="text-gray-600 font-mono text-[10px] mt-1">
              Run a backfill from the admin panel to populate data.
            </p>
          </div>
        )}

        {/* Stats summary */}
        {!isLoading && completedGames.length > 0 && (
          <StatsSummary games={games} teamSlug={teamSlug} />
        )}

        {/* Upcoming / Live */}
        {!isLoading && upcomingGames.length > 0 && (
          <div className="mb-4 sm:mb-5">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
              <h2 className="text-[9px] sm:text-[10px] font-bold text-blue-400 font-mono tracking-widest uppercase">
                Upcoming / Live
              </h2>
              <span className="text-[9px] text-gray-600 font-mono">
                ({upcomingGames.length})
              </span>
            </div>
            <ScheduleTable
              games={upcomingGames}
              teamSlug={teamSlug}
              isUpcoming={true}
            />
          </div>
        )}

        {/* Completed Games */}
        {!isLoading && completedGames.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <h2 className="text-[9px] sm:text-[10px] font-bold text-gray-400 font-mono tracking-widest uppercase">
                Completed Games
              </h2>
              <span className="text-[9px] text-gray-600 font-mono">
                ({completedGames.length})
              </span>
            </div>
            <ScheduleTable
              games={completedGames}
              teamSlug={teamSlug}
              isUpcoming={false}
            />
          </div>
        )}

      </div>
    </div>
  );
}
