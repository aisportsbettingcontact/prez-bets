/**
 * OddsHistoryPanel
 *
 * Collapsible full-width panel rendered BELOW every game card (outside all
 * overflow:hidden containers). Displays a chronological timeline of every
 * odds snapshot for the game, with timestamps, lines, and VSIN betting splits.
 *
 * Architecture:
 *   - Rendered at the GameCard level so it can expand freely without clipping.
 *   - Lazy-loaded: only fetches data when the user expands the panel.
 *   - staleTime=30s: avoids redundant refetches during a session.
 *   - activeMarket prop: mirrors the SPREAD/TOTAL/MONEYLINE toggle in the
 *     BettingSplitsPanel — only the selected market's columns are shown.
 *
 * Market column layout:
 *   SPREAD:    Time | Src | Away Spread+Odds | Home Spread+Odds | Away🎟️ | Away💰
 *   TOTAL:     Time | Src | Over Line+Odds   | Under Line+Odds  | Over🎟️ | Over💰
 *   MONEYLINE: Time | Src | Away ML          | Home ML          | Away🎟️ | Away💰
 *
 * Timestamp format: DD/MM HH:MM AM/PM EST (e.g., "10/04 12:20 AM EDT")
 *
 * Emoji key:
 *   🎟️ = Tickets % (betting volume by number of bets)
 *   💰 = Money %  (betting volume by dollar handle)
 *
 * 0/0 guard: splits where both tickets AND money are 0 or null are treated
 * as "market not yet open" and displayed as "—" to avoid misleading zeros.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Clock, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";

export type ActiveMarket = "spread" | "total" | "ml";

interface OddsHistoryPanelProps {
  gameId: number;
  awayTeam: string;
  homeTeam: string;
  /** Mirrors the SPREAD/TOTAL/MONEYLINE toggle from BettingSplitsPanel */
  activeMarket: ActiveMarket;
}

// ── Logging helpers ────────────────────────────────────────────────────────────

function logPanel(msg: string, data?: unknown) {
  if (data !== undefined) {
    console.log(`[OddsHistoryPanel] ${msg}`, data);
  } else {
    console.log(`[OddsHistoryPanel] ${msg}`);
  }
}

// ── Formatters ─────────────────────────────────────────────────────────────────

/**
 * Format a UTC epoch ms timestamp as: DD/MM HH:MM AM/PM TZ
 * Example: "10/04 12:20 AM EDT"
 */
function fmtTimestamp(epochMs: number): string {
  const d = new Date(epochMs);

  // Day and month in DD/MM format (Eastern time)
  const day = d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    day: "2-digit",
  });
  const month = d.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "2-digit",
  });

  // Time in HH:MM AM/PM
  const timePart = d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  // Timezone abbreviation (EST or EDT)
  const tzAbbr =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      timeZoneName: "short",
    })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value ?? "ET";

  return `${day}/${month} ${timePart} ${tzAbbr}`;
}

/** Format a spread value with its juice: "+1.5 (-163)" */
function fmtSpreadWithOdds(
  value: string | null | undefined,
  odds: string | null | undefined
): string {
  if (!value) return "—";
  const v = parseFloat(value);
  if (isNaN(v)) return value;
  const sign = v > 0 ? "+" : "";
  const line = `${sign}${v}`;
  if (!odds) return line;
  return `${line} (${odds})`;
}

/** Format a total side: "o8.5 (-115)" or "u (-105)" */
function fmtOverWithOdds(
  total: string | null | undefined,
  odds: string | null | undefined
): string {
  if (!total) return "—";
  const t = parseFloat(total);
  if (isNaN(t)) return total;
  const base = `o${t}`;
  return odds ? `${base} (${odds})` : base;
}

function fmtUnderWithOdds(
  total: string | null | undefined,
  odds: string | null | undefined
): string {
  if (!total) return "—";
  const t = parseFloat(total);
  if (isNaN(t)) return total;
  const base = `u${t}`;
  return odds ? `${base} (${odds})` : base;
}

/** Format a moneyline: "-149" or "+123" */
function fmtML(val: string | null | undefined): string {
  if (!val) return "—";
  return val;
}

/**
 * Format a percentage value as "##%" (integer, no decimals).
 * Returns "—" if null/undefined.
 */
function fmtPct(val: number | null | undefined): string {
  if (val == null) return "—";
  return `${Math.round(val)}%`;
}

// ── Shared cell styles ─────────────────────────────────────────────────────────

const TH_BASE: React.CSSProperties = {
  color: "rgba(255,255,255,0.55)",
  borderBottom: "1px solid rgba(57,255,20,0.12)",
  fontWeight: 700,
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  whiteSpace: "nowrap" as const,
};

const GROUP_BORDER_L: React.CSSProperties = {
  borderLeft: "1px solid rgba(57,255,20,0.18)",
};

const CELL_BORDER_L: React.CSSProperties = {
  borderLeft: "1px solid rgba(57,255,20,0.1)",
};

// ── Market color map ───────────────────────────────────────────────────────────

const MARKET_COLOR: Record<ActiveMarket, string> = {
  spread: "rgba(255,200,80,0.9)",
  total:  "rgba(80,200,255,0.9)",
  ml:     "rgba(180,120,255,0.9)",
};

const MARKET_LABEL: Record<ActiveMarket, string> = {
  spread: "Spread / Run Line / Puck Line",
  total:  "Total (O/U)",
  ml:     "Moneyline",
};

// ── Component ──────────────────────────────────────────────────────────────────

export function OddsHistoryPanel({
  gameId,
  awayTeam,
  homeTeam,
  activeMarket,
}: OddsHistoryPanelProps) {
  const [open, setOpen] = useState(false);

  // Lazy-load: only fetch when panel is expanded
  const { data, isLoading, error } = trpc.oddsHistory.listForGame.useQuery(
    { gameId },
    { enabled: open, staleTime: 30_000 }
  );

  const rows = data?.history ?? [];

  // ── Structured logging ─────────────────────────────────────────────────────

  if (open && !isLoading && !error && rows.length > 0) {
    logPanel(
      `[RENDER] gameId=${gameId} activeMarket=${activeMarket} rows=${rows.length} | ` +
        `latest=${fmtTimestamp(rows[0]?.scrapedAt ?? 0)} | ` +
        `oldest=${fmtTimestamp(rows[rows.length - 1]?.scrapedAt ?? 0)}`
    );
  }
  if (open && error) {
    logPanel(`[ERROR] gameId=${gameId} | ${error.message}`);
  }

  const handleToggle = () => {
    const next = !open;
    logPanel(
      `[TOGGLE] gameId=${gameId} activeMarket=${activeMarket} | ${next ? "OPEN -> fetching" : "CLOSE"}`
    );
    setOpen(next);
  };

  // ── Column definitions per market ──────────────────────────────────────────

  const marketColor = MARKET_COLOR[activeMarket];
  const marketLabel = MARKET_LABEL[activeMarket];

  return (
    <div className="border-t" style={{ borderColor: "rgba(57,255,20,0.15)" }}>
      {/* ── Toggle header ── */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors"
        aria-expanded={open}
        aria-label={`${open ? "Collapse" : "Expand"} odds & splits history for ${awayTeam}`}
      >
        <div className="flex items-center gap-2">
          <Clock size={13} style={{ color: "#39FF14" }} />
          <span
            className="text-[11px] font-black uppercase tracking-[0.18em]"
            style={{ color: "#39FF14" }}
          >
            Odds &amp; Splits History
          </span>
          {/* Active market badge */}
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider"
            style={{ background: `${marketColor}22`, color: marketColor, border: `1px solid ${marketColor}55` }}
          >
            {activeMarket === "spread" ? "SPREAD" : activeMarket === "total" ? "TOTAL" : "ML"}
          </span>
          {/* Snapshot count badge */}
          {rows.length > 0 && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(57,255,20,0.15)", color: "#39FF14" }}
            >
              {rows.length}
            </span>
          )}
        </div>
        {open ? (
          <ChevronUp size={14} style={{ color: "#39FF14" }} />
        ) : (
          <ChevronDown size={14} style={{ color: "rgba(57,255,20,0.6)" }} />
        )}
      </button>

      {/* ── Expanded table ── */}
      {open && (
        <div className="px-2 pb-3">
          {isLoading ? (
            <div
              className="flex items-center justify-center py-6 gap-2"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              <RefreshCw size={13} className="animate-spin" />
              <span className="text-xs">Loading history...</span>
            </div>
          ) : error ? (
            <p className="text-xs text-center py-4" style={{ color: "#ff4444" }}>
              Failed to load odds &amp; splits history.
            </p>
          ) : rows.length === 0 ? (
            <p
              className="text-xs text-center py-4"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              No snapshots yet — history will populate after the next 10-min refresh cycle.
            </p>
          ) : (
            <div
              className="overflow-x-auto rounded-md"
              style={{ border: "1px solid rgba(57,255,20,0.12)" }}
            >
              <table
                className="w-full text-[10px]"
                style={{ borderCollapse: "collapse" }}
              >
                <thead>
                  {/* ── Group header row ── */}
                  <tr style={{ background: "rgba(57,255,20,0.05)" }}>
                    {/* Time + Src spacer */}
                    <th colSpan={2} className="px-3 py-1 text-left" style={TH_BASE} />
                    {/* Market group header — spans all market columns */}
                    {activeMarket === "spread" && (
                      <th
                        colSpan={4}
                        className="px-2 py-1 text-center"
                        style={{ ...TH_BASE, ...GROUP_BORDER_L, color: marketColor }}
                      >
                        {marketLabel}
                      </th>
                    )}
                    {activeMarket === "total" && (
                      <th
                        colSpan={4}
                        className="px-2 py-1 text-center"
                        style={{ ...TH_BASE, ...GROUP_BORDER_L, color: marketColor }}
                      >
                        {marketLabel}
                      </th>
                    )}
                    {activeMarket === "ml" && (
                      <th
                        colSpan={4}
                        className="px-2 py-1 text-center"
                        style={{ ...TH_BASE, ...GROUP_BORDER_L, color: marketColor }}
                      >
                        {marketLabel}
                      </th>
                    )}
                  </tr>

                  {/* ── Column header row ── */}
                  <tr style={{ background: "rgba(57,255,20,0.08)" }}>
                    <th className="text-left px-3 py-2" style={TH_BASE}>
                      Time (ET)
                    </th>
                    <th className="text-center px-2 py-2" style={TH_BASE}>
                      Src
                    </th>

                    {/* SPREAD columns: Away Line+Odds | Home Line+Odds | Away🎟️ | Away💰 */}
                    {activeMarket === "spread" && (
                      <>
                        <th
                          className="text-center px-2 py-2"
                          style={{ ...TH_BASE, ...GROUP_BORDER_L, color: marketColor }}
                          title={`${awayTeam} spread + juice`}
                        >
                          {awayTeam} Line
                        </th>
                        <th
                          className="text-center px-2 py-2"
                          style={{ ...TH_BASE, color: marketColor }}
                          title={`${homeTeam} spread + juice`}
                        >
                          {homeTeam} Line
                        </th>
                        <th
                          className="text-center px-2 py-2"
                          style={TH_BASE}
                          title={`${awayTeam} spread tickets %`}
                        >
                          {awayTeam}&nbsp;🎟️
                        </th>
                        <th
                          className="text-center px-2 py-2"
                          style={TH_BASE}
                          title={`${awayTeam} spread money %`}
                        >
                          {awayTeam}&nbsp;💰
                        </th>
                      </>
                    )}

                    {/* TOTAL columns: Over Line+Odds | Under Line+Odds | Over🎟️ | Over💰 */}
                    {activeMarket === "total" && (
                      <>
                        <th
                          className="text-center px-2 py-2"
                          style={{ ...TH_BASE, ...GROUP_BORDER_L, color: marketColor }}
                          title="Over line + juice"
                        >
                          Over Line
                        </th>
                        <th
                          className="text-center px-2 py-2"
                          style={{ ...TH_BASE, color: marketColor }}
                          title="Under line + juice"
                        >
                          Under Line
                        </th>
                        <th
                          className="text-center px-2 py-2"
                          style={TH_BASE}
                          title="Over tickets %"
                        >
                          Over&nbsp;🎟️
                        </th>
                        <th
                          className="text-center px-2 py-2"
                          style={TH_BASE}
                          title="Over money %"
                        >
                          Over&nbsp;💰
                        </th>
                      </>
                    )}

                    {/* ML columns: Away ML | Home ML | Away🎟️ | Away💰 */}
                    {activeMarket === "ml" && (
                      <>
                        <th
                          className="text-center px-2 py-2"
                          style={{ ...TH_BASE, ...GROUP_BORDER_L, color: marketColor }}
                          title={`${awayTeam} moneyline`}
                        >
                          {awayTeam} ML
                        </th>
                        <th
                          className="text-center px-2 py-2"
                          style={{ ...TH_BASE, color: marketColor }}
                          title={`${homeTeam} moneyline`}
                        >
                          {homeTeam} ML
                        </th>
                        <th
                          className="text-center px-2 py-2"
                          style={TH_BASE}
                          title={`${awayTeam} ML tickets %`}
                        >
                          {awayTeam}&nbsp;🎟️
                        </th>
                        <th
                          className="text-center px-2 py-2"
                          style={TH_BASE}
                          title={`${awayTeam} ML money %`}
                        >
                          {awayTeam}&nbsp;💰
                        </th>
                      </>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row, idx) => {
                    const isManual = row.source === "manual";
                    const isEven = idx % 2 === 0;

                    // 0/0 guard per market
                    const spreadPending =
                      (row.spreadAwayBetsPct == null || row.spreadAwayBetsPct === 0) &&
                      (row.spreadAwayMoneyPct == null || row.spreadAwayMoneyPct === 0);
                    const totalPending =
                      (row.totalOverBetsPct == null || row.totalOverBetsPct === 0) &&
                      (row.totalOverMoneyPct == null || row.totalOverMoneyPct === 0);
                    const mlPending =
                      (row.mlAwayBetsPct == null || row.mlAwayBetsPct === 0) &&
                      (row.mlAwayMoneyPct == null || row.mlAwayMoneyPct === 0);

                    return (
                      <tr
                        key={row.id}
                        style={{
                          background: isEven ? "rgba(255,255,255,0.02)" : "transparent",
                          borderBottom:
                            idx < rows.length - 1
                              ? "1px solid rgba(255,255,255,0.04)"
                              : "none",
                        }}
                      >
                        {/* ── Timestamp: DD/MM HH:MM AM/PM TZ ── */}
                        <td
                          className="px-3 py-2 whitespace-nowrap font-mono"
                          style={{ color: "rgba(255,255,255,0.75)" }}
                        >
                          {fmtTimestamp(row.scrapedAt)}
                        </td>

                        {/* ── Source badge ── */}
                        <td className="px-2 py-2 text-center">
                          <span
                            className="inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                            style={
                              isManual
                                ? {
                                    background: "rgba(251,191,36,0.18)",
                                    color: "#FBB924",
                                    border: "1px solid rgba(251,191,36,0.35)",
                                  }
                                : {
                                    background: "rgba(57,255,20,0.1)",
                                    color: "#39FF14",
                                    border: "1px solid rgba(57,255,20,0.25)",
                                  }
                            }
                          >
                            {isManual ? "M" : "A"}
                          </span>
                        </td>

                        {/* ── SPREAD market cells ── */}
                        {activeMarket === "spread" && (
                          <>
                            {/* Away spread + odds */}
                            <td
                              className="px-2 py-2 text-center font-mono whitespace-nowrap"
                              style={{ color: marketColor, ...CELL_BORDER_L }}
                            >
                              {fmtSpreadWithOdds(row.awaySpread, row.awaySpreadOdds)}
                            </td>
                            {/* Home spread + odds */}
                            <td
                              className="px-2 py-2 text-center font-mono whitespace-nowrap"
                              style={{ color: marketColor }}
                            >
                              {fmtSpreadWithOdds(row.homeSpread, row.homeSpreadOdds)}
                            </td>
                            {/* Away tickets % */}
                            <td
                              className="px-2 py-2 text-center font-mono"
                              style={{
                                color: spreadPending
                                  ? "rgba(255,255,255,0.25)"
                                  : "rgba(255,255,255,0.9)",
                              }}
                            >
                              {spreadPending ? "—" : fmtPct(row.spreadAwayBetsPct)}
                            </td>
                            {/* Away money % */}
                            <td
                              className="px-2 py-2 text-center font-mono"
                              style={{
                                color: spreadPending
                                  ? "rgba(255,255,255,0.25)"
                                  : "rgba(255,255,255,0.9)",
                              }}
                            >
                              {spreadPending ? "—" : fmtPct(row.spreadAwayMoneyPct)}
                            </td>
                          </>
                        )}

                        {/* ── TOTAL market cells ── */}
                        {activeMarket === "total" && (
                          <>
                            {/* Over line + odds */}
                            <td
                              className="px-2 py-2 text-center font-mono whitespace-nowrap"
                              style={{ color: marketColor, ...CELL_BORDER_L }}
                            >
                              {fmtOverWithOdds(row.total, row.overOdds)}
                            </td>
                            {/* Under line + odds */}
                            <td
                              className="px-2 py-2 text-center font-mono whitespace-nowrap"
                              style={{ color: marketColor }}
                            >
                              {fmtUnderWithOdds(row.total, row.underOdds)}
                            </td>
                            {/* Over tickets % */}
                            <td
                              className="px-2 py-2 text-center font-mono"
                              style={{
                                color: totalPending
                                  ? "rgba(255,255,255,0.25)"
                                  : "rgba(255,255,255,0.9)",
                              }}
                            >
                              {totalPending ? "—" : fmtPct(row.totalOverBetsPct)}
                            </td>
                            {/* Over money % */}
                            <td
                              className="px-2 py-2 text-center font-mono"
                              style={{
                                color: totalPending
                                  ? "rgba(255,255,255,0.25)"
                                  : "rgba(255,255,255,0.9)",
                              }}
                            >
                              {totalPending ? "—" : fmtPct(row.totalOverMoneyPct)}
                            </td>
                          </>
                        )}

                        {/* ── MONEYLINE market cells ── */}
                        {activeMarket === "ml" && (
                          <>
                            {/* Away ML */}
                            <td
                              className="px-2 py-2 text-center font-mono whitespace-nowrap"
                              style={{ color: marketColor, ...CELL_BORDER_L }}
                            >
                              {fmtML(row.awayML)}
                            </td>
                            {/* Home ML */}
                            <td
                              className="px-2 py-2 text-center font-mono whitespace-nowrap"
                              style={{ color: marketColor }}
                            >
                              {fmtML(row.homeML)}
                            </td>
                            {/* Away tickets % */}
                            <td
                              className="px-2 py-2 text-center font-mono"
                              style={{
                                color: mlPending
                                  ? "rgba(255,255,255,0.25)"
                                  : "rgba(255,255,255,0.9)",
                              }}
                            >
                              {mlPending ? "—" : fmtPct(row.mlAwayBetsPct)}
                            </td>
                            {/* Away money % */}
                            <td
                              className="px-2 py-2 text-center font-mono"
                              style={{
                                color: mlPending
                                  ? "rgba(255,255,255,0.25)"
                                  : "rgba(255,255,255,0.9)",
                              }}
                            >
                              {mlPending ? "—" : fmtPct(row.mlAwayMoneyPct)}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* ── Legend ── */}
              <div
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2"
                style={{ borderTop: "1px solid rgba(57,255,20,0.08)" }}
              >
                <span
                  className="text-[9px] font-bold uppercase tracking-wider"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                >
                  Src: A = Auto (10-min) · M = Manual (Refresh Now)
                </span>
                <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                  🎟️ = Tickets % · 💰 = Money % · — = market not yet open
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
