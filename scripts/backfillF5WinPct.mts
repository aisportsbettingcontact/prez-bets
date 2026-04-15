/**
 * backfillF5WinPct.mts
 * Re-runs the MLB model for 2026-04-15 to backfill modelF5HomeWinPct
 * and modelF5AwayWinPct which were missing from the initial write.
 * The model runner is idempotent — it overwrites existing rows.
 */
import { runMlbModelForDate } from "../server/mlbModelRunner";
import { getDb } from "../server/db";
import { games } from "../drizzle/schema";
import { like, isNotNull } from "drizzle-orm";

const DATE = "2026-04-15";

console.log(`[BackfillF5WinPct] [STEP 1] Re-running MLB model for ${DATE}`);
console.log(`[BackfillF5WinPct] [STATE] This will overwrite all 15 games with modelF5HomeWinPct + modelF5AwayWinPct`);

await runMlbModelForDate(DATE);

console.log(`[BackfillF5WinPct] [STEP 2] Verifying F5 win pct fields are now populated`);

const db = await getDb();
const rows = await db.select({
  id: games.id,
  awayTeam: games.awayTeam,
  homeTeam: games.homeTeam,
  modelF5HomeWinPct: games.modelF5HomeWinPct,
  modelF5AwayWinPct: games.modelF5AwayWinPct,
}).from(games).where(like(games.gameDate, `${DATE}%`));

const mlbRows = rows.filter(r => r.modelF5HomeWinPct !== null);
const nullRows = rows.filter(r => r.modelF5HomeWinPct === null);

console.log(`\n[BackfillF5WinPct] [OUTPUT] F5 win pct populated: ${mlbRows.length}/${rows.length}`);
for (const r of mlbRows) {
  console.log(`  [${r.id}] ${r.awayTeam}@${r.homeTeam} → F5HomeWin=${r.modelF5HomeWinPct}% F5AwayWin=${r.modelF5AwayWinPct}%`);
}

if (nullRows.length > 0) {
  console.log(`\n[BackfillF5WinPct] [FAIL] ${nullRows.length} games still null:`);
  for (const r of nullRows) {
    console.log(`  [${r.id}] ${r.awayTeam}@${r.homeTeam}`);
  }
} else {
  console.log(`\n[BackfillF5WinPct] [VERIFY] ✅ PASS — All ${mlbRows.length} games have F5 win pct populated`);
}

process.exit(0);
