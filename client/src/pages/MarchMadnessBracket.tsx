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

// ─── Layout constants derived from first principles ─────────────────────────
// STATUS_H: height of the status label (LIVE / FINAL / time) above each card
const STATUS_H  = 16;
// ITEM_H: total height of one matchup item (status label + card)
const ITEM_H    = STATUS_H + CARD_H;  // 85px
// GAP_R64: gap between adjacent matchup items in the R64 column
const GAP_R64   = 12;
// R64 pitch = vertical distance from one card center to the next in R64
const R64_PITCH = ITEM_H + GAP_R64;  // 97px

// R32 gap: each R32 card spans 2 R64 pitches minus one ITEM_H
const GAP_R32 = 2 * R64_PITCH - ITEM_H;  // 109px
const R32_PITCH = ITEM_H + GAP_R32;       // 194px

// S16 gap: each S16 card spans 2 R32 pitches minus one ITEM_H
const GAP_S16 = 2 * R32_PITCH - ITEM_H;  // 303px
const S16_PITCH = ITEM_H + GAP_S16;       // 388px

// E8 gap: 0 (only 1 card per half)
const GAP_E8 = 0;

// Gap between matchup cards within a round column
const ROUND_GAP: Record<string, number> = {
  r64: GAP_R64,
  r32: GAP_R32,
  s16: GAP_S16,
  e8:  GAP_E8,
};

// Padding-top so card[0] center aligns with its feeder midpoint
// Formula: paddingTop = feeder_midpoint_cy - STATUS_H - CARD_H/2
// R64 card[0] cy = STATUS_H + CARD_H/2 = 50.5
// R64 card[1] cy = 50.5 + R64_PITCH = 147.5 → midpoint = 99
// R32 paddingTop = 99 - STATUS_H - CARD_H/2 = 48.5
const PAD_R32 = R64_PITCH / 2 - STATUS_H / 2;  // 48.5px
// R32 card[0] cy = PAD_R32 + STATUS_H + CARD_H/2 = 99
// R32 card[1] cy = 99 + R32_PITCH = 293 → midpoint = 196
// S16 paddingTop = 196 - STATUS_H - CARD_H/2 = 145.5
const PAD_S16 = PAD_R32 + R64_PITCH + GAP_R32 / 2;  // 145.5px
// S16 card[0] cy = PAD_S16 + STATUS_H + CARD_H/2 = 196
// S16 card[1] cy = 196 + S16_PITCH = 584 → midpoint = 390
// E8 paddingTop = 390 - STATUS_H - CARD_H/2 = 339.5
const PAD_E8  = PAD_S16 + R32_PITCH + GAP_S16 / 2;  // 339.5px

const ROUND_PAD: Record<string, number> = {
  r64: 0,
  r32: PAD_R32,
  s16: PAD_S16,
  e8:  PAD_E8,
};

// Gap between top and bottom halves within a region (EAST top + EAST bot)
const REGION_GAP = 32;
// R64 half height = 8 items × ITEM_H + 7 gaps
const R64_HALF_H = 8 * ITEM_H + 7 * GAP_R64;  // 764px
// E8 card cy within a half = PAD_E8 + STATUS_H + CARD_H/2 = 390
const E8_CARD_CY_IN_HALF = PAD_E8 + STATUS_H + CARD_H / 2;  // 390px
// FF card cy = midpoint of E8 top and E8 bot
// E8 top cy = E8_CARD_CY_IN_HALF = 390
// E8 bot cy = R64_HALF_H + REGION_GAP + E8_CARD_CY_IN_HALF = 764 + 32 + 390 = 1186
// FF cy = (390 + 1186) / 2 = 788
const FF_CY = (E8_CARD_CY_IN_HALF + R64_HALF_H + REGION_GAP + E8_CARD_CY_IN_HALF) / 2;  // 788px
// FF_SPACING: vertical distance from Championship center to FF card center
// FF-TOP at FF_CY - FF_SPACING, FF-BOT at FF_CY + FF_SPACING
// Must not overlap E8 cards: FF-TOP cy > E8 top cy (390) and FF-BOT cy < E8 bot cy (1186)
// FF_SPACING = (1186 - 390) / 2 - some_margin = 398 - 60 = 338? No, too large.
// Actually FF cards sit between E8 and Championship, so:
// FF-TOP should be between E8[0] (390) and Championship (788): use 788 - 180 = 608
// FF-BOT should be between Championship (788) and E8[1] (1186): use 788 + 180 = 968
// Both are safely between E8 cards, no overlap.
const FF_SPACING = 180;  // px from Championship center to FF card center

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
  dir: 'ltr' | 'rtl',
  scale = 1
) {
  const debug = typeof window !== 'undefined' && localStorage.getItem('bracketDebug') === '1';
  svg.innerHTML = '';

  const wr = wrap.getBoundingClientRect();
  // SVG is inside bk-canvas which has transform:scale(s).
  // getBoundingClientRect() returns screen-space coordinates (post-transform).
  // SVG path coordinates must be in canvas-space (pre-transform), so divide by scale.
  // wrap.scrollWidth/scrollHeight are layout dimensions (pre-transform), so no division needed.
  svg.setAttribute('width',  `${wrap.scrollWidth}`);
  svg.setAttribute('height', `${wrap.scrollHeight}`);

  const cy = (el: Element) => { const r = el.getBoundingClientRect(); return (r.top  - wr.top  + r.height / 2) / scale; };
  const rx = (el: Element) => { const r = el.getBoundingClientRect(); return (r.right - wr.left) / scale; };
  const lx = (el: Element) => { const r = el.getBoundingClientRect(); return (r.left  - wr.left) / scale; };

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
      // Each pair of curr cards feeds one next card.
      // KEY FIX: use cy(tgt) as the convergence Y, NOT the midpoint of the two source cards.
      // The target card is positioned with paddingTop that shifts it relative to the source midpoint.
      // Using cy(tgt) ensures the connector arrives precisely at the target card's center.
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
        const yMid = cy(tgt);  // ← use target card center, not (y1+y2)/2
        const xMid = x1 + (x2 - x1) / 2;
        if (debug) console.log(`  [LTR] ni=${ni} x1=${x1.toFixed(0)} y1=${y1.toFixed(0)} y2=${y2.toFixed(0)} x2=${x2.toFixed(0)} xMid=${xMid.toFixed(0)} yMid(tgt)=${yMid.toFixed(0)} offset=${Math.abs(yMid-(y1+y2)/2).toFixed(1)}px`);
        line(`M ${x1} ${y1} H ${xMid} V ${yMid}`);
        line(`M ${x1} ${y2} H ${xMid} V ${yMid}`);
        line(`M ${xMid} ${yMid} H ${x2}`);
      }
    } else {
      // RTL: each curr card is fed by a pair of next cards.
      // KEY FIX: use cy(tgt) as the convergence Y.
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
        const yMid = cy(tgt);  // ← use target card center, not (y1+y2)/2
        const xMid = x2 + (x1 - x2) / 2;
        if (debug) console.log(`  [RTL] ni=${ni} x1=${x1.toFixed(0)} y1=${y1.toFixed(0)} y2=${y2.toFixed(0)} x2=${x2.toFixed(0)} xMid=${xMid.toFixed(0)} yMid(tgt)=${yMid.toFixed(0)} offset=${Math.abs(yMid-(y1+y2)/2).toFixed(1)}px`);
        line(`M ${x1} ${y1} H ${xMid} V ${yMid}`);
        line(`M ${x1} ${y2} H ${xMid} V ${yMid}`);
        line(`M ${xMid} ${yMid} H ${x2}`);
      }
    }
  }
}

// ─── RegionBracket ────────────────────────────────────────────────────────────
function RegionBracket({ region, data, dir, baseDelay = 0, scale = 1 }: {
  region: string;
  data: { r64:(Matchup|null)[]; r32:(Matchup|null)[]; s16:(Matchup|null)[]; e8:(Matchup|null)[] };
  dir: 'ltr' | 'rtl';
  baseDelay?: number;
  scale?: number;
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
      dir,
      scale
    );
  }, [dir, scale]);

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
// champTopPx: Championship card center Y (px from bk-ff top) — computed dynamically from E8 positions
// ffSpacingPx: vertical distance from Championship card center to each FF card center
function FinalFourSection({
  ff, champ, champTopPx, ffSpacingPx,
}: {
  ff: (Matchup|null)[];
  champ: (Matchup|null)[];
  champTopPx: number;   // Championship card center, px from bk-ff top (0 = use 50%)
  ffSpacingPx: number;  // Distance from champ center to FF card center
}) {
  const champGame = champ[0];
  const champSlug = useMemo(() => {
    if (!champGame || champGame.status !== 'final') return null;
    if (champGame.top.score === null || champGame.bot.score === null) return null;
    return champGame.top.score > champGame.bot.score ? champGame.top.slug : champGame.bot.slug;
  }, [champGame]);
  const champTeam = champSlug ? TEAM_BY_SLUG.get(champSlug) : null;

  // Dynamic positioning:
  //   champTopPx = E8 midpoint Y (computed after render from actual E8 card positions)
  //   ffSpacingPx = (E8_bot_cy - E8_top_cy) / 4 — quarter of E8 spread
  // This ensures: E8[0] → FF-TOP → Championship → FF-BOT → E8[1] with equal spacing.
  // Fall back to 50% if positions not yet computed (first render).
  const CARD_HALF = CARD_H / 2;  // 34.5px

  // Championship: position card center at champTopPx
  // The container has label + trophy above the card, so we offset upward by those heights.
  // label≈14px + gap6 + trophy≈26px + gap6 = 52px above card top
  // card center = card_top + CARD_HALF
  // container top = champTopPx - 52 - CARD_HALF
  const CHAMP_ABOVE = 14 + 6 + 26 + 6;  // 52px of label + trophy above card
  const champContainerTop = champTopPx > 0
    ? champTopPx - CHAMP_ABOVE - CARD_HALF
    : undefined;

  // FF-TOP card center at champTopPx - ffSpacingPx
  // FF-BOT card center at champTopPx + ffSpacingPx
  // Each FF div has a label above the card (12px + gap4 = 16px)
  const FF_ABOVE = 12 + 4;  // 16px of label above FF card
  const ffTopContainerTop = champTopPx > 0
    ? champTopPx - ffSpacingPx - FF_ABOVE - CARD_HALF
    : undefined;
  const ffBotContainerTop = champTopPx > 0
    ? champTopPx + ffSpacingPx - FF_ABOVE - CARD_HALF
    : undefined;

  // FINAL FOUR label: above FF-TOP container
  const ffLabelTop = ffTopContainerTop !== undefined ? ffTopContainerTop - 20 : undefined;

  // Fallback CSS when positions not yet computed
  const champStyle: React.CSSProperties = champContainerTop !== undefined
    ? { position:'absolute', left:'50%', transform:'translateX(-50%)', top: champContainerTop }
    : { position:'absolute', left:'50%', top:'50%', transform:'translate(-50%, -50%)' };

  const ffTopStyle: React.CSSProperties = ffTopContainerTop !== undefined
    ? { position:'absolute', left:'50%', transform:'translateX(-50%)', top: ffTopContainerTop }
    : { position:'absolute', left:'50%', transform:'translateX(-50%)', top:'calc(30% - 35px)' };

  const ffBotStyle: React.CSSProperties = ffBotContainerTop !== undefined
    ? { position:'absolute', left:'50%', transform:'translateX(-50%)', top: ffBotContainerTop }
    : { position:'absolute', left:'50%', transform:'translateX(-50%)', top:'calc(70% - 35px)' };

  const ffLabelStyle: React.CSSProperties = ffLabelTop !== undefined
    ? { position:'absolute', left:'50%', transform:'translateX(-50%)', top: ffLabelTop }
    : { position:'absolute', left:'50%', transform:'translateX(-50%)', top:'calc(30% - 55px)' };

  return (
    // bk-ff: position:relative so children can be absolute-positioned
    // align-self:stretch ensures it fills the full bracket height
    <div className="bk-ff" style={{
      position:'relative', alignSelf:'stretch', flexShrink:0,
      minWidth: COL_W + 24,
    }}>
      {/* FINAL FOUR label — above FF-TOP */}
      <div style={{ ...ffLabelStyle, fontSize:9, fontWeight:700, letterSpacing:'0.22em', textTransform:'uppercase', color:'rgba(255,165,50,.7)', whiteSpace:'nowrap' }}>
        FINAL FOUR
      </div>

      {/* FF-TOP: EAST/SOUTH winner — positioned above Championship */}
      <div className="bk-ff-top" style={{ ...ffTopStyle, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
        <div style={{ fontSize:8, color:'rgba(255,255,255,.28)', letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:2 }}>EAST · SOUTH</div>
        <MatchupCard m={ff[0] ?? null} />
      </div>

      {/* Championship — positioned at E8 midpoint */}
      <div style={{ ...champStyle, display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
        <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.22em', textTransform:'uppercase', color:'rgba(255,165,50,.7)' }}>CHAMPIONSHIP</div>
        <div className="bk-trophy">🏆</div>
        {/* bk-champ-card: Championship card — both FF cards connect here */}
        <div className="bk-champ-card">
          <MatchupCard m={champGame ?? null} champ />
        </div>
        {champTeam && (
          <div style={{ marginTop:4, textAlign:'center' }}>
            <div style={{ fontSize:9, color:'rgba(255,165,50,.7)', letterSpacing:'0.2em', textTransform:'uppercase', marginBottom:3 }}>2026 CHAMPION</div>
            <div className="bk-champ-name">{champTeam.ncaaName}</div>
          </div>
        )}
      </div>

      {/* FF-BOT: WEST/MIDWEST winner — positioned below Championship */}
      <div className="bk-ff-bot" style={{ ...ffBotStyle, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
        <div style={{ fontSize:8, color:'rgba(255,255,255,.28)', letterSpacing:'0.15em', textTransform:'uppercase', marginBottom:2 }}>WEST · MIDWEST</div>
        <MatchupCard m={ff[1] ?? null} />
      </div>
    </div>
  );
}

// ─── Center connector drawing (E8→FF→Championship) ─────────────────────────────
// This SVG spans the full bk-layout and draws:
//   EAST E8  ──────────────────────────────────────► FF top card
//   SOUTH E8 ──────────────────────────────────────► FF top card
//   WEST E8  ──────────────────────────────────────► FF bot card
//   MIDWEST E8 ────────────────────────────────────► FF bot card
//   FF top card ──────────────────────────────────► Championship
//   FF bot card ──────────────────────────────────► Championship
function drawCenterConnectors(
  svg: SVGSVGElement,
  layout: HTMLElement,
  scale: number
) {
  const debug = typeof window !== 'undefined' && localStorage.getItem('bracketDebug') === '1';
  svg.innerHTML = '';

  const lr = layout.getBoundingClientRect();
  svg.setAttribute('width',  `${layout.scrollWidth}`);
  svg.setAttribute('height', `${layout.scrollHeight}`);

  // Coordinate helpers: screen-space → canvas-space (divide by scale)
  const cy = (el: Element) => { const r = el.getBoundingClientRect(); return (r.top  - lr.top  + r.height / 2) / scale; };
  const rx = (el: Element) => { const r = el.getBoundingClientRect(); return (r.right - lr.left) / scale; };
  const lx = (el: Element) => { const r = el.getBoundingClientRect(); return (r.left  - lr.left) / scale; };

  function line(d: string, dim = false) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', dim ? 'bk-connector bk-connector-center' : 'bk-connector bk-connector-center');
    svg.appendChild(p);
  }

  // Find E8 cards: last column in each RegionBracket
  // LTR regions (EAST, SOUTH): E8 column is the rightmost column (data-round="e8")
  // RTL regions (WEST, MIDWEST): E8 column is the leftmost column (data-round="e8")
  const e8Cols = Array.from(layout.querySelectorAll('[data-round="e8"]')) as HTMLElement[];
  if (debug) console.log(`[CenterConnector] e8Cols found: ${e8Cols.length}`);

  // Find FF cards
  const ffTop   = layout.querySelector('.bk-ff-top .bk-card')   as HTMLElement | null;
  const ffBot   = layout.querySelector('.bk-ff-bot .bk-card')   as HTMLElement | null;
  const champEl = layout.querySelector('.bk-champ-card .bk-card') as HTMLElement | null;

  if (debug) {
    console.log(`[CenterConnector] ffTop=${!!ffTop} ffBot=${!!ffBot} champ=${!!champEl}`);
    if (ffTop) console.log(`  ffTop: cy=${cy(ffTop).toFixed(1)} lx=${lx(ffTop).toFixed(0)} rx=${rx(ffTop).toFixed(0)}`);
    if (ffBot) console.log(`  ffBot: cy=${cy(ffBot).toFixed(1)} lx=${lx(ffBot).toFixed(0)} rx=${rx(ffBot).toFixed(0)}`);
    if (champEl) console.log(`  champ: cy=${cy(champEl).toFixed(1)} lx=${lx(champEl).toFixed(0)} rx=${rx(champEl).toFixed(0)}`);
  }

  // E8 → FF connectors
  // e8Cols[0] = EAST E8 (LTR, rightmost) → ffTop
  // e8Cols[1] = SOUTH E8 (LTR, rightmost) → ffTop
  // e8Cols[2] = WEST E8 (RTL, leftmost) → ffBot
  // e8Cols[3] = MIDWEST E8 (RTL, leftmost) → ffBot
  const e8ToFF: Array<[HTMLElement, HTMLElement | null, 'ltr'|'rtl']> = [
    [e8Cols[0], ffTop,  'ltr'],
    [e8Cols[1], ffTop,  'ltr'],
    [e8Cols[2], ffBot,  'rtl'],
    [e8Cols[3], ffBot,  'rtl'],
  ];

  for (const [e8Col, ffCard, dir] of e8ToFF) {
    if (!e8Col || !ffCard) {
      if (debug) console.warn(`[CenterConnector] SKIP e8→ff: e8Col=${!!e8Col} ffCard=${!!ffCard}`);
      continue;
    }
    const e8Cards = Array.from(e8Col.querySelectorAll('.bk-card')) as Element[];
    if (e8Cards.length === 0) {
      if (debug) console.warn(`[CenterConnector] SKIP e8→ff: no .bk-card in e8Col`);
      continue;
    }
    // E8 column has exactly 1 card (the E8 matchup)
    const e8Card = e8Cards[0];
    const yFF   = cy(ffCard);
    const yE8   = cy(e8Card);
    const xMid  = dir === 'ltr'
      ? rx(e8Card) + (lx(ffCard) - rx(e8Card)) / 2
      : lx(e8Card) + (rx(ffCard) - lx(e8Card)) / 2;
    if (debug) console.log(`[CenterConnector] e8→ff dir=${dir} yE8=${yE8.toFixed(1)} yFF=${yFF.toFixed(1)} xMid=${xMid.toFixed(0)}`);
    if (dir === 'ltr') {
      line(`M ${rx(e8Card)} ${yE8} H ${xMid} V ${yFF} H ${lx(ffCard)}`);
    } else {
      line(`M ${lx(e8Card)} ${yE8} H ${xMid} V ${yFF} H ${rx(ffCard)}`);
    }
  }

  // FF → Championship connectors
  if (ffTop && champEl) {
    const yTop   = cy(ffTop);
    const yChamp = cy(champEl);
    const xMid   = rx(ffTop) + (lx(champEl) - rx(ffTop)) / 2;
    if (debug) console.log(`[CenterConnector] ffTop→champ: yTop=${yTop.toFixed(1)} yChamp=${yChamp.toFixed(1)} xMid=${xMid.toFixed(0)}`);
    line(`M ${rx(ffTop)} ${yTop} H ${xMid} V ${yChamp} H ${lx(champEl)}`);
  }
  if (ffBot && champEl) {
    const yBot   = cy(ffBot);
    const yChamp = cy(champEl);
    const xMid   = rx(ffBot) + (lx(champEl) - rx(ffBot)) / 2;
    if (debug) console.log(`[CenterConnector] ffBot→champ: yBot=${yBot.toFixed(1)} yChamp=${yChamp.toFixed(1)} xMid=${xMid.toFixed(0)}`);
    line(`M ${rx(ffBot)} ${yBot} H ${xMid} V ${yChamp} H ${lx(champEl)}`);
  }

  if (debug) console.log(`[CenterConnector] Total paths drawn: ${svg.querySelectorAll('path').length}`);
}

// ─── CenterConnectors overlay component ──────────────────────────────────────
function CenterConnectors({ layoutRef, scale, bracket }: {
  layoutRef: React.RefObject<HTMLDivElement | null>;
  scale: number;
  bracket: ReturnType<typeof buildBracket> | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  const redraw = useCallback(() => {
    if (!svgRef.current || !layoutRef.current) return;
    drawCenterConnectors(svgRef.current, layoutRef.current, scale);
  }, [layoutRef, scale]);

  useEffect(() => {
    // Double rAF to ensure all RegionBracket columns have painted
    const id = requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(redraw)));
    return () => cancelAnimationFrame(id);
  }, [redraw, bracket]);

  useEffect(() => {
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, [redraw]);

  return (
    <svg
      ref={svgRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: 5,  // below cards (z-index:3 for .bk-card) but above background
      }}
    />
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
function useZoomPan(
  containerRef: React.RefObject<HTMLDivElement | null>,
  layoutRef: React.RefObject<HTMLDivElement | null>,
  dataReady = false
) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const dragging  = useRef(false);
  const lastPos   = useRef({ x: 0, y: 0 });
  const pinchDist = useRef<number | null>(null);
  const scaledOnce = useRef(false);

  // Compute initial scale to fit bracket in viewport.
  // Key insight: on iOS Safari, scrollWidth of a child inside overflow:hidden
  // returns the CONTAINER width, not the actual content width.
  // Fix: read offsetWidth of bk-layout (the actual content element) directly.
  const applyAutoScale = useCallback(() => {
    const el = containerRef.current;
    const layout = layoutRef.current;
    if (!el || !layout) return;
    const vw = window.innerWidth;
    // offsetWidth is the true rendered width, unaffected by overflow:hidden parent
    const bw = layout.offsetWidth;
    console.log('[BracketAutoScale] vw=' + vw + ' layout.offsetWidth=' + bw + ' dataReady=' + dataReady + ' scaledOnce=' + scaledOnce.current);
    if (bw > 100 && bw > vw + 20) {
      const s = Math.max(0.2, Math.min(1, (vw - 8) / bw));
      console.log('[BracketAutoScale] Applying scale=' + s.toFixed(3));
      scaledOnce.current = true;
      setTransform({ scale: s, x: 0, y: 0 });
    } else if (bw > 100 && !scaledOnce.current) {
      console.log('[BracketAutoScale] Bracket fits viewport, no scale needed');
      scaledOnce.current = true;
    }
  }, [containerRef, layoutRef, dataReady]);

  // Use ResizeObserver on bk-layout to detect when content is actually painted.
  // This is more reliable than setTimeout on mobile where paint timing varies.
  useEffect(() => {
    const layout = layoutRef.current;
    if (!layout) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      const w = entry.contentRect.width;
      console.log('[BracketAutoScale] ResizeObserver fired, layout.width=' + w.toFixed(0));
      if (w > 100) applyAutoScale();
    });
    ro.observe(layout);
    // Also run immediately in case layout is already painted
    applyAutoScale();
    return () => ro.disconnect();
  }, [layoutRef, applyAutoScale]);

  // Re-run on window resize
  useEffect(() => {
    const handler = () => { scaledOnce.current = false; applyAutoScale(); };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
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
    // Stop iOS Safari page scroll from consuming our touch events
    e.stopPropagation();
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
    // preventDefault stops iOS rubber-band scroll; stopPropagation prevents parent scroll
    e.preventDefault();
    e.stopPropagation();
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
  const layoutRef    = useRef<HTMLDivElement>(null);
  const transform    = useZoomPan(containerRef, layoutRef, bracket !== null);

  // ─── Dynamic FF/Championship positioning ─────────────────────────────────────
  // After the bracket renders, read the actual E8 card positions and compute:
  //   champTopPx = midpoint of E8[0] and E8[1] card centers (relative to bk-layout top)
  //   ffSpacingPx = (E8[1].cy - E8[0].cy) / 4  (quarter of E8 spread)
  // This gives equal spacing: E8[0] → FF-TOP → Championship → FF-BOT → E8[1]
  const [ffLayout, setFfLayout] = useState({ champTopPx: 0, ffSpacingPx: 0 });

  const computeFfLayout = useCallback(() => {
    const layout = layoutRef.current;
    if (!layout) return;
    const e8Cols = Array.from(layout.querySelectorAll('[data-round="e8"]')) as HTMLElement[];
    if (e8Cols.length < 2) return;
    const e8Cards0 = e8Cols[0].querySelectorAll('.bk-card');
    const e8Cards1 = e8Cols[1].querySelectorAll('.bk-card');
    if (!e8Cards0.length || !e8Cards1.length) return;

    // Use scrollTop-relative positions (layout-space, not screen-space)
    // getBoundingClientRect gives screen coords; subtract layout top and divide by scale.
    const s = transform.scale;
    const lr = layout.getBoundingClientRect();
    const cardCY = (card: Element) => {
      const r = card.getBoundingClientRect();
      return (r.top - lr.top + r.height / 2) / s;
    };

    const cy0 = cardCY(e8Cards0[0]);
    const cy1 = cardCY(e8Cards1[0]);
    const champTopPx  = (cy0 + cy1) / 2;           // midpoint of E8 cards
    const ffSpacingPx = (cy1 - cy0) / 4;           // quarter of E8 spread
    console.log(`[FFLayout] E8[0].cy=${cy0.toFixed(1)} E8[1].cy=${cy1.toFixed(1)} champTopPx=${champTopPx.toFixed(1)} ffSpacingPx=${ffSpacingPx.toFixed(1)}`);
    setFfLayout({ champTopPx, ffSpacingPx });
  }, [transform.scale]);

  // Recompute after bracket data loads and after scale changes
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(computeFfLayout));
    return () => cancelAnimationFrame(id);
  }, [computeFfLayout, bracket]);

  useEffect(() => {
    window.addEventListener('resize', computeFfLayout);
    return () => window.removeEventListener('resize', computeFfLayout);
  }, [computeFfLayout]);

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
      style={{ cursor: 'grab' }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&display=swap');

        .bk-root {
          background: #0d0d0f;
          overflow: hidden;
          font-family: 'Barlow Condensed', 'Inter', sans-serif;
          position: relative;
          width: 100%;
          /* dvh = dynamic viewport height (excludes mobile browser chrome).
             Falls back to 100vh on browsers that don't support dvh.
             Subtract ~200px for the app header + tab bar above the bracket. */
          height: calc(100dvh - 200px);
          min-height: 420px;
          /* touch-action:none tells the browser NOT to handle scroll/zoom on this element.
             This is required for our custom pinch-zoom and drag-pan to work on iOS Safari.
             The parent page scroll is blocked by stopPropagation in our touch handlers. */
          touch-action: none;
          -webkit-user-select: none;
          user-select: none;
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
          display:flex; align-items:stretch; gap:20px;
          min-width:max-content;
        }
        .bk-half { display:flex; flex-direction:column; gap:280px; }

        /* ── First Four ── */
        .bk-firstfour {
          display:flex; flex-direction:column; align-items:center;
          gap:8px; margin-top:28px; margin-bottom:0;
        }
        .bk-firstfour-label {
          font-size:9px; font-weight:700; letter-spacing:.22em; text-transform:uppercase;
          color:rgba(255,165,50,.7); padding-bottom:4px;
          border-bottom:1px solid rgba(255,255,255,.09); width:100%; text-align:center;
        }
        /* nowrap — First Four is inside the scaled canvas so it must stay in one row */
        .bk-firstfour-games { display:flex; flex-wrap:nowrap; gap:16px; justify-content:center; }
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

        {/* Main bracket — position:relative so CenterConnectors SVG can be absolute-positioned */}
        <div ref={layoutRef} className="bk-layout" style={{ position:'relative' }}>
          {/* E8→FF→Championship SVG overlay — spans full bk-layout */}
          <CenterConnectors layoutRef={layoutRef} scale={transform.scale} bracket={bracket} />

          {/* LEFT: EAST + SOUTH */}
          <div className="bk-half">
            <RegionBracket region="EAST"  data={bracket.regions.EAST}  dir="ltr" baseDelay={0.2} scale={transform.scale} />
            <RegionBracket region="SOUTH" data={bracket.regions.SOUTH} dir="ltr" baseDelay={0.2} scale={transform.scale} />
          </div>

          {/* CENTER: Final Four + Championship */}
          <FinalFourSection
            ff={bracket.ff}
            champ={bracket.champ}
            champTopPx={ffLayout.champTopPx}
            ffSpacingPx={ffLayout.ffSpacingPx}
          />

          {/* RIGHT: WEST + MIDWEST (RTL) */}
          <div className="bk-half">
            <RegionBracket region="WEST"    data={bracket.regions.WEST}    dir="rtl" baseDelay={0.2} scale={transform.scale} />
            <RegionBracket region="MIDWEST" data={bracket.regions.MIDWEST} dir="rtl" baseDelay={0.2} scale={transform.scale} />
          </div>
        </div>

        {/* First Four Results — always at the bottom */}
        <FirstFourSection games={bracket.firstFour} />
      </div>
    </div>
  );
}
