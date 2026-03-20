/**
 * MarchMadnessBracket.tsx — 2026 NCAA Tournament Bracket
 *
 * Architecture:
 *  - 67 games total: 4 First Four + 32 R64 + 16 R32 + 8 S16 + 4 E8 + 2 FF + 1 Champ
 *  - Teams STAY in their R64 slot with final scores; losers are dimmed
 *  - Winners populate the next-round slot (R32, S16, E8, FF, Champ)
 *  - Connector SVG lines drawn via getBoundingClientRect() after layout paint
 *  - LEFT half: EAST (top) + SOUTH (bottom) — LTR (R64→R32→S16→E8)
 *  - RIGHT half: WEST (top) + MIDWEST (bottom) — RTL (E8→S16→R32→R64)
 *  - CENTER: First Four + Final Four + Championship
 *  - Pinch-to-zoom + touch pan + mouse wheel zoom + drag pan
 *  - Responsive: auto-scales to fit viewport on load
 *
 * Debug logging: set localStorage.bracketDebug='1' to enable verbose connector logs
 */
import React, {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from "react";
import { trpc } from "@/lib/trpc";
import { NCAAM_TEAMS } from "@shared/ncaamTeams";

// ─── Layout constants ─────────────────────────────────────────────────────────
const STRIP_H   = 34;          // px — height of one team row
const DIVIDER_H = 1;           // px — divider between top/bottom strip
const CARD_H    = STRIP_H * 2 + DIVIDER_H; // 69px
const COL_W     = 188;         // px — card width
const COL_GAP   = 44;          // px — horizontal gap between round columns (connector zone)

// Gap between matchup cards within a round column
const ROUND_GAP: Record<string, number> = {
  r64:  10,
  r32:  89,
  s16:  239,
  e8:   0,
};

// Padding-top so card[0] center aligns with its feeder midpoint
const ROUND_PAD: Record<string, number> = {
  r64:  18,
  r32:  57.5,
  s16:  132.5,
  e8:   282.5,
};

// ─── Team registry ────────────────────────────────────────────────────────────
const TEAM_BY_SLUG = new Map(NCAAM_TEAMS.map(t => [t.dbSlug, t]));

const SLUG_ALIAS: Record<string, string> = {
  north_carolina_st: 'nc_state',
  s_florida:         'south_florida',
  north_dakota_st:   'n_dakota_st',
  vcu:               'va_commonwealth',
  penn:              'pennsylvania',
  texas_am:          'texas_a_and_m',
  saint_marys:       'st_marys',
  liu:               'liu_brooklyn',
  byu:               'brigham_young',
};
function resolveSlug(s: string): string { return SLUG_ALIAS[s] ?? s; }
function isTbd(s: string): boolean {
  return !s || s.startsWith('tbd_') || s === 'tbd';
}

// ─── Seed map (bracketGameId → { away seed, home seed }) ─────────────────────
const SEED_MAP: Record<number, { away: number; home: number }> = {
  // First Four
  101: { away:16, home:16 }, 102: { away:11, home:11 },
  103: { away:16, home:16 }, 104: { away:11, home:11 },
  // EAST R64
  201: { away:16, home:1  }, 202: { away:8,  home:9  },
  203: { away:12, home:5  }, 204: { away:13, home:4  },
  205: { away:11, home:6  }, 206: { away:14, home:3  },
  207: { away:10, home:7  }, 208: { away:15, home:2  },
  // SOUTH R64
  209: { away:16, home:1  }, 210: { away:9,  home:8  },
  211: { away:12, home:5  }, 212: { away:13, home:4  },
  213: { away:6,  home:11 }, 214: { away:14, home:3  },
  215: { away:7,  home:10 }, 216: { away:15, home:2  },
  // WEST R64
  217: { away:16, home:1  }, 218: { away:8,  home:9  },
  219: { away:12, home:5  }, 220: { away:13, home:4  },
  221: { away:6,  home:11 }, 222: { away:14, home:3  },
  223: { away:7,  home:10 }, 224: { away:15, home:2  },
  // MIDWEST R64
  225: { away:16, home:1  }, 226: { away:8,  home:9  },
  227: { away:12, home:5  }, 228: { away:13, home:4  },
  229: { away:11, home:6  }, 230: { away:14, home:3  },
  231: { away:10, home:7  }, 232: { away:15, home:2  },
  // R32 — seeds come from the R64 winners
  301: { away:1,  home:9  }, 302: { away:5,  home:4  },
  303: { away:6,  home:3  }, 304: { away:7,  home:2  },
  305: { away:1,  home:8  }, 306: { away:5,  home:4  },
  307: { away:11, home:3  }, 308: { away:10, home:2  },
  309: { away:1,  home:9  }, 310: { away:12, home:4  },
  311: { away:11, home:3  }, 312: { away:7,  home:2  },
  313: { away:1,  home:9  }, 314: { away:5,  home:4  },
  315: { away:6,  home:3  }, 316: { away:7,  home:2  },
};

// ─── Region game ID map ───────────────────────────────────────────────────────
const REGION_IDS = {
  EAST:    { r64:[201,202,203,204,205,206,207,208], r32:[301,302,303,304], s16:[401,402], e8:[501] },
  SOUTH:   { r64:[209,210,211,212,213,214,215,216], r32:[305,306,307,308], s16:[403,404], e8:[502] },
  WEST:    { r64:[217,218,219,220,221,222,223,224], r32:[309,310,311,312], s16:[405,406], e8:[503] },
  MIDWEST: { r64:[225,226,227,228,229,230,231,232], r32:[313,314,315,316], s16:[407,408], e8:[504] },
} as const;
type RegionKey = keyof typeof REGION_IDS;

const FIRST_FOUR_IDS = [101, 102, 103, 104];

// ─── Types ────────────────────────────────────────────────────────────────────
interface BracketGame {
  bracketGameId: number;
  awayTeam: string;
  homeTeam: string;
  startTimeEst: string;
  gameStatus: string;
  awayScore: number | null;
  homeScore: number | null;
}

interface Strip {
  slug: string;
  seed: number;
  score: number | null;
  winner: boolean | null;  // null = game not final; true = winner; false = loser
}

interface Matchup {
  id: number;
  top: Strip;
  bot: Strip;
  status: string;   // 'upcoming' | 'live' | 'final'
  timeLabel: string;
  placeholder: boolean;
}

// ─── Build bracket data ───────────────────────────────────────────────────────
function buildBracket(games: BracketGame[]) {
  const byId = new Map(games.map(g => [g.bracketGameId, g]));

  function makeMatchup(id: number): Matchup | null {
    const g = byId.get(id);
    if (!g) return null;

    const seeds = SEED_MAP[id] ?? { away: 0, home: 0 };
    const aSlug = resolveSlug(g.awayTeam ?? '');
    const hSlug = resolveSlug(g.homeTeam ?? '');

    const isFinal = g.gameStatus === 'final';
    const isLive  = g.gameStatus === 'live' || g.gameStatus === 'in_progress';

    let aWin: boolean | null = null;
    let hWin: boolean | null = null;
    if (isFinal && g.awayScore !== null && g.homeScore !== null) {
      aWin = g.awayScore > g.homeScore;
      hWin = !aWin;
    }

    // Display: lower seed number (better seed) on top
    const awayIsTop = seeds.away <= seeds.home;
    const top: Strip = {
      slug:   awayIsTop ? aSlug : hSlug,
      seed:   awayIsTop ? seeds.away : seeds.home,
      score:  (isFinal || isLive) ? (awayIsTop ? g.awayScore : g.homeScore) : null,
      winner: awayIsTop ? aWin : hWin,
    };
    const bot: Strip = {
      slug:   awayIsTop ? hSlug : aSlug,
      seed:   awayIsTop ? seeds.home : seeds.away,
      score:  (isFinal || isLive) ? (awayIsTop ? g.homeScore : g.awayScore) : null,
      winner: awayIsTop ? hWin : aWin,
    };

    const placeholder = isTbd(aSlug) && isTbd(hSlug);
    let timeLabel = '';
    if (isFinal)     timeLabel = 'FINAL';
    else if (isLive) timeLabel = 'LIVE';
    else if (!placeholder && g.startTimeEst && g.startTimeEst !== 'TBD')
      timeLabel = g.startTimeEst + ' EST';

    return { id, top, bot, status: g.gameStatus, timeLabel, placeholder };
  }

  const regions = {} as Record<RegionKey, {
    r64: (Matchup|null)[];
    r32: (Matchup|null)[];
    s16: (Matchup|null)[];
    e8:  (Matchup|null)[];
  }>;
  for (const [key, ids] of Object.entries(REGION_IDS) as [RegionKey, typeof REGION_IDS[RegionKey]][]) {
    regions[key] = {
      r64: ids.r64.map(makeMatchup),
      r32: ids.r32.map(makeMatchup),
      s16: ids.s16.map(makeMatchup),
      e8:  ids.e8.map(makeMatchup),
    };
  }

  const firstFour = FIRST_FOUR_IDS.map(makeMatchup);
  const ff        = [601, 602].map(makeMatchup);
  const champ     = [701].map(makeMatchup);

  return { regions, firstFour, ff, champ };
}

// ─── Luminance / color helpers ────────────────────────────────────────────────
function lum(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0,2),16)/255;
  const g = parseInt(h.slice(2,4),16)/255;
  const b = parseInt(h.slice(4,6),16)/255;
  return 0.2126*r + 0.7152*g + 0.0722*b;
}

// ─── StripRow ─────────────────────────────────────────────────────────────────
function StripRow({ s }: { s: Strip }) {
  const placeholder = isTbd(s.slug);
  const team   = placeholder ? null : TEAM_BY_SLUG.get(s.slug);
  const bg     = placeholder ? '#111318' : (team?.primaryColor ?? '#1a1a2e');
  const name   = placeholder ? '' : (team?.ncaaName ?? s.slug.replace(/_/g,' ').toUpperCase());
  const logo   = placeholder ? null : (team?.logoUrl ?? null);
  const bright = lum(bg) > 0.45;
  const circleBg     = bright ? 'rgba(0,0,0,.2)'  : 'rgba(255,255,255,.18)';
  const circleBorder = bright ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.35)';

  const stateClass =
    s.winner === true  ? 'bk-strip strip-winner' :
    s.winner === false ? 'bk-strip strip-loser'  : 'bk-strip';

  return (
    <div className={stateClass} style={{ background: bg }}>
      {/* Sheen */}
      <div className="bk-sheen" />

      {/* Left logo circle — only on left */}
      {!placeholder && (
        <div className="bk-logo">
          <div className="bk-circle" style={{ background: circleBg, borderColor: circleBorder }}>
            {logo ? (
              <img
                src={logo} alt={name}
                width={16} height={16}
                style={{ objectFit:'contain', display:'block' }}
                onError={e => {
                  const el = e.currentTarget;
                  el.style.display = 'none';
                  if (el.parentElement) {
                    el.parentElement.innerHTML =
                      `<span style="font-size:5px;font-weight:900;color:#fff;letter-spacing:-.3px;line-height:1">${name.replace(/[^A-Za-z]/g,'').slice(0,4).toUpperCase()}</span>`;
                  }
                }}
              />
            ) : (
              <span style={{ fontSize:5, fontWeight:900, color:'#fff', letterSpacing:-.3, lineHeight:1 }}>
                {name.replace(/[^A-Za-z]/g,'').slice(0,4).toUpperCase()}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Seed + Name */}
      <div className="bk-center" style={{ paddingLeft: placeholder ? 8 : 34, paddingRight: s.score !== null ? 36 : 8 }}>
        {!placeholder && s.seed > 0 && (
          <span className="bk-seed">{s.seed}</span>
        )}
        {!placeholder && (
          <span className="bk-name">{name}</span>
        )}
      </div>

      {/* Score — far right */}
      {s.score !== null && (
        <div className="bk-score">
          <span>{s.score}</span>
        </div>
      )}
    </div>
  );
}

// ─── MatchupCard ──────────────────────────────────────────────────────────────
function MatchupCard({ m, champ = false }: { m: Matchup | null; champ?: boolean }) {
  const cls = `bk-card${champ ? ' bk-card-champ' : ''}`;
  if (!m) {
    return (
      <div className={cls}>
        <div className="bk-strip bk-placeholder"><div className="bk-sheen" /></div>
        <div className="bk-divider" />
        <div className="bk-strip bk-placeholder"><div className="bk-sheen" /></div>
      </div>
    );
  }
  return (
    <div className={cls}>
      <StripRow s={m.top} />
      <div className="bk-divider" />
      <StripRow s={m.bot} />
    </div>
  );
}

// ─── RoundColumn ─────────────────────────────────────────────────────────────
function RoundColumn({ matchups, roundKey, colRef, animDelay = 0 }: {
  matchups: (Matchup | null)[];
  roundKey: string;
  colRef?: React.RefObject<HTMLDivElement | null>;
  animDelay?: number;
}) {
  const gap        = ROUND_GAP[roundKey] ?? 10;
  const paddingTop = ROUND_PAD[roundKey] ?? 18;

  return (
    <div
      ref={colRef}
      className="bk-round-col"
      data-round={roundKey}
      style={{ gap: `${gap}px`, paddingTop: `${paddingTop}px`, animationDelay: `${animDelay}s` }}
    >
      {matchups.map((m, i) => {
        const tl = m?.timeLabel ?? '';
        const statusCls =
          tl === 'LIVE'  ? 'bk-status-live'  :
          tl === 'FINAL' ? 'bk-status-final' :
          tl             ? 'bk-status-time'  : '';
        return (
          <div key={m?.id ?? `ph-${i}`} className="bk-matchup-item">
            <div className={`bk-status ${statusCls}`}>{tl}</div>
            <MatchupCard m={m} />
          </div>
        );
      })}
    </div>
  );
}

// ─── SVG Connector drawing ────────────────────────────────────────────────────
function drawConnectors(
  svg: SVGSVGElement,
  wrap: HTMLElement,
  cols: (HTMLElement | null)[],
  dir: 'ltr' | 'rtl'
) {
  const debug = typeof window !== 'undefined' && localStorage.getItem('bracketDebug') === '1';
  svg.innerHTML = '';

  const wr = wrap.getBoundingClientRect();
  svg.setAttribute('width',  `${wrap.scrollWidth}`);
  svg.setAttribute('height', `${wrap.scrollHeight}`);

  const cy = (el: Element) => { const r = el.getBoundingClientRect(); return r.top  - wr.top  + r.height / 2; };
  const rx = (el: Element) => { const r = el.getBoundingClientRect(); return r.right - wr.left; };
  const lx = (el: Element) => { const r = el.getBoundingClientRect(); return r.left  - wr.left; };

  function line(d: string) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', 'bk-connector');
    svg.appendChild(p);
  }

  const validCols = cols.filter(Boolean) as HTMLElement[];
  if (debug) console.log(`[BracketConnector] dir=${dir} cols=${validCols.length}`);

  for (let ci = 0; ci < validCols.length - 1; ci++) {
    const curr = validCols[ci];
    const next = validCols[ci + 1];
    const currCards = Array.from(curr.querySelectorAll('.bk-card')) as Element[];
    const nextCards = Array.from(next.querySelectorAll('.bk-card')) as Element[];

    if (debug) console.log(`  col[${ci}]->${ci+1}: currCards=${currCards.length} nextCards=${nextCards.length}`);

    if (dir === 'ltr') {
      // Each pair of curr cards feeds one next card
      for (let ni = 0; ni < nextCards.length; ni++) {
        const top = currCards[ni * 2];
        const bot = currCards[ni * 2 + 1];
        const tgt = nextCards[ni];
        if (!top || !bot || !tgt) {
          if (debug) console.warn(`  [SKIP ltr] ni=${ni} top=${!!top} bot=${!!bot} tgt=${!!tgt}`);
          continue;
        }
        const x1   = rx(top);
        const y1   = cy(top);
        const y2   = cy(bot);
        const x2   = lx(tgt);
        const xMid = x1 + (x2 - x1) / 2;
        const yMid = (y1 + y2) / 2;
        if (debug) console.log(`  [LTR] ni=${ni} x1=${x1.toFixed(0)} y1=${y1.toFixed(0)} y2=${y2.toFixed(0)} x2=${x2.toFixed(0)} xMid=${xMid.toFixed(0)} yMid=${yMid.toFixed(0)}`);
        line(`M ${x1} ${y1} H ${xMid} V ${yMid}`);
        line(`M ${x1} ${y2} H ${xMid} V ${yMid}`);
        line(`M ${xMid} ${yMid} H ${x2}`);
      }
    } else {
      // RTL: each curr card is fed by a pair of next cards
      for (let ni = 0; ni < currCards.length; ni++) {
        const tgt = currCards[ni];
        const top = nextCards[ni * 2];
        const bot = nextCards[ni * 2 + 1];
        if (!top || !bot || !tgt) {
          if (debug) console.warn(`  [SKIP rtl] ni=${ni} top=${!!top} bot=${!!bot} tgt=${!!tgt}`);
          continue;
        }
        const x1   = lx(top);
        const y1   = cy(top);
        const y2   = cy(bot);
        const x2   = rx(tgt);
        const xMid = x2 + (x1 - x2) / 2;
        const yMid = (y1 + y2) / 2;
        if (debug) console.log(`  [RTL] ni=${ni} x1=${x1.toFixed(0)} y1=${y1.toFixed(0)} y2=${y2.toFixed(0)} x2=${x2.toFixed(0)} xMid=${xMid.toFixed(0)} yMid=${yMid.toFixed(0)}`);
        line(`M ${x1} ${y1} H ${xMid} V ${yMid}`);
        line(`M ${x1} ${y2} H ${xMid} V ${yMid}`);
        line(`M ${xMid} ${yMid} H ${x2}`);
      }
    }
  }
}

// ─── RegionBracket ────────────────────────────────────────────────────────────
function RegionBracket({ region, data, dir, baseDelay = 0 }: {
  region: string;
  data: { r64:(Matchup|null)[]; r32:(Matchup|null)[]; s16:(Matchup|null)[]; e8:(Matchup|null)[] };
  dir: 'ltr' | 'rtl';
  baseDelay?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef  = useRef<SVGSVGElement>(null);
  const c0 = useRef<HTMLDivElement>(null);
  const c1 = useRef<HTMLDivElement>(null);
  const c2 = useRef<HTMLDivElement>(null);
  const c3 = useRef<HTMLDivElement>(null);

  // LTR: [R64, R32, S16, E8]   RTL: [E8, S16, R32, R64]
  const rounds     = dir === 'ltr'
    ? [data.r64, data.r32, data.s16, data.e8]
    : [data.e8,  data.s16, data.r32, data.r64];
  const roundKeys  = dir === 'ltr'
    ? ['r64','r32','s16','e8']
    : ['e8','s16','r32','r64'];
  const roundLabels = dir === 'ltr'
    ? ['R64','R32','S16','E8']
    : ['E8','S16','R32','R64'];
  const colRefs = [c0, c1, c2, c3];

  const redraw = useCallback(() => {
    if (!svgRef.current || !wrapRef.current) return;
    drawConnectors(
      svgRef.current,
      wrapRef.current,
      [c0.current, c1.current, c2.current, c3.current],
      dir
    );
  }, [dir]);

  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(redraw));
    return () => cancelAnimationFrame(id);
  }, [redraw, data]);

  useEffect(() => {
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, [redraw]);

  return (
    <div style={{ display:'flex', flexDirection:'column' }}>
      {/* Region label */}
      <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.22em', textTransform:'uppercase', color:'rgba(255,165,50,.7)', marginBottom:4 }}>
        {region}
      </div>

      {/* Round header labels */}
      <div style={{ display:'flex', marginBottom:6 }}>
        {roundLabels.map((lbl, i) => (
          <React.Fragment key={lbl}>
            <div style={{ width:COL_W, fontSize:8.5, fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase', color:'rgba(255,255,255,.28)', paddingBottom:4, borderBottom:'1px solid rgba(255,255,255,.09)', textAlign:'center', flexShrink:0 }}>
              {lbl}
            </div>
            {i < 3 && <div style={{ width:COL_GAP, flexShrink:0 }} />}
          </React.Fragment>
        ))}
      </div>

      {/* Columns + SVG overlay */}
      <div ref={wrapRef} style={{ position:'relative', display:'flex', alignItems:'flex-start' }}>
        <svg ref={svgRef} style={{ position:'absolute', top:0, left:0, pointerEvents:'none', overflow:'visible', zIndex:10 }} />
        {rounds.map((matchups, ri) => (
          <React.Fragment key={ri}>
            <RoundColumn
              matchups={matchups}
              roundKey={roundKeys[ri]}
              colRef={colRefs[ri] as React.RefObject<HTMLDivElement | null>}
              animDelay={baseDelay + ri * 0.12}
            />
            {ri < 3 && <div style={{ width:COL_GAP, flexShrink:0 }} />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ─── FirstFourSection ─────────────────────────────────────────────────────────
function FirstFourSection({ games }: { games: (Matchup|null)[] }) {
  const visible = games.filter(Boolean);
  if (!visible.length) return null;
  return (
    <div className="bk-firstfour">
      <div className="bk-firstfour-label">FIRST FOUR</div>
      <div className="bk-firstfour-games">
        {games.map((m, i) => {
          if (!m) return null;
          const tl = m.timeLabel;
          const statusCls =
            tl === 'LIVE'  ? 'bk-status-live'  :
            tl === 'FINAL' ? 'bk-status-final' :
            tl             ? 'bk-status-time'  : '';
          return (
            <div key={m.id} className="bk-firstfour-game">
              <div className={`bk-ff-status ${statusCls}`}>{tl}</div>
              <MatchupCard m={m} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── FinalFourSection ─────────────────────────────────────────────────────────
function FinalFourSection({ ff, champ }: { ff: (Matchup|null)[]; champ: (Matchup|null)[] }) {
  const champGame = champ[0];
  const champSlug = useMemo(() => {
    if (!champGame || champGame.status !== 'final') return null;
    if (champGame.top.score === null || champGame.bot.score === null) return null;
    return champGame.top.score > champGame.bot.score ? champGame.top.slug : champGame.bot.slug;
  }, [champGame]);
  const champTeam = champSlug ? TEAM_BY_SLUG.get(champSlug) : null;

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:20, flexShrink:0, paddingTop:16 }}>
      <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.22em', textTransform:'uppercase', color:'rgba(255,165,50,.7)' }}>
        FINAL FOUR
      </div>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
        <div style={{ fontSize:8, color:'rgba(255,255,255,.28)', letterSpacing:'0.15em', textTransform:'uppercase' }}>EAST · SOUTH</div>
        <MatchupCard m={ff[0] ?? null} />
      </div>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
        <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.22em', textTransform:'uppercase', color:'rgba(255,165,50,.7)' }}>CHAMPIONSHIP</div>
        <div className="bk-trophy">🏆</div>
        <MatchupCard m={champGame ?? null} champ />
        {champTeam && (
          <div style={{ marginTop:6, textAlign:'center' }}>
            <div style={{ fontSize:9, color:'rgba(255,165,50,.7)', letterSpacing:'0.2em', textTransform:'uppercase', marginBottom:3 }}>2026 CHAMPION</div>
            <div className="bk-champ-name">{champTeam.ncaaName}</div>
          </div>
        )}
      </div>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
        <div style={{ fontSize:8, color:'rgba(255,255,255,.28)', letterSpacing:'0.15em', textTransform:'uppercase' }}>WEST · MIDWEST</div>
        <MatchupCard m={ff[1] ?? null} />
      </div>
    </div>
  );
}

// ─── Ember particles ──────────────────────────────────────────────────────────
const EMBER_DATA = Array.from({ length: 30 }, (_, i) => {
  const sz  = 1.5 + (i * 0.17) % 3;
  const col = ['#FF6B1A','#FF9B3A','#FFD060','#FF4422'][i % 4];
  return {
    key: i, sz, col,
    left:  `${(i * 3.33) % 100}%`,
    bottom:`${(i * 7.7)  % 50}%`,
    d:     `${4 + (i * 0.6) % 9}s`,
    delay: `${-((i * 0.4) % 12)}s`,
    tx:    `${((i % 9) - 4) * 10}px`,
    ty:    `${-(120 + (i * 20) % 320)}px`,
  };
});

// ─── Zoom / Pan hook ──────────────────────────────────────────────────────────
function useZoomPan(containerRef: React.RefObject<HTMLDivElement | null>, dataReady = false) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const dragging  = useRef(false);
  const lastPos   = useRef({ x: 0, y: 0 });
  const pinchDist = useRef<number | null>(null);

  // Compute initial scale to fit bracket in viewport.
  // Must run AFTER the bracket data loads and the canvas is fully painted.
  // We use a combination of useLayoutEffect (synchronous after DOM paint) +
  // a 200ms setTimeout to handle async data-driven renders.
  const applyAutoScale = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const vw = window.innerWidth;
    const canvas = el.querySelector('.bk-canvas') as HTMLElement | null;
    const bw = canvas ? canvas.scrollWidth : el.scrollWidth;
    console.log('[BracketAutoScale] vw=' + vw + ' bw=' + bw + ' dataReady=' + dataReady);
    if (bw > vw + 20) {
      const s = Math.max(0.25, Math.min(1, (vw - 16) / bw));
      console.log('[BracketAutoScale] Applying scale=' + s.toFixed(3));
      setTransform({ scale: s, x: 0, y: 0 });
    }
  }, [containerRef, dataReady]);

  // Run once on mount + re-run when data loads + 300ms delay for paint
  useLayoutEffect(() => {
    applyAutoScale();
    const t = setTimeout(applyAutoScale, 300);
    return () => clearTimeout(t);
  }, [applyAutoScale, dataReady]);

  // Also re-run when window resizes
  useEffect(() => {
    window.addEventListener('resize', applyAutoScale);
    return () => window.removeEventListener('resize', applyAutoScale);
  }, [applyAutoScale]);

  // Mouse wheel zoom
  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(t => ({
      ...t,
      scale: Math.max(0.25, Math.min(3, t.scale * delta)),
    }));
  }, []);

  // Mouse drag
  const onMouseDown = useCallback((e: MouseEvent) => {
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
  }, []);
  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  // Touch pan + pinch zoom
  const onTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchDist.current = Math.hypot(dx, dy);
    } else if (e.touches.length === 1) {
      dragging.current = true;
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, []);
  const onTouchMove = useCallback((e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2 && pinchDist.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / pinchDist.current;
      pinchDist.current = dist;
      setTransform(t => ({
        ...t,
        scale: Math.max(0.25, Math.min(3, t.scale * ratio)),
      }));
    } else if (e.touches.length === 1 && dragging.current) {
      const dx = e.touches[0].clientX - lastPos.current.x;
      const dy = e.touches[0].clientY - lastPos.current.y;
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setTransform(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
    }
  }, []);
  const onTouchEnd = useCallback(() => {
    dragging.current = false;
    pinchDist.current = null;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel',      onWheel,      { passive: false });
    el.addEventListener('mousedown',  onMouseDown);
    el.addEventListener('mousemove',  onMouseMove);
    el.addEventListener('mouseup',    onMouseUp);
    el.addEventListener('mouseleave', onMouseUp);
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    el.addEventListener('touchend',   onTouchEnd);
    return () => {
      el.removeEventListener('wheel',      onWheel);
      el.removeEventListener('mousedown',  onMouseDown);
      el.removeEventListener('mousemove',  onMouseMove);
      el.removeEventListener('mouseup',    onMouseUp);
      el.removeEventListener('mouseleave', onMouseUp);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
    };
  }, [containerRef, onWheel, onMouseDown, onMouseMove, onMouseUp, onTouchStart, onTouchMove, onTouchEnd]);

  return transform;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function MarchMadnessBracket() {
  const { data: result, isLoading, error } = trpc.bracket.getGames.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const bracket = useMemo(() => {
    if (!result?.games) return null;
    return buildBracket(result.games as unknown as BracketGame[]);
  }, [result]);

  const containerRef = useRef<HTMLDivElement>(null);
  const transform    = useZoomPan(containerRef, bracket !== null);

  if (isLoading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, color:'rgba(255,255,255,.5)', fontSize:14 }}>
      Loading bracket…
    </div>
  );
  if (error || !bracket) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, color:'#f87171', fontSize:14 }}>
      Failed to load bracket data.
    </div>
  );

  return (
    <div
      ref={containerRef}
      className="bk-root"
      style={{ cursor: 'grab', userSelect: 'none', touchAction: 'none' }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&display=swap');

        .bk-root {
          background: #0d0d0f;
          overflow: hidden;
          font-family: 'Barlow Condensed', 'Inter', sans-serif;
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 400px;
        }

        /* ── Fire background ── */
        .bk-fire-bg {
          position: absolute; inset: 0; z-index: 0; pointer-events: none;
          background:
            radial-gradient(ellipse 55% 45% at 10% 15%, rgba(255,100,20,0.28) 0%, transparent 65%),
            radial-gradient(ellipse 45% 55% at 88% 80%, rgba(180,30,30,0.22) 0%, transparent 65%),
            radial-gradient(ellipse 35% 35% at 55% 45%, rgba(255,140,40,0.10) 0%, transparent 55%);
        }
        .bk-grain {
          position: absolute; inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          opacity: 0.03; pointer-events: none; z-index: 1;
        }

        /* ── Ember particles ── */
        .bk-ember {
          position: absolute; border-radius: 50%; opacity: 0;
          animation: bk-rise var(--d,7s) var(--delay,0s) infinite ease-in;
          z-index: 2; pointer-events: none;
        }
        @keyframes bk-rise {
          0%   { opacity:0; transform:translate(0,0) scale(1); }
          15%  { opacity:.8; }
          85%  { opacity:.2; }
          100% { opacity:0; transform:translate(var(--tx,20px),var(--ty,-280px)) scale(.2); }
        }

        /* ── Zoom/pan canvas ── */
        .bk-canvas {
          position: relative; z-index: 10;
          transform-origin: top left;
          will-change: transform;
          padding: 20px 16px 60px;
        }

        /* ── Header ── */
        .bk-header { text-align:center; padding:12px 0 20px; }
        .bk-header-sub {
          font-size:10px; font-weight:700; letter-spacing:.24em;
          text-transform:uppercase; color:#FF7A28; margin-bottom:4px;
        }
        .bk-header-main {
          font-size: clamp(28px, 5vw, 52px); font-weight:900; color:#fff;
          line-height:.92; text-transform:uppercase; letter-spacing:-.01em;
        }
        .bk-header-fire {
          background:linear-gradient(130deg,#FF6B1A,#FFCF60);
          -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
        }
        .bk-header-year { font-size:11px; letter-spacing:.14em; color:rgba(255,255,255,.28); margin-top:7px; }

        /* ── Zoom hint ── */
        .bk-zoom-hint {
          position: absolute; bottom: 12px; right: 16px; z-index: 20;
          font-size: 10px; color: rgba(255,255,255,.3); letter-spacing: .08em;
          pointer-events: none;
        }

        /* ── Card ── */
        .bk-card {
          display:flex; flex-direction:column;
          width:${COL_W}px; background:#000;
          border:1.5px solid #2a2a2a; border-radius:3px; overflow:hidden;
          box-shadow:0 2px 8px rgba(0,0,0,.7), inset 0 0 0 1px rgba(255,255,255,.04);
          flex-shrink:0; position:relative; z-index:3;
        }
        .bk-card-champ {
          border-color:rgba(255,185,50,.5);
          box-shadow:0 0 18px rgba(255,120,20,.3), 0 2px 8px rgba(0,0,0,.7);
        }
        .bk-divider { height:${DIVIDER_H}px; background:#000; flex-shrink:0; }

        /* ── Strip ── */
        .bk-strip {
          position:relative; width:100%; height:${STRIP_H}px;
          display:flex; align-items:center; overflow:hidden;
          cursor:pointer; transition:filter .12s; flex-shrink:0;
        }
        .bk-strip:hover { filter:brightness(1.15); z-index:10; }
        .bk-placeholder { background:#111318 !important; }
        .strip-winner   { box-shadow:inset 0 0 0 1.5px rgba(255,200,80,.45); }
        .strip-loser    { filter:brightness(.42) saturate(.35) !important; }
        .strip-loser:hover { filter:brightness(.55) saturate(.45) !important; }

        /* Sheen */
        .bk-sheen {
          position:absolute; inset:0;
          background:linear-gradient(180deg,rgba(255,255,255,.22) 0%,rgba(255,255,255,.06) 30%,rgba(0,0,0,.18) 100%);
          z-index:2; pointer-events:none;
        }

        /* Logo — left only */
        .bk-logo {
          position:absolute; left:4px; top:50%; transform:translateY(-50%);
          z-index:4; width:28px; height:22px;
          display:flex; align-items:center; justify-content:center;
        }
        .bk-circle {
          width:20px; height:20px; border-radius:50%;
          border:1px solid rgba(255,255,255,.3);
          display:flex; align-items:center; justify-content:center; overflow:hidden;
        }

        /* Seed + Name */
        .bk-center {
          position:relative; z-index:4;
          display:flex; align-items:center; gap:4px;
          flex:1; min-width:0;
        }
        .bk-seed {
          font-size:9px; font-weight:800; min-width:10px;
          text-align:right; line-height:1;
          color:rgba(255,255,255,.55);
          text-shadow:0 1px 3px rgba(0,0,0,.8); flex-shrink:0;
        }
        .bk-name {
          font-size:13px; font-weight:900; letter-spacing:0.04em;
          text-transform:uppercase; color:#fff;
          text-shadow:0 1px 4px rgba(0,0,0,.9);
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.1;
        }

        /* Score — far right */
        .bk-score {
          position:absolute; right:6px; top:50%; transform:translateY(-50%);
          z-index:4; min-width:26px; text-align:right;
          font-size:13px; font-weight:900; color:#fff;
          text-shadow:0 1px 4px rgba(0,0,0,.9);
        }

        /* ── Matchup item wrapper ── */
        .bk-matchup-item { position:relative; flex-shrink:0; padding-top:16px; }
        .bk-status {
          position:absolute; top:0; left:0; right:0; height:16px;
          display:flex; align-items:center; justify-content:center;
          font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase;
          color:rgba(255,255,255,.35); pointer-events:none;
        }
        .bk-status-live  { color:#4ade80; text-shadow:0 0 6px rgba(74,222,128,.6); }
        .bk-status-final { color:rgba(255,255,255,.5); }
        .bk-status-time  { color:rgba(255,255,255,.38); font-weight:600; }

        /* ── Round column ── */
        .bk-round-col {
          display:flex; flex-direction:column; flex-shrink:0;
          position:relative; z-index:3;
          opacity:0; animation:bk-colIn .5s forwards;
        }
        @keyframes bk-colIn {
          from { opacity:0; transform:translateX(-6px); }
          to   { opacity:1; transform:translateX(0); }
        }

        /* ── SVG connector lines ── */
        .bk-connector {
          fill:none; stroke:rgba(255,255,255,.5);
          stroke-width:1.5px; stroke-linecap:square;
        }

        /* ── Bracket layout ── */
        .bk-layout {
          display:flex; align-items:flex-start; gap:20px;
          min-width:max-content;
        }
        .bk-half { display:flex; flex-direction:column; gap:36px; }

        /* ── First Four ── */
        .bk-firstfour {
          display:flex; flex-direction:column; align-items:center;
          gap:8px; margin-bottom:20px;
        }
        .bk-firstfour-label {
          font-size:9px; font-weight:700; letter-spacing:.22em; text-transform:uppercase;
          color:rgba(255,165,50,.7); padding-bottom:4px;
          border-bottom:1px solid rgba(255,255,255,.09); width:100%; text-align:center;
        }
        .bk-firstfour-games { display:flex; flex-wrap:wrap; gap:16px; justify-content:center; }
        .bk-firstfour-game {
          position:relative; display:flex; flex-direction:column;
          align-items:center; gap:2px;
        }
        .bk-ff-status {
          font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase;
          color:rgba(255,255,255,.35); height:14px;
          display:flex; align-items:center; justify-content:center; width:100%;
        }

        /* ── Champion ── */
        .bk-trophy {
          font-size:26px; line-height:1;
          animation:bk-glow-trophy 2.2s ease-in-out infinite;
        }
        @keyframes bk-glow-trophy {
          0%,100% { filter:drop-shadow(0 0 6px rgba(255,155,40,.5)); }
          50%      { filter:drop-shadow(0 0 16px rgba(255,155,40,.95)); }
        }
        .bk-champ-name {
          font-size:15px; font-weight:900; text-transform:uppercase; letter-spacing:.06em;
          background:linear-gradient(130deg,#FF6B1A,#FFD060);
          -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
          text-align:center; max-width:160px; line-height:1.1;
        }
      `}</style>

      {/* Fire background */}
      <div className="bk-fire-bg" />
      <div className="bk-grain" />

      {/* Ember particles */}
      {EMBER_DATA.map(e => (
        <div
          key={e.key}
          className="bk-ember"
          style={{
            width: e.sz, height: e.sz,
            left: e.left, bottom: e.bottom,
            background: e.col,
            boxShadow: `0 0 ${e.sz * 2.5}px ${e.col}`,
            ['--d' as string]: e.d,
            ['--delay' as string]: e.delay,
            ['--tx' as string]: e.tx,
            ['--ty' as string]: e.ty,
          } as React.CSSProperties}
        />
      ))}

      {/* Zoom hint */}
      <div className="bk-zoom-hint">Pinch or scroll to zoom · Drag to pan</div>

      {/* Zoom/pan canvas */}
      <div
        className="bk-canvas"
        style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
      >
        {/* Header */}
        <div className="bk-header">
          <div className="bk-header-sub">NCAA Division I Men's Basketball</div>
          <div className="bk-header-main">
            March <span className="bk-header-fire">Madness</span>
          </div>
          <div className="bk-header-year">2026 Tournament · All Regions</div>
        </div>

        {/* First Four Results */}
        <FirstFourSection games={bracket.firstFour} />

        {/* Main bracket */}
        <div className="bk-layout">
          {/* LEFT: EAST + SOUTH */}
          <div className="bk-half">
            <RegionBracket region="EAST"  data={bracket.regions.EAST}  dir="ltr" baseDelay={0.2} />
            <RegionBracket region="SOUTH" data={bracket.regions.SOUTH} dir="ltr" baseDelay={0.2} />
          </div>

          {/* CENTER: Final Four + Championship */}
          <FinalFourSection ff={bracket.ff} champ={bracket.champ} />

          {/* RIGHT: WEST + MIDWEST (RTL) */}
          <div className="bk-half">
            <RegionBracket region="WEST"    data={bracket.regions.WEST}    dir="rtl" baseDelay={0.2} />
            <RegionBracket region="MIDWEST" data={bracket.regions.MIDWEST} dir="rtl" baseDelay={0.2} />
          </div>
        </div>
      </div>
    </div>
  );
}
