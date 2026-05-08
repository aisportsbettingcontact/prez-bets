import "dotenv/config";
import { getDb } from "../server/db";
import { games } from "../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";

const TAG = "[AuditMay8]";

async function main() {
  const db = await getDb();

  // ── 1. Pull all May 8 games (MLB + NHL) ──────────────────────────────────
  const rows = await db.select().from(games)
    .where(and(
      eq(games.gameDate, "2026-05-08"),
      inArray(games.sport, ["MLB", "NHL"])
    ))
    .orderBy(games.sport, games.startTimeEst, games.id);

  const mlb = rows.filter(r => r.sport === "MLB");
  const nhl = rows.filter(r => r.sport === "NHL");

  console.log(`\n${"═".repeat(70)}`);
  console.log(`${TAG} MAY 8, 2026 — FULL DATA AUDIT`);
  console.log(`${"═".repeat(70)}`);
  console.log(`${TAG} Total games found: ${rows.length} (MLB=${mlb.length}, NHL=${nhl.length})`);

  // ── 2. Per-game audit ────────────────────────────────────────────────────
  for (const sport of ["MLB", "NHL"] as const) {
    const sportGames = rows.filter(r => r.sport === sport);
    console.log(`\n${"─".repeat(70)}`);
    console.log(`${TAG} ${sport} GAMES (${sportGames.length})`);
    console.log(`${"─".repeat(70)}`);

    for (const g of sportGames) {
      const matchup = `${g.awayTeam}@${g.homeTeam}`;
      console.log(`\n${TAG} [${g.id}] ${matchup} | ${g.startTimeEst ?? "TBD"}`);

      // ODDS
      const hasSpread = g.awayBookSpread !== null;
      const hasTotal  = g.bookTotal !== null;
      const hasML     = g.awayML !== null && g.homeML !== null;
      const hasOdds   = hasSpread && hasTotal && hasML;
      console.log(`${TAG}   ODDS     : ${hasOdds ? "✅ COMPLETE" : "❌ INCOMPLETE"}`);
      console.log(`${TAG}     Spread : ${hasSpread ? `away=${g.awayBookSpread}  home=${g.homeBookSpread}` : "MISSING"}`);
      if (sport === "MLB") {
        console.log(`${TAG}     RL odds: away=${g.awayRunLineOdds ?? "MISSING"}  home=${g.homeRunLineOdds ?? "MISSING"}`);
      } else {
        console.log(`${TAG}     PL odds: away=${g.awayPuckLineOdds ?? "MISSING"}  home=${g.homePuckLineOdds ?? "MISSING"}`);
      }
      console.log(`${TAG}     Total  : ${hasTotal ? `${g.bookTotal}  over=${g.overOdds ?? "?"}  under=${g.underOdds ?? "?"}` : "MISSING"}`);
      console.log(`${TAG}     ML     : ${hasML ? `away=${g.awayML}  home=${g.homeML}` : "MISSING"}`);

      // SPLITS
      const hasSplitSpread = g.spreadAwayBetsPct !== null;
      const hasSplitTotal  = g.totalOverBetsPct !== null;
      const hasSplitML     = g.mlAwayBetsPct !== null;
      const hasSplits      = hasSplitSpread && hasSplitTotal && hasSplitML;
      console.log(`${TAG}   SPLITS   : ${hasSplits ? "✅ COMPLETE" : hasSplitSpread || hasSplitTotal || hasSplitML ? "⚠️  PARTIAL" : "❌ MISSING"}`);
      console.log(`${TAG}     Spread : bets=${g.spreadAwayBetsPct ?? "—"}% money=${g.spreadAwayMoneyPct ?? "—"}%`);
      console.log(`${TAG}     Total  : bets=${g.totalOverBetsPct ?? "—"}% money=${g.totalOverMoneyPct ?? "—"}%`);
      console.log(`${TAG}     ML     : bets=${g.mlAwayBetsPct ?? "—"}% money=${g.mlAwayMoneyPct ?? "—"}%`);

      // PITCHERS / GOALIES
      if (sport === "MLB") {
        const hasPitchers = g.awayStartingPitcher !== null && g.homeStartingPitcher !== null;
        console.log(`${TAG}   PITCHERS : ${hasPitchers ? "✅ COMPLETE" : "❌ MISSING"}`);
        console.log(`${TAG}     Away SP: ${g.awayStartingPitcher ?? "TBD"}`);
        console.log(`${TAG}     Home SP: ${g.homeStartingPitcher ?? "TBD"}`);
      } else {
        console.log(`${TAG}   GOALIES  : away=${g.awayGoalie ?? "TBD"}  home=${g.homeGoalie ?? "TBD"}`);
      }

      // LINEUPS
      const hasAwayLineup = g.awayLineup !== null && g.awayLineup !== "[]" && g.awayLineup !== "";
      const hasHomeLineup = g.homeLineup !== null && g.homeLineup !== "[]" && g.homeLineup !== "";
      const awayCount = hasAwayLineup ? (() => { try { return JSON.parse(g.awayLineup!).length; } catch { return "?"; } })() : 0;
      const homeCount = hasHomeLineup ? (() => { try { return JSON.parse(g.homeLineup!).length; } catch { return "?"; } })() : 0;
      console.log(`${TAG}   LINEUPS  : away=${hasAwayLineup ? `✅ ${awayCount} players` : "❌ MISSING"}  home=${hasHomeLineup ? `✅ ${homeCount} players` : "❌ MISSING"}`);

      // MODEL
      const isModeled   = g.modelRunAt !== null;
      const isPublished = g.publishedToFeed === true;
      console.log(`${TAG}   MODEL    : ${isModeled ? "✅ MODELED" : "⏳ PENDING"} | ${isPublished ? "📢 PUBLISHED" : "— NOT PUBLISHED"}`);
      if (isModeled) {
        if (sport === "MLB") {
          console.log(`${TAG}     RL     : ${g.awayModelSpread ?? "—"}  odds: away=${g.awayModelRunLineOdds ?? "—"}  home=${g.homeModelRunLineOdds ?? "—"}`);
        } else {
          console.log(`${TAG}     PL     : ${g.awayModelSpread ?? "—"}  odds: away=${g.awayModelPuckLineOdds ?? "—"}  home=${g.homeModelPuckLineOdds ?? "—"}`);
        }
        console.log(`${TAG}     Total  : ${g.modelTotal ?? "—"}  over=${g.modelOverOdds ?? "—"}  under=${g.modelUnderOdds ?? "—"}`);
        console.log(`${TAG}     ML     : away=${g.modelAwayML ?? "—"}  home=${g.modelHomeML ?? "—"}`);
      }
    }
  }

  // ── 3. Summary table ─────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(70)}`);
  console.log(`${TAG} SUMMARY`);
  console.log(`${"═".repeat(70)}`);
  for (const sport of ["MLB", "NHL"] as const) {
    const sg = rows.filter(r => r.sport === sport);
    const withOdds     = sg.filter(g => g.awayBookSpread !== null && g.bookTotal !== null && g.awayML !== null).length;
    const withSplits   = sg.filter(g => g.spreadAwayBetsPct !== null && g.totalOverBetsPct !== null && g.mlAwayBetsPct !== null).length;
    const withPitchers = sport === "MLB" ? sg.filter(g => g.awayStartingPitcher !== null && g.homeStartingPitcher !== null).length : "N/A";
    const withLineups  = sg.filter(g => g.awayLineup !== null && g.awayLineup !== "[]").length;
    const modeled      = sg.filter(g => g.modelRunAt !== null).length;
    const published    = sg.filter(g => g.publishedToFeed).length;
    console.log(`${TAG} ${sport}: total=${sg.length} | odds=${withOdds}/${sg.length} | splits=${withSplits}/${sg.length} | pitchers=${withPitchers}/${sg.length} | lineups=${withLineups}/${sg.length} | modeled=${modeled}/${sg.length} | published=${published}/${sg.length}`);
  }

  process.exit(0);
}

main().catch(e => { console.error(`${TAG} FATAL:`, e); process.exit(1); });
