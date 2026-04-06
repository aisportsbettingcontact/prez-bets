/**
 * MlbF5NrfiCard
 *
 * Displays F5 (First 5 Innings) and NRFI/YRFI model projections for a single MLB game.
 *
 * Book sources (enforced in scrapers):
 *   - F5 ML, F5 Total, F5 RL → FanDuel NJ (book_id=69)
 *   - NRFI/YRFI → FanDuel NJ (book_id=69)
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────┐
 *   │  AWAY TEAM          vs          HOME TEAM           │
 *   │  SP: Away Pitcher       SP: Home Pitcher            │
 *   ├─────────────────────────────────────────────────────┤
 *   │  F5 MONEY LINE                                      │
 *   │  Away ML   Model Away ML   Home ML   Model Home ML  │
 *   ├─────────────────────────────────────────────────────┤
 *   │  F5 TOTAL                                           │
 *   │  Book Line  Book Over  Book Under  Model Total      │
 *   │  Model Over  Model Under  Edge                      │
 *   ├─────────────────────────────────────────────────────┤
 *   │  NRFI / YRFI                                        │
 *   │  NRFI Odds  YRFI Odds  Model P(NRFI)  Model Odds   │
 *   └─────────────────────────────────────────────────────┘
 */
import { useMemo } from "react";
import { MLB_BY_ABBREV } from "@shared/mlbTeams";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface F5NrfiGameRow {
  id: number;
  awayTeam: string;
  homeTeam: string;
  startTimeEst: string | null;
  awayStartingPitcher?: string | null;
  homeStartingPitcher?: string | null;
  awayPitcherConfirmed?: boolean | null;
  homePitcherConfirmed?: boolean | null;
  // F5 book odds (FanDuel NJ)
  f5Total?: string | null;
  f5OverOdds?: string | null;
  f5UnderOdds?: string | null;
  f5AwayML?: string | null;
  f5HomeML?: string | null;
  // F5 model values
  modelF5AwayScore?: string | null;
  modelF5HomeScore?: string | null;
  modelF5Total?: string | null;
  modelF5OverRate?: string | null;
  modelF5UnderRate?: string | null;
  modelF5AwayWinPct?: string | null;
  modelF5HomeWinPct?: string | null;
  modelF5AwayML?: string | null;
  modelF5HomeML?: string | null;
  modelF5AwayRLCoverPct?: string | null;
  modelF5HomeRLCoverPct?: string | null;
  modelF5OverOdds?: string | null;
  modelF5UnderOdds?: string | null;
  // NRFI/YRFI book odds (FanDuel NJ)
  nrfiOverOdds?: string | null;
  yrfiUnderOdds?: string | null;
  // NRFI/YRFI model values
  modelPNrfi?: string | null;
  modelNrfiOdds?: string | null;
  modelYrfiOdds?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const CARD_BG = '#090E14';
const BORDER = '#182433';
const NEON = '#39FF14';
const AMBER = '#f59e0b';
const BLUE = '#60a5fa';
const MUTED = 'rgba(255,255,255,0.45)';
const WHITE = 'rgba(255,255,255,0.92)';

function americanOddsToProb(odds: string | null | undefined): number | null {
  if (!odds) return null;
  const n = parseFloat(odds.replace('+', ''));
  if (isNaN(n)) return null;
  if (n < 0) return -n / (-n + 100);
  return 100 / (n + 100);
}

function edgeColor(edge: number): string {
  if (edge >= 0.05) return NEON;
  if (edge >= 0.02) return '#86efac';
  if (edge <= -0.05) return '#f87171';
  return MUTED;
}

function EdgeBadge({ model, book }: { model: string | null | undefined; book: string | null | undefined }) {
  const modelP = americanOddsToProb(model);
  const bookP = americanOddsToProb(book);
  if (modelP == null || bookP == null) return null;
  const edge = modelP - bookP;
  const sign = edge >= 0 ? '+' : '';
  return (
    <span style={{ fontSize: 9, fontWeight: 700, color: edgeColor(edge), letterSpacing: '0.04em' }}>
      {sign}{(edge * 100).toFixed(1)}%
    </span>
  );
}

function OddsCell({ label, book, model }: { label: string; book?: string | null; model?: string | null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 56 }}>
      <span style={{ fontSize: 9, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: WHITE, fontFamily: "'Barlow Condensed', sans-serif" }}>
        {book ?? '—'}
      </span>
      {model && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: 10, color: BLUE, fontWeight: 600 }}>{model}</span>
          <EdgeBadge model={model} book={book} />
        </div>
      )}
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      padding: '5px 10px 3px',
      borderTop: `1px solid ${BORDER}`,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    }}>
      <span style={{ fontSize: 9, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        {label}
      </span>
      <span style={{ fontSize: 8, color: MUTED, opacity: 0.6 }}>FanDuel NJ</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface MlbF5NrfiCardProps {
  game: F5NrfiGameRow;
}

export default function MlbF5NrfiCard({ game }: MlbF5NrfiCardProps) {
  const awayInfo = useMemo(() => MLB_BY_ABBREV.get(game.awayTeam), [game.awayTeam]);
  const homeInfo = useMemo(() => MLB_BY_ABBREV.get(game.homeTeam), [game.homeTeam]);

  const awayColor = awayInfo?.primaryColor ?? '#4B5563';
  const homeColor = homeInfo?.primaryColor ?? '#4B5563';

  // F5 Total edge computation
  const f5TotalEdge = useMemo(() => {
    if (!game.f5Total || !game.modelF5Total) return null;
    const bookLine = parseFloat(game.f5Total);
    const modelLine = parseFloat(String(game.modelF5Total));
    if (isNaN(bookLine) || isNaN(modelLine)) return null;
    return modelLine - bookLine;
  }, [game.f5Total, game.modelF5Total]);

  // NRFI edge computation
  const nrfiEdge = useMemo(() => {
    const modelP = game.modelPNrfi ? parseFloat(String(game.modelPNrfi)) / 100 : null;
    const bookP = americanOddsToProb(game.nrfiOverOdds);
    if (modelP == null || bookP == null) return null;
    return modelP - bookP;
  }, [game.modelPNrfi, game.nrfiOverOdds]);

  const nrfiModelPct = game.modelPNrfi ? parseFloat(String(game.modelPNrfi)) : null;
  const nrfiVerdict = nrfiEdge != null && nrfiEdge >= 0.03 ? 'NRFI' : nrfiEdge != null && nrfiEdge <= -0.03 ? 'YRFI' : null;

  const hasF5Data = game.f5AwayML || game.f5HomeML || game.f5Total || game.f5OverOdds;
  const hasNrfiData = game.nrfiOverOdds || game.yrfiUnderOdds || game.modelPNrfi;

  if (!hasF5Data && !hasNrfiData) {
    return (
      <div style={{
        background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 10,
        marginBottom: 10, padding: '12px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 11, color: MUTED }}>F5/NRFI data not yet available for this game</span>
      </div>
    );
  }

  return (
    <div style={{
      background: CARD_BG,
      border: `1px solid ${BORDER}`,
      borderRadius: 10,
      marginBottom: 10,
      overflow: 'hidden',
      fontFamily: "'Barlow Condensed', 'Inter', sans-serif",
    }}>
      {/* Team color gradient top bar */}
      <div style={{
        height: 3,
        background: `linear-gradient(to right, ${awayColor} 0%, ${awayColor} 50%, ${homeColor} 50%, ${homeColor} 100%)`,
      }} />

      {/* Header: teams + starting pitchers */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px 6px',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: WHITE, letterSpacing: '0.04em' }}>
            {game.awayTeam}
          </span>
          {game.awayStartingPitcher && (
            <span style={{ fontSize: 10, color: MUTED }}>
              {game.awayStartingPitcher}{!game.awayPitcherConfirmed ? ' *' : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: 9, color: MUTED, letterSpacing: '0.1em' }}>F5 / NRFI</span>
          <span style={{ fontSize: 10, color: MUTED }}>@</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: WHITE, letterSpacing: '0.04em' }}>
            {game.homeTeam}
          </span>
          {game.homeStartingPitcher && (
            <span style={{ fontSize: 10, color: MUTED }}>
              {game.homeStartingPitcher}{!game.homePitcherConfirmed ? ' *' : ''}
            </span>
          )}
        </div>
      </div>

      {/* ── F5 MONEY LINE ── */}
      {(game.f5AwayML || game.f5HomeML || game.modelF5AwayML || game.modelF5HomeML) && (
        <>
          <SectionHeader label="F5 Money Line" />
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: 8, padding: '6px 12px 10px',
          }}>
            <OddsCell label={`${game.awayTeam} ML`} book={game.f5AwayML} model={game.modelF5AwayML} />
            <OddsCell label={`${game.homeTeam} ML`} book={game.f5HomeML} model={game.modelF5HomeML} />
          </div>
          {/* Model projected scores */}
          {(game.modelF5AwayScore || game.modelF5HomeScore) && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, padding: '0 12px 8px' }}>
              <span style={{ fontSize: 10, color: MUTED }}>Model F5 Score:</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: BLUE }}>
                {game.awayTeam} {Number(game.modelF5AwayScore).toFixed(2)} — {Number(game.modelF5HomeScore).toFixed(2)} {game.homeTeam}
              </span>
            </div>
          )}
        </>
      )}

      {/* ── F5 TOTAL ── */}
      {(game.f5Total || game.f5OverOdds || game.modelF5Total) && (
        <>
          <SectionHeader label="F5 Total" />
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            gap: 6, padding: '6px 12px 8px',
          }}>
            <OddsCell label="Book Line" book={game.f5Total} />
            <OddsCell label="Over" book={game.f5OverOdds} model={game.modelF5OverOdds} />
            <OddsCell label="Under" book={game.f5UnderOdds} model={game.modelF5UnderOdds} />
          </div>
          {game.modelF5Total && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '0 12px 8px' }}>
              <span style={{ fontSize: 10, color: MUTED }}>Model Total:</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: BLUE }}>
                {Number(game.modelF5Total).toFixed(1)}
              </span>
              {f5TotalEdge != null && (
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  color: Math.abs(f5TotalEdge) >= 0.5 ? NEON : MUTED,
                  letterSpacing: '0.04em',
                }}>
                  ({f5TotalEdge >= 0 ? '+' : ''}{f5TotalEdge.toFixed(2)} vs book)
                </span>
              )}
            </div>
          )}
          {/* Over/Under rates */}
          {(game.modelF5OverRate || game.modelF5UnderRate) && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, padding: '0 12px 8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <span style={{ fontSize: 9, color: MUTED }}>Model Over%</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: WHITE }}>{Number(game.modelF5OverRate).toFixed(1)}%</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <span style={{ fontSize: 9, color: MUTED }}>Model Under%</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: WHITE }}>{Number(game.modelF5UnderRate).toFixed(1)}%</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── NRFI / YRFI ── */}
      {hasNrfiData && (
        <>
          <SectionHeader label="NRFI / YRFI (1st Inning)" />
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
            gap: 6, padding: '6px 12px 10px',
          }}>
            <OddsCell label="NRFI" book={game.nrfiOverOdds} model={game.modelNrfiOdds} />
            <OddsCell label="YRFI" book={game.yrfiUnderOdds} model={game.modelYrfiOdds} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 56 }}>
              <span style={{ fontSize: 9, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Model P(NRFI)</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: WHITE, fontFamily: "'Barlow Condensed', sans-serif" }}>
                {nrfiModelPct != null ? `${nrfiModelPct.toFixed(1)}%` : '—'}
              </span>
              {nrfiEdge != null && (
                <span style={{ fontSize: 9, fontWeight: 700, color: edgeColor(nrfiEdge) }}>
                  {nrfiEdge >= 0 ? '+' : ''}{(nrfiEdge * 100).toFixed(1)}%
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 56 }}>
              <span style={{ fontSize: 9, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Verdict</span>
              {nrfiVerdict ? (
                <span style={{
                  fontSize: 11, fontWeight: 800, letterSpacing: '0.08em',
                  color: nrfiVerdict === 'NRFI' ? NEON : AMBER,
                  border: `1px solid ${nrfiVerdict === 'NRFI' ? NEON : AMBER}`,
                  borderRadius: 4, padding: '1px 5px',
                }}>
                  {nrfiVerdict}
                </span>
              ) : (
                <span style={{ fontSize: 11, color: MUTED }}>PASS</span>
              )}
            </div>
          </div>
        </>
      )}

      {/* Footer: data source */}
      <div style={{
        padding: '4px 12px',
        borderTop: `1px solid ${BORDER}`,
        display: 'flex', justifyContent: 'flex-end',
      }}>
        <span style={{ fontSize: 8, color: MUTED, opacity: 0.5 }}>
          F5 + NRFI/YRFI odds: FanDuel NJ · Model: MLBAIModel 400K sims
        </span>
      </div>
    </div>
  );
}
