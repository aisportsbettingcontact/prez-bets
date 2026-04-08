import "dotenv/config";
import { getDb } from "./server/db";
import { sql } from "drizzle-orm";

const DATE = "2026-04-08";

async function main() {
  const db = await getDb();

  // ── MLB ──────────────────────────────────────────────────────────────────
  const [mlbRows] = await db.execute(sql`
    SELECT id, awayTeam, homeTeam, awayML, homeML,
           awayBookSpread, homeBookSpread, awaySpreadOdds, homeSpreadOdds,
           bookTotal, overOdds, underOdds,
           openAwayML, openHomeML, openTotal, openAwaySpread,
           f5AwayML, f5HomeML, f5OverOdds, nrfiOverOdds,
           modelAwayWinPct, modelTotal, modelAwayScore, modelHomeScore,
           publishedToFeed, gameStatus, startTimeEst, mlbGamePk
    FROM games
    WHERE gameDate = ${DATE} AND sport = 'MLB'
    ORDER BY sortOrder ASC
  `);
  const mlb = mlbRows as any[];

  // ── NHL ──────────────────────────────────────────────────────────────────
  const [nhlRows] = await db.execute(sql`
    SELECT id, awayTeam, homeTeam, awayML, homeML,
           awayBookSpread, homeBookSpread, awaySpreadOdds, homeSpreadOdds,
           bookTotal, overOdds, underOdds,
           openAwayML, openHomeML, openTotal, openAwaySpread,
           modelAwayWinPct, modelTotal, modelAwayScore, modelHomeScore,
           publishedToFeed, gameStatus, startTimeEst
    FROM games
    WHERE gameDate = ${DATE} AND sport = 'NHL'
    ORDER BY sortOrder ASC
  `);
  const nhl = nhlRows as any[];

  // ── K-Props ───────────────────────────────────────────────────────────────
  const [kpRows] = await db.execute(sql`
    SELECT COUNT(*) as cnt, SUM(CASE WHEN sp.edgeOver IS NOT NULL THEN 1 ELSE 0 END) as modeled
    FROM mlb_strikeout_props sp
    JOIN games g ON g.id = sp.gameId
    WHERE g.gameDate = ${DATE}
  `);
  const kp = (kpRows as any[])[0];

  // ── HR Props ──────────────────────────────────────────────────────────────
  const [hrRows] = await db.execute(sql`
    SELECT COUNT(*) as cnt, SUM(CASE WHEN hp.edgeOver IS NOT NULL THEN 1 ELSE 0 END) as modeled
    FROM mlb_hr_props hp
    JOIN games g ON g.id = hp.gameId
    WHERE g.gameDate = ${DATE}
  `);
  const hr = (hrRows as any[])[0];

  // ── Print MLB ─────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(80)}`);
  console.log(`[AUDIT] ${DATE} — MLB (${mlb.length} games)`);
  console.log(`${"=".repeat(80)}`);
  let mlbOdds = 0, mlbF5 = 0, mlbModeled = 0, mlbPub = 0;
  for (const r of mlb) {
    const hasOdds = !!(r.awayML && r.homeML && r.bookTotal && r.awayBookSpread);
    const hasF5 = !!(r.f5AwayML && r.f5HomeML && r.f5OverOdds);
    const isModeled = r.modelAwayWinPct !== null;
    const isPub = r.publishedToFeed === 1;
    if (hasOdds) mlbOdds++;
    if (hasF5) mlbF5++;
    if (isModeled) mlbModeled++;
    if (isPub) mlbPub++;
    console.log(
      `  [${r.startTimeEst}] ${r.awayTeam}@${r.homeTeam} | ` +
      `ML=${r.awayML ?? "n/a"}/${r.homeML ?? "n/a"} | ` +
      `SPR=${r.awayBookSpread ?? "n/a"}(${r.awaySpreadOdds ?? "n/a"}) | ` +
      `TOT=${r.bookTotal ?? "n/a"}(o${r.overOdds ?? "n/a"}/u${r.underOdds ?? "n/a"}) | ` +
      `F5=${hasF5 ? "✅" : "❌"} NRFI=${r.nrfiOverOdds ? "✅" : "❌"} | ` +
      `model=${isModeled ? `${r.modelAwayScore}/${r.modelHomeScore} tot=${r.modelTotal} wp=${r.modelAwayWinPct}%` : "PENDING"} | ` +
      `pub=${isPub ? "✅" : "❌"} gamePk=${r.mlbGamePk ?? "n/a"}`
    );
  }
  console.log(`\n  [SUMMARY] Odds: ${mlbOdds}/${mlb.length} | F5: ${mlbF5}/${mlb.length} | Modeled: ${mlbModeled}/${mlb.length} | Published: ${mlbPub}/${mlb.length}`);
  console.log(`  [SUMMARY] K-Props: ${kp.cnt} seeded, ${kp.modeled} modeled | HR Props: ${hr.cnt} seeded, ${hr.modeled} modeled`);

  // ── Print NHL ─────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(80)}`);
  console.log(`[AUDIT] ${DATE} — NHL (${nhl.length} games)`);
  console.log(`${"=".repeat(80)}`);
  let nhlOdds = 0, nhlModeled = 0, nhlPub = 0;
  for (const r of nhl) {
    const hasOdds = !!(r.awayML && r.homeML && r.bookTotal && r.awayBookSpread);
    const isModeled = r.modelAwayWinPct !== null;
    const isPub = r.publishedToFeed === 1;
    if (hasOdds) nhlOdds++;
    if (isModeled) nhlModeled++;
    if (isPub) nhlPub++;
    console.log(
      `  [${r.startTimeEst}] ${r.awayTeam}@${r.homeTeam} | ` +
      `ML=${r.awayML ?? "n/a"}/${r.homeML ?? "n/a"} | ` +
      `PL=${r.awayBookSpread ?? "n/a"}(${r.awaySpreadOdds ?? "n/a"})/${r.homeBookSpread ?? "n/a"}(${r.homeSpreadOdds ?? "n/a"}) | ` +
      `TOT=${r.bookTotal ?? "n/a"}(o${r.overOdds ?? "n/a"}/u${r.underOdds ?? "n/a"}) | ` +
      `openML=${r.openAwayML ?? "n/a"}/${r.openHomeML ?? "n/a"} | ` +
      `model=${isModeled ? `${r.modelAwayScore}/${r.modelHomeScore} tot=${r.modelTotal} wp=${r.modelAwayWinPct}%` : "PENDING"} | ` +
      `pub=${isPub ? "✅" : "❌"}`
    );
  }
  console.log(`\n  [SUMMARY] Odds: ${nhlOdds}/${nhl.length} | Modeled: ${nhlModeled}/${nhl.length} | Published: ${nhlPub}/${nhl.length}`);
  console.log(`${"=".repeat(80)}\n`);

  process.exit(0);
}

main().catch((e) => { console.error("[FAIL]", e); process.exit(1); });
