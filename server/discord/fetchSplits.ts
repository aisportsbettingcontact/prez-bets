/**
 * Data layer for the /splits Discord command.
 *
 * Pulls today's games directly from the database (no HTTP round-trip needed
 * since the bot runs inside the same server process).
 *
 * Deep logging: every row is audited for completeness and logged at debug level.
 * Set LOG_LEVEL=debug to see per-row field values.
 */

import { listGames } from "../db";
import { resolveTeam } from "./teamRegistry";

export interface SpreadSplits {
  away_ticket_pct: number | null;
  away_money_pct:  number | null;
  home_ticket_pct: number | null;
  home_money_pct:  number | null;
}

export interface TotalSplits {
  over_ticket_pct:   number | null;
  over_money_pct:    number | null;
  under_ticket_pct:  number | null;
  under_money_pct:   number | null;
}

export interface MoneylineSplits {
  away_ticket_pct: number | null;
  away_money_pct:  number | null;
  home_ticket_pct: number | null;
  home_money_pct:  number | null;
}

export interface GameSplits {
  id:          number;
  league:      string;
  game_date:   string;
  start_time:  string;
  away_team:   string;   // full display name (kept for autocomplete/logging)
  home_team:   string;
  away_city:   string;   // top line on card, e.g. "Toronto"
  away_nickname: string; // bottom line on card, e.g. "Maple Leafs"
  home_city:   string;
  home_nickname: string;
  away_abbr:   string;
  home_abbr:   string;
  away_color:  string;
  home_color:  string;
  away_color2: string;
  home_color2: string;
  away_color3: string;
  home_color3: string;
  away_logo:   string;
  home_logo:   string;
  // Book lines
  away_book_spread: string | null;
  home_book_spread: string | null;
  book_total:       string | null;
  away_ml:          string | null;
  home_ml:          string | null;
  spread:      SpreadSplits;
  total:       TotalSplits;
  moneyline:   MoneylineSplits;
}

// ─── Logger ───────────────────────────────────────────────────────────────────
const IS_DEBUG = process.env.LOG_LEVEL === "debug";
function log(stage: string, msg: string, level: "info" | "warn" | "error" | "debug" = "info") {
  if (level === "debug" && !IS_DEBUG) return;
  const ts = new Date().toISOString();
  const prefix = `[${ts}][SplitsBot][fetch:${stage}]`;
  if (level === "error") console.error(`${prefix} ❌ ${msg}`);
  else if (level === "warn") console.warn(`${prefix} ⚠️  ${msg}`);
  else console.log(`${prefix} ${msg}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Returns today's date in ET as YYYY-MM-DD */
function todayEt(): string {
  return new Date()
    .toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      year:  "numeric",
      month: "2-digit",
      day:   "2-digit",
    })
    .replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$1-$2");
}

/**
 * Formats a time string for display.
 *
 * Handles two input formats:
 *   1. Already-formatted: "7:05 PM ET" — returned as-is (MLB games store times this way)
 *   2. Raw 24-hour "HH:MM" — converted to "H:MM AM/PM ET" (NBA/NHL/NCAAM format)
 *
 * Deep logging: logs the raw input and output for every call when LOG_LEVEL=debug.
 */
function formatTime(raw: string | null | undefined): string {
  if (!raw) {
    log("time", `formatTime: null/empty input → TBD`, "debug");
    return "TBD";
  }
  // If the string already contains AM or PM, it's already formatted — pass through as-is.
  // This handles MLB games where startTimeEst is stored as "7:05 PM ET".
  if (/AM|PM/i.test(raw)) {
    log("time", `formatTime: already formatted → "${raw}" (pass-through)`, "debug");
    return raw;
  }
  // Raw 24-hour format: "HH:MM" or "H:MM"
  const [hStr, mStr] = raw.split(":");
  const h = parseInt(hStr ?? "0", 10);
  const m = parseInt(mStr ?? "0", 10);
  if (isNaN(h) || isNaN(m)) {
    log("time", `formatTime: unparseable "${raw}" → returned as-is`, "warn");
    return raw;
  }
  const period = h >= 12 ? "PM" : "AM";
  const h12    = h % 12 === 0 ? 12 : h % 12;
  const result = `${h12}:${String(m).padStart(2, "0")} ${period} ET`;
  log("time", `formatTime: "${raw}" → "${result}"`, "debug");
  return result;
}

function complement(pct: number | null): number | null {
  if (pct === null || pct === undefined) return null;
  return Math.round(100 - pct);
}

/**
 * Fetch all daily betting splits for a given date (defaults to today ET).
 * Reads directly from the database — no HTTP overhead.
 */
export async function fetchAllDailySplits(dateOverride?: string, sport?: string): Promise<GameSplits[]> {
  const gameDate = dateOverride ?? todayEt();
  log("init", `Fetching splits for date: ${gameDate}${sport ? ` sport: ${sport}` : ""}`);

  const t0   = Date.now();
  const rows = await listGames({ gameDate, ...(sport ? { sport } : {}) });
  const dbMs = Date.now() - t0;
  log("db", `DB query returned ${rows.length} row(s) in ${dbMs}ms`);

  if (rows.length === 0) {
    log("db", `No games in DB for ${gameDate}`, "warn");
    return [];
  }

  // Log raw DB row summary
  for (const row of rows) {
    const key = `${row.awayTeam} @ ${row.homeTeam}`;
    log("db", `  row[${row.id}] ${key} | sport=${row.sport} | startTime=${row.startTimeEst}`, "debug");
    log("db", `    spread: awayBetsPct=${row.spreadAwayBetsPct} awayMoneyPct=${row.spreadAwayMoneyPct}`, "debug");
    log("db", `    total:  overBetsPct=${row.totalOverBetsPct}  overMoneyPct=${row.totalOverMoneyPct}`, "debug");
    log("db", `    ml:     awayBetsPct=${row.mlAwayBetsPct}     awayMoneyPct=${row.mlAwayMoneyPct}`, "debug");
  }

  const result: GameSplits[] = rows.map((row, idx) => {
    const key = `[${idx + 1}/${rows.length}] ${row.awayTeam} @ ${row.homeTeam}`;

    // Resolve team registry entries
    // DEEP LOGGING: log raw DB slug, sport, and full resolved entry for MLB
    log("team", `${key} — resolving: away="${row.awayTeam}" home="${row.homeTeam}" sport="${row.sport}"`);
    const awayEntry = resolveTeam(row.awayTeam, row.sport);
    const homeEntry = resolveTeam(row.homeTeam, row.sport);

    // Always log resolved values (not just debug) so MLB issues are immediately visible
    log("team", `${key} — away resolved: displayName="${awayEntry.displayName}" city="${awayEntry.city}" nickname="${awayEntry.nickname}" abbrev=${awayEntry.abbrev} primaryColor=${awayEntry.primaryColor} logo=${awayEntry.logoUrl ? awayEntry.logoUrl.slice(0, 60) + '...' : 'NONE'}`);
    log("team", `${key} — home resolved: displayName="${homeEntry.displayName}" city="${homeEntry.city}" nickname="${homeEntry.nickname}" abbrev=${homeEntry.abbrev} primaryColor=${homeEntry.primaryColor} logo=${homeEntry.logoUrl ? homeEntry.logoUrl.slice(0, 60) + '...' : 'NONE'}`);

    // Warn if team resolution fell back (fallback produces city=first-word, nickname=last-word from slug)
    // For MLB: DB stores abbreviations ("NYY", "SF"), registry now handles both abbrev and slug lookup
    const awayFallback = awayEntry.logoUrl === '' || awayEntry.primaryColor === '#4A90D9';
    const homeFallback = homeEntry.logoUrl === '' || homeEntry.primaryColor === '#4A90D9';
    if (awayFallback) {
      log("team", `${key} — ⚠️  AWAY FALLBACK DETECTED for "${row.awayTeam}" (sport=${row.sport}) — team not in registry! logoUrl="${awayEntry.logoUrl}" primaryColor="${awayEntry.primaryColor}"`, "warn");
    }
    if (homeFallback) {
      log("team", `${key} — ⚠️  HOME FALLBACK DETECTED for "${row.homeTeam}" (sport=${row.sport}) — team not in registry! logoUrl="${homeEntry.logoUrl}" primaryColor="${homeEntry.primaryColor}"`, "warn");
    }

    // Extract raw split values
    const spreadAwayTicket = row.spreadAwayBetsPct  ?? null;
    const spreadAwayMoney  = row.spreadAwayMoneyPct ?? null;
    const overTicket       = row.totalOverBetsPct   ?? null;
    const overMoney        = row.totalOverMoneyPct  ?? null;
    const mlAwayTicket     = row.mlAwayBetsPct      ?? null;
    const mlAwayMoney      = row.mlAwayMoneyPct     ?? null;

    // Warn on any null splits
    const nullFields: string[] = [];
    if (spreadAwayTicket === null) nullFields.push("spreadAwayTicket");
    if (spreadAwayMoney  === null) nullFields.push("spreadAwayMoney");
    if (overTicket       === null) nullFields.push("overTicket");
    if (overMoney        === null) nullFields.push("overMoney");
    if (mlAwayTicket     === null) nullFields.push("mlAwayTicket");
    if (mlAwayMoney      === null) nullFields.push("mlAwayMoney");
    if (nullFields.length > 0) {
      log("splits", `${key} — null fields (will show 50/50): ${nullFields.join(", ")}`, "warn");
    } else {
      log("splits", `${key} — all splits present ✓`, "debug");
    }

    const game: GameSplits = {
      id:          row.id,
      league:      row.sport,
      game_date:   row.gameDate ?? gameDate,
      start_time:  formatTime(row.startTimeEst),
      away_team:     awayEntry.displayName,
      home_team:     homeEntry.displayName,
      away_city:     awayEntry.city,
      away_nickname: awayEntry.nickname,
      home_city:     homeEntry.city,
      home_nickname: homeEntry.nickname,
      away_abbr:   awayEntry.abbrev,
      home_abbr:   homeEntry.abbrev,
      away_color:  awayEntry.primaryColor,
      home_color:  homeEntry.primaryColor,
      away_color2: awayEntry.secondaryColor,
      home_color2: homeEntry.secondaryColor,
      away_color3: awayEntry.tertiaryColor,
      home_color3: homeEntry.tertiaryColor,
      away_logo:   awayEntry.logoUrl,
      home_logo:   homeEntry.logoUrl,
      away_book_spread: row.awayBookSpread != null ? String(row.awayBookSpread) : null,
      home_book_spread: row.homeBookSpread != null ? String(row.homeBookSpread) : null,
      book_total:       row.bookTotal      != null ? String(row.bookTotal)      : null,
      away_ml:          row.awayML         ?? null,
      home_ml:          row.homeML         ?? null,
      spread: {
        away_ticket_pct: spreadAwayTicket,
        away_money_pct:  spreadAwayMoney,
        home_ticket_pct: complement(spreadAwayTicket),
        home_money_pct:  complement(spreadAwayMoney),
      },
      total: {
        over_ticket_pct:  overTicket,
        over_money_pct:   overMoney,
        under_ticket_pct: complement(overTicket),
        under_money_pct:  complement(overMoney),
      },
      moneyline: {
        away_ticket_pct: mlAwayTicket,
        away_money_pct:  mlAwayMoney,
        home_ticket_pct: complement(mlAwayTicket),
        home_money_pct:  complement(mlAwayMoney),
      },
    };

    log("map", `${key} — mapped: spread=${spreadAwayTicket}%/${complement(spreadAwayTicket)}% total=${overTicket}%/${complement(overTicket)}% ml=${mlAwayTicket}%/${complement(mlAwayTicket)}%`);
    return game;
  });

  const totalMs = Date.now() - t0;
  log("done", `fetchAllDailySplits complete — ${result.length} games in ${totalMs}ms`);
  return result;
}
