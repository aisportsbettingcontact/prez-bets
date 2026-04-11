/**
 * MlbTeamSchedule.tsx
 *
 * Full team schedule page for an MLB team.
 * Accessed via /mlb/team/:slug (where slug is the Action Network url_slug).
 *
 * Displays all games for the team with:
 *   - Date, opponent, home/away indicator
 *   - DK NJ Run Line (spread + juice)
 *   - DK NJ Total (over/under + juice)
 *   - DK NJ Moneyline
 *   - Final score
 *   - Who won (W/L)
 *   - Whether team covered the run line (COV / NO / —)
 *   - Total result (OVER / UNDER / PUSH / —)
 *
 * Data source: mlb_schedule_history table (Action Network DK NJ API)
 */

import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { MLB_BY_AN_SLUG } from "@shared/mlbTeams";
import { ArrowLeft, RefreshCw, Calendar, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduleGame {
  id: number;
  anGameId: number;
  gameDate: string;
  startTimeUtc: string;
  gameStatus: string;
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
  totalResult: string | null;
  awayWon: boolean | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatGameDate(dateStr: string): string {
  // dateStr is YYYY-MM-DD
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatStartTime(utcIso: string): string {
  const d = new Date(utcIso);
  return d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }) + " ET";
}

function formatRunLine(value: string | null, odds: string | null): string {
  if (!value) return "—";
  const v = parseFloat(value);
  const sign = v >= 0 ? "+" : "";
  const lineStr = `${sign}${v}`;
  if (!odds) return lineStr;
  return `${lineStr} (${odds})`;
}

function formatTotal(total: string | null, overOdds: string | null, underOdds: string | null): string {
  if (!total) return "—";
  const t = parseFloat(total);
  if (!overOdds && !underOdds) return String(t);
  return `${t} (${overOdds ?? "—"}/${underOdds ?? "—"})`;
}

function getOddsColor(odds: string | null): string {
  if (!odds) return "text-gray-400";
  const n = parseInt(odds.replace("+", ""));
  if (n > 0) return "text-green-400";
  if (n < -150) return "text-red-400";
  return "text-yellow-300";
}

// ─── Result Badge ─────────────────────────────────────────────────────────────

function ResultBadge({ label, variant }: { label: string; variant: "win" | "loss" | "push" | "neutral" }) {
  const cls = {
    win:     "bg-green-500/20 text-green-400 border-green-500/30",
    loss:    "bg-red-500/20 text-red-400 border-red-500/30",
    push:    "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    neutral: "bg-gray-700/50 text-gray-400 border-gray-600/30",
  }[variant];
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border font-mono tracking-wide", cls)}>
      {label}
    </span>
  );
}

// ─── Game Row ─────────────────────────────────────────────────────────────────

function ScheduleRow({ game, teamSlug }: { game: ScheduleGame; teamSlug: string }) {
  const isAway = game.awaySlug === teamSlug;
  const isHome = game.homeSlug === teamSlug;

  // Opponent info
  const oppSlug  = isAway ? game.homeSlug  : game.awaySlug;
  const oppAbbr  = isAway ? game.homeAbbr  : game.awayAbbr;
  const oppName  = isAway ? game.homeName  : game.awayName;
  const oppTeam  = MLB_BY_AN_SLUG.get(oppSlug);
  const oppLogo  = oppTeam?.logoUrl ?? `https://www.mlbstatic.com/team-logos/${isAway ? game.homeTeamId : game.awayTeamId}.svg`;

  // This team's score and opponent score
  const myScore  = isAway ? game.awayScore  : game.homeScore;
  const oppScore = isAway ? game.homeScore  : game.awayScore;

  // This team's run line
  const myRunLine     = isAway ? game.dkAwayRunLine     : game.dkHomeRunLine;
  const myRunLineOdds = isAway ? game.dkAwayRunLineOdds : game.dkHomeRunLineOdds;
  const myML          = isAway ? game.dkAwayML          : game.dkHomeML;

  // Results
  const myCovered = isAway ? game.awayRunLineCovered : game.homeRunLineCovered;
  const myWon     = game.awayWon != null ? (isAway ? game.awayWon : !game.awayWon) : null;
  const isComplete = game.gameStatus === "complete";
  const isScheduled = game.gameStatus === "scheduled";

  // Score display
  const scoreStr = isComplete && myScore != null && oppScore != null
    ? `${myScore}–${oppScore}`
    : isScheduled ? formatStartTime(game.startTimeUtc) : "Live";

  // W/L badge
  const wlVariant: "win" | "loss" | "neutral" =
    myWon === true ? "win" : myWon === false ? "loss" : "neutral";
  const wlLabel = myWon === true ? "W" : myWon === false ? "L" : "—";

  // Cover badge
  const covVariant: "win" | "loss" | "neutral" =
    myCovered === true ? "win" : myCovered === false ? "loss" : "neutral";
  const covLabel = myCovered === true ? "COV" : myCovered === false ? "NO" : "—";

  // Total badge
  const totalVariant: "win" | "loss" | "push" | "neutral" =
    game.totalResult === "OVER" ? "win"
    : game.totalResult === "UNDER" ? "loss"
    : game.totalResult === "PUSH" ? "push"
    : "neutral";
  const totalLabel = game.totalResult ?? "—";

  return (
    <tr className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
      {/* Date */}
      <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap font-mono">
        {formatGameDate(game.gameDate)}
      </td>

      {/* H/A */}
      <td className="px-2 py-2.5 text-center">
        <span className={cn(
          "text-[10px] font-bold font-mono px-1.5 py-0.5 rounded",
          isAway ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"
        )}>
          {isAway ? "A" : "H"}
        </span>
      </td>

      {/* Opponent */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <img
            src={oppLogo}
            alt={oppAbbr}
            className="w-6 h-6 object-contain flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div className="min-w-0">
            <div className="text-xs font-semibold text-white truncate">{oppName}</div>
          </div>
        </div>
      </td>

      {/* Score / Time */}
      <td className="px-3 py-2.5 text-center">
        <span className={cn(
          "text-xs font-mono font-bold",
          isComplete ? (myWon ? "text-green-400" : "text-red-400") : "text-gray-400"
        )}>
          {scoreStr}
        </span>
      </td>

      {/* W/L */}
      <td className="px-2 py-2.5 text-center">
        <ResultBadge label={wlLabel} variant={wlVariant} />
      </td>

      {/* Run Line */}
      <td className="px-3 py-2.5">
        <div className="text-xs font-mono text-gray-300 whitespace-nowrap">
          {formatRunLine(myRunLine, myRunLineOdds)}
        </div>
      </td>

      {/* RL Cover */}
      <td className="px-2 py-2.5 text-center">
        <ResultBadge label={covLabel} variant={covVariant} />
      </td>

      {/* Total */}
      <td className="px-3 py-2.5">
        <div className="text-xs font-mono text-gray-300 whitespace-nowrap">
          {formatTotal(game.dkTotal, game.dkOverOdds, game.dkUnderOdds)}
        </div>
      </td>

      {/* O/U Result */}
      <td className="px-2 py-2.5 text-center">
        <ResultBadge label={totalLabel} variant={totalVariant} />
      </td>

      {/* Moneyline */}
      <td className="px-3 py-2.5 text-center">
        <span className={cn("text-xs font-mono font-bold", getOddsColor(myML))}>
          {myML ?? "—"}
        </span>
      </td>
    </tr>
  );
}

// ─── Stats Summary Bar ────────────────────────────────────────────────────────

function StatsSummary({ games, teamSlug }: { games: ScheduleGame[]; teamSlug: string }) {
  const completed = games.filter((g) => g.gameStatus === "complete");
  if (!completed.length) return null;

  const wins = completed.filter((g) => {
    const isAway = g.awaySlug === teamSlug;
    return isAway ? g.awayWon === true : g.awayWon === false;
  }).length;

  const losses = completed.length - wins;

  const covered = completed.filter((g) => {
    const isAway = g.awaySlug === teamSlug;
    const cov = isAway ? g.awayRunLineCovered : g.homeRunLineCovered;
    return cov === true;
  }).length;

  const notCovered = completed.filter((g) => {
    const isAway = g.awaySlug === teamSlug;
    const cov = isAway ? g.awayRunLineCovered : g.homeRunLineCovered;
    return cov === false;
  }).length;

  const overs = completed.filter((g) => g.totalResult === "OVER").length;
  const unders = completed.filter((g) => g.totalResult === "UNDER").length;

  return (
    <div className="flex flex-wrap gap-3 mb-4 px-1">
      <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
        <span className="text-xs text-gray-400 font-mono">RECORD</span>
        <span className="text-sm font-bold text-white font-mono">{wins}–{losses}</span>
      </div>
      <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
        <span className="text-xs text-gray-400 font-mono">RL COVER</span>
        <span className="text-sm font-bold text-green-400 font-mono">{covered}</span>
        <span className="text-xs text-gray-500 font-mono">–</span>
        <span className="text-sm font-bold text-red-400 font-mono">{notCovered}</span>
      </div>
      <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
        <span className="text-xs text-gray-400 font-mono">O/U</span>
        <span className="text-sm font-bold text-green-400 font-mono">{overs}O</span>
        <span className="text-xs text-gray-500 font-mono">–</span>
        <span className="text-sm font-bold text-red-400 font-mono">{unders}U</span>
      </div>
      <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
        <span className="text-xs text-gray-400 font-mono">GAMES</span>
        <span className="text-sm font-bold text-white font-mono">{completed.length}</span>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MlbTeamSchedule() {
  const params = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const teamSlug = params.slug ?? "";

  // Look up team info from shared registry
  const teamInfo = MLB_BY_AN_SLUG.get(teamSlug);

  const { data, isLoading, error, refetch, isFetching } = trpc.mlbSchedule.getTeamSchedule.useQuery(
    { teamSlug },
    {
      enabled: !!teamSlug,
      staleTime: 2 * 60 * 1000, // 2 min
    }
  );

  const games = (data?.games ?? []) as ScheduleGame[];

  // Separate into upcoming/live and completed
  const completedGames = games.filter((g) => g.gameStatus === "complete");
  const upcomingGames  = games.filter((g) => g.gameStatus !== "complete");

  if (!teamSlug) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
        <p className="text-gray-400 font-mono text-sm">No team specified.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-[#0a0e1a]/95 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/feed")}
            className="text-gray-400 hover:text-white gap-1.5 -ml-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-mono">BACK</span>
          </Button>

          {teamInfo && (
            <img
              src={teamInfo.logoUrl}
              alt={teamInfo.abbrev}
              className="w-8 h-8 object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}

          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-white font-mono tracking-wide truncate">
              {teamInfo?.name ?? teamSlug.replace(/-/g, " ").toUpperCase()}
            </h1>
            <p className="text-[10px] text-gray-500 font-mono">
              2026 MLB SCHEDULE — DK NJ ODDS
            </p>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-gray-400 hover:text-white gap-1.5"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
            <span className="text-xs font-mono hidden sm:inline">REFRESH</span>
          </Button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <RefreshCw className="w-6 h-6 text-blue-400 animate-spin mx-auto mb-3" />
              <p className="text-gray-400 font-mono text-sm">Loading schedule...</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
            <p className="text-red-400 font-mono text-sm">
              Error loading schedule: {error.message}
            </p>
          </div>
        )}

        {/* No data */}
        {!isLoading && !error && games.length === 0 && (
          <div className="text-center py-20">
            <Calendar className="w-8 h-8 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 font-mono text-sm">No schedule data available.</p>
            <p className="text-gray-600 font-mono text-xs mt-1">
              Run a backfill from the admin panel to populate data.
            </p>
          </div>
        )}

        {/* Stats summary */}
        {!isLoading && games.length > 0 && (
          <StatsSummary games={games} teamSlug={teamSlug} />
        )}

        {/* Upcoming / Live games */}
        {!isLoading && upcomingGames.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              <h2 className="text-xs font-bold text-blue-400 font-mono tracking-widest uppercase">
                Upcoming / Live
              </h2>
              <span className="text-xs text-gray-600 font-mono">({upcomingGames.length})</span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full min-w-[700px] text-left">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03]">
                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 font-mono tracking-widest">DATE</th>
                    <th className="px-2 py-2 text-[10px] font-bold text-gray-500 font-mono tracking-widest text-center">H/A</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 font-mono tracking-widest">OPPONENT</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 font-mono tracking-widest text-center">TIME</th>
                    <th className="px-2 py-2 text-[10px] font-bold text-gray-500 font-mono tracking-widest text-center">W/L</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 font-mono tracking-widest">RUN LINE</th>
                    <th className="px-2 py-2 text-[10px] font-bold text-gray-500 font-mono tracking-widest text-center">COV</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 font-mono tracking-widest">TOTAL</th>
                    <th className="px-2 py-2 text-[10px] font-bold text-gray-500 font-mono tracking-widest text-center">O/U</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 font-mono tracking-widest text-center">ML</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingGames.map((game) => (
                    <ScheduleRow key={game.anGameId} game={game} teamSlug={teamSlug} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Completed games */}
        {!isLoading && completedGames.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-gray-400" />
              <h2 className="text-xs font-bold text-gray-400 font-mono tracking-widest uppercase">
                Completed Games
              </h2>
              <span className="text-xs text-gray-600 font-mono">({completedGames.length})</span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full min-w-[700px] text-left">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03]">
                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 font-mono tracking-widest">DATE</th>
                    <th className="px-2 py-2 text-[10px] font-bold text-gray-500 font-mono tracking-widest text-center">H/A</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 font-mono tracking-widest">OPPONENT</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 font-mono tracking-widest text-center">SCORE</th>
                    <th className="px-2 py-2 text-[10px] font-bold text-gray-500 font-mono tracking-widest text-center">W/L</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 font-mono tracking-widest">RUN LINE</th>
                    <th className="px-2 py-2 text-[10px] font-bold text-gray-500 font-mono tracking-widest text-center">COV</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 font-mono tracking-widest">TOTAL</th>
                    <th className="px-2 py-2 text-[10px] font-bold text-gray-500 font-mono tracking-widest text-center">O/U</th>
                    <th className="px-3 py-2 text-[10px] font-bold text-gray-500 font-mono tracking-widest text-center">ML</th>
                  </tr>
                </thead>
                <tbody>
                  {completedGames.map((game) => (
                    <ScheduleRow key={game.anGameId} game={game} teamSlug={teamSlug} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}


      </div>
    </div>
  );
}
