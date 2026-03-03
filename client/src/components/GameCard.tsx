// GameCard — displays a single game matchup with model projections
// Uses live data from the games tRPC query (DB-backed)

import { Share2, Maximize2 } from "lucide-react";
import TeamLogo from "./TeamLogo";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/lib/trpc";

// Re-export AppRouter type from trpc lib
type _AppRouter = AppRouter;

type RouterOutput = inferRouterOutputs<AppRouter>;
type GameRow = RouterOutput["games"]["list"][number];

interface GameCardProps {
  game: GameRow;
}

function formatSpread(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return String(value);
  return n > 0 ? `+${n}` : `${n}`;
}

function titleCase(s: string): string {
  return s
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatDate(dateStr: string): string {
  // "2026-03-02" → "Mon Mar 2"
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatTime(timeStr: string): string {
  // "19:00" → "7:00 PM EST"
  try {
    const [h, m] = timeStr.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${hour}:${String(m).padStart(2, "0")} ${suffix} EST`;
  } catch {
    return timeStr;
  }
}

export function GameCard({ game }: GameCardProps) {
  const spreadIsPass = !game.spreadEdge || game.spreadEdge === "PASS";
  const totalIsPass = !game.totalEdge || game.totalEdge === "PASS";

  const spreadEdgeDisplay = spreadIsPass
    ? "PASS"
    : titleCase(game.spreadEdge);

  const totalEdgeDisplay = totalIsPass ? "PASS" : game.totalEdge;

  const modelTotal = parseFloat(String(game.modelTotal));
  const bookTotal = parseFloat(String(game.bookTotal));

  const handleShare = () => {
    const text = `${titleCase(game.awayTeam)} vs ${titleCase(game.homeTeam)} — ${spreadEdgeDisplay} | ${totalEdgeDisplay}`;
    navigator.clipboard.writeText(text).catch(() => {});
    toast.success("Game info copied to clipboard!");
  };

  const handleExpand = () => {
    toast.info("Expanded view coming soon");
  };

  return (
    <div className="relative group border-b border-border last:border-b-0">
      {/* Date/Time Header */}
      <div className="py-2 text-center">
        <span className="text-xs text-muted-foreground font-medium tracking-wide uppercase">
          {formatDate(game.gameDate)} · {formatTime(game.startTimeEst)}
        </span>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 px-4 pb-1">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Books</span>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest text-center">Model Line</span>
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest text-right">Model O/U</span>
      </div>

      {/* Away Team Row */}
      <div className="grid grid-cols-3 items-center px-4 py-2">
        <div className="flex items-center gap-2.5">
          <TeamLogo name={game.awayTeam} size={36} />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-foreground leading-tight truncate">
              {titleCase(game.awayTeam)}
            </span>
            <span className="font-mono text-sm text-muted-foreground">
              {formatSpread(game.awayBookSpread)}
            </span>
          </div>
        </div>
        <div className="flex justify-center">
          <span className="inline-flex items-center justify-center min-w-[56px] px-3 py-1 rounded bg-secondary text-foreground font-mono text-sm font-medium">
            {formatSpread(game.awayModelSpread)}
          </span>
        </div>
        <div className="flex justify-end">
          <span className="font-mono text-sm text-foreground">
            O {isNaN(modelTotal) ? game.modelTotal : modelTotal}
          </span>
        </div>
      </div>

      {/* Home Team Row */}
      <div className="grid grid-cols-3 items-center px-4 py-2">
        <div className="flex items-center gap-2.5">
          <TeamLogo name={game.homeTeam} size={36} />
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-foreground leading-tight truncate">
              {titleCase(game.homeTeam)}
            </span>
            <span className="font-mono text-sm text-muted-foreground">
              {formatSpread(game.homeBookSpread)}
            </span>
          </div>
        </div>
        <div className="flex justify-center">
          <span className="inline-flex items-center justify-center min-w-[56px] px-3 py-1 rounded bg-secondary text-foreground font-mono text-sm font-medium">
            {formatSpread(game.homeModelSpread)}
          </span>
        </div>
        <div className="flex justify-end">
          <span className="font-mono text-sm text-foreground">
            U {isNaN(bookTotal) ? game.bookTotal : bookTotal}
          </span>
        </div>
      </div>

      {/* Pick Row */}
      <div className="grid grid-cols-3 items-center px-4 py-2.5 border-t border-border/40">
        {/* Spread Pick */}
        <div className="flex flex-col">
          {!spreadIsPass ? (
            <>
              <span className="text-xs font-semibold text-foreground leading-tight">
                {spreadEdgeDisplay}
              </span>
              <span className="text-[10px] font-semibold text-edge-green uppercase tracking-wide mt-0.5">
                EDGE: {game.spreadDiff}pt
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground font-medium">PASS</span>
          )}
        </div>

        <div />

        {/* Total Pick */}
        <div className="flex flex-col items-end">
          {!totalIsPass ? (
            <>
              <span className="text-xs font-semibold text-foreground leading-tight text-right">
                {totalEdgeDisplay}
              </span>
              <span className="text-[10px] font-semibold text-edge-green uppercase tracking-wide mt-0.5 text-right">
                EDGE: {game.totalDiff} pts
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground font-medium">PASS</span>
          )}
        </div>
      </div>

      {/* Action Buttons — appear on hover */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <button
          onClick={handleShare}
          className="w-7 h-7 rounded flex items-center justify-center bg-secondary hover:bg-accent transition-colors"
          title="Share card"
        >
          <Share2 className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={handleExpand}
          className="w-7 h-7 rounded flex items-center justify-center bg-secondary hover:bg-accent transition-colors"
          title="Expand"
        >
          <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
