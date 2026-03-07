/**
 * BettingSplitsPanel
 *
 * DraftKings-style betting splits display for NCAAM and NBA games.
 *
 * Layout:
 *   - Team header: AWAY XX% ←→ YY% HOME (showing Handle/money%)
 *   - Per market (Spread, Total, and NBA-only Moneyline):
 *       • Handle % row (primary sharp-money signal) — colored bar
 *       • Bets % row (public ticket count) — muted bar
 *
 * NCAAM: Spread + Total only (no ML)
 * NBA:   Spread + Total + Moneyline
 */

interface BettingSplitsPanelProps {
  game: {
    sport: string | null;
    awayTeam: string;
    homeTeam: string;
    awayBookSpread?: string | null;
    homeBookSpread?: string | null;
    bookTotal?: string | null;
    spreadAwayBetsPct: number | null | undefined;
    spreadAwayMoneyPct: number | null | undefined;
    totalOverBetsPct: number | null | undefined;
    totalOverMoneyPct: number | null | undefined;
    mlAwayBetsPct: number | null | undefined;
    mlAwayMoneyPct: number | null | undefined;
    awayML: string | null | undefined;
    homeML: string | null | undefined;
  };
  awayLabel: string;   // e.g. "Arkansas" or "Magic"
  homeLabel: string;   // e.g. "Missouri" or "Timberwolves"
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function spreadSign(n: number): string {
  if (n === 0) return "PK";
  return n > 0 ? `+${n}` : `${n}`;
}

function toNum(v: string | null | undefined): number {
  if (v == null) return NaN;
  const n = parseFloat(v);
  return isNaN(n) ? NaN : n;
}

// ── SplitBar ─────────────────────────────────────────────────────────────────

interface SplitBarProps {
  /** Percentage for the left (away/over) side — 0-100 */
  pct: number | null | undefined;
  /** Bar fill color */
  accentColor: string;
  /** Row label shown in center, e.g. "Handle" or "Bets" */
  rowLabel: string;
  /** Left side label, e.g. "ARK +2.5" */
  leftLabel: string;
  /** Right side label, e.g. "MIZZ -2.5" */
  rightLabel: string;
  /** Whether this is the primary (Handle) row — larger text */
  primary?: boolean;
}

function SplitBar({ pct, accentColor, rowLabel, leftLabel, rightLabel, primary = false }: SplitBarProps) {
  const left = pct ?? null;
  const right = left !== null ? 100 - left : null;
  const hasData = left !== null && right !== null;

  const leftLeads = hasData && left > right;
  const rightLeads = hasData && right > left;

  const pctSize = primary ? "text-[13px]" : "text-[11px]";
  const labelSize = primary ? "text-[9px]" : "text-[8px]";
  const barHeight = primary ? 5 : 3;

  return (
    <div className="flex flex-col gap-0.5">
      {/* Pct + label row */}
      <div className="flex items-center justify-between gap-1">
        {/* Left */}
        <div className="flex items-baseline gap-1" style={{ minWidth: 0, flex: "0 0 auto", maxWidth: "40%" }}>
          {hasData && (
            <span
              className={`${pctSize} font-bold tabular-nums leading-none`}
              style={{ color: leftLeads ? accentColor : "hsl(var(--muted-foreground))" }}
            >
              {left}%
            </span>
          )}
          <span
            className={`${labelSize} truncate`}
            style={{ color: "hsl(var(--muted-foreground))", opacity: 0.55 }}
          >
            {leftLabel}
          </span>
        </div>

        {/* Center label */}
        <span
          className="text-[8px] uppercase tracking-widest text-center"
          style={{ color: "hsl(var(--muted-foreground))", opacity: primary ? 0.6 : 0.4, flex: "1 1 auto" }}
        >
          {rowLabel}
        </span>

        {/* Right */}
        <div className="flex items-baseline gap-1 justify-end" style={{ minWidth: 0, flex: "0 0 auto", maxWidth: "40%" }}>
          <span
            className={`${labelSize} truncate text-right`}
            style={{ color: "hsl(var(--muted-foreground))", opacity: 0.55 }}
          >
            {rightLabel}
          </span>
          {hasData && (
            <span
              className={`${pctSize} font-bold tabular-nums leading-none`}
              style={{ color: rightLeads ? "#FF6B6B" : "hsl(var(--muted-foreground))" }}
            >
              {right}%
            </span>
          )}
        </div>
      </div>

      {/* Bar */}
      {hasData ? (
        <div
          className="relative w-full rounded-full overflow-hidden"
          style={{ height: barHeight, background: "rgba(255,255,255,0.07)" }}
        >
          <div
            className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
            style={{ width: `${left}%`, background: accentColor, opacity: primary ? 0.9 : 0.5 }}
          />
        </div>
      ) : (
        <div
          className="w-full rounded-full"
          style={{ height: barHeight, background: "rgba(255,255,255,0.05)" }}
        />
      )}
    </div>
  );
}

// ── MarketSection ─────────────────────────────────────────────────────────────

interface MarketSectionProps {
  title: string;
  titleColor: string;
  moneyPct: number | null | undefined;
  betsPct: number | null | undefined;
  accentColor: string;
  leftMoneyLabel: string;
  rightMoneyLabel: string;
  leftBetsLabel: string;
  rightBetsLabel: string;
}

function MarketSection({
  title, titleColor,
  moneyPct, betsPct, accentColor,
  leftMoneyLabel, rightMoneyLabel,
  leftBetsLabel, rightBetsLabel,
}: MarketSectionProps) {
  const hasAny = moneyPct != null || betsPct != null;
  if (!hasAny) return null;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Market title */}
      <div className="flex items-center gap-1.5">
        <span
          className="text-[8px] uppercase tracking-widest font-bold"
          style={{ color: titleColor, opacity: 0.8 }}
        >
          {title}
        </span>
        <div className="flex-1" style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />
      </div>

      {/* Handle % (primary) */}
      {moneyPct != null && (
        <SplitBar
          pct={moneyPct}
          accentColor={accentColor}
          rowLabel="Handle"
          leftLabel={leftMoneyLabel}
          rightLabel={rightMoneyLabel}
          primary
        />
      )}

      {/* Bets % (secondary) */}
      {betsPct != null && (
        <SplitBar
          pct={betsPct}
          accentColor={accentColor}
          rowLabel="Bets"
          leftLabel={leftBetsLabel}
          rightLabel={rightBetsLabel}
          primary={false}
        />
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function BettingSplitsPanel({ game, awayLabel, homeLabel }: BettingSplitsPanelProps) {
  const isNba = game.sport === "NBA";

  const hasSpreadSplits = game.spreadAwayMoneyPct != null || game.spreadAwayBetsPct != null;
  const hasTotalSplits = game.totalOverMoneyPct != null || game.totalOverBetsPct != null;
  const hasMlSplits = isNba && (game.mlAwayMoneyPct != null || game.mlAwayBetsPct != null);
  const hasAnySplits = hasSpreadSplits || hasTotalSplits || hasMlSplits;

  // Spread values for inline labels
  const awaySpread = toNum(game.awayBookSpread);
  const homeSpread = toNum(game.homeBookSpread);
  const bookTotal = toNum(game.bookTotal);

  const awaySpreadStr = !isNaN(awaySpread) ? spreadSign(awaySpread) : "";
  const homeSpreadStr = !isNaN(homeSpread) ? spreadSign(homeSpread) : "";
  const totalStr = !isNaN(bookTotal) ? `${bookTotal}` : "";

  // Header percentage (spread Handle% is the primary sharp signal)
  const headerPct = game.spreadAwayMoneyPct ?? game.spreadAwayBetsPct ?? null;

  if (!hasAnySplits) {
    return (
      <div
        className="px-3 py-3 flex items-center justify-center"
        style={{ borderTop: "1px solid hsl(var(--border) / 0.3)" }}
      >
        <span className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))", opacity: 0.4 }}>
          Splits not yet available
        </span>
      </div>
    );
  }

  return (
    <div
      className="px-3 pt-3 pb-3 flex flex-col gap-3"
      style={{ borderTop: "1px solid hsl(var(--border) / 0.3)" }}
    >
      {/* ── Team header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        {/* Away side */}
        <div className="flex items-baseline gap-1.5" style={{ minWidth: 0, flex: "0 0 auto" }}>
          {headerPct != null && (
            <span
              className="text-[16px] font-extrabold tabular-nums leading-none"
              style={{ color: "#39FF14" }}
            >
              {headerPct}%
            </span>
          )}
          <span
            className="text-[10px] font-bold uppercase tracking-wide truncate"
            style={{ color: "hsl(var(--foreground))", maxWidth: 80 }}
          >
            {awayLabel}
          </span>
        </div>

        {/* Center */}
        <span
          className="text-[8px] uppercase tracking-widest text-center"
          style={{ color: "hsl(var(--muted-foreground))", opacity: 0.45, flex: "1 1 auto" }}
        >
          % of handle
        </span>

        {/* Home side */}
        <div className="flex items-baseline gap-1.5 justify-end" style={{ minWidth: 0, flex: "0 0 auto" }}>
          <span
            className="text-[10px] font-bold uppercase tracking-wide truncate text-right"
            style={{ color: "hsl(var(--foreground))", maxWidth: 80 }}
          >
            {homeLabel}
          </span>
          {headerPct != null && (
            <span
              className="text-[16px] font-extrabold tabular-nums leading-none"
              style={{ color: "#FF6B6B" }}
            >
              {100 - headerPct}%
            </span>
          )}
        </div>
      </div>

      {/* ── NBA only: Moneyline ──────────────────────────────────────────── */}
      {isNba && hasMlSplits && (
        <MarketSection
          title="Moneyline"
          titleColor="#A78BFA"
          moneyPct={game.mlAwayMoneyPct}
          betsPct={game.mlAwayBetsPct}
          accentColor="#A78BFA"
          leftMoneyLabel={`${awayLabel}${game.awayML ? ` ${game.awayML}` : ""}`}
          rightMoneyLabel={`${game.homeML ? `${game.homeML} ` : ""}${homeLabel}`}
          leftBetsLabel={awayLabel}
          rightBetsLabel={homeLabel}
        />
      )}

      {/* ── Spread ──────────────────────────────────────────────────────── */}
      {hasSpreadSplits && (
        <MarketSection
          title="Spread"
          titleColor="#39FF14"
          moneyPct={game.spreadAwayMoneyPct}
          betsPct={game.spreadAwayBetsPct}
          accentColor="#39FF14"
          leftMoneyLabel={`${awayLabel}${awaySpreadStr ? ` ${awaySpreadStr}` : ""}`}
          rightMoneyLabel={`${homeSpreadStr ? `${homeSpreadStr} ` : ""}${homeLabel}`}
          leftBetsLabel={`${awayLabel}${awaySpreadStr ? ` ${awaySpreadStr}` : ""}`}
          rightBetsLabel={`${homeSpreadStr ? `${homeSpreadStr} ` : ""}${homeLabel}`}
        />
      )}

      {/* ── Total ───────────────────────────────────────────────────────── */}
      {hasTotalSplits && (
        <MarketSection
          title="Total"
          titleColor="#FFB800"
          moneyPct={game.totalOverMoneyPct}
          betsPct={game.totalOverBetsPct}
          accentColor="#FFB800"
          leftMoneyLabel={`Over${totalStr ? ` ${totalStr}` : ""}`}
          rightMoneyLabel={`Under${totalStr ? ` ${totalStr}` : ""}`}
          leftBetsLabel={`Over${totalStr ? ` ${totalStr}` : ""}`}
          rightBetsLabel={`Under${totalStr ? ` ${totalStr}` : ""}`}
        />
      )}

      {/* Attribution */}
      <div className="flex items-center justify-center">
        <span
          className="text-[7px] uppercase tracking-widest"
          style={{ color: "hsl(var(--muted-foreground))", opacity: 0.3 }}
        >
          via VSiN / DraftKings
        </span>
      </div>
    </div>
  );
}
