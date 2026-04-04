/**
 * ModelResults — Owner-only page for reviewing K-Props model backtest results.
 *
 * Displays:
 *   - Daily accuracy summary (correct / total, over/under breakdown, MAE, mean bias)
 *   - Rolling calibration metrics (all-time accuracy, calibration factor, RMSE)
 *   - Per-pitcher result table with headshots, projections, actuals, verdict
 *
 * Access: owner role only — non-owners are immediately redirected to /feed.
 * Backend: all procedures use ownerProcedure (server-side owner check enforced).
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAppAuth } from "@/_core/hooks/useAppAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
  Target,
} from "lucide-react";
import { MLB_BY_ABBREV } from "@shared/mlbTeams";

// ─── Date helpers (mirrors PublishProjections) ────────────────────────────────
function todayPst(): string {
  const now = new Date();
  const pst = now.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const [mm, dd, yyyy] = pst.split("/");
  return `${yyyy}-${mm}-${dd}`;
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function formatDateNav(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}
function formatMilitaryTime(time: string | null | undefined): string {
  if (!time) return "TBD";
  const upper = time.toUpperCase();
  if (upper === "TBD" || upper === "TBA" || !time.includes(":")) return "TBD";
  const parts = time.split(":");
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1]?.slice(0, 2) ?? "00";
  if (isNaN(hours)) return "TBD";
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm} ET`;
}

// ─── Team helpers ─────────────────────────────────────────────────────────────
function teamPrimary(abbrev: string): string {
  return MLB_BY_ABBREV.get(abbrev?.toUpperCase())?.primaryColor ?? "#4A90D9";
}
function teamLogo(abbrev: string): string | null {
  return MLB_BY_ABBREV.get(abbrev?.toUpperCase())?.logoUrl ?? null;
}
function teamCity(abbrev: string): string {
  return MLB_BY_ABBREV.get(abbrev?.toUpperCase())?.city ?? abbrev;
}
function teamNickname(abbrev: string): string {
  return MLB_BY_ABBREV.get(abbrev?.toUpperCase())?.nickname ?? "";
}

// ─── Pitcher headshot ─────────────────────────────────────────────────────────
function mlbPhoto(id: number | null | undefined): string | null {
  if (!id) return null;
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_360,q_auto:best,e_background_removal,f_png/v1/people/${id}/headshot/67/current`;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────
function fmtNum(val: string | number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined || val === "") return "—";
  const n = typeof val === "number" ? val : parseFloat(val as string);
  if (isNaN(n)) return "—";
  return n.toFixed(decimals);
}
function fmtPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  return `${Math.round(val * 100)}%`;
}
function fmtOdds(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseInt(val, 10);
  if (isNaN(n)) return "—";
  return n > 0 ? `+${n}` : String(n);
}
function signedNum(val: number | null | undefined, decimals = 2): string {
  if (val === null || val === undefined) return "—";
  return val > 0 ? `+${val.toFixed(decimals)}` : val.toFixed(decimals);
}

// ─── Accuracy color ───────────────────────────────────────────────────────────
function accuracyColor(acc: number | null): string {
  if (acc === null) return "rgba(255,255,255,0.4)";
  if (acc >= 0.65) return "#39FF14";
  if (acc >= 0.55) return "#ADFF2F";
  if (acc >= 0.50) return "#FFD700";
  if (acc >= 0.45) return "#FF9500";
  return "#FF2244";
}

// ─── Backtest result badge ────────────────────────────────────────────────────
function ResultBadge({ result, correct }: { result: string | null; correct: number | null }) {
  if (!result || result === "PENDING" || result === "NO_LINE") {
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: "1px", padding: "3px 8px",
        borderRadius: 4, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)",
        border: "1px solid rgba(255,255,255,0.12)", fontFamily: '"Barlow Condensed", sans-serif',
      }}>
        {result === "NO_LINE" ? "NO LINE" : "PENDING"}
      </span>
    );
  }
  const isCorrect = correct === 1;
  const isOver = result === "OVER";
  const isPush = result === "PUSH";
  const bg = isPush
    ? "rgba(255,215,0,0.12)"
    : isCorrect
      ? "rgba(57,255,20,0.12)"
      : "rgba(255,34,68,0.12)";
  const border = isPush
    ? "rgba(255,215,0,0.35)"
    : isCorrect
      ? "rgba(57,255,20,0.35)"
      : "rgba(255,34,68,0.35)";
  const color = isPush ? "#FFD700" : isCorrect ? "#39FF14" : "#FF2244";
  const icon = isPush ? null : isCorrect
    ? <CheckCircle2 size={10} style={{ flexShrink: 0 }} />
    : <XCircle size={10} style={{ flexShrink: 0 }} />;

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10, fontWeight: 700, letterSpacing: "1px", padding: "3px 8px",
      borderRadius: 4, background: bg, color, border: `1px solid ${border}`,
      fontFamily: '"Barlow Condensed", sans-serif',
    }}>
      {icon}
      {result}
    </span>
  );
}

// ─── Verdict badge ────────────────────────────────────────────────────────────
function VerdictBadge({ verdict, bestSide, bestEdge, bestMlStr }: {
  verdict: string | null;
  bestSide: string | null;
  bestEdge: string | null;
  bestMlStr: string | null;
}) {
  if (!verdict || verdict === "PASS") {
    return <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: '"Barlow Condensed", sans-serif' }}>PASS</span>;
  }
  const edgePp = bestEdge ? parseFloat(bestEdge) * 100 : null;
  const isOver = bestSide === "OVER";
  const color = isOver ? "#39FF14" : "#00BFFF";
  const bg = isOver ? "rgba(57,255,20,0.10)" : "rgba(0,191,255,0.10)";
  const border = isOver ? "rgba(57,255,20,0.30)" : "rgba(0,191,255,0.30)";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 10, fontWeight: 700, letterSpacing: "1px", padding: "3px 8px",
      borderRadius: 4, background: bg, color, border: `1px solid ${border}`,
      fontFamily: '"Barlow Condensed", sans-serif',
    }}>
      ▶ {bestSide} {bestMlStr ?? ""}
      {edgePp !== null && (
        <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
          {edgePp > 0 ? "+" : ""}{edgePp.toFixed(1)}pp
        </span>
      )}
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div style={{
      background: "#090E14", border: "1px solid #182433", borderRadius: 10,
      padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", fontFamily: '"Barlow Condensed", sans-serif' }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color ?? "#FFFFFF", lineHeight: 1, fontFamily: '"Barlow Condensed", sans-serif' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontFamily: '"Barlow Condensed", sans-serif' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── Pitcher row ─────────────────────────────────────────────────────────────
interface PropRow {
  id: number;
  gameId: number;
  pitcherName: string;
  side: string;
  mlbamId: number | null;
  awayTeam: string;
  homeTeam: string;
  startTimeEst: string | null;
  bookLine: string | null;
  kProj: string | null;
  verdict: string | null;
  bestSide: string | null;
  bestEdge: string | null;
  bestMlStr: string | null;
  pOver: string | null;
  pUnder: string | null;
  bookOverOdds: string | null;
  bookUnderOdds: string | null;
  anNoVigOverPct: string | null;
  actualKs: number | null;
  backtestResult: string | null;
  modelCorrect: number | null;
  modelError: string | null;
  backtestRunAt: number | null;
}

function PitcherResultRow({ prop }: { prop: PropRow }) {
  const isAway = prop.side === "away";
  const pitcherTeam = isAway ? prop.awayTeam : prop.homeTeam;
  const oppTeam = isAway ? prop.homeTeam : prop.awayTeam;
  const primary = teamPrimary(pitcherTeam);
  const logo = teamLogo(pitcherTeam);
  const photo = mlbPhoto(prop.mlbamId);

  const kProj = prop.kProj ? parseFloat(prop.kProj) : null;
  const bookLine = prop.bookLine ? parseFloat(prop.bookLine) : null;
  const modelErr = prop.modelError ? parseFloat(prop.modelError) : null;

  const isPending = !prop.backtestResult || prop.backtestResult === "PENDING";
  const isCorrect = prop.modelCorrect === 1;

  return (
    <div style={{
      background: "#090E14",
      border: "1px solid #182433",
      borderRadius: 10,
      overflow: "hidden",
      marginBottom: 8,
    }}>
      {/* Color bar */}
      <div style={{ height: 3, background: primary }} />

      <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
        {/* Left: headshot + team */}
        <div style={{
          width: 80, flexShrink: 0, background: "rgba(255,255,255,0.02)",
          borderRight: "1px solid #182433",
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", padding: "10px 8px", gap: 6,
        }}>
          {/* Headshot */}
          <div style={{ width: 52, height: 52, overflow: "hidden", borderRadius: "50%", background: "rgba(255,255,255,0.04)", border: "1px solid #182433", flexShrink: 0 }}>
            {photo ? (
              <img src={photo} alt={prop.pitcherName} style={{ width: "100%", height: "100%", objectFit: "cover", mixBlendMode: "screen" }} onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0"; }} />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 16, color: "rgba(255,255,255,0.2)" }}>?</span>
              </div>
            )}
          </div>
          {/* Team logo */}
          {logo && (
            <img src={logo} alt={pitcherTeam} style={{ width: 22, height: 22, objectFit: "contain", mixBlendMode: "screen", opacity: 0.85 }} />
          )}
          {/* Matchup */}
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: '"Barlow Condensed", sans-serif', textAlign: "center", letterSpacing: "0.5px" }}>
            {isAway ? `${prop.awayTeam} @` : `vs ${prop.awayTeam}`}
            <br />
            {isAway ? prop.homeTeam : ""}
          </div>
        </div>

        {/* Center: pitcher info + projections */}
        <div style={{ flex: 1, minWidth: 0, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Name + time + verdict */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 18, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.1 }}>
                {prop.pitcherName}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", fontFamily: '"Barlow Condensed", sans-serif', marginTop: 2 }}>
                {formatMilitaryTime(prop.startTimeEst)} · {isAway ? "AWAY" : "HOME"}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <VerdictBadge verdict={prop.verdict} bestSide={prop.bestSide} bestEdge={prop.bestEdge} bestMlStr={prop.bestMlStr} />
              <ResultBadge result={prop.backtestResult} correct={prop.modelCorrect} />
            </div>
          </div>

          {/* Projection row */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            {/* K Proj */}
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", fontFamily: '"Barlow Condensed", sans-serif' }}>MODEL PROJ</div>
              <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 22, fontWeight: 800, color: "#FFFFFF", lineHeight: 1 }}>
                {fmtNum(prop.kProj, 1)}
              </div>
            </div>
            {/* Book line */}
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", fontFamily: '"Barlow Condensed", sans-serif' }}>BOOK LINE</div>
              <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 22, fontWeight: 800, color: "rgba(255,255,255,0.7)", lineHeight: 1 }}>
                {fmtNum(prop.bookLine, 1)}
              </div>
            </div>
            {/* Actual Ks */}
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", fontFamily: '"Barlow Condensed", sans-serif' }}>ACTUAL Ks</div>
              <div style={{
                fontFamily: '"Barlow Condensed", sans-serif', fontSize: 22, fontWeight: 800, lineHeight: 1,
                color: isPending ? "rgba(255,255,255,0.25)" : isCorrect ? "#39FF14" : "#FF2244",
              }}>
                {isPending ? "—" : (prop.actualKs ?? "—")}
              </div>
            </div>
            {/* Model error */}
            {!isPending && modelErr !== null && (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", fontFamily: '"Barlow Condensed", sans-serif' }}>MODEL ERR</div>
                <div style={{
                  fontFamily: '"Barlow Condensed", sans-serif', fontSize: 22, fontWeight: 800, lineHeight: 1,
                  color: Math.abs(modelErr) <= 0.5 ? "#39FF14" : Math.abs(modelErr) <= 1.5 ? "#FFD700" : "#FF2244",
                }}>
                  {signedNum(modelErr, 2)}
                </div>
              </div>
            )}
            {/* AN No-Vig % */}
            {prop.anNoVigOverPct && (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", fontFamily: '"Barlow Condensed", sans-serif' }}>AN NO-VIG O%</div>
                <div style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 22, fontWeight: 800, color: "rgba(255,255,255,0.7)", lineHeight: 1 }}>
                  {fmtPct(parseFloat(prop.anNoVigOverPct))}
                </div>
              </div>
            )}
          </div>

          {/* Over/Under probs */}
          {(prop.pOver || prop.pUnder) && (
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{
                flex: 1, padding: "6px 10px", borderRadius: 6,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", fontFamily: '"Barlow Condensed", sans-serif' }}>
                  OVER {fmtNum(prop.bookLine, 1)}
                </span>
                <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 14, fontWeight: 800, color: "#FFFFFF" }}>
                  {prop.pOver ? fmtPct(parseFloat(prop.pOver)) : "—"}
                </span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: '"Barlow Condensed", sans-serif' }}>
                  {fmtOdds(prop.bookOverOdds)}
                </span>
              </div>
              <div style={{
                flex: 1, padding: "6px 10px", borderRadius: 6,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", fontFamily: '"Barlow Condensed", sans-serif' }}>
                  UNDER {fmtNum(prop.bookLine, 1)}
                </span>
                <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontSize: 14, fontWeight: 800, color: "#FFFFFF" }}>
                  {prop.pUnder ? fmtPct(parseFloat(prop.pUnder)) : "—"}
                </span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: '"Barlow Condensed", sans-serif' }}>
                  {fmtOdds(prop.bookUnderOdds)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ModelResults() {
  const [, setLocation] = useLocation();
  const { appUser, isOwner, loading: authLoading } = useAppAuth();
  const [gameDate, setGameDate] = useState(() => todayPst());
  const [isRunningBacktest, setIsRunningBacktest] = useState(false);

  // ── Strict owner-only guard ─────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && (!appUser || !isOwner)) {
      setLocation("/feed");
    }
  }, [authLoading, appUser, isOwner, setLocation]);

  // ── Daily backtest results ──────────────────────────────────────────────────
  const {
    data: dailyData,
    isLoading: dailyLoading,
    refetch: refetchDaily,
  } = trpc.strikeoutProps.getRichDailyBacktest.useQuery(
    { gameDate },
    { enabled: !!appUser && isOwner, refetchOnWindowFocus: false }
  );

  // ── Rolling calibration metrics ─────────────────────────────────────────────
  const {
    data: calibrationData,
    isLoading: calibrationLoading,
    refetch: refetchCalibration,
  } = trpc.strikeoutProps.getCalibrationMetrics.useQuery(
    undefined,
    { enabled: !!appUser && isOwner, refetchOnWindowFocus: false }
  );

  const handleRefresh = async () => {
    setIsRunningBacktest(true);
    try {
      await Promise.all([refetchDaily(), refetchCalibration()]);
      toast.success("Results refreshed");
    } catch (err) {
      toast.error("Refresh failed");
    } finally {
      setIsRunningBacktest(false);
    }
  };

  const daily = dailyData?.results;
  const calibration = calibrationData?.metrics;

  // Show loading spinner while auth resolves
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(var(--background))" }}>
        <Loader2 className="animate-spin" style={{ color: "#39FF14" }} />
      </div>
    );
  }
  if (!isOwner) return null;

  const accuracy = daily?.accuracy ?? null;
  const accColor = accuracyColor(accuracy);

  return (
    <div className="min-h-screen" style={{ background: "hsl(var(--background))" }}>
      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        {/* Top row */}
        <div className="relative flex items-center px-4 py-2 max-w-5xl mx-auto">
          <button
            onClick={() => setLocation("/admin/publish")}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/10 mr-2 flex-shrink-0"
          >
            <ChevronLeft size={18} style={{ color: "hsl(var(--muted-foreground))" }} />
          </button>
          {/* Centered brand */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none">
            <span className="font-black text-white whitespace-nowrap" style={{ fontSize: "clamp(13px, 3vw, 20px)", letterSpacing: "0.08em" }}>
              PREZ BETS
            </span>
            <span className="text-border" style={{ fontSize: "clamp(10px, 2vw, 14px)" }}>|</span>
            <span className="font-medium whitespace-nowrap" style={{ fontSize: "clamp(11px, 2.4vw, 16px)", letterSpacing: "0.1em", color: "#9CA3AF" }}>
              MODEL RESULTS
            </span>
          </div>
          {/* Right: refresh */}
          <div className="flex-1" />
          <Button
            size="sm"
            onClick={handleRefresh}
            disabled={isRunningBacktest || dailyLoading}
            className="gap-1.5 text-xs h-8 font-bold border"
            style={{ background: "rgba(57,255,20,0.10)", color: "#39FF14", borderColor: "rgba(57,255,20,0.35)" }}
          >
            {isRunningBacktest
              ? <Loader2 size={12} className="animate-spin" />
              : <RefreshCw size={12} />
            }
            Refresh
          </Button>
        </div>

        {/* Date navigation row */}
        <div className="px-4 pb-1.5 max-w-5xl mx-auto flex items-center gap-2">
          <button
            onClick={() => setGameDate(d => addDays(d, -1))}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10 flex-shrink-0"
          >
            <ChevronLeft size={14} style={{ color: "hsl(var(--muted-foreground))" }} />
          </button>
          <div className="flex-1 flex items-center justify-center gap-2">
            <span className="text-xs font-bold text-foreground tracking-wide">
              {formatDateNav(gameDate)}
            </span>
            {gameDate === todayPst() && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "rgba(57,255,20,0.15)", color: "#39FF14" }}>
                TODAY
              </span>
            )}
          </div>
          <button
            onClick={() => setGameDate(d => addDays(d, 1))}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10 flex-shrink-0"
          >
            <ChevronRight size={14} style={{ color: "hsl(var(--muted-foreground))" }} />
          </button>
        </div>
      </header>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-4 py-4 pb-16">

        {/* ── Daily summary stats ─────────────────────────────────────────── */}
        {dailyLoading ? (
          <div className="flex items-center justify-center py-12 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#39FF14" }} />
            <span className="text-sm text-muted-foreground">Loading results…</span>
          </div>
        ) : !daily || daily.total === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <BarChart3 className="w-10 h-10 text-muted-foreground/30" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">No K-Props data for {formatDateNav(gameDate)}</p>
              <p className="text-xs text-muted-foreground">Run the model for MLB games on this date first.</p>
            </div>
          </div>
        ) : (
          <>
            {/* ── Section: Daily Accuracy ──────────────────────────────── */}
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase",
                color: "rgba(255,255,255,0.35)", fontFamily: '"Barlow Condensed", sans-serif',
                marginBottom: 10,
              }}>
                DAILY ACCURACY — {formatDateNav(gameDate).toUpperCase()}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <StatCard
                  label="ACCURACY"
                  value={daily.completed > 0 ? fmtPct(accuracy) : "—"}
                  sub={`${daily.correct}/${daily.completed} correct`}
                  color={accColor}
                />
                <StatCard
                  label="TOTAL PROPS"
                  value={String(daily.total)}
                  sub={`${daily.completed} completed · ${daily.total - daily.completed} pending`}
                />
                <StatCard
                  label="OVER ACCURACY"
                  value={daily.overTotal > 0 ? fmtPct(daily.overCorrect / daily.overTotal) : "—"}
                  sub={`${daily.overCorrect}/${daily.overTotal} overs correct`}
                  color={daily.overTotal > 0 ? accuracyColor(daily.overCorrect / daily.overTotal) : undefined}
                />
                <StatCard
                  label="UNDER ACCURACY"
                  value={daily.underTotal > 0 ? fmtPct(daily.underCorrect / daily.underTotal) : "—"}
                  sub={`${daily.underCorrect}/${daily.underTotal} unders correct`}
                  color={daily.underTotal > 0 ? accuracyColor(daily.underCorrect / daily.underTotal) : undefined}
                />
                <StatCard
                  label="MEAN ERROR"
                  value={daily.meanError !== null ? signedNum(daily.meanError, 2) : "—"}
                  sub="avg (actual − proj)"
                  color={daily.meanError !== null
                    ? Math.abs(daily.meanError) <= 0.3 ? "#39FF14"
                    : Math.abs(daily.meanError) <= 0.8 ? "#FFD700"
                    : "#FF2244"
                    : undefined}
                />
                <StatCard
                  label="MAE"
                  value={daily.mae !== null ? fmtNum(daily.mae, 2) : "—"}
                  sub="mean absolute error"
                  color={daily.mae !== null
                    ? daily.mae <= 0.8 ? "#39FF14"
                    : daily.mae <= 1.5 ? "#FFD700"
                    : "#FF2244"
                    : undefined}
                />
              </div>
            </div>

            {/* ── Section: Rolling Calibration ────────────────────────── */}
            {!calibrationLoading && calibration && (
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase",
                  color: "rgba(255,255,255,0.35)", fontFamily: '"Barlow Condensed", sans-serif',
                  marginBottom: 10,
                }}>
                  ROLLING CALIBRATION — ALL TIME ({calibration.completedProps} props)
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <StatCard
                    label="MODEL ACCURACY"
                    value={fmtPct(calibration.modelAccuracy)}
                    sub={`${calibration.completedProps} completed props`}
                    color={accuracyColor(calibration.modelAccuracy)}
                  />
                  <StatCard
                    label="OVER ACCURACY"
                    value={fmtPct(calibration.modelOverAccuracy)}
                    sub={`${calibration.overCount} overs`}
                    color={accuracyColor(calibration.modelOverAccuracy)}
                  />
                  <StatCard
                    label="UNDER ACCURACY"
                    value={fmtPct(calibration.modelUnderAccuracy)}
                    sub={`${calibration.underCount} unders`}
                    color={accuracyColor(calibration.modelUnderAccuracy)}
                  />
                  <StatCard
                    label="ROLLING MAE"
                    value={fmtNum(calibration.mae, 3)}
                    sub="mean absolute error"
                    color={calibration.mae <= 0.8 ? "#39FF14" : calibration.mae <= 1.5 ? "#FFD700" : "#FF2244"}
                  />
                  <StatCard
                    label="MEAN BIAS"
                    value={signedNum(calibration.meanBias, 3)}
                    sub="avg (actual − proj)"
                    color={Math.abs(calibration.meanBias) <= 0.2 ? "#39FF14" : Math.abs(calibration.meanBias) <= 0.5 ? "#FFD700" : "#FF2244"}
                  />
                  <StatCard
                    label="CALIBRATION FACTOR"
                    value={fmtNum(calibration.calibrationFactor, 4)}
                    sub="multiply proj × factor"
                    color={Math.abs(calibration.calibrationFactor - 1) <= 0.03 ? "#39FF14" : "#FFD700"}
                  />
                  <StatCard
                    label="RMSE"
                    value={fmtNum(calibration.rmse, 3)}
                    sub="root mean squared error"
                  />
                </div>
              </div>
            )}

            {/* ── Section: Per-pitcher results ─────────────────────────── */}
            <div>
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase",
                color: "rgba(255,255,255,0.35)", fontFamily: '"Barlow Condensed", sans-serif',
                marginBottom: 10, display: "flex", alignItems: "center", gap: 8,
              }}>
                <span>PER-PITCHER RESULTS</span>
                <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
                <span style={{ color: "rgba(255,255,255,0.25)" }}>{daily.total} pitchers</span>
                {daily.completed > 0 && (
                  <>
                    <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
                    <span style={{ color: accColor }}>{daily.correct}/{daily.completed} correct</span>
                  </>
                )}
              </div>
              {daily.props.map((prop) => (
                <PitcherResultRow key={prop.id} prop={prop as PropRow} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
