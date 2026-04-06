/**
 * MlbF5NrfiCard
 *
 * Displays First Five Innings (F5) and NRFI/YRFI market projections for a single MLB game.
 *
 * Data sources:
 *   F5 ML / RL / Total odds → FanDuel NJ (Action Network book_id=69)
 *   NRFI / YRFI odds        → FanDuel NJ (Action Network book_id=69)
 *   Model projections       → MLBAIModel.py (400K Monte Carlo simulations)
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  TEAM GRADIENT BAR (away ← → home)                     │
 *   │  MATCHUP HEADER: away @ home + start time              │
 *   ├─────────────────────────────────────────────────────────┤
 *   │  F5 SECTION                                             │
 *   │    ML:  away odds | model pct | home odds               │
 *   │    RL:  away line+odds | model pct | home line+odds     │
 *   │    TOT: over odds | model total | under odds            │
 *   ├─────────────────────────────────────────────────────────┤
 *   │  NRFI / YRFI SECTION                                    │
 *   │    NRFI: FD odds | model pct | verdict                  │
 *   │    YRFI: FD odds | model pct | verdict                  │
 *   └─────────────────────────────────────────────────────────┘
 */
import { useMemo } from "react";
import { MLB_BY_ABBREV } from "@shared/mlbTeams";
import { teamLogoGradient } from "@/lib/teamLogoCircle";

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface F5NrfiGame {
  id: number;
  awayTeam: string;
  homeTeam: string;
  startTimeEst: string | null;
  sport: string;
  // F5 book odds (FanDuel NJ)
  f5AwayML: string | null;
  f5HomeML: string | null;
  f5AwayRunLine: string | null;
  f5HomeRunLine: string | null;
  f5AwayRunLineOdds: string | null;
  f5HomeRunLineOdds: string | null;
  f5Total: string | null;
  f5OverOdds: string | null;
  f5UnderOdds: string | null;
  // F5 model projections
  modelF5AwayScore: string | null;
  modelF5HomeScore: string | null;
  modelF5Total: string | null;
  modelF5OverRate: string | null;
  modelF5UnderRate: string | null;
  modelF5AwayWinPct: string | null;
  modelF5HomeWinPct: string | null;
  modelF5AwayRLCoverPct: string | null;
  modelF5HomeRLCoverPct: string | null;
  modelF5OverOdds: string | null;
  modelF5UnderOdds: string | null;
  // NRFI/YRFI book odds (FanDuel NJ)
  nrfiOverOdds: string | null;
  yrfiUnderOdds: string | null;
  // NRFI/YRFI model
  modelPNrfi: string | null;
  modelNrfiOdds: string | null;
  modelYrfiOdds: string | null;
}

interface MlbF5NrfiCardProps {
  game: F5NrfiGame;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmtOdds(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  return n > 0 ? `+${n}` : `${n}`;
}

function fmtPct(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function fmtScore(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return n.toFixed(2);
}

function fmtLine(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  return n > 0 ? `+${n}` : `${n}`;
}

function fmtTotal(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return n.toFixed(1);
}

function formatTime(t: string | null | undefined): string {
  if (!t) return "TBD";
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return t;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Compute edge between model probability and book implied probability (from American odds) */
function computeEdge(modelPct: string | null | undefined, bookOdds: string | null | undefined): { edge: number; isEdge: boolean } | null {
  if (!modelPct || !bookOdds) return null;
  const model = parseFloat(modelPct) / 100;
  const odds = parseFloat(bookOdds);
  if (isNaN(model) || isNaN(odds)) return null;
  // Convert American odds to implied probability
  const implied = odds < 0 ? (-odds) / (-odds + 100) : 100 / (odds + 100);
  const edge = model - implied;
  return { edge, isEdge: Math.abs(edge) >= 0.03 };
}

/** Edge color: green if model favors, red if book favors, white if neutral */
function edgeColor(edge: number | null | undefined): string {
  if (edge == null) return "rgba(255,255,255,0.85)";
  if (edge >= 0.03) return "#39FF14";
  if (edge <= -0.03) return "#FF4444";
  return "rgba(255,255,255,0.85)";
}

// ─── Sub-components ────────────────────────────────────────────────────────────

interface MarketRowProps {
  label: string;
  awayVal: string;
  awayOdds?: string;
  modelVal: string;
  modelLabel?: string;
  homeVal: string;
  homeOdds?: string;
  awayEdge?: { edge: number; isEdge: boolean } | null;
  homeEdge?: { edge: number; isEdge: boolean } | null;
}

function MarketRow({ label, awayVal, awayOdds, modelVal, modelLabel, homeVal, homeOdds, awayEdge, homeEdge }: MarketRowProps) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "48px 1fr 80px 1fr",
      alignItems: "center",
      padding: "5px 10px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      gap: 4,
    }}>
      {/* Label */}
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>
        {label}
      </span>
      {/* Away */}
      <div style={{ textAlign: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: awayEdge?.isEdge ? "#39FF14" : "rgba(255,255,255,0.9)", fontFamily: "'Barlow Condensed', sans-serif" }}>
          {awayVal}
        </span>
        {awayOdds && (
          <span style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>
            {awayOdds}
          </span>
        )}
      </div>
      {/* Model center */}
      <div style={{ textAlign: "center", background: "rgba(255,255,255,0.04)", borderRadius: 4, padding: "3px 4px" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#39FF14", fontFamily: "'Barlow Condensed', sans-serif" }}>
          {modelVal}
        </span>
        {modelLabel && (
          <span style={{ display: "block", fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
            {modelLabel}
          </span>
        )}
      </div>
      {/* Home */}
      <div style={{ textAlign: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: homeEdge?.isEdge ? "#39FF14" : "rgba(255,255,255,0.9)", fontFamily: "'Barlow Condensed', sans-serif" }}>
          {homeVal}
        </span>
        {homeOdds && (
          <span style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>
            {homeOdds}
          </span>
        )}
      </div>
    </div>
  );
}

interface NrfiRowProps {
  label: string;
  bookOdds: string | null | undefined;
  modelPct: string | null | undefined;
  modelOdds: string | null | undefined;
  isNrfi: boolean;
}

function NrfiRow({ label, bookOdds, modelPct, modelOdds, isNrfi }: NrfiRowProps) {
  const modelPctNum = modelPct ? parseFloat(modelPct) : null;
  const edgeResult = computeEdge(isNrfi ? modelPct : (modelPctNum != null ? String(100 - modelPctNum) : null), bookOdds);
  const hasEdge = edgeResult?.isEdge ?? false;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "60px 1fr 1fr 1fr",
      alignItems: "center",
      padding: "6px 10px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      gap: 4,
    }}>
      {/* Label */}
      <span style={{
        fontSize: 11, fontWeight: 800, letterSpacing: "0.06em",
        color: isNrfi ? "#39FF14" : "#FF6B35",
        textTransform: "uppercase",
        fontFamily: "'Barlow Condensed', sans-serif",
      }}>
        {label}
      </span>
      {/* FD Book odds */}
      <div style={{ textAlign: "center" }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 1 }}>FD ODDS</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)", fontFamily: "'Barlow Condensed', sans-serif" }}>
          {fmtOdds(bookOdds)}
        </span>
      </div>
      {/* Model probability */}
      <div style={{ textAlign: "center" }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 1 }}>MODEL %</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#39FF14", fontFamily: "'Barlow Condensed', sans-serif" }}>
          {modelPctNum != null
            ? isNrfi
              ? fmtPct(modelPct)
              : `${(100 - modelPctNum).toFixed(1)}%`
            : "—"}
        </span>
      </div>
      {/* Model fair value odds */}
      <div style={{ textAlign: "center" }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 1 }}>MODEL ODDS</span>
        <span style={{
          fontSize: 13, fontWeight: 700,
          color: hasEdge ? "#39FF14" : "rgba(255,255,255,0.85)",
          fontFamily: "'Barlow Condensed', sans-serif",
        }}>
          {fmtOdds(isNrfi ? modelOdds : null)}
          {!isNrfi && modelOdds && fmtOdds(modelOdds) !== "—" ? (
            // For YRFI, show the YRFI odds (modelYrfiOdds passed as modelOdds)
            fmtOdds(modelOdds)
          ) : null}
        </span>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function MlbF5NrfiCard({ game }: MlbF5NrfiCardProps) {
  const awayInfo = MLB_BY_ABBREV.get(game.awayTeam);
  const homeInfo = MLB_BY_ABBREV.get(game.homeTeam);
  const awayName = awayInfo?.city ?? game.awayTeam;
  const homeName = homeInfo?.city ?? game.homeTeam;
  const awayColor = awayInfo?.primaryColor ?? "#666";
  const homeColor = homeInfo?.primaryColor ?? "#888";
  const awayLogo = awayInfo ? teamLogoGradient(game.awayTeam) : null;
  const homeLogo = homeInfo ? teamLogoGradient(game.homeTeam) : null;

  // F5 ML edge computation
  const awayF5MlEdge = useMemo(() => computeEdge(game.modelF5AwayWinPct, game.f5AwayML), [game.modelF5AwayWinPct, game.f5AwayML]);
  const homeF5MlEdge = useMemo(() => computeEdge(game.modelF5HomeWinPct, game.f5HomeML), [game.modelF5HomeWinPct, game.f5HomeML]);

  // F5 RL edge computation
  const awayF5RlEdge = useMemo(() => computeEdge(game.modelF5AwayRLCoverPct, game.f5AwayRunLineOdds), [game.modelF5AwayRLCoverPct, game.f5AwayRunLineOdds]);
  const homeF5RlEdge = useMemo(() => computeEdge(game.modelF5HomeRLCoverPct, game.f5HomeRunLineOdds), [game.modelF5HomeRLCoverPct, game.f5HomeRunLineOdds]);

  // F5 Total edge computation
  const overF5Edge = useMemo(() => computeEdge(game.modelF5OverRate, game.f5OverOdds), [game.modelF5OverRate, game.f5OverOdds]);
  const underF5Edge = useMemo(() => computeEdge(game.modelF5UnderRate, game.f5UnderOdds), [game.modelF5UnderRate, game.f5UnderOdds]);

  const hasF5Data = game.f5AwayML || game.f5Total || game.modelF5AwayScore;
  const hasNrfiData = game.nrfiOverOdds || game.modelPNrfi;

  return (
    <div style={{
      background: "#090E14",
      border: "1px solid #182433",
      borderRadius: 10,
      marginBottom: 10,
      overflow: "hidden",
      fontFamily: "'Barlow Condensed', 'Barlow', sans-serif",
    }}>
      {/* Team gradient bar */}
      <div style={{
        height: 4,
        background: `linear-gradient(to right, ${awayColor}, ${homeColor})`,
      }} />

      {/* Matchup header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px 6px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {awayLogo && <img src={awayLogo} alt={game.awayTeam} style={{ width: 22, height: 22, objectFit: "contain" }} />}
          <span style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.9)", letterSpacing: "0.04em" }}>
            {awayName}
          </span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "0 2px" }}>@</span>
          {homeLogo && <img src={homeLogo} alt={game.homeTeam} style={{ width: 22, height: 22, objectFit: "contain" }} />}
          <span style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.9)", letterSpacing: "0.04em" }}>
            {homeName}
          </span>
        </div>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
          {formatTime(game.startTimeEst)}
        </span>
      </div>

      {/* Column headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "48px 1fr 80px 1fr",
        padding: "4px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        gap: 4,
      }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}></span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", textAlign: "center" }}>
          {game.awayTeam}
        </span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", textAlign: "center" }}>
          MODEL
        </span>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", textAlign: "center" }}>
          {game.homeTeam}
        </span>
      </div>

      {/* F5 Section */}
      {hasF5Data ? (
        <>
          <div style={{ padding: "4px 10px 2px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", color: "#39FF14", textTransform: "uppercase" }}>
              F5 · FANDUEL NJ
            </span>
          </div>

          {/* F5 ML */}
          <MarketRow
            label="ML"
            awayVal={fmtOdds(game.f5AwayML)}
            modelVal={fmtPct(game.modelF5AwayWinPct)}
            modelLabel="AWAY WIN"
            homeVal={fmtOdds(game.f5HomeML)}
            awayEdge={awayF5MlEdge}
            homeEdge={homeF5MlEdge}
          />

          {/* F5 RL */}
          <MarketRow
            label="RL"
            awayVal={fmtLine(game.f5AwayRunLine)}
            awayOdds={fmtOdds(game.f5AwayRunLineOdds)}
            modelVal={fmtPct(game.modelF5AwayRLCoverPct)}
            modelLabel="AWAY CVR"
            homeVal={fmtLine(game.f5HomeRunLine)}
            homeOdds={fmtOdds(game.f5HomeRunLineOdds)}
            awayEdge={awayF5RlEdge}
            homeEdge={homeF5RlEdge}
          />

          {/* F5 Total */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "48px 1fr 80px 1fr",
            alignItems: "center",
            padding: "5px 10px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            gap: 4,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>
              TOT
            </span>
            {/* Over */}
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 1 }}>O {fmtTotal(game.f5Total)}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: overF5Edge?.isEdge ? "#39FF14" : "rgba(255,255,255,0.9)", fontFamily: "'Barlow Condensed', sans-serif" }}>
                {fmtOdds(game.f5OverOdds)}
              </span>
            </div>
            {/* Model total */}
            <div style={{ textAlign: "center", background: "rgba(255,255,255,0.04)", borderRadius: 4, padding: "3px 4px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#39FF14", fontFamily: "'Barlow Condensed', sans-serif" }}>
                {fmtScore(game.modelF5AwayScore)} – {fmtScore(game.modelF5HomeScore)}
              </span>
              <span style={{ display: "block", fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
                TOT {fmtTotal(game.modelF5Total)}
              </span>
            </div>
            {/* Under */}
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 1 }}>U {fmtTotal(game.f5Total)}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: underF5Edge?.isEdge ? "#39FF14" : "rgba(255,255,255,0.9)", fontFamily: "'Barlow Condensed', sans-serif" }}>
                {fmtOdds(game.f5UnderOdds)}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div style={{ padding: "12px 10px", textAlign: "center" }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>F5 odds not yet available</span>
        </div>
      )}

      {/* NRFI / YRFI Section */}
      {hasNrfiData ? (
        <>
          <div style={{ padding: "4px 10px 2px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", color: "#FF6B35", textTransform: "uppercase" }}>
              NRFI / YRFI · FANDUEL NJ
            </span>
          </div>

          {/* NRFI row */}
          <NrfiRow
            label="NRFI"
            bookOdds={game.nrfiOverOdds}
            modelPct={game.modelPNrfi}
            modelOdds={game.modelNrfiOdds}
            isNrfi={true}
          />

          {/* YRFI row */}
          <NrfiRow
            label="YRFI"
            bookOdds={game.yrfiUnderOdds}
            modelPct={game.modelPNrfi}
            modelOdds={game.modelYrfiOdds}
            isNrfi={false}
          />
        </>
      ) : (
        <div style={{ padding: "12px 10px", textAlign: "center" }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>NRFI/YRFI odds not yet available</span>
        </div>
      )}

      {/* Source footer */}
      <div style={{ padding: "4px 10px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: "0.04em" }}>
          F5 + NRFI/YRFI odds: FanDuel NJ · Model: 400K Monte Carlo
        </span>
      </div>
    </div>
  );
}
