/**
 * backfill_mlbam_ids.mjs
 * One-time script to populate mlbamId for all mlb_strikeout_props rows
 * that have a retrosheetId but null mlbamId.
 * Usage: node scripts/backfill_mlbam_ids.mjs
 */
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import path from "path";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CROSSWALK_PATH = path.join(__dirname, "../server/crosswalk.csv");

async function loadCrosswalk() {
  const map = new Map();
  const rl = createInterface({
    input: createReadStream(CROSSWALK_PATH),
    crlfDelay: Infinity,
  });

  let headerSkipped = false;
  for await (const line of rl) {
    if (!headerSkipped) {
      headerSkipped = true;
      continue;
    }
    const [rsId, scId] = line.split(",");
    if (rsId && scId) {
      map.set(rsId.trim(), parseInt(scId.trim(), 10));
    }
  }

  console.log(`[INPUT] Loaded ${map.size} crosswalk entries from ${CROSSWALK_PATH}`);
  return map;
}

async function main() {
  console.log("[STEP] Starting MLBAM ID backfill for mlb_strikeout_props");

  const crosswalk = await loadCrosswalk();

  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  const [rows] = await conn.execute(
    "SELECT id, pitcherName, retrosheetId FROM mlb_strikeout_props WHERE mlbamId IS NULL AND retrosheetId IS NOT NULL"
  );

  console.log(`[STATE] Found ${rows.length} rows needing mlbamId backfill`);

  let updated = 0;
  let notFound = 0;

  for (const row of rows) {
    const mlbamId = crosswalk.get(row.retrosheetId);
    if (!mlbamId) {
      console.warn(`[WARN] No crosswalk entry for retrosheetId="${row.retrosheetId}" (${row.pitcherName})`);
      notFound++;
      continue;
    }

    await conn.execute(
      "UPDATE mlb_strikeout_props SET mlbamId = ? WHERE id = ?",
      [mlbamId, row.id]
    );

    console.log(`[OUTPUT] Updated id=${row.id} ${row.pitcherName} (${row.retrosheetId}) → mlbamId=${mlbamId}`);
    updated++;
  }

  await conn.end();

  console.log(`\n[VERIFY] Backfill complete: updated=${updated} | notFound=${notFound} | total=${rows.length}`);

  if (notFound > 0) {
    console.warn(`[WARN] ${notFound} pitchers not found in crosswalk — headshots will not render for these`);
  } else {
    console.log("[VERIFY] PASS — all pitchers found in crosswalk");
  }
}

main().catch((err) => {
  console.error("[ERROR] Backfill failed:", err);
  process.exit(1);
});
