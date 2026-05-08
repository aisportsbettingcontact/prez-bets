import "dotenv/config";
import { getDb } from "../server/db";
import { games } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

const TAG = "[NHLOddsCheck]";

async function main() {
  const db = await getDb();
  const rows = await db.select().from(games)
    .where(and(eq(games.gameDate, "2026-05-08"), eq(games.sport, "NHL")));

  console.log(`\n${TAG} Found ${rows.length} NHL games for 2026-05-08`);

  for (const g of rows) {
    console.log(`\n${TAG} [${g.id}] ${g.awayTeam}@${g.homeTeam}`);
    const keys = Object.keys(g) as (keyof typeof g)[];
    for (const k of keys) {
      if (/spread|line|odds|^awayML|^homeML|total|over|under|puck|run|goalie|model/i.test(k) && g[k] !== null && g[k] !== undefined) {
        console.log(`${TAG}   ${k}: ${g[k]}`);
      }
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(`${TAG} FATAL:`, e); process.exit(1); });
