/**
 * OddsHistoryPanel
 *
 * Collapsible full-width panel rendered BELOW every game card (outside all
 * overflow:hidden containers). Displays a chronological timeline of every
 * DK NJ odds snapshot for the game, with EST timestamps, spread/total/ML
 * lines, and VSIN betting splits (tickets % + money %) side-by-side.
 *
 * Architecture:
 *   - Rendered at the GameCard level (not inside BettingSplitsPanel) so it
 *     can expand freely without being clipped by column overflow:hidden.
 *   - Lazy-loaded: only fetches data when the user expands the panel.
 *   - staleTime=30s: avoids redundant refetches during a session.
 *
 * Column layout per snapshot row (11 data columns):
 *   Time (ET) | Src | Spread Line | 🎟️ | 💰 |
 *   Total Line | 🎟️ | 💰 | ML Line | 🎟️ | 💰
 *
 * Emoji key:
 *   🎟️ = Tickets % (betting volume by number of bets)
 *   💰 = Money %  (betting volume by dollar handle)
 *
 * Timestamps: stored as UTC epoch ms in DB → displayed in Eastern Time.
 * Source badge: A = Auto (10-min scheduler) | M = Manual (Refresh Now button)
 * 0/0 guard: splits showing both 0 are treated as "market not yet open" → "—"
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Clock, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface OddsHistoryPanelProps {
  gameId: number;
  awayTeam: string;
  homeTeam: string;
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

/** Format a UTC epoch ms timestamp as Eastern time: "Apr 9, 11:41 AM EDT" */
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
  const tzAbbr =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      timeZoneName: "short",
    })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value ?? "ET";
  return `${datePart}, ${timePart} ${tzAbbr}`;
}

/** Format a spread value with its juice: "+3.5 (-118)" */
function fmtSpread(
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

/** Format a total: "o139.5 (-108) / u (-112)" */
function fmtTotal(
  total: string | null | undefined,
  over: string | null | undefined,
  under: string | null | undefined
): string {
  if (!total) return "—";
  const t = parseFloat(total);
  if (isNaN(t)) return total;
  const overStr = over ? `o${t} (${over})` : `o${t}`;
  const underStr = under ? `u (${under})` : "u";
  return `${overStr} / ${underStr}`;
}

/** Format a moneyline pair: "-145 / +125" */
function fmtML(
  away: string | null | undefined,
  home: string | null | undefined
): string {
  if (!away && !home) return "—";
  const a = away ?? "—";
  const h = home ?? "—";
  return `${a} / ${h}`;
}

/**
 * Format a percentage value as "##%" (integer, no decimals).
 * Returns "—" if null/undefined.
 * The 0/0 guard is applied at the row level — individual cells just format.
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
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  whiteSpace: "nowrap",
};

const GROUP_BORDER_L: React.CSSProperties = {
  borderLeft: "1px solid rgba(57,255,20,0.18)",
};

// ── Component ──────────────────────────────────────────────────────────────────

export function OddsHistoryPanel({
  gameId,
  awayTeam,
  homeTeam: _homeTeam,
}: OddsHistoryPanelProps) {
  const [open, setOpen] = useState(false);

  // Lazy-load: only fetch when panel is expanded
  const { data, isLoading, error } = trpc.oddsHistory.listForGame.useQuery(
    { gameId },
    {
      enabled: open,
      staleTime: 30_000,
    }
  );

  const rows = data?.history ?? [];

  // ── Structured logging ─────────────────────────────────────────────────────

  // Log when panel opens and data arrives
  if (open && !isLoading && !error && rows.length > 0) {
    logPanel(
      `[RENDER] gameId=${gameId} | rows=${rows.length} | ` +
        `latest=${fmtEst(rows[0]?.scrapedAt ?? 0)} | ` +
        `oldest=${fmtEst(rows[rows.length - 1]?.scrapedAt ?? 0)}`
    );
  }
  if (open && error) {
    logPanel(`[ERROR] gameId=${gameId} | ${error.message}`);
  }

  const handleToggle = () => {
    const next = !open;
    logPanel(
      `[TOGGLE] gameId=${gameId} | ${next ? "OPEN → fetching history" : "CLOSE"}`
    );
    setOpen(next);
  };

  return (
    <div
      className="border-t"
      style={{ borderColor: "rgba(57,255,20,0.15)" }}
    >
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
          {/* Snapshot count badge — only visible when rows are loaded */}
          {rows.length > 0 && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background: "rgba(57,255,20,0.15)",
                color: "#39FF14",
              }}
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
              <span className="text-xs">Loading history…</span>
            </div>
          ) : error ? (
            <p
              className="text-xs text-center py-4"
              style={{ color: "#ff4444" }}
            >
              Failed to load odds &amp; splits history.
            </p>
          ) : rows.length === 0 ? (
            <p
              className="text-xs text-center py-4"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              No snapshots yet — history will populate after the next 10-min
              refresh cycle.
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
                    <th
                      colSpan={2}
                      className="px-3 py-1 text-left"
                      style={TH_BASE}
                    />
                    {/* Spread group */}
                    <th
                      colSpan={3}
                      className="px-2 py-1 text-center"
                      style={{
                        ...TH_BASE,
                        ...GROUP_BORDER_L,
                        color: "rgba(255,200,80,0.85)",
                      }}
                    >
                      Spread / Run Line / Puck Line
                    </th>
                    {/* Total group */}
                    <th
                      colSpan={3}
                      className="px-2 py-1 text-center"
                      style={{
                        ...TH_BASE,
                        ...GROUP_BORDER_L,
                        color: "rgba(80,200,255,0.85)",
                      }}
                    >
                      Total (O/U)
                    </th>
                    {/* Moneyline group */}
                    <th
                      colSpan={3}
                      className="px-2 py-1 text-center"
                      style={{
                        ...TH_BASE,
                        ...GROUP_BORDER_L,
                        color: "rgba(180,120,255,0.85)",
                      }}
                    >
                      Moneyline
                    </th>
                  </tr>

                  {/* ── Column header row ── */}
                  <tr style={{ background: "rgba(57,255,20,0.08)" }}>
                    {/* Time */}
                    <th
                      className="text-left px-3 py-2"
                      style={TH_BASE}
                    >
                      Time (ET)
                    </th>
                    {/* Source */}
                    <th
                      className="text-center px-2 py-2"
                      style={TH_BASE}
                    >
                      Src
                    </th>

                    {/* ── Spread cols ── */}
                    <th
                      className="text-center px-2 py-2"
                      style={{ ...TH_BASE, ...GROUP_BORDER_L }}
                    >
                      Line
                    </th>
                    <th
                      className="text-center px-2 py-2"
                      style={TH_BASE}
                      title={`${awayTeam} tickets %`}
                    >
                      {awayTeam}&nbsp;🎟️
                    </th>
                    <th
                      className="text-center px-2 py-2"
                      style={TH_BASE}
                      title={`${awayTeam} money %`}
                    >
                      {awayTeam}&nbsp;💰
                    </th>

                    {/* ── Total cols ── */}
                    <th
                      className="text-center px-2 py-2"
                      style={{ ...TH_BASE, ...GROUP_BORDER_L }}
                    >
                      Line
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

                    {/* ── ML cols ── */}
                    <th
                      className="text-center px-2 py-2"
                      style={{ ...TH_BASE, ...GROUP_BORDER_L }}
                    >
                      Line
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
                  </tr>
                </thead>

                <tbody>
                  {rows.map((row, idx) => {
                    const isManual = row.source === "manual";
                    const isEven = idx % 2 === 0;

                    // 0/0 guard: if both tickets AND money are 0 → market not yet open
                    const spreadBothZero =
                      (row.spreadAwayBetsPct === 0 ||
                        row.spreadAwayBetsPct == null) &&
                      (row.spreadAwayMoneyPct === 0 ||
                        row.spreadAwayMoneyPct == null);
                    const totalBothZero =
                      (row.totalOverBetsPct === 0 ||
                        row.totalOverBetsPct == null) &&
                      (row.totalOverMoneyPct === 0 ||
                        row.totalOverMoneyPct == null);
                    const mlBothZero =
                      (row.mlAwayBetsPct === 0 || row.mlAwayBetsPct == null) &&
                      (row.mlAwayMoneyPct === 0 || row.mlAwayMoneyPct == null);

                    return (
                      <tr
                        key={row.id}
                        style={{
                          background: isEven
                            ? "rgba(255,255,255,0.02)"
                            : "transparent",
                          borderBottom:
                            idx < rows.length - 1
                              ? "1px solid rgba(255,255,255,0.04)"
                              : "none",
                        }}
                      >
                        {/* ── EST timestamp ── */}
                        <td
                          className="px-3 py-2 whitespace-nowrap font-mono"
                          style={{ color: "rgba(255,255,255,0.75)" }}
                        >
                          {fmtEst(row.scrapedAt)}
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
                                    border:
                                      "1px solid rgba(251,191,36,0.35)",
                                  }
                                : {
                                    background: "rgba(57,255,20,0.1)",
                                    color: "#39FF14",
                                    border:
                                      "1px solid rgba(57,255,20,0.25)",
                                  }
                            }
                          >
                            {isManual ? "M" : "A"}
                          </span>
                        </td>

                        {/* ── Spread group ── */}
                        <td
                          className="px-2 py-2 text-center font-mono whitespace-nowrap"
                          style={{
                            color: "rgba(255,200,80,0.9)",
                            borderLeft: "1px solid rgba(57,255,20,0.1)",
                          }}
                        >
                          {fmtSpread(row.awaySpread, row.awaySpreadOdds)}
                        </td>
                        <td
                          className="px-2 py-2 text-center font-mono"
                          style={{
                            color: spreadBothZero
                              ? "rgba(255,255,255,0.25)"
                              : "rgba(255,255,255,0.9)",
                          }}
                        >
                          {spreadBothZero
                            ? "—"
                            : fmtPct(row.spreadAwayBetsPct)}
                        </td>
                        <td
                          className="px-2 py-2 text-center font-mono"
                          style={{
                            color: spreadBothZero
                              ? "rgba(255,255,255,0.25)"
                              : "rgba(255,255,255,0.9)",
                          }}
                        >
                          {spreadBothZero
                            ? "—"
                            : fmtPct(row.spreadAwayMoneyPct)}
                        </td>

                        {/* ── Total group ── */}
                        <td
                          className="px-2 py-2 text-center font-mono whitespace-nowrap"
                          style={{
                            color: "rgba(80,200,255,0.9)",
                            borderLeft: "1px solid rgba(57,255,20,0.1)",
                          }}
                        >
                          {fmtTotal(row.total, row.overOdds, row.underOdds)}
                        </td>
                        <td
                          className="px-2 py-2 text-center font-mono"
                          style={{
                            color: totalBothZero
                              ? "rgba(255,255,255,0.25)"
                              : "rgba(255,255,255,0.9)",
                          }}
                        >
                          {totalBothZero ? "—" : fmtPct(row.totalOverBetsPct)}
                        </td>
                        <td
                          className="px-2 py-2 text-center font-mono"
                          style={{
                            color: totalBothZero
                              ? "rgba(255,255,255,0.25)"
                              : "rgba(255,255,255,0.9)",
                          }}
                        >
                          {totalBothZero
                            ? "—"
                            : fmtPct(row.totalOverMoneyPct)}
                        </td>

                        {/* ── Moneyline group ── */}
                        <td
                          className="px-2 py-2 text-center font-mono whitespace-nowrap"
                          style={{
                            color: "rgba(180,120,255,0.9)",
                            borderLeft: "1px solid rgba(57,255,20,0.1)",
                          }}
                        >
                          {fmtML(row.awayML, row.homeML)}
                        </td>
                        <td
                          className="px-2 py-2 text-center font-mono"
                          style={{
                            color: mlBothZero
                              ? "rgba(255,255,255,0.25)"
                              : "rgba(255,255,255,0.9)",
                          }}
                        >
                          {mlBothZero ? "—" : fmtPct(row.mlAwayBetsPct)}
                        </td>
                        <td
                          className="px-2 py-2 text-center font-mono"
                          style={{
                            color: mlBothZero
                              ? "rgba(255,255,255,0.25)"
                              : "rgba(255,255,255,0.9)",
                          }}
                        >
                          {mlBothZero ? "—" : fmtPct(row.mlAwayMoneyPct)}
                        </td>
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
                <span
                  className="text-[9px]"
                  style={{ color: "rgba(255,255,255,0.25)" }}
                >
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
