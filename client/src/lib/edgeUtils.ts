/**
 * edgeUtils.ts — Single source of truth for ALL edge calculation logic.
 *
 * RULE: Edge lives in the juice, not the line.
 * The line tells you what you're betting. The juice tells you what you're paying.
 *
 * Previously duplicated in: GameCard.tsx, MlbPropsCard.tsx, MlbCheatSheetCard.tsx (V3 variants).
 * Now: one canonical implementation. Import from here everywhere.
 */

/**
 * Convert American odds to implied probability (raw, not vig-removed).
 * Returns NaN for NaN input.
 */
export function americanToImplied(odds: number): number {
  if (isNaN(odds)) return NaN;
  if (odds < 0) return (-odds) / (-odds + 100);
  return 100 / (odds + 100);
}

/**
 * Convert American odds to decimal odds.
 * Returns NaN for NaN input.
 */
export function americanToDecimal(odds: number): number {
  if (isNaN(odds)) return NaN;
  if (odds < 0) return 1 + 100 / (-odds);
  return 1 + odds / 100;
}

/**
 * Calculate edge in percentage points.
 * Positive = model likes this bet over book price.
 * Negative = book is more efficient than model here.
 * Returns NaN if either input is NaN (missing data).
 */
export function calculateEdge(bookOdds: number, modelOdds: number): number {
  const bookImplied = americanToImplied(bookOdds);
  const modelImplied = americanToImplied(modelOdds);
  if (isNaN(bookImplied) || isNaN(modelImplied)) return NaN;
  return (modelImplied - bookImplied) * 100;
}

/**
 * Calculate edge from raw probability percentage.
 * bookOdds: American odds from the book.
 * modelPct: Model's win probability as a percentage (e.g. 54.2 for 54.2%).
 * Returns edge in percentage points.
 */
export function calculateEdgeFromPct(bookOdds: number, modelPct: number): number {
  const bookImplied = americanToImplied(bookOdds);
  if (isNaN(bookImplied) || isNaN(modelPct)) return NaN;
  return (modelPct / 100 - bookImplied) * 100;
}

/** 6-tier verdict from edge pp value. */
export function getVerdict(edge: number): string {
  if (isNaN(edge)) return '—';
  if (edge >= 8) return 'ELITE';
  if (edge >= 5) return 'STRONG';
  if (edge >= 2.5) return 'PLAYABLE';
  if (edge >= 0.5) return 'SMALL';
  if (edge >= -1) return 'NEUTRAL';
  return 'FADE';
}

/** Color for a given edge pp value (spec-compliant 6-tier scale). */
export function getEdgeColor(edge: number): string {
  if (isNaN(edge)) return 'rgba(255,255,255,0.30)';
  if (edge >= 8) return '#39FF14';   // ELITE   — full neon green
  if (edge >= 5) return '#7FFF00';   // STRONG  — chartreuse
  if (edge >= 2.5) return '#ADFF2F'; // PLAYABLE — yellow-green
  if (edge >= 0.5) return 'rgba(255,255,255,0.60)'; // SMALL — white/60
  if (edge >= -1) return 'rgba(255,255,255,0.30)';  // NEUTRAL — white/30
  return '#FF2244';                  // FADE    — red
}

/**
 * Remove vig from a two-sided market.
 * Returns [awayFairPct, homeFairPct] as percentages (0–100).
 * Returns null if either ML is missing or invalid.
 */
export function removeVig(
  awayML: string | null | undefined,
  homeML: string | null | undefined
): [number, number] | null {
  if (!awayML || !homeML) return null;
  const a = parseFloat(awayML);
  const h = parseFloat(homeML);
  if (isNaN(a) || isNaN(h)) return null;
  const rawA = americanToImplied(a);
  const rawH = americanToImplied(h);
  const vigTotal = rawA + rawH;
  if (vigTotal <= 0) return null;
  return [(rawA / vigTotal) * 100, (rawH / vigTotal) * 100];
}

/** Minimum edge threshold in percentage points to display as an edge. */
export const EDGE_THRESHOLD_PP = 1.5;

/**
 * Calculate ROI % from model ML vs book ML.
 * ROI = (modelWinProb / bookNoVigProb - 1) * 100
 *
 * @param modelML  - Model's fair American ML for the side (e.g. -148 or +143)
 * @param bookML   - Book's American ML for the same side (e.g. -160 or +135)
 * @param bookOppML - Book's American ML for the opposite side (e.g. +130 or -155)
 *                   Used to compute the no-vig book probability.
 * @returns ROI as a percentage (e.g. 4.44), or NaN if any input is invalid.
 */
export function calculateRoi(
  modelML: number,
  bookML: number,
  bookOppML: number
): number {
  if (isNaN(modelML) || isNaN(bookML) || isNaN(bookOppML)) return NaN;
  const modelWinProb = americanToImplied(modelML);
  const rawBook = americanToImplied(bookML);
  const rawOpp  = americanToImplied(bookOppML);
  const vigTotal = rawBook + rawOpp;
  if (vigTotal <= 0 || isNaN(vigTotal)) return NaN;
  const bookNoVigProb = rawBook / vigTotal;
  if (bookNoVigProb <= 0) return NaN;
  return (modelWinProb / bookNoVigProb - 1) * 100;
}

/**
 * Calculate ROI % from model win probability (0–1) vs book odds.
 * Used when the model provides a direct win probability rather than ML.
 *
 * @param modelWinProb - Model's win probability as a decimal (0–1)
 * @param bookML       - Book's American ML for the same side
 * @param bookOppML    - Book's American ML for the opposite side
 * @returns ROI as a percentage (e.g. 4.44), or NaN if any input is invalid.
 */
export function calculateRoiFromProb(
  modelWinProb: number,
  bookML: number,
  bookOppML: number
): number {
  if (isNaN(modelWinProb) || isNaN(bookML) || isNaN(bookOppML)) return NaN;
  if (modelWinProb <= 0 || modelWinProb >= 1) return NaN;
  const rawBook = americanToImplied(bookML);
  const rawOpp  = americanToImplied(bookOppML);
  const vigTotal = rawBook + rawOpp;
  if (vigTotal <= 0 || isNaN(vigTotal)) return NaN;
  const bookNoVigProb = rawBook / vigTotal;
  if (bookNoVigProb <= 0) return NaN;
  return (modelWinProb / bookNoVigProb - 1) * 100;
}

/**
 * Format ROI % for display.
 * e.g. 4.44 → "4.44% ROI", -2.1 → "-2.10% ROI"
 */
export function formatRoi(roi: number): string {
  if (isNaN(roi)) return '';
  const sign = roi >= 0 ? '+' : '';
  return `${sign}${roi.toFixed(2)}% ROI`;
}
