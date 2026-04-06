/**
 * MlbHrPropsCard
 *
 * Displays per-player HR prop projections for a single MLB game.
 *
 * Book source: Consensus (Action Network book_id=15) — anNoVigOverPct
 *
 * Layout per game:
 *   ┌────────────────────────────────────────────────────────────┐
 *   │  AWAY TEAM                    HOME TEAM                    │
 *   │  SP: Away Pitcher             SP: Home Pitcher             │
 *   ├────────────────────────────────────────────────────────────┤
 *   │  AWAY BATTERS                                              │
 *   │  Player  Consensus Over  Consensus Under  Model P(HR)  Edge  EV  Verdict │
 *   ├────────────────────────────────────────────────────────────┤
 *   │  HOME BATTERS                                              │
 *   │  (same columns)                                            │
 *   └────────────────────────────────────────────────────────────┘
 */
import { useMemo } from "react";
import { MLB_BY_ABBREV } from "@shared/mlbTeams";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface HrPropRow {
  id: number;
  gameId: number;
  side: string;
  playerName: string;
  mlbamId?: number | null;
  teamAbbrev?: string | null;
  bookLine?: string | null;
  consensusOverOdds?: string | null;
  consensusUnderOdds?: string | null;
  anNoVigOverPct?: string | null;
  modelPHr?: string | null;
  modelOverOdds?: string | null;
  edgeOver?: string | null;
  evOver?: string | null;
  verdict?: string | null;
}

export interface HrPropsGameInfo {
  id: number;
  awayTeam: string;
  homeTeam: string;
  startTimeEst?: string | null;
  awayStartingPitcher?: string | null;
  homeStartingPitcher?: string | null;
  awayPitcherConfirmed?: boolean | null;
  homePitcherConfirmed?: boolean | null;
}

// ─── Style constants ──────────────────────────────────────────────────────────
const CARD_BG = '#090E14';
const BORDER = '#182433';
const NEON = '#39FF14';
const AMBER = '#f59e0b';
const BLUE = '#60a5fa';
const MUTED = 'rgba(255,255,255,0.45)';
const WHITE = 'rgba(255,255,255,0.92)';
const SECTION_BG = 'rgba(255,255,255,0.03)';

function verdictColor(v: string | null | undefined): string {
  if (v === 'OVER') return NEON;
  if (v === 'UNDER') return AMBER;
  return MUTED;
}

function edgeColor(edge: number): string {
  if (edge >= 0.05) return NEON;
  if (edge >= 0.02) return '#86efac';
  if (edge <= -0.05) return '#f87171';
  return MUTED;
}

function PlayerRow({ row, rank }: { row: HrPropRow; rank: number }) {
  const edge = row.edgeOver ? parseFloat(row.edgeOver) : null;
  const ev = row.evOver ? parseFloat(row.evOver) : null;
  const pHr = row.modelPHr ? parseFloat(row.modelPHr) : null;
  const isEdge = row.verdict === 'OVER';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '22px 1fr 52px 52px 52px 44px 44px 44px',
      gap: 4,
      padding: '5px 10px',
      borderBottom: `1px solid ${BORDER}`,
      background: isEdge ? 'rgba(57,255,20,0.04)' : 'transparent',
      alignItems: 'center',
    }}>
      {/* Rank */}
      <span style={{ fontSize: 9, color: MUTED, textAlign: 'center' }}>{rank}</span>
      {/* Player name */}
      <span style={{
        fontSize: 11, fontWeight: isEdge ? 700 : 500,
        color: isEdge ? WHITE : 'rgba(255,255,255,0.75)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {row.playerName}
      </span>
      {/* Consensus Over */}
      <span style={{ fontSize: 11, fontWeight: 600, color: WHITE, textAlign: 'center' }}>
        {row.consensusOverOdds ?? '—'}
      </span>
      {/* Consensus Under */}
      <span style={{ fontSize: 10, color: MUTED, textAlign: 'center' }}>
        {row.consensusUnderOdds ?? '—'}
      </span>
      {/* Model P(HR) */}
      <span style={{ fontSize: 11, fontWeight: 600, color: BLUE, textAlign: 'center' }}>
        {pHr != null ? `${(pHr * 100).toFixed(1)}%` : '—'}
      </span>
      {/* Edge */}
      <span style={{
        fontSize: 10, fontWeight: 700, textAlign: 'center',
        color: edge != null ? edgeColor(edge) : MUTED,
      }}>
        {edge != null ? `${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(1)}%` : '—'}
      </span>
      {/* EV */}
      <span style={{
        fontSize: 10, fontWeight: ev != null && ev > 0 ? 700 : 400, textAlign: 'center',
        color: ev != null && ev > 5 ? NEON : ev != null && ev > 0 ? '#86efac' : MUTED,
      }}>
        {ev != null ? `${ev >= 0 ? '+' : ''}${ev.toFixed(1)}` : '—'}
      </span>
      {/* Verdict */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {row.verdict && row.verdict !== 'PASS' ? (
          <span style={{
            fontSize: 9, fontWeight: 800, letterSpacing: '0.06em',
            color: verdictColor(row.verdict),
            border: `1px solid ${verdictColor(row.verdict)}`,
            borderRadius: 3, padding: '1px 4px',
          }}>
            {row.verdict}
          </span>
        ) : (
          <span style={{ fontSize: 9, color: MUTED }}>—</span>
        )}
      </div>
    </div>
  );
}

function TeamSection({ team, players, label }: { team: string; players: HrPropRow[]; label: string }) {
  const teamInfo = MLB_BY_ABBREV.get(team);
  const teamColor = teamInfo?.primaryColor ?? '#4B5563';
  const edgePlayers = players.filter(p => p.verdict === 'OVER').length;

  if (players.length === 0) return null;

  return (
    <div style={{ borderTop: `1px solid ${BORDER}` }}>
      {/* Team section header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '5px 10px 4px',
        background: SECTION_BG,
        borderLeft: `3px solid ${teamColor}`,
      }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: WHITE, letterSpacing: '0.08em' }}>
          {label} BATTERS ({team})
        </span>
        {edgePlayers > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: NEON,
            border: `1px solid ${NEON}`, borderRadius: 3, padding: '1px 5px',
          }}>
            {edgePlayers} EDGE{edgePlayers > 1 ? 'S' : ''}
          </span>
        )}
      </div>
      {/* Column headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '22px 1fr 52px 52px 52px 44px 44px 44px',
        gap: 4,
        padding: '3px 10px',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <span style={{ fontSize: 8, color: MUTED }}>#</span>
        <span style={{ fontSize: 8, color: MUTED }}>PLAYER</span>
        <span style={{ fontSize: 8, color: MUTED, textAlign: 'center' }}>OVER</span>
        <span style={{ fontSize: 8, color: MUTED, textAlign: 'center' }}>UNDER</span>
        <span style={{ fontSize: 8, color: BLUE, textAlign: 'center' }}>MODEL</span>
        <span style={{ fontSize: 8, color: MUTED, textAlign: 'center' }}>EDGE</span>
        <span style={{ fontSize: 8, color: MUTED, textAlign: 'center' }}>EV</span>
        <span style={{ fontSize: 8, color: MUTED, textAlign: 'center' }}>PICK</span>
      </div>
      {/* Player rows */}
      {players.map((p, i) => (
        <PlayerRow key={p.id} row={p} rank={i + 1} />
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface MlbHrPropsCardProps {
  game: HrPropsGameInfo;
  props: HrPropRow[] | undefined;
}

export default function MlbHrPropsCard({ game, props }: MlbHrPropsCardProps) {
  const awayInfo = useMemo(() => MLB_BY_ABBREV.get(game.awayTeam), [game.awayTeam]);
  const homeInfo = useMemo(() => MLB_BY_ABBREV.get(game.homeTeam), [game.homeTeam]);

  const awayColor = awayInfo?.primaryColor ?? '#4B5563';
  const homeColor = homeInfo?.primaryColor ?? '#4B5563';

  const awayPlayers = useMemo(() =>
    (props ?? []).filter(p => p.side === 'away').sort((a, b) => {
      // Sort OVER verdicts first, then by edge descending
      if (a.verdict === 'OVER' && b.verdict !== 'OVER') return -1;
      if (b.verdict === 'OVER' && a.verdict !== 'OVER') return 1;
      const ea = a.edgeOver ? parseFloat(a.edgeOver) : -99;
      const eb = b.edgeOver ? parseFloat(b.edgeOver) : -99;
      return eb - ea;
    }),
    [props]
  );

  const homePlayers = useMemo(() =>
    (props ?? []).filter(p => p.side === 'home').sort((a, b) => {
      if (a.verdict === 'OVER' && b.verdict !== 'OVER') return -1;
      if (b.verdict === 'OVER' && a.verdict !== 'OVER') return 1;
      const ea = a.edgeOver ? parseFloat(a.edgeOver) : -99;
      const eb = b.edgeOver ? parseFloat(b.edgeOver) : -99;
      return eb - ea;
    }),
    [props]
  );

  const totalEdges = [...awayPlayers, ...homePlayers].filter(p => p.verdict === 'OVER').length;

  if (!props || props.length === 0) {
    return (
      <div style={{
        background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 10,
        marginBottom: 10, padding: '12px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 11, color: MUTED }}>HR prop data not yet available for this game</span>
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

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px 6px',
        borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: WHITE, letterSpacing: '0.04em' }}>
            {game.awayTeam}
          </span>
          {game.awayStartingPitcher && (
            <span style={{ fontSize: 10, color: MUTED }}>
              SP: {game.awayStartingPitcher}{!game.awayPitcherConfirmed ? ' *' : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <span style={{ fontSize: 9, color: MUTED, letterSpacing: '0.1em' }}>HR PROPS</span>
          {totalEdges > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 800, color: NEON,
              border: `1px solid ${NEON}`, borderRadius: 4, padding: '1px 6px',
            }}>
              {totalEdges} EDGE{totalEdges > 1 ? 'S' : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: WHITE, letterSpacing: '0.04em' }}>
            {game.homeTeam}
          </span>
          {game.homeStartingPitcher && (
            <span style={{ fontSize: 10, color: MUTED }}>
              SP: {game.homeStartingPitcher}{!game.homePitcherConfirmed ? ' *' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Away batters */}
      <TeamSection team={game.awayTeam} players={awayPlayers} label="AWAY" />

      {/* Home batters */}
      <TeamSection team={game.homeTeam} players={homePlayers} label="HOME" />

      {/* Footer */}
      <div style={{
        padding: '4px 12px',
        borderTop: `1px solid ${BORDER}`,
        display: 'flex', justifyContent: 'flex-end',
      }}>
        <span style={{ fontSize: 8, color: MUTED, opacity: 0.5 }}>
          Odds: Consensus (Action Network) · Model: MLBAIModel Poisson HR · Edge threshold: 3%
        </span>
      </div>
    </div>
  );
}
