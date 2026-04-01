/**
 * backfillMlbRunLineOdds.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * One-shot backfill: copies awayRunLineOdds → modelAwaySpreadOdds and
 * homeRunLineOdds → modelHomeSpreadOdds for all MLB games where the model has
 * run (modelRunAt IS NOT NULL) but modelAwaySpreadOdds is still null.
 *
 * Root cause: mlbModelRunner.ts previously wrote RL odds only to awayRunLineOdds
 * / homeRunLineOdds but NOT to modelAwaySpreadOdds / modelHomeSpreadOdds.
 * GameCard.tsx checks isMlbGame && modelAwaySpreadOdds to render RL odds in the
 * spread section — so nothing was displayed.
 *
 * Usage: node scripts/backfillMlbRunLineOdds.mjs
 */

import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[ERROR] DATABASE_URL not set");
  process.exit(1);
}

// Parse mysql://user:pass@host:port/db?ssl=... 
const m = DATABASE_URL.match(/mysql[^:]*:\/\/([^:]+):([^@]+)@([^:/]+)(?::(\d+))?\/([^?]+)/);
if (!m) {
  console.error("[ERROR] Could not parse DATABASE_URL:", DATABASE_URL);
  process.exit(1);
}
const [, user, password, host, portStr, database] = m;
const port = parseInt(portStr || "3306", 10);

async function main() {
  console.log("[INPUT] Connecting to DB:", host, database);
  const conn = await createConnection({
    host, user, password, database, port,
    ssl: { rejectUnauthorized: false },
  });

  // Step 1: Find all MLB games that need backfill
  const [rows] = await conn.execute(`
    SELECT id, awayTeam, homeTeam, gameDate,
           awayRunLineOdds, homeRunLineOdds,
           modelAwaySpreadOdds, modelHomeSpreadOdds
    FROM games
    WHERE sport = 'MLB'
      AND modelRunAt IS NOT NULL
      AND awayRunLineOdds IS NOT NULL
      AND homeRunLineOdds IS NOT NULL
      AND (modelAwaySpreadOdds IS NULL OR modelHomeSpreadOdds IS NULL)
    ORDER BY gameDate DESC
  `);

  console.log(`[STATE] Found ${rows.length} MLB games needing backfill`);

  if (rows.length === 0) {
    console.log("[OUTPUT] Nothing to backfill — all games already have modelAwaySpreadOdds populated");
    await conn.end();
    return;
  }

  let updated = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      await conn.execute(`
        UPDATE games
        SET modelAwaySpreadOdds = ?,
            modelHomeSpreadOdds = ?
        WHERE id = ?
      `, [row.awayRunLineOdds, row.homeRunLineOdds, row.id]);

      console.log(
        `[STEP] id=${row.id} ${row.awayTeam}@${row.homeTeam} ${row.gameDate}` +
        ` → modelAwaySpreadOdds=${row.awayRunLineOdds} modelHomeSpreadOdds=${row.homeRunLineOdds}`
      );
      updated++;
    } catch (err) {
      console.error(`[ERROR] id=${row.id}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n[OUTPUT] Backfill complete: ${updated} updated, ${errors} errors`);

  // Step 2: Verify — confirm no games still have null modelAwaySpreadOdds after backfill
  const [remaining] = await conn.execute(`
    SELECT COUNT(*) AS cnt
    FROM games
    WHERE sport = 'MLB'
      AND modelRunAt IS NOT NULL
      AND awayRunLineOdds IS NOT NULL
      AND modelAwaySpreadOdds IS NULL
  `);
  const remaining_count = remaining[0].cnt;
  if (remaining_count === 0) {
    console.log("[VERIFY] PASS — 0 MLB games with null modelAwaySpreadOdds after backfill");
  } else {
    console.error(`[VERIFY] FAIL — ${remaining_count} games still have null modelAwaySpreadOdds`);
  }

  await conn.end();
}

main().catch(err => {
  console.error("[FATAL]", err);
  process.exit(1);
});
