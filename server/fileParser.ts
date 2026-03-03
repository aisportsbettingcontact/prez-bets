/**
 * fileParser.ts
 *
 * Parses XLSX and CSV model files using the canonical 03-02-2026 column format:
 *
 * Col A: date            – "MMDDYYYY" string, e.g. "03022026"
 * Col B: start_time_est  – 4-digit 24h string, e.g. "1900"
 * Col C: away_team       – snake_case team name, e.g. "duke"
 * Col D: away_book_spread
 * Col E: away_model_spread
 * Col F: home_team
 * Col G: home_book_spread
 * Col H: book_total
 * Col I: home_model_spread
 * Col J: model_total
 * Col K: spread_edge     – computed label, e.g. "duke (-9.5)" or "PASS"
 * Col L: spread_diff     – numeric
 * Col M: total_edge      – computed label, e.g. "UNDER 150.5" or "PASS"
 * Col N: total_diff      – numeric
 *
 * For XLSX files the parser reads every sheet that matches this header layout.
 * For CSV files the parser reads the single sheet.
 */

import * as XLSX from "xlsx";
import type { InsertGame } from "../drizzle/schema";

// ─── Column indices (0-based) for the canonical format ────────────────────────
const COL = {
  date: 0,
  start_time_est: 1,
  away_team: 2,
  away_book_spread: 3,
  away_model_spread: 4,
  home_team: 5,
  home_book_spread: 6,
  book_total: 7,
  home_model_spread: 8,
  model_total: 9,
  spread_edge: 10,
  spread_diff: 11,
  total_edge: 12,
  total_diff: 13,
} as const;

// Expected header values (lowercase, trimmed) for validation
const EXPECTED_HEADERS = [
  "date",
  "start_time_est",
  "away_team",
  "away_book_spread",
  "away_model_spread",
  "home_team",
  "home_book_spread",
  "book_total",
  "home_model_spread",
  "model_total",
  "spread_edge",
  "spread_diff",
  "total_edge",
  "total_diff",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function toNum(v: unknown): string {
  if (v === null || v === undefined || v === "") return "0";
  const n = parseFloat(String(v));
  return isNaN(n) ? "0" : String(n);
}

/**
 * Convert "MMDDYYYY" → "YYYY-MM-DD"
 * Also handles JS Date objects from openpyxl-style reads.
 */
function parseDate(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).replace(/\D/g, "");
  if (s.length === 8) {
    // MMDDYYYY
    return `${s.slice(4, 8)}-${s.slice(0, 2)}-${s.slice(2, 4)}`;
  }
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return String(v);
  return s;
}

/**
 * Convert 4-digit 24h time "1900" → "19:00"
 * Also handles Date objects (Excel stores times as Date with 1899-12-30 base).
 */
function parseTime(v: unknown): string {
  if (!v) return "00:00";
  if (v instanceof Date) {
    const h = String(v.getHours()).padStart(2, "0");
    const m = String(v.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
  const s = String(v).trim();
  if (/^\d{4}$/.test(s)) {
    return `${s.slice(0, 2)}:${s.slice(2)}`;
  }
  if (/^\d{1,2}:\d{2}$/.test(s)) return s.padStart(5, "0");
  return s;
}

/**
 * Format team name from snake_case to Title Case display.
 * e.g. "nc_state" → "NC State", "duke" → "Duke"
 */
export function formatTeamName(raw: string): string {
  return raw
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

// ─── Header validation ────────────────────────────────────────────────────────

function isCanonicalHeader(row: unknown[]): boolean {
  if (row.length < EXPECTED_HEADERS.length) return false;
  return EXPECTED_HEADERS.every(
    (expected, i) => toStr(row[i]).toLowerCase() === expected
  );
}

// ─── Row parser ───────────────────────────────────────────────────────────────

function parseDataRow(
  row: unknown[],
  fileId: number,
  sport: string
): InsertGame | null {
  const awayTeam = toStr(row[COL.away_team]);
  const homeTeam = toStr(row[COL.home_team]);

  // Skip empty or header-like rows
  if (!awayTeam || !homeTeam) return null;
  if (awayTeam.toLowerCase() === "away_team") return null;

  const gameDate = parseDate(row[COL.date]);
  if (!gameDate) return null;

  return {
    fileId,
    sport,
    gameDate,
    startTimeEst: parseTime(row[COL.start_time_est]),
    awayTeam,
    awayBookSpread: toNum(row[COL.away_book_spread]),
    awayModelSpread: toNum(row[COL.away_model_spread]),
    homeTeam,
    homeBookSpread: toNum(row[COL.home_book_spread]),
    homeModelSpread: toNum(row[COL.home_model_spread]),
    bookTotal: toNum(row[COL.book_total]),
    modelTotal: toNum(row[COL.model_total]),
    spreadEdge: toStr(row[COL.spread_edge]) || "PASS",
    spreadDiff: toNum(row[COL.spread_diff]),
    totalEdge: toStr(row[COL.total_edge]) || "PASS",
    totalDiff: toNum(row[COL.total_diff]),
  };
}

// ─── XLSX parser ──────────────────────────────────────────────────────────────

export function parseXlsxBuffer(
  buffer: Buffer,
  fileId: number,
  sport = "NCAAM"
): InsertGame[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const allGames: InsertGame[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: null,
      raw: false, // get formatted strings for dates/times
    });

    if (rawRows.length < 2) continue;

    const headerRow = rawRows[0] as unknown[];

    // Only process sheets that match the canonical 03-02-2026 format
    if (!isCanonicalHeader(headerRow)) {
      console.log(`[XLSX Parser] Skipping sheet "${sheetName}" — does not match canonical format`);
      continue;
    }

    console.log(`[XLSX Parser] Processing sheet "${sheetName}" (${rawRows.length - 1} data rows)`);

    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i] as unknown[];
      if (!row || row.every((v) => v === null || v === "")) continue;

      const game = parseDataRow(row, fileId, sport);
      if (game) allGames.push(game);
    }
  }

  return allGames;
}

// ─── CSV parser ───────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCsvBuffer(
  buffer: Buffer,
  fileId: number,
  sport = "NCAAM"
): InsertGame[] {
  const content = buffer.toString("utf-8");
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headerRow = parseCsvLine(lines[0]);

  if (!isCanonicalHeader(headerRow)) {
    throw new Error(
      `CSV does not match the expected format. Expected headers: ${EXPECTED_HEADERS.join(", ")}`
    );
  }

  const rows: InsertGame[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    if (vals.length < EXPECTED_HEADERS.length) continue;

    const game = parseDataRow(vals, fileId, sport);
    if (game) rows.push(game);
  }

  return rows;
}

// ─── Unified entry point ──────────────────────────────────────────────────────

export function parseFileBuffer(
  buffer: Buffer,
  filename: string,
  fileId: number,
  sport = "NCAAM"
): InsertGame[] {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "xlsx" || ext === "xls") {
    return parseXlsxBuffer(buffer, fileId, sport);
  }
  return parseCsvBuffer(buffer, fileId, sport);
}

export function detectSportFromFilename(filename: string): string {
  const upper = filename.toUpperCase();
  if (upper.includes("NCAAM")) return "NCAAM";
  if (upper.includes("NCAAF")) return "NCAAF";
  if (upper.includes("NFL")) return "NFL";
  if (upper.includes("NBA")) return "NBA";
  if (upper.includes("MLB")) return "MLB";
  if (upper.includes("NHL")) return "NHL";
  return "NCAAM";
}

export function detectDateFromFilename(filename: string): string | null {
  const m1 = filename.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (m1) return `${m1[3]}-${m1[1]}-${m1[2]}`;
  const m2 = filename.match(/(\d{2})(\d{2})(\d{4})/);
  if (m2) return `${m2[3]}-${m2[1]}-${m2[2]}`;
  return null;
}
