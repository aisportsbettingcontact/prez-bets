// Trigger NHL model sync for today's upcoming games
// First clears modelRunAt so the sync will pick up the games
import mysql from 'mysql2/promise';
import { syncNhlModelForToday } from "./server/nhlModelSync.js";

console.log("=== Step 1: Clearing modelRunAt for upcoming/live NHL games ===");
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [r1] = await conn.execute(`
  UPDATE games 
  SET modelRunAt = NULL
  WHERE sport = 'NHL' 
    AND gameDate = '2026-03-15' 
    AND (gameStatus = 'upcoming' OR gameStatus = 'live')
    AND modelAwayPuckLine IS NOT NULL
`);
console.log('Cleared modelRunAt for', r1.affectedRows, 'NHL games');
await conn.end();

console.log("\n=== Step 2: Running NHL model sync ===");
const result = await syncNhlModelForToday("manual");
console.log("\n=== Sync Result ===");
console.log(`Synced: ${result.synced} | Skipped: ${result.skipped} | Errors: ${result.errors.length}`);
if (result.errors.length > 0) {
  console.log("Errors:", result.errors);
}
