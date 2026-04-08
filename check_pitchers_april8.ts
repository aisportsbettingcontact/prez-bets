import "dotenv/config";
import { getDb } from "./server/db.js";
import { games } from "./drizzle/schema.js";
import { eq, and } from "drizzle-orm";

const db = await getDb();
const rows = await db.select({
  away: games.awayTeam,
  home: games.homeTeam,
  awayP: games.awayStartingPitcher,
  homeP: games.homeStartingPitcher,
  awayML: games.awayML,
  bookTotal: games.bookTotal,
}).from(games).where(and(eq(games.gameDate, "2026-04-08"), eq(games.sport, "MLB")));

console.log(`\n[AUDIT] April 8 Starting Pitchers (${rows.length} games):`);
let missing = 0;
for (const r of rows) {
  const awayP = r.awayP ?? "NULL";
  const homeP = r.homeP ?? "NULL";
  const hasBoth = r.awayP && r.homeP;
  if (!hasBoth) missing++;
  console.log(`  ${r.away}@${r.home}: away=${awayP} | home=${homeP} | ML=${r.awayML} TOT=${r.bookTotal} ${hasBoth ? "✅" : "❌"}`);
}
console.log(`\n[SUMMARY] ${rows.length - missing}/${rows.length} games have both starters confirmed`);
process.exit(0);
