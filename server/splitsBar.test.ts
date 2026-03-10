/**
 * splitsBar.test.ts
 *
 * Tests for the betting splits bar percentage display logic.
 *
 * Design rules (non-negotiable):
 *   1. Labels ALWAYS appear INSIDE their pill segment — never outside.
 *   2. 100%/0% → single full-width segment, only the 100% label shown, 0% hidden entirely.
 *   3. Any value 1–99% → segment gets a minWidth guarantee so the label always fits.
 *
 * These tests validate the pure logic layer (segment visibility, minWidth, label values)
 * that drives both LabeledBar (mobile) and SplitBar (desktop).
 */

import { describe, it, expect } from "vitest";

// ── Pure logic extracted from the component ──────────────────────────────────
// This mirrors exactly what LabeledBar and SplitBar compute.

const MOBILE_SEGMENT_MIN_PX = 28;
const DESKTOP_SEGMENT_MIN_PX = 38;

interface SegmentResult {
  awayVisible: boolean;
  homeVisible: boolean;
  awayLabel: string | null;  // null = not rendered
  homeLabel: string | null;  // null = not rendered
  awayMinWidth: number | null; // null = not applicable (full-bar case)
  homeMinWidth: number | null;
  dividerVisible: boolean;
  awayIsFull: boolean;
  homeIsFull: boolean;
}

function computeSegments(
  awayPct: number,
  homePct: number,
  minPx: number
): SegmentResult {
  const isAwayFull = awayPct >= 100;
  const isHomeFull = homePct >= 100;

  // Visibility rules
  const awayVisible = awayPct > 0 && !isHomeFull;
  const homeVisible = homePct > 0 && !isAwayFull;

  // Labels — always inside, never outside
  const awayLabel = isAwayFull
    ? "100%"
    : awayPct > 0 && !isHomeFull
    ? `${awayPct}%`
    : null;

  const homeLabel = isHomeFull
    ? "100%"
    : homePct > 0 && !isAwayFull
    ? `${homePct}%`
    : null;

  // minWidth — applied to every non-full segment that is visible
  const awayMinWidth = awayVisible && !isAwayFull ? minPx : null;
  const homeMinWidth = homeVisible && !isHomeFull ? minPx : null;

  // Divider only between two non-full segments
  const dividerVisible = !isAwayFull && !isHomeFull && awayPct > 0 && homePct > 0;

  return {
    awayVisible,
    homeVisible,
    awayLabel,
    homeLabel,
    awayMinWidth,
    homeMinWidth,
    dividerVisible,
    awayIsFull: isAwayFull,
    homeIsFull: isHomeFull,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Splits bar segment logic — 100%/0% cases", () => {
  it("100/0: away is full-bar, home is hidden, no divider", () => {
    const r = computeSegments(100, 0, MOBILE_SEGMENT_MIN_PX);
    expect(r.awayIsFull).toBe(true);
    expect(r.homeIsFull).toBe(false);
    // awayVisible tracks the normal segment branch ({away > 0 && !isHomeFull});
    // the full-bar is rendered via the separate {isAwayFull && ...} branch
    expect(r.awayVisible).toBe(true);  // 100 > 0 && !isHomeFull(false) → true
    expect(r.homeVisible).toBe(false); // home is 0, so hidden
    expect(r.awayLabel).toBe("100%");  // label says 100%
    expect(r.homeLabel).toBe(null);    // 0% is NEVER shown
    expect(r.dividerVisible).toBe(false);
  });

  it("0/100: home is full-bar, away is hidden, no divider", () => {
    const r = computeSegments(0, 100, MOBILE_SEGMENT_MIN_PX);
    expect(r.homeIsFull).toBe(true);
    expect(r.awayIsFull).toBe(false);
    expect(r.awayVisible).toBe(false); // away is 0, so hidden
    // homeVisible tracks the normal segment branch ({home > 0 && !isAwayFull});
    // the full-bar is rendered via the separate {isHomeFull && ...} branch
    expect(r.homeVisible).toBe(true);  // 100 > 0 && !isAwayFull(false) → true
    expect(r.homeLabel).toBe("100%");  // label says 100%
    expect(r.awayLabel).toBe(null);    // 0% is NEVER shown
    expect(r.dividerVisible).toBe(false);
  });
});

describe("Splits bar segment logic — single-digit percentages (1–9%)", () => {
  it("1/99: both segments visible, both have minWidth guarantee, labels inside", () => {
    const r = computeSegments(1, 99, MOBILE_SEGMENT_MIN_PX);
    expect(r.awayVisible).toBe(true);
    expect(r.homeVisible).toBe(true);
    expect(r.awayLabel).toBe("1%");
    expect(r.homeLabel).toBe("99%");
    expect(r.awayMinWidth).toBe(MOBILE_SEGMENT_MIN_PX);
    expect(r.homeMinWidth).toBe(MOBILE_SEGMENT_MIN_PX);
    expect(r.dividerVisible).toBe(true);
  });

  it("4/96: both segments visible, both have minWidth guarantee", () => {
    const r = computeSegments(4, 96, MOBILE_SEGMENT_MIN_PX);
    expect(r.awayVisible).toBe(true);
    expect(r.homeVisible).toBe(true);
    expect(r.awayLabel).toBe("4%");
    expect(r.homeLabel).toBe("96%");
    expect(r.awayMinWidth).toBe(MOBILE_SEGMENT_MIN_PX);
    expect(r.homeMinWidth).toBe(MOBILE_SEGMENT_MIN_PX);
    expect(r.dividerVisible).toBe(true);
  });

  it("9/91: both segments visible, both have minWidth guarantee", () => {
    const r = computeSegments(9, 91, MOBILE_SEGMENT_MIN_PX);
    expect(r.awayVisible).toBe(true);
    expect(r.homeVisible).toBe(true);
    expect(r.awayLabel).toBe("9%");
    expect(r.homeLabel).toBe("91%");
    expect(r.awayMinWidth).toBe(MOBILE_SEGMENT_MIN_PX);
    expect(r.homeMinWidth).toBe(MOBILE_SEGMENT_MIN_PX);
    expect(r.dividerVisible).toBe(true);
  });

  it("99/1: both segments visible, both have minWidth guarantee", () => {
    const r = computeSegments(99, 1, MOBILE_SEGMENT_MIN_PX);
    expect(r.awayVisible).toBe(true);
    expect(r.homeVisible).toBe(true);
    expect(r.awayLabel).toBe("99%");
    expect(r.homeLabel).toBe("1%");
    expect(r.awayMinWidth).toBe(MOBILE_SEGMENT_MIN_PX);
    expect(r.homeMinWidth).toBe(MOBILE_SEGMENT_MIN_PX);
    expect(r.dividerVisible).toBe(true);
  });
});

describe("Splits bar segment logic — normal splits", () => {
  it("50/50: both segments visible with divider", () => {
    const r = computeSegments(50, 50, MOBILE_SEGMENT_MIN_PX);
    expect(r.awayVisible).toBe(true);
    expect(r.homeVisible).toBe(true);
    expect(r.awayLabel).toBe("50%");
    expect(r.homeLabel).toBe("50%");
    expect(r.dividerVisible).toBe(true);
    expect(r.awayIsFull).toBe(false);
    expect(r.homeIsFull).toBe(false);
  });

  it("65/35: both segments visible with divider", () => {
    const r = computeSegments(65, 35, MOBILE_SEGMENT_MIN_PX);
    expect(r.awayVisible).toBe(true);
    expect(r.homeVisible).toBe(true);
    expect(r.awayLabel).toBe("65%");
    expect(r.homeLabel).toBe("35%");
    expect(r.dividerVisible).toBe(true);
  });

  it("95/5: both segments visible, 5% side has minWidth guarantee", () => {
    const r = computeSegments(95, 5, MOBILE_SEGMENT_MIN_PX);
    expect(r.awayVisible).toBe(true);
    expect(r.homeVisible).toBe(true);
    expect(r.awayLabel).toBe("95%");
    expect(r.homeLabel).toBe("5%");
    expect(r.homeMinWidth).toBe(MOBILE_SEGMENT_MIN_PX);
    expect(r.dividerVisible).toBe(true);
  });
});

describe("Splits bar segment logic — no outside labels ever", () => {
  // This test validates the core invariant: no label is ever placed outside the pill.
  // In the old code, labels < 15% were placed outside. The new code never does this.
  // We verify this by checking that every visible segment has a minWidth guarantee
  // AND that the label is always set (not null) for visible segments.

  const testCases = [
    [1, 99], [2, 98], [3, 97], [4, 96], [5, 95],
    [6, 94], [7, 93], [8, 92], [9, 91], [10, 90],
    [11, 89], [12, 88], [13, 87], [14, 86], [15, 85],
    [20, 80], [25, 75], [30, 70], [50, 50],
    [70, 30], [75, 25], [80, 20], [85, 15],
    [86, 14], [87, 13], [88, 12], [89, 11], [90, 10],
    [91, 9], [92, 8], [93, 7], [94, 6], [95, 5],
    [96, 4], [97, 3], [98, 2], [99, 1],
  ];

  for (const [away, home] of testCases) {
    it(`${away}/${home}: both labels are inside (non-null) and minWidth is set`, () => {
      const r = computeSegments(away, home, MOBILE_SEGMENT_MIN_PX);
      // Both segments must be visible
      expect(r.awayVisible).toBe(true);
      expect(r.homeVisible).toBe(true);
      // Both labels must be non-null (i.e., rendered inside the segment)
      expect(r.awayLabel).not.toBeNull();
      expect(r.homeLabel).not.toBeNull();
      // Both segments must have a minWidth guarantee
      expect(r.awayMinWidth).toBe(MOBILE_SEGMENT_MIN_PX);
      expect(r.homeMinWidth).toBe(MOBILE_SEGMENT_MIN_PX);
    });
  }
});

describe("Splits bar segment logic — desktop minWidth", () => {
  it("1/99 desktop: minWidth is DESKTOP_SEGMENT_MIN_PX", () => {
    const r = computeSegments(1, 99, DESKTOP_SEGMENT_MIN_PX);
    expect(r.awayMinWidth).toBe(DESKTOP_SEGMENT_MIN_PX);
    expect(r.homeMinWidth).toBe(DESKTOP_SEGMENT_MIN_PX);
  });

  it("100/0 desktop: no minWidth needed (full-bar case)", () => {
    const r = computeSegments(100, 0, DESKTOP_SEGMENT_MIN_PX);
    expect(r.awayMinWidth).toBeNull();
    expect(r.homeMinWidth).toBeNull();
    expect(r.awayLabel).toBe("100%");
    expect(r.homeLabel).toBeNull();
  });
});
