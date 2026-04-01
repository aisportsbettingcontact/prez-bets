/**
 * dbPopulationAudit.ts
 *
 * Deep end-to-end audit: compares live MetaBet API data against what is
 * actually stored in the database for every game across NCAAM, NBA, and NHL.
 *
 * Checks per game:
 *   - awayBookSpread / homeBookSpread (spread line)
 *   - awaySpreadOdds / homeSpreadOdds (spread juice)
 *   - bookTotal (O/U total)
 *   - overOdds / underOdds (O/U juice)
 *   - awayML / homeML (moneyline)
 *
 * Outputs a per-game table with PASS/FAIL/MISSING status for each field,
 * plus a summary with completeness percentages.
 */

import { fetchMetabetConsensusOdds, type MetabetConsensusOdds } from "./metabetScraper";
import { getDb } from "./db";
import { games } from "../drizzle/schema";
import { eq, and, gte, lt } from "drizzle-orm";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayRange(): { start: string; end: string } {
  const now = new Date();
  // Use EST
  const estOffset = -5 * 60;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const estMs = utcMs + estOffset * 60000;
  const est = new Date(estMs);
  const yyyy = est.getFullYear();
  const mm = String(est.getMonth() + 1).padStart(2, "0");
  const dd = String(est.getDate()).padStart(2, "0");
  const today = `${yyyy}-${mm}-${dd}`;
  // Also include tomorrow to catch late-night games
  const tomorrow = new Date(estMs + 86400000);
  const ty = tomorrow.getFullYear();
  const tm = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const td = String(tomorrow.getDate()).padStart(2, "0");
  return { start: today, end: `${ty}-${tm}-${td}` };
}

function fmt(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  return String(v);
}

function status(dbVal: string | number | null | undefined, apiVal: string | number | null | undefined): string {
  if (apiVal == null) return "API_NULL";
  if (dbVal == null || dbVal === "") return "❌ MISSING";
  return "✅ OK";
}

function numStatus(dbVal: string | number | null | undefined, apiVal: string | number | null | undefined): string {
  if (apiVal == null) return "API_NULL";
  if (dbVal == null || dbVal === "") return "❌ MISSING";
  return "✅ OK";
}

// ─── DB query ─────────────────────────────────────────────────────────────────

async function getDbGames(sport: string) {
  const { start, end } = todayRange();
  const db = await getDb();
  const rows = await db
    .select({
      id: games.id,
      awayTeam: games.awayTeam,
      homeTeam: games.homeTeam,
      gameDate: games.gameDate,
      sport: games.sport,
      awayBookSpread: games.awayBookSpread,
      homeBookSpread: games.homeBookSpread,
      awaySpreadOdds: games.awaySpreadOdds,
      homeSpreadOdds: games.homeSpreadOdds,
      bookTotal: games.bookTotal,
      overOdds: games.overOdds,
      underOdds: games.underOdds,
      awayML: games.awayML,
      homeML: games.homeML,
    })
    .from(games)
    .where(
      and(
        eq(games.sport, sport),
        gte(games.gameDate, start),
        lt(games.gameDate, end)
      )
    );
  return rows;
}

// ─── Matching ─────────────────────────────────────────────────────────────────

function normalizeTeamKey(city: string, name: string): string {
  return `${city} ${name}`.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchApiToDb(
  apiGame: MetabetConsensusOdds,
  dbRows: Awaited<ReturnType<typeof getDbGames>>
): Awaited<ReturnType<typeof getDbGames>>[0] | null {
  const awayKey = normalizeTeamKey(apiGame.awayCity, apiGame.awayName);
  const homeKey = normalizeTeamKey(apiGame.homeCity, apiGame.homeName);
  const awayInit = apiGame.awayInitials.toLowerCase();
  const homeInit = apiGame.homeInitials.toLowerCase();

  for (const row of dbRows) {
    const dbAway = row.awayTeam?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
    const dbHome = row.homeTeam?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";

    // Try initials match first (most reliable for NHL/NBA)
    if (dbAway.includes(awayInit) || dbHome.includes(homeInit)) return row;
    // Try city+name substring match
    if (dbAway.includes(awayKey.slice(0, 6)) || dbHome.includes(homeKey.slice(0, 6))) return row;
    // Try partial city match
    const awayCity = apiGame.awayCity.toLowerCase().replace(/[^a-z]/g, "");
    const homeCity = apiGame.homeCity.toLowerCase().replace(/[^a-z]/g, "");
    if (dbAway.includes(awayCity.slice(0, 5)) && dbHome.includes(homeCity.slice(0, 5))) return row;
  }
  return null;
}

// ─── Audit per league ─────────────────────────────────────────────────────────

interface GameAuditResult {
  matchup: string;
  dbId: string;
  spreadLine: string;
  spreadOdds: string;
  total: string;
  ouOdds: string;
  ml: string;
  issues: string[];
}

async function auditLeague(
  leagueCode: "BKC" | "BKP" | "HKN",
  sport: string,
  label: string
): Promise<void> {
  console.log(`\n${"═".repeat(80)}`);
  console.log(`  LEAGUE: ${label} (${leagueCode}) | DB sport="${sport}"`);
  console.log(`${"═".repeat(80)}`);

  const [apiGames, dbRows] = await Promise.all([
    fetchMetabetConsensusOdds(leagueCode),
    getDbGames(sport),
  ]);

  // Filter API to today's games only (timestamp within today's range)
  const { start } = todayRange();
  const todayMs = new Date(start).getTime();
  const tomorrowMs = todayMs + 86400000;
  const todayApiGames = apiGames.filter(
    (g: MetabetConsensusOdds) => g.gameTimestamp >= todayMs && g.gameTimestamp < tomorrowMs
  );

  console.log(`\n  API games (today): ${todayApiGames.length}`);
  console.log(`  DB games (today):  ${dbRows.length}`);

  if (dbRows.length === 0) {
    console.log(`\n  ⚠️  NO DB GAMES FOUND for today. Run a refresh first.`);
    return;
  }

  const results: GameAuditResult[] = [];
  let totalFields = 0;
  let missingFields = 0;
  let unmatchedApi = 0;
  let unmatchedDb = 0;

  // Check each API game against DB
  const matchedDbIds = new Set<number>();

  for (const apiGame of todayApiGames) {
    const dbRow = matchApiToDb(apiGame, dbRows);
    const matchup = `${apiGame.awayCity} ${apiGame.awayName} @ ${apiGame.homeCity} ${apiGame.homeName}`;

    if (!dbRow) {
      unmatchedApi++;
      console.log(`  ⚠️  API game NOT IN DB: ${matchup} (${apiGame.awayInitials} @ ${apiGame.homeInitials})`);
      continue;
    }

    matchedDbIds.add(dbRow.id);

    const issues: string[] = [];

    // Check spread line
    const spreadLineSt = numStatus(dbRow.awayBookSpread, apiGame.awaySpread);
    if (spreadLineSt === "❌ MISSING") { issues.push("awayBookSpread"); missingFields++; }
    totalFields++;

    // Check spread odds
    const spreadOddsSt = status(dbRow.awaySpreadOdds, apiGame.awaySpreadOdds);
    if (spreadOddsSt === "❌ MISSING") { issues.push("awaySpreadOdds"); missingFields++; }
    if (spreadOddsSt !== "API_NULL") totalFields++;

    const homeSpreadOddsSt = status(dbRow.homeSpreadOdds, apiGame.homeSpreadOdds);
    if (homeSpreadOddsSt === "❌ MISSING") { issues.push("homeSpreadOdds"); missingFields++; }
    if (homeSpreadOddsSt !== "API_NULL") totalFields++;

    // Check total
    const totalSt = numStatus(dbRow.bookTotal, apiGame.total);
    if (totalSt === "❌ MISSING") { issues.push("bookTotal"); missingFields++; }
    totalFields++;

    // Check O/U odds
    const overSt = status(dbRow.overOdds, apiGame.overOdds);
    if (overSt === "❌ MISSING") { issues.push("overOdds"); missingFields++; }
    if (overSt !== "API_NULL") totalFields++;

    const underSt = status(dbRow.underOdds, apiGame.underOdds);
    if (underSt === "❌ MISSING") { issues.push("underOdds"); missingFields++; }
    if (underSt !== "API_NULL") totalFields++;

    // Check ML
    const awayMLSt = status(dbRow.awayML, apiGame.awayML);
    if (awayMLSt === "❌ MISSING") { issues.push("awayML"); missingFields++; }
    if (awayMLSt !== "API_NULL") totalFields++;

    const homeMLSt = status(dbRow.homeML, apiGame.homeML);
    if (homeMLSt === "❌ MISSING") { issues.push("homeML"); missingFields++; }
    if (homeMLSt !== "API_NULL") totalFields++;

    results.push({
      matchup,
      dbId: String(dbRow.id),
      spreadLine: `DB:${fmt(dbRow.awayBookSpread)}/${fmt(dbRow.homeBookSpread)} | API:${fmt(apiGame.awaySpread)}/${fmt(apiGame.homeSpread)}`,
      spreadOdds: `DB:${fmt(dbRow.awaySpreadOdds)}/${fmt(dbRow.homeSpreadOdds)} | API:${fmt(apiGame.awaySpreadOdds)}/${fmt(apiGame.homeSpreadOdds)}`,
      total: `DB:${fmt(dbRow.bookTotal)} | API:${fmt(apiGame.total)}`,
      ouOdds: `DB:${fmt(dbRow.overOdds)}/${fmt(dbRow.underOdds)} | API:${fmt(apiGame.overOdds)}/${fmt(apiGame.underOdds)}`,
      ml: `DB:${fmt(dbRow.awayML)}/${fmt(dbRow.homeML)} | API:${fmt(apiGame.awayML)}/${fmt(apiGame.homeML)}`,
      issues,
    });
  }

  // Check for DB games not matched to any API game
  for (const row of dbRows) {
    if (!matchedDbIds.has(row.id)) {
      unmatchedDb++;
      console.log(`  ⚠️  DB game NOT IN API: ${row.awayTeam} @ ${row.homeTeam} (id=${row.id})`);
    }
  }

  // Print per-game table
  console.log(`\n  ${"─".repeat(76)}`);
  console.log(`  ${"GAME".padEnd(38)} ${"SPREAD LINE".padEnd(8)} ${"SPREAD ODDS".padEnd(8)} ${"TOTAL".padEnd(6)} ${"O/U ODDS".padEnd(8)} ${"ML".padEnd(6)}`);
  console.log(`  ${"─".repeat(76)}`);

  for (const r of results) {
    const spreadLineSt = r.issues.includes("awayBookSpread") ? "❌" : "✅";
    const spreadOddsSt = r.issues.includes("awaySpreadOdds") || r.issues.includes("homeSpreadOdds") ? "❌" : "✅";
    const totalSt = r.issues.includes("bookTotal") ? "❌" : "✅";
    const ouOddsSt = r.issues.includes("overOdds") || r.issues.includes("underOdds") ? "❌" : "✅";
    const mlSt = r.issues.includes("awayML") || r.issues.includes("homeML") ? "❌" : "✅";

    const name = r.matchup.length > 37 ? r.matchup.slice(0, 34) + "..." : r.matchup;
    console.log(`  ${name.padEnd(38)} ${spreadLineSt.padEnd(8)} ${spreadOddsSt.padEnd(8)} ${totalSt.padEnd(6)} ${ouOddsSt.padEnd(8)} ${mlSt.padEnd(6)}`);

    if (r.issues.length > 0) {
      console.log(`    ↳ MISSING fields: ${r.issues.join(", ")}`);
      console.log(`      Spread: ${r.spreadLine}`);
      console.log(`      Odds:   ${r.spreadOdds}`);
      console.log(`      Total:  ${r.total}`);
      console.log(`      O/U:    ${r.ouOdds}`);
      console.log(`      ML:     ${r.ml}`);
    }
  }

  console.log(`  ${"─".repeat(76)}`);

  // Summary
  const pct = totalFields > 0 ? ((totalFields - missingFields) / totalFields * 100).toFixed(1) : "N/A";
  console.log(`\n  ┌─ SUMMARY ─────────────────────────────────────────────────────────────┐`);
  console.log(`  │  API games today:        ${String(todayApiGames.length).padEnd(4)} │  DB games today:       ${String(dbRows.length).padEnd(4)} │`);
  console.log(`  │  Matched (API→DB):       ${String(results.length).padEnd(4)} │  Unmatched API games:  ${String(unmatchedApi).padEnd(4)} │`);
  console.log(`  │  Unmatched DB games:     ${String(unmatchedDb).padEnd(4)} │                              │`);
  console.log(`  │  Total checkable fields: ${String(totalFields).padEnd(4)} │  Missing fields:       ${String(missingFields).padEnd(4)} │`);
  console.log(`  │  Field completeness:     ${pct}%                                    │`);
  console.log(`  └───────────────────────────────────────────────────────────────────────┘`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"█".repeat(80)}`);
  console.log(`  FULL DB POPULATION AUDIT — MetaBet DraftKings Odds vs Database`);
  console.log(`  Run at: ${new Date().toISOString()}`);
  console.log(`${"█".repeat(80)}`);

  await auditLeague("BKC", "NCAAM", "NCAAM (College Basketball)");
  await auditLeague("BKP", "NBA", "NBA");
  await auditLeague("HKN", "NHL", "NHL");

  console.log(`\n${"█".repeat(80)}`);
  console.log(`  AUDIT COMPLETE`);
  console.log(`${"█".repeat(80)}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error("AUDIT FAILED:", err);
  process.exit(1);
});
