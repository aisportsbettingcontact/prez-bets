// CSV Parser for AI Sports Betting Model files
// Parses the standard NCAAM/NFL/NBA model CSV format into InsertGame rows

import type { InsertGame } from "../drizzle/schema";

interface CsvRow {
  date: string;
  start_time_est: string;
  away_team: string;
  away_book_spread: string;
  away_model_spread: string;
  home_team: string;
  home_book_spread: string;
  home_model_spread: string;
  book_total: string;
  model_total: string;
  spread_edge: string;
  spread_diff: string;
  total_edge: string;
  total_diff: string;
}

function parseCsvLine(line: string): string[] {
  // Simple CSV parser (handles quoted fields)
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

function formatGameDate(raw: string): string {
  // raw = "03022026" → "2026-03-02"
  if (raw.length === 8) {
    const month = raw.slice(0, 2);
    const day = raw.slice(2, 4);
    const year = raw.slice(4, 8);
    return `${year}-${month}-${day}`;
  }
  return raw;
}

function formatTime(raw: string): string {
  // raw = "1900" → "19:00"
  if (raw.length === 4) {
    return `${raw.slice(0, 2)}:${raw.slice(2)}`;
  }
  return raw;
}

export function parseCsvContent(content: string, fileId: number, sport = "NCAAM"): InsertGame[] {
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine).map((h) => h.toLowerCase().replace(/\s+/g, "_"));

  const rows: InsertGame[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length < headers.length) continue;

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });

    const r = row as unknown as CsvRow;

    // Skip rows with missing critical data
    if (!r.date || !r.away_team || !r.home_team) continue;

    try {
      rows.push({
        fileId,
        gameDate: formatGameDate(r.date),
        startTimeEst: formatTime(r.start_time_est),
        awayTeam: r.away_team.trim(),
        awayBookSpread: r.away_book_spread,
        awayModelSpread: r.away_model_spread,
        homeTeam: r.home_team.trim(),
        homeBookSpread: r.home_book_spread,
        homeModelSpread: r.home_model_spread,
        bookTotal: r.book_total,
        modelTotal: r.model_total,
        spreadEdge: r.spread_edge?.trim() || "PASS",
        spreadDiff: r.spread_diff || "0",
        totalEdge: r.total_edge?.trim() || "PASS",
        totalDiff: r.total_diff || "0",
        sport,
      });
    } catch (err) {
      console.warn(`[CSV Parser] Skipping row ${i}:`, err);
    }
  }

  return rows;
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
  // Match patterns like "03-02-2026" or "03022026"
  const match1 = filename.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (match1) return `${match1[3]}-${match1[1]}-${match1[2]}`;
  const match2 = filename.match(/(\d{2})(\d{2})(\d{4})/);
  if (match2) return `${match2[3]}-${match2[1]}-${match2[2]}`;
  return null;
}
