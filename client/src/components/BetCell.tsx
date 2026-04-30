/**
 * BetCell — Universal atomic bet display component.
 *
 * Replaces: MktCard IIFE inside GameCard mobile IIFE, inline cells in DesktopMergedPanel.
 * Canonical: one implementation for all card types.
 *
 * Layout:
 *   ┌──────────────────────────────┐
 *   │  BOOK          │  MODEL      │  ← header
 *   ├──────────────────────────────┤
 *   │  bookLine      │  modelLine  │  ← away/over row
 *   │  bookJuice     │  modelJuice │
 *   ├──────────────────────────────┤
 *   │  bookLine      │  modelLine  │  ← home/under row
 *   │  bookJuice     │  modelJuice │
 *   ├──────────────────────────────┤
 *   │  edgeLabel  +X.XX% ROI      │  ← footer
 *   └──────────────────────────────┘
 */
import React from 'react';
import { getEdgeColor, EDGE_THRESHOLD_PP } from '@/lib/edgeUtils';

export interface BetCellSide {
  /** Line display string, e.g. "-1.5", "O8.5", "+110". Empty string for ML (no line). */
  bookLine: string;
  bookJuice: string;
  modelLine: string;
  modelJuice: string;
  /** Edge in percentage points for this specific side. NaN = no edge data. */
  edgePP: number;
}

interface BetCellProps {
  /** Market title: "SPREAD" | "TOTAL" | "ML" */
  title: string;
  away: BetCellSide;
  home: BetCellSide;
  /** Best edge side label, e.g. "EDM -1.5", "U6.5", "CGY ML" */
  edgeLabel?: string;
  /** Best edge PP across away/home for this market. Used for footer. */
  bestEdgePP?: number;
  /** Visual size: 'sm' = mobile compressed, 'md' = tablet/desktop */
  size?: 'sm' | 'md';
}

export const BetCell = React.memo(function BetCell({
  away,
  home,
  edgeLabel,
  bestEdgePP = NaN,
  size = 'sm',
}: BetCellProps) {
  const hasEdge = !isNaN(bestEdgePP) && bestEdgePP >= EDGE_THRESHOLD_PP;
  const edgeColor = hasEdge ? getEdgeColor(bestEdgePP) : undefined;

  const juiceSize = size === 'sm' ? 14 : 16;
  const lineSize = size === 'sm' ? 9 : 10;
  const headerSize = size === 'sm' ? 6.5 : 8;
  const footerSize = size === 'sm' ? 7 : 8;
  const borderRadius = size === 'sm' ? 8 : 10;
  const padding = size === 'sm' ? '3px 4px' : '5px 7px';

  const awayEdge = !isNaN(away.edgePP) && away.edgePP >= EDGE_THRESHOLD_PP;
  const homeEdge = !isNaN(home.edgePP) && home.edgePP >= EDGE_THRESHOLD_PP;

  const TeamRow = ({ side, isEdge }: { side: BetCellSide; isEdge: boolean }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, padding }}>
      {/* Book column */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        {side.bookLine && (
          <span style={{ fontSize: lineSize, color: 'rgba(255,255,255,0.45)', lineHeight: 1 }}>
            {side.bookLine}
          </span>
        )}
        <span
          style={{
            fontSize: juiceSize,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.90)',
            lineHeight: 1,
          }}
        >
          {side.bookJuice || '—'}
        </span>
      </div>
      {/* Model column */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        {side.modelLine && (
          <span style={{ fontSize: lineSize, color: 'rgba(255,255,255,0.45)', lineHeight: 1 }}>
            {side.modelLine}
          </span>
        )}
        <span
          style={{
            fontSize: juiceSize,
            fontWeight: 700,
            lineHeight: 1,
            color: isEdge ? getEdgeColor(side.edgePP) : 'rgba(255,255,255,0.90)',
          }}
        >
          {side.modelJuice || '—'}
        </span>
      </div>
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: '#2a2a2e',
        borderRadius,
        overflow: 'hidden',
        flex: '1 1 0',
        minWidth: 0,
      }}
    >
      {/* BOOK / MODEL header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          borderBottom: '0.5px solid rgba(255,255,255,0.08)',
          padding: '3px 4px 2px',
        }}
      >
        <span
          style={{
            fontSize: headerSize,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.30)',
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          BOOK
        </span>
        <span
          style={{
            fontSize: headerSize,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.65)',
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          MODEL
        </span>
      </div>

      {/* Away / Over row */}
      <TeamRow side={away} isEdge={awayEdge} />

      {/* Divider */}
      <div style={{ height: 0.5, background: 'rgba(255,255,255,0.07)', margin: '0 4px' }} />

      {/* Home / Under row */}
      <TeamRow side={home} isEdge={homeEdge} />

      {/* ROI Footer */}
      <div
        style={{
          borderTop: '0.5px solid rgba(255,255,255,0.07)',
          padding: '3px 4px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1,
          background: hasEdge ? 'rgba(57,255,20,0.04)' : 'transparent',
        }}
      >
        {hasEdge && edgeLabel && (
          <span
            style={{
              fontSize: footerSize,
              fontWeight: 700,
              color: edgeColor,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              lineHeight: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
              textAlign: 'center',
            }}
          >
            {edgeLabel}
          </span>
        )}
        <span
          style={{
            fontSize: footerSize + 0.5,
            fontWeight: hasEdge ? 800 : 400,
            color: hasEdge ? edgeColor : 'rgba(200,200,200,0.40)',
            letterSpacing: '0.03em',
            lineHeight: 1,
          }}
        >
          {hasEdge && !isNaN(bestEdgePP)
            ? `+${bestEdgePP.toFixed(2)}% ROI`
            : 'NO EDGE'}
        </span>
      </div>
    </div>
  );
});
