/**
 * BettingSplitsPanel
 *
 * Displays VSiN betting splits (spread bets%, spread money%, total bets%, total money%)
 * for NCAAM games, and additionally ML bets%, ML money%, and moneyline odds for NBA games.
 *
 * Designed to be embedded inside GameCard and the Publish Projections page.
 * Shows a horizontal bar for each split: away/over on the left (colored), home/under on the right (muted).
 */

interface BettingSplitsPanelProps {
  game: {
    sport: string | null;
    awayTeam: string;
    homeTeam: string;
    spreadAwayBetsPct: number | null | undefined;
    spreadAwayMoneyPct: number | null | undefined;
    totalOverBetsPct: number | null | undefined;
    totalOverMoneyPct: number | null | undefined;
    mlAwayBetsPct: number | null | undefined;
    mlAwayMoneyPct: number | null | undefined;
    awayML: string | null | undefined;
    homeML: string | null | undefined;
  };
  awayLabel: string;   // e.g. "Houston" or "Magic"
  homeLabel: string;   // e.g. "Oklahoma St" or "Timberwolves"
}

interface SplitBarProps {
  label: string;
  awayPct: number | null | undefined;
  homePct: number | null | undefined;
  awayLabel: string;
  homeLabel: string;
  /** Override the "away" color — defaults to neon green accent */
  accentColor?: string;
}

function SplitBar({ label, awayPct, homePct, awayLabel, homeLabel, accentColor = "#39FF14" }: SplitBarProps) {
  const away = awayPct ?? null;
  const home = homePct ?? null;
  const hasData = away !== null && home !== null;

  // Determine which side has more action (for arrow indicator)
  const awayLeads = hasData && away > home;
  const homeLeads = hasData && home > away;

  return (
    <div className="flex flex-col gap-0.5">
      {/* Label row */}
      <div className="flex items-center justify-between">
        <span
          className="text-[9px] uppercase tracking-widest font-semibold"
          style={{ color: "hsl(var(--muted-foreground))" }}
        >
          {label}
        </span>
        {!hasData && (
          <span className="text-[9px]" style={{ color: "hsl(var(--muted-foreground))" }}>—</span>
        )}
      </div>

      {hasData && (
        <>
          {/* Bar */}
          <div
            className="relative w-full rounded-full overflow-hidden"
            style={{ height: 6, background: "hsl(var(--border))" }}
          >
            <div
              className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
              style={{ width: `${away}%`, background: accentColor, opacity: 0.85 }}
            />
          </div>

          {/* Pct labels */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-0.5">
              <span
                className="text-[10px] font-bold tabular-nums"
                style={{ color: awayLeads ? accentColor : "hsl(var(--muted-foreground))" }}
              >
                {away}%
              </span>
              <span
                className="text-[9px] truncate max-w-[60px]"
                style={{ color: "hsl(var(--muted-foreground))", opacity: 0.7 }}
              >
                {" "}{awayLabel}
              </span>
              {awayLeads && (
                <span className="text-[8px]" style={{ color: accentColor }}>↑</span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              {homeLeads && (
                <span className="text-[8px]" style={{ color: "#FF6B6B" }}>↑</span>
              )}
              <span
                className="text-[9px] truncate max-w-[60px] text-right"
                style={{ color: "hsl(var(--muted-foreground))", opacity: 0.7 }}
              >
                {homeLabel}{" "}
              </span>
              <span
                className="text-[10px] font-bold tabular-nums"
                style={{ color: homeLeads ? "#FF6B6B" : "hsl(var(--muted-foreground))" }}
              >
                {home}%
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function BettingSplitsPanel({ game, awayLabel, homeLabel }: BettingSplitsPanelProps) {
  const isNba = game.sport === "NBA";

  // Check if we have any splits data at all
  const hasSpreadSplits = game.spreadAwayBetsPct != null || game.spreadAwayMoneyPct != null;
  const hasTotalSplits = game.totalOverBetsPct != null || game.totalOverMoneyPct != null;
  const hasMlSplits = isNba && (game.mlAwayBetsPct != null || game.mlAwayMoneyPct != null);
  const hasAnySplits = hasSpreadSplits || hasTotalSplits || hasMlSplits;

  if (!hasAnySplits) {
    return (
      <div
        className="px-3 py-2 flex items-center justify-center"
        style={{ borderTop: "1px solid hsl(var(--border) / 0.4)" }}
      >
        <span className="text-[10px]" style={{ color: "hsl(var(--muted-foreground))", opacity: 0.5 }}>
          Splits loading...
        </span>
      </div>
    );
  }

  return (
    <div
      className="px-3 pt-2 pb-3 flex flex-col gap-2.5"
      style={{ borderTop: "1px solid hsl(var(--border) / 0.4)" }}
    >
      {/* Section header */}
      <div className="flex items-center gap-1.5">
        <span
          className="text-[9px] uppercase tracking-widest font-bold"
          style={{ color: "hsl(var(--muted-foreground))", opacity: 0.6 }}
        >
          Betting Splits
        </span>
        <div className="flex-1" style={{ height: 1, background: "hsl(var(--border) / 0.4)" }} />
        <span
          className="text-[8px] uppercase tracking-widest"
          style={{ color: "hsl(var(--muted-foreground))", opacity: 0.4 }}
        >
          via VSiN
        </span>
      </div>

      {/* Spread splits */}
      {hasSpreadSplits && (
        <div className="flex flex-col gap-1.5">
          <span
            className="text-[9px] uppercase tracking-widest font-semibold"
            style={{ color: "#39FF14", opacity: 0.7 }}
          >
            Spread
          </span>
          <SplitBar
            label="Bets %"
            awayPct={game.spreadAwayBetsPct}
            homePct={game.spreadAwayBetsPct != null ? 100 - game.spreadAwayBetsPct : null}
            awayLabel={awayLabel}
            homeLabel={homeLabel}
            accentColor="#39FF14"
          />
          <SplitBar
            label="Money %"
            awayPct={game.spreadAwayMoneyPct}
            homePct={game.spreadAwayMoneyPct != null ? 100 - game.spreadAwayMoneyPct : null}
            awayLabel={awayLabel}
            homeLabel={homeLabel}
            accentColor="#00E5FF"
          />
        </div>
      )}

      {/* Total splits */}
      {hasTotalSplits && (
        <div className="flex flex-col gap-1.5">
          <span
            className="text-[9px] uppercase tracking-widest font-semibold"
            style={{ color: "#FFB800", opacity: 0.8 }}
          >
            Total
          </span>
          <SplitBar
            label="Bets %"
            awayPct={game.totalOverBetsPct}
            homePct={game.totalOverBetsPct != null ? 100 - game.totalOverBetsPct : null}
            awayLabel="Over"
            homeLabel="Under"
            accentColor="#FFB800"
          />
          <SplitBar
            label="Money %"
            awayPct={game.totalOverMoneyPct}
            homePct={game.totalOverMoneyPct != null ? 100 - game.totalOverMoneyPct : null}
            awayLabel="Over"
            homeLabel="Under"
            accentColor="#FF9500"
          />
        </div>
      )}

      {/* NBA-only: Moneyline splits */}
      {isNba && hasMlSplits && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span
              className="text-[9px] uppercase tracking-widest font-semibold"
              style={{ color: "#A78BFA", opacity: 0.8 }}
            >
              Moneyline
            </span>
            {/* ML odds display */}
            {(game.awayML || game.homeML) && (
              <div className="flex items-center gap-2">
                {game.awayML && (
                  <span
                    className="text-[9px] font-bold tabular-nums"
                    style={{ color: "hsl(var(--muted-foreground))" }}
                  >
                    {awayLabel} {game.awayML}
                  </span>
                )}
                {game.homeML && (
                  <span
                    className="text-[9px] font-bold tabular-nums"
                    style={{ color: "hsl(var(--muted-foreground))" }}
                  >
                    {homeLabel} {game.homeML}
                  </span>
                )}
              </div>
            )}
          </div>
          <SplitBar
            label="Bets %"
            awayPct={game.mlAwayBetsPct}
            homePct={game.mlAwayBetsPct != null ? 100 - game.mlAwayBetsPct : null}
            awayLabel={awayLabel}
            homeLabel={homeLabel}
            accentColor="#A78BFA"
          />
          <SplitBar
            label="Money %"
            awayPct={game.mlAwayMoneyPct}
            homePct={game.mlAwayMoneyPct != null ? 100 - game.mlAwayMoneyPct : null}
            awayLabel={awayLabel}
            homeLabel={homeLabel}
            accentColor="#C084FC"
          />
        </div>
      )}
    </div>
  );
}
