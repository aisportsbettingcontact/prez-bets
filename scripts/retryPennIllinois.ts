/**
 * Retry script: force re-run Penn @ Illinois (failed due to SSL error)
 */
import "dotenv/config";
import { getDb } from "../server/db.js";
import { games } from "../drizzle/schema.js";
import { and, eq } from "drizzle-orm";
import { triggerModelWatcherForDate } from "../server/ncaamModelWatcher.js";

const db = await getDb();

// Find Penn @ Illinois
const [game] = await db.select().from(games).where(
  and(eq(games.awayTeam, "pennsylvania"), eq(games.homeTeam, "illinois"))
).limit(1);

if (!game) {
  console.error("Game not found!");
  process.exit(1);
}

console.log(`Clearing model data for: ${game.awayTeam} @ ${game.homeTeam} (id=${game.id})`);
await db.update(games).set({
  awayModelSpread: null,
  homeModelSpread: null,
  modelTotal: null,
  modelAwayML: null,
  modelHomeML: null,
  modelAwaySpreadOdds: null,
  modelHomeSpreadOdds: null,
  modelOverOdds: null,
  modelUnderOdds: null,
  publishedModel: 0,
}).where(eq(games.id, game.id));

console.log("Cleared. Now running model...");

const result = await triggerModelWatcherForDate("2026-03-19", { forceRerun: false });
console.log(`\nTriggered: ${result.triggered} | Skipped: ${result.skipped}`);
