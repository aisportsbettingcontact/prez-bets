/**
 * deleteSupplementalPitchers.mjs
 * Removes the 3 supplemental pitcher rows that were incorrectly inserted:
 *   - Shane McClanahan (663556) — 2023 data, not 2025 bulk
 *   - Brandon Williamson (682227) — 2024 data, not 2025 bulk
 *   - PJ Poulin (676571) — reliever, GS=0
 *
 * These pitchers will now get team SP average fallback from the engine.
 */
import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const conn = await createConnection(process.env.DATABASE_URL);

const idsToDelete = [663556, 682227, 676571];
const placeholders = idsToDelete.map(() => "?").join(", ");
const [result] = await conn.execute(
  `DELETE FROM mlb_pitcher_stats WHERE mlbamId IN (${placeholders})`,
  idsToDelete
);

console.log(`[DELETE] Removed ${result.affectedRows} supplemental pitcher row(s)`);
console.log(`[VERIFY] mlbamIds removed: ${idsToDelete.join(", ")}`);

await conn.end();
process.exit(0);
