/*
 * BettingSplitsPanel — Redesigned for maximum readability
 *
 * Layout: 3 equal columns side-by-side (SPREAD | TOTAL | MONEYLINE)
 * Each column:
 *   - Market title (centered, bold, spaced)
 *   - Side labels (team abbr + line value, centered)
 *   - TICKETS bar (tall, full-width, large %)
 *   - HANDLE bar  (tall, full-width, large %)
 *   - Generous padding/spacing throughout
 */

import { trpc } from "@/lib/trpc";

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
  awayLabel: string;
  homeLabel: string;
  awayNickname?: string;
  homeNickname?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toNum(v: string | null | undefined): number {
  if (v == null) return NaN;
  const n = parseFloat(v);
  return isNaN(n) ? NaN : n;
}

function spreadSign(n: number): string {
  if (n === 0) return "PK";
  return n > 0 ? `+${n}` : `${n}`;
}

const FALLBACK_AWAY = "#1a4a8a";
const FALLBACK_HOME = "#c84b0c";

function isUnusableBarColor(hex: string | null | undefined): boolean {
  if (!hex) return false;
  const clean = hex.replace(/^#/, "");
  if (clean.length !== 6 && clean.length !== 3) return false;
  const full = clean.length === 3
    ? clean.split("").map(c => c + c).join("")
    : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.04 || lum > 0.90;
}

function areColorsTooSimilar(hexA: string, hexB: string, threshold = 60): boolean {
  const toRgb = (hex: string) => {
    const clean = hex.replace(/^#/, "");
    const full = clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  };
  try {
    const [r1, g1, b1] = toRgb(hexA);
    const [r2, g2, b2] = toRgb(hexB);
    const dist = Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
    return dist < threshold;
  } catch {
    return false;
  }
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace(/^#/, "");
  const full = clean.length === 3
    ? clean.split("").map(c => c + c).join("")
    : clean;
  const toLinear = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const r = toLinear(parseInt(full.slice(0, 2), 16) / 255);
  const g = toLinear(parseInt(full.slice(2, 4), 16) / 255);
  const b = toLinear(parseInt(full.slice(4, 6), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function bestTextColor(hex: string | null | undefined): string {
  if (!hex || !/^#[0-9a-fA-F]{3,6}$/.test(hex)) return "#ffffff";
  const bgLum = relativeLuminance(hex);
  const contrastWithWhite = (1 + 0.05) / (bgLum + 0.05);
  const contrastWithBlack = (bgLum + 0.05) / (0 + 0.05);
  return contrastWithBlack > contrastWithWhite ? "#000000" : "#ffffff";
}

function pickBarColor(
  primary: string | null | undefined,
  secondary: string | null | undefined,
  tertiary: string | null | undefined,
  fallback: string
): string {
  for (const c of [primary, secondary, tertiary]) {
    if (c && !isUnusableBarColor(c)) return c;
  }
  return fallback;
}

// ── SplitBar ──────────────────────────────────────────────────────────────────

interface SplitBarProps {
  label: string;
  awayPct: number | null;
  homePct: number | null;
  awayColor: string;
  homeColor: string;
}

function SplitBar({ label, awayPct, homePct, awayColor, homeColor }: SplitBarProps) {
  const hasData = awayPct != null && homePct != null;
  const awayTextColor = bestTextColor(awayColor);
  const homeTextColor = bestTextColor(homeColor);

  return (
    <div className="flex flex-col gap-1 w-full">
      {/* Bar label */}
      <span
        className="text-center uppercase tracking-widest font-bold"
        style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.12em" }}
      >
        {label}
      </span>

      {hasData ? (
        <div
          className="relative w-full rounded-full overflow-hidden"
          style={{
            height: 30,
            display: "flex",
            border: "1.5px solid rgba(255,255,255,0.15)",
            boxSizing: "border-box",
          }}
        >
          {/* Away side */}
          <div
            className="flex items-center justify-start pl-2 transition-all duration-700"
            style={{
              width: `${awayPct}%`,
              background: awayColor,
              minWidth: awayPct! > 0 ? 32 : 0,
              borderRadius: awayPct! >= 100 ? "9999px" : "9999px 0 0 9999px",
            }}
          >
            <span
              className="font-extrabold tabular-nums leading-none"
              style={{ fontSize: 12, color: awayTextColor }}
            >
              {awayPct}%
            </span>
          </div>
          {/* Divider */}
          <div style={{ width: 1.5, background: "rgba(255,255,255,0.3)", flexShrink: 0, alignSelf: "stretch" }} />
          {/* Home side */}
          <div
            className="flex items-center justify-end pr-2 transition-all duration-700"
            style={{
              width: `${homePct}%`,
              background: homeColor,
              minWidth: homePct! > 0 ? 32 : 0,
              borderRadius: homePct! >= 100 ? "9999px" : "0 9999px 9999px 0",
            }}
          >
            <span
              className="font-extrabold tabular-nums leading-none"
              style={{ fontSize: 12, color: homeTextColor }}
            >
              {homePct}%
            </span>
          </div>
        </div>
      ) : (
        <div
          className="w-full rounded-full flex items-center justify-center"
          style={{ height: 30, background: "rgba(255,255,255,0.05)" }}
        >
          <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", opacity: 0.35 }}>—</span>
        </div>
      )}
    </div>
  );
}

// ── MarketColumn ──────────────────────────────────────────────────────────────

interface MarketColumnProps {
  title: string;
  awayLabel: string;
  homeLabel: string;
  totalValue?: number;
  ticketsPct: number | null | undefined;
  handlePct: number | null | undefined;
  awayColor: string;
  homeColor: string;
}

function MarketColumn({ title, awayLabel, homeLabel, totalValue, ticketsPct, handlePct, awayColor, homeColor }: MarketColumnProps) {
  const hasTickets = ticketsPct != null;
  const hasHandle  = handlePct  != null;
  if (!hasTickets && !hasHandle) return null;

  const awayTickets = hasTickets ? ticketsPct! : null;
  const homeTickets = hasTickets ? 100 - ticketsPct! : null;
  const awayHandle  = hasHandle  ? handlePct!  : null;
  const homeHandle  = hasHandle  ? 100 - handlePct!  : null;

  const isTotalMarket = totalValue !== undefined && !isNaN(totalValue);

  return (
    <div
      className="flex flex-col flex-1 min-w-0"
      style={{ padding: "12px 10px", gap: 10 }}
    >
      {/* Market title — centered with flanking rules */}
      <div className="flex items-center gap-2">
        <div className="flex-1" style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
        <span
          className="uppercase tracking-widest font-extrabold whitespace-nowrap text-center"
          style={{ fontSize: 11, color: "#ffffff", letterSpacing: "0.14em" }}
        >
          {title}
        </span>
        <div className="flex-1" style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
      </div>

      {/* Side labels */}
      {isTotalMarket ? (
        <div className="flex items-center justify-between" style={{ paddingLeft: 2, paddingRight: 2 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", fontWeight: 600, letterSpacing: "0.06em" }}>
            OVER
          </span>
          <span style={{ fontSize: 13, color: "#ffffff", fontWeight: 700, letterSpacing: "0.04em" }}>
            {totalValue}
          </span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", fontWeight: 600, letterSpacing: "0.06em" }}>
            UNDER
          </span>
        </div>
      ) : (
        <div className="flex items-start justify-between" style={{ paddingLeft: 2, paddingRight: 2, gap: 4 }}>
          <span
            className="uppercase leading-tight"
            style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", fontWeight: 600, maxWidth: "48%", wordBreak: "break-word", letterSpacing: "0.04em" }}
          >
            {awayLabel}
          </span>
          <span
            className="uppercase leading-tight text-right"
            style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", fontWeight: 600, maxWidth: "48%", wordBreak: "break-word", letterSpacing: "0.04em" }}
          >
            {homeLabel}
          </span>
        </div>
      )}

      {/* Tickets bar */}
      <SplitBar
        label="Tickets"
        awayPct={awayTickets}
        homePct={homeTickets}
        awayColor={awayColor}
        homeColor={homeColor}
      />

      {/* Handle bar */}
      <SplitBar
        label="Handle"
        awayPct={awayHandle}
        homePct={homeHandle}
        awayColor={awayColor}
        homeColor={homeColor}
      />
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function BettingSplitsPanel({
  game, awayLabel, homeLabel,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  awayNickname: _aN, homeNickname: _hN,
}: BettingSplitsPanelProps) {
  const sport = game.sport ?? "NCAAM";
  const { data: colors } = trpc.teamColors.getForGame.useQuery(
    { awayTeam: game.awayTeam, homeTeam: game.homeTeam, sport },
    { staleTime: 1000 * 60 * 60 }
  );

  const homeColor = pickBarColor(
    colors?.home?.primaryColor,
    colors?.home?.secondaryColor,
    colors?.home?.tertiaryColor,
    FALLBACK_HOME
  );

  const awayColorCandidates: (string | null | undefined)[] = [
    colors?.away?.primaryColor,
    colors?.away?.secondaryColor,
    colors?.away?.tertiaryColor,
    FALLBACK_AWAY,
  ];
  const awayColor = (() => {
    for (const candidate of awayColorCandidates) {
      if (!candidate) continue;
      if (isUnusableBarColor(candidate)) continue;
      if (!areColorsTooSimilar(candidate, homeColor)) return candidate;
    }
    return FALLBACK_AWAY;
  })();

  const awaySpread = toNum(game.awayBookSpread);
  const homeSpread = toNum(game.homeBookSpread);
  const bookTotal  = toNum(game.bookTotal);

  const awayAbbr = colors?.away?.abbrev ?? awayLabel;
  const homeAbbr = colors?.home?.abbrev ?? homeLabel;

  const awaySpreadLabel = !isNaN(awaySpread)
    ? `${awayAbbr} (${spreadSign(awaySpread)})`
    : awayAbbr;
  const homeSpreadLabel = !isNaN(homeSpread)
    ? `${homeAbbr} (${spreadSign(homeSpread)})`
    : homeAbbr;

  const awayMlLabel = game.awayML ? `${awayAbbr} (${game.awayML})` : awayAbbr;
  const homeMlLabel = game.homeML ? `${homeAbbr} (${game.homeML})` : homeAbbr;

  const hasSpreadSplits = game.spreadAwayMoneyPct != null || game.spreadAwayBetsPct != null;
  const hasTotalSplits  = game.totalOverMoneyPct  != null || game.totalOverBetsPct  != null;
  const hasMlSplits     = (game.mlAwayMoneyPct != null || game.mlAwayBetsPct != null || game.awayML != null);
  const hasAnySplits    = hasSpreadSplits || hasTotalSplits || hasMlSplits;

  if (!hasAnySplits) {
    return (
      <div
        className="w-full flex items-center justify-center"
        style={{ minHeight: 80, padding: "16px 12px" }}
      >
        <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", opacity: 0.4, letterSpacing: "0.06em" }}>
          Splits not yet available
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex items-stretch w-full"
      style={{ minHeight: 0 }}
    >
      {/* SPREAD */}
      {hasSpreadSplits && (
        <MarketColumn
          title="Spread"
          awayLabel={awaySpreadLabel}
          homeLabel={homeSpreadLabel}
          ticketsPct={game.spreadAwayBetsPct}
          handlePct={game.spreadAwayMoneyPct}
          awayColor={awayColor}
          homeColor={homeColor}
        />
      )}

      {/* Divider */}
      {hasSpreadSplits && (hasTotalSplits || hasMlSplits) && (
        <div style={{ width: 1, background: "rgba(255,255,255,0.07)", flexShrink: 0, alignSelf: "stretch", margin: "8px 0" }} />
      )}

      {/* TOTAL */}
      {hasTotalSplits && (
        <MarketColumn
          title="Total"
          awayLabel=""
          homeLabel=""
          totalValue={isNaN(bookTotal) ? undefined : bookTotal}
          ticketsPct={game.totalOverBetsPct}
          handlePct={game.totalOverMoneyPct}
          awayColor={awayColor}
          homeColor={homeColor}
        />
      )}

      {/* Divider */}
      {hasTotalSplits && hasMlSplits && (
        <div style={{ width: 1, background: "rgba(255,255,255,0.07)", flexShrink: 0, alignSelf: "stretch", margin: "8px 0" }} />
      )}

      {/* MONEYLINE */}
      {hasMlSplits && (
        <MarketColumn
          title="Moneyline"
          awayLabel={awayMlLabel}
          homeLabel={homeMlLabel}
          ticketsPct={game.mlAwayBetsPct}
          handlePct={game.mlAwayMoneyPct}
          awayColor={awayColor}
          homeColor={homeColor}
        />
      )}
    </div>
  );
}
