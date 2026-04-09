/**
 * OddsHistoryPanel
 *
 * Collapsible panel shown at the bottom of each game card (both frontend Betting Splits
 * tab and backend Publish Projections). Displays a chronological table of every
 * DK NJ odds snapshot for the game, with EST timestamps, spread/total/ML lines,
 * and VSIN betting splits (tickets % + money %) side-by-side.
 *
 * Timestamps are stored as UTC epoch ms in the DB and converted to EST for display.
 * "Manual" rows (triggered by the Refresh Now button) are highlighted with an amber badge.
 *
 * Column layout per snapshot row:
 *   Time (EST) | Source | Spread Line | Spread Bets% | Spread Money% |
 *   Total Line | Over Bets% | Over Money% | ML | ML Away Bets% | ML Away Money%
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Clock, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface OddsHistoryPanelProps {
  gameId: number;
  awayTeam: string;
  homeTeam: string;
}

/** Format a UTC epoch ms timestamp as Eastern time string: "Mar 15, 1:59 PM EST" or "Mar 15, 2:59 PM EDT" */
function fmtEst(epochMs: number): string {
  const d = new Date(epochMs);
  const datePart = d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  });
  const timePart = d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const tzAbbr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).formatToParts(d).find(p => p.type === "timeZoneName")?.value ?? "ET";
  return `${datePart}, ${timePart} ${tzAbbr}`;
}

/** Format a spread value with its juice: "+3.5 (-118)" */
function fmtSpread(value: string | null | undefined, odds: string | null | undefined): string {
  if (!value) return "—";
  const v = parseFloat(value);
  const sign = v > 0 ? "+" : "";
  const line = `${sign}${v}`;
  if (!odds) return line;
  return `${line} (${odds})`;
}

/** Format a total: "o139.5 (-108) / u (-112)" */
function fmtTotal(
  total: string | null | undefined,
  over: string | null | undefined,
  under: string | null | undefined
): string {
  if (!total) return "—";
  const t = parseFloat(total);
  const overStr = over ? `o${t} (${over})` : `o${t}`;
  const underStr = under ? `u (${under})` : "u";
  return `${overStr} / ${underStr}`;
}

/** Format a moneyline pair: "-145 / +125" */
function fmtML(away: string | null | undefined, home: string | null | undefined): string {
  if (!away && !home) return "—";
  const a = away ?? "—";
  const h = home ?? "—";
  return `${a} / ${h}`;
}

/** Format a percentage value: "62%" or "—" if null */
function fmtPct(val: number | null | undefined): string {
  if (val == null) return "—";
  return `${val}%`;
}

// ── Shared cell styles ────────────────────────────────────────────────────────

const TH_STYLE: React.CSSProperties = {
  color: "rgba(255,255,255,0.55)",
  borderBottom: "1px solid rgba(57,255,20,0.12)",
};

const GROUP_BORDER: React.CSSProperties = {
  borderLeft: "1px solid rgba(57,255,20,0.18)",
};

export function OddsHistoryPanel({ gameId, awayTeam, homeTeam: _homeTeam }: OddsHistoryPanelProps) {
  const [open, setOpen] = useState(false);

  // Only fetch when the panel is expanded — avoids unnecessary queries on page load
  const { data, isLoading, error } = trpc.oddsHistory.listForGame.useQuery(
    { gameId },
    { enabled: open, staleTime: 30_000 }
  );

  const rows = data?.history ?? [];

  return (
    <div
      className="border-t"
      style={{ borderColor: "rgba(57,255,20,0.15)" }}
    >
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <Clock size={13} style={{ color: "#39FF14" }} />
          <span
            className="text-[11px] font-black uppercase tracking-[0.18em]"
            style={{ color: "#39FF14" }}
          >
            Odds &amp; Splits History
          </span>
          {rows.length > 0 && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(57,255,20,0.15)", color: "#39FF14" }}
            >
              {rows.length}
            </span>
          )}
        </div>
        {open
          ? <ChevronUp size={14} style={{ color: "#39FF14" }} />
          : <ChevronDown size={14} style={{ color: "rgba(57,255,20,0.6)" }} />
        }
      </button>

      {/* Expanded table */}
      {open && (
        <div className="px-2 pb-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 gap-2" style={{ color: "rgba(255,255,255,0.4)" }}>
              <RefreshCw size={13} className="animate-spin" />
              <span className="text-xs">Loading history…</span>
            </div>
          ) : error ? (
            <p className="text-xs text-center py-4" style={{ color: "#ff4444" }}>
              Failed to load odds &amp; splits history.
            </p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: "rgba(255,255,255,0.35)" }}>
              No snapshots yet — history will populate after the next 10-min refresh cycle.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md" style={{ border: "1px solid rgba(57,255,20,0.12)" }}>
              <table className="w-full text-[10px]" style={{ borderCollapse: "collapse" }}>
                <thead>
                  {/* Group header row */}
                  <tr style={{ background: "rgba(57,255,20,0.05)" }}>
                    <th colSpan={2} className="px-3 py-1 text-left font-bold uppercase tracking-wider" style={TH_STYLE} />
                    {/* Spread group */}
                    <th
                      colSpan={3}
                      className="px-2 py-1 text-center font-bold uppercase tracking-wider whitespace-nowrap"
                      style={{ ...TH_STYLE, ...GROUP_BORDER, color: "rgba(255,200,80,0.8)" }}
                    >
                      Spread / Run Line / Puck Line
                    </th>
                    {/* Total group */}
                    <th
                      colSpan={3}
                      className="px-2 py-1 text-center font-bold uppercase tracking-wider whitespace-nowrap"
                      style={{ ...TH_STYLE, ...GROUP_BORDER, color: "rgba(80,200,255,0.8)" }}
                    >
                      Total (O/U)
                    </th>
                    {/* ML group */}
                    <th
                      colSpan={3}
                      className="px-2 py-1 text-center font-bold uppercase tracking-wider whitespace-nowrap"
                      style={{ ...TH_STYLE, ...GROUP_BORDER, color: "rgba(180,120,255,0.8)" }}
                    >
                      Moneyline
                    </th>
                  </tr>
                  {/* Column header row */}
                  <tr style={{ background: "rgba(57,255,20,0.08)" }}>
                    <th className="text-left px-3 py-2 font-bold uppercase tracking-wider whitespace-nowrap" style={TH_STYLE}>
                      Time (ET)
                    </th>
                    <th className="text-center px-2 py-2 font-bold uppercase tracking-wider whitespace-nowrap" style={TH_STYLE}>
                      Src
                    </th>
                    {/* Spread cols */}
                    <th className="text-center px-2 py-2 font-bold uppercase tracking-wider whitespace-nowrap" style={{ ...TH_STYLE, ...GROUP_BORDER }}>
                      Line
                    </th>
                    <th className="text-center px-2 py-2 font-bold uppercase tracking-wider whitespace-nowrap" style={TH_STYLE}>
                      {awayTeam} Tkts%
                    </th>
                    <th className="text-center px-2 py-2 font-bold uppercase tracking-wider whitespace-nowrap" style={TH_STYLE}>
                      {awayTeam} $%
                    </th>
                    {/* Total cols */}
                    <th className="text-center px-2 py-2 font-bold uppercase tracking-wider whitespace-nowrap" style={{ ...TH_STYLE, ...GROUP_BORDER }}>
                      Line
                    </th>
                    <th className="text-center px-2 py-2 font-bold uppercase tracking-wider whitespace-nowrap" style={TH_STYLE}>
                      Over Tkts%
                    </th>
                    <th className="text-center px-2 py-2 font-bold uppercase tracking-wider whitespace-nowrap" style={TH_STYLE}>
                      Over $%
                    </th>
                    {/* ML cols */}
                    <th className="text-center px-2 py-2 font-bold uppercase tracking-wider whitespace-nowrap" style={{ ...TH_STYLE, ...GROUP_BORDER }}>
                      Line
                    </th>
                    <th className="text-center px-2 py-2 font-bold uppercase tracking-wider whitespace-nowrap" style={TH_STYLE}>
                      {awayTeam} Tkts%
                    </th>
                    <th className="text-center px-2 py-2 font-bold uppercase tracking-wider whitespace-nowrap" style={TH_STYLE}>
                      {awayTeam} $%
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const isManual = row.source === "manual";
                    const isEven = idx % 2 === 0;
                    const spreadBothZero = row.spreadAwayBetsPct === 0 && row.spreadAwayMoneyPct === 0;
                    return (
                      <tr
                        key={row.id}
                        style={{
                          background: isEven
                            ? "rgba(255,255,255,0.02)"
                            : "transparent",
                          borderBottom: idx < rows.length - 1
                            ? "1px solid rgba(255,255,255,0.04)"
                            : "none",
                        }}
                      >
                        {/* EST timestamp */}
                        <td className="px-3 py-2 whitespace-nowrap font-mono" style={{ color: "rgba(255,255,255,0.75)" }}>
                          {fmtEst(row.scrapedAt)}
                        </td>

                        {/* Source badge */}
                        <td className="px-2 py-2 text-center">
                          <span
                            className="inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                            style={isManual
                              ? { background: "rgba(251,191,36,0.18)", color: "#FBB924", border: "1px solid rgba(251,191,36,0.35)" }
                              : { background: "rgba(57,255,20,0.1)", color: "#39FF14", border: "1px solid rgba(57,255,20,0.25)" }
                            }
                          >
                            {isManual ? "M" : "A"}
                          </span>
                        </td>

                        {/* ── Spread group ── */}
                        <td className="px-2 py-2 text-center font-mono whitespace-nowrap" style={{ color: "rgba(255,200,80,0.9)", borderLeft: "1px solid rgba(57,255,20,0.1)" }}>
                          {fmtSpread(row.awaySpread, row.awaySpreadOdds)}
                        </td>
                        <td className="px-2 py-2 text-center font-mono" style={{ color: spreadBothZero ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.85)" }}>
                          {spreadBothZero ? "—" : fmtPct(row.spreadAwayBetsPct)}
                        </td>
                        <td className="px-2 py-2 text-center font-mono" style={{ color: spreadBothZero ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.85)" }}>
                          {spreadBothZero ? "—" : fmtPct(row.spreadAwayMoneyPct)}
                        </td>

                        {/* ── Total group ── */}
                        <td className="px-2 py-2 text-center font-mono whitespace-nowrap" style={{ color: "rgba(80,200,255,0.9)", borderLeft: "1px solid rgba(57,255,20,0.1)" }}>
                          {fmtTotal(row.total, row.overOdds, row.underOdds)}
                        </td>
                        <td className="px-2 py-2 text-center font-mono" style={{ color: "rgba(255,255,255,0.85)" }}>
                          {fmtPct(row.totalOverBetsPct)}
                        </td>
                        <td className="px-2 py-2 text-center font-mono" style={{ color: "rgba(255,255,255,0.85)" }}>
                          {fmtPct(row.totalOverMoneyPct)}
                        </td>

                        {/* ── Moneyline group ── */}
                        <td className="px-2 py-2 text-center font-mono whitespace-nowrap" style={{ color: "rgba(180,120,255,0.9)", borderLeft: "1px solid rgba(57,255,20,0.1)" }}>
                          {fmtML(row.awayML, row.homeML)}
                        </td>
                        <td className="px-2 py-2 text-center font-mono" style={{ color: "rgba(255,255,255,0.85)" }}>
                          {fmtPct(row.mlAwayBetsPct)}
                        </td>
                        <td className="px-2 py-2 text-center font-mono" style={{ color: "rgba(255,255,255,0.85)" }}>
                          {fmtPct(row.mlAwayMoneyPct)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Legend */}
              <div className="flex items-center gap-4 px-3 py-2" style={{ borderTop: "1px solid rgba(57,255,20,0.08)" }}>
                <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Src: A=Auto (10-min) · M=Manual
                </span>
                <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                  Splits: — = market not yet open · Tkts% = tickets · $% = handle
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
