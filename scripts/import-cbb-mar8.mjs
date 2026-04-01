/**
 * Import CBB Model Lines for March 8, 2026
 * These are MODEL lines (awayModelSpread, homeModelSpread, modelTotal, modelAwayML, modelHomeML)
 * The script upserts each game: if it exists (by date+awayTeam+homeTeam), update model fields;
 * otherwise insert a new game row.
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL not set");

// Team name → dbSlug mapping (from ncaamTeams registry)
// Format: [awaySlug, awayModelSpread, awayML, homeSlug, homeModelSpread, homeML, modelTotal]
const GAMES = [
  // Penn St +2.5 +144 vs Rutgers -2.5 -144, Total 147.5
  ["penn_st",        +2.5, "+144", "rutgers",       -2.5, "-144", 147.5],
  // N Iowa -5.5 -224 vs Illinois-Chicago +5.5 +224, Total 127.5
  ["n_iowa",         -5.5, "-224", "illinois_chicago", +5.5, "+224", 127.5],
  // Campbell +6.5 +265 vs UNC-Wilmington -6.5 -265, Total 146.5
  ["campbell",       +6.5, "+265", "unc_wilmington", -6.5, "-265", 146.5],
  // Winthrop +4.5 +197 vs High Point -4.5 -197, Total 156.5
  ["winthrop",       +4.5, "+197", "high_point",    -4.5, "-197", 156.5],
  // Colgate -3.5 -164 vs Lehigh +3.5 +164, Total 145.5
  ["colgate",        -3.5, "-164", "lehigh",        +3.5, "+164", 145.5],
  // Memphis -4.5 -197 vs Tulane +4.5 +197, Total 149.5
  ["memphis",        -4.5, "-197", "tulane",        +4.5, "+197", 149.5],
  // Charlotte +11.5 +506 vs South Florida -11.5 -506, Total 146.5
  ["charlotte",     +11.5, "+506", "south_florida", -11.5, "-506", 146.5],
  // Queens NC -3.5 -164 vs C Arkansas +3.5 +164, Total 153.5
  ["queens_nc",      -3.5, "-164", "c_arkansas",    +3.5, "+164", 153.5],
  // Boston U +3.5 +164 vs Navy -3.5 -164, Total 135.5
  ["boston_u",       +3.5, "+164", "navy",          -3.5, "-164", 135.5],
  // Drexel -3.5 -164 vs Monmouth +3.5 +164, Total 136.5
  ["drexel",         -3.5, "-164", "monmouth",      +3.5, "+164", 136.5],
  // Temple -6.5 -265 vs Tulsa +6.5 +265, Total 149.5
  ["temple",         -6.5, "-265", "tulsa",         +6.5, "+265", 149.5],
  // Illinois -10.5 -516 vs Maryland +10.5 +516, Total 143.5
  ["illinois",      -10.5, "-516", "maryland",     +10.5, "+516", 143.5],
  // East Carolina +7.5 +303 vs UAB -7.5 -303, Total 144.5
  ["east_carolina",  +7.5, "+303", "uab",           -7.5, "-303", 144.5],
  // Texas-San Antonio +3.5 +164 vs Rice -3.5 -164, Total 147.5
  ["texas_san_antonio", +3.5, "+164", "rice",       -3.5, "-164", 147.5],
  // N Kentucky -4.5 -197 vs UW-Green Bay +4.5 +197, Total 140.5
  ["n_kentucky",     -4.5, "-197", "uw_green_bay",  +4.5, "+197", 140.5],
  // W Carolina +2.5 +144 vs E Tennessee ST -2.5 -144, Total 146.5
  ["w_carolina",     +2.5, "+144", "e_tennessee_st", -2.5, "-144", 146.5],
  // Michigan ST +4.5 +197 vs Michigan -4.5 -197, Total 147.5
  ["michigan_st",    +4.5, "+197", "michigan",      -4.5, "-197", 147.5],
  // Iowa +3.5 +164 vs Nebraska -3.5 -164, Total 138.5
  ["iowa",           +3.5, "+164", "nebraska",      -3.5, "-164", 138.5],
  // Towson +5.5 +224 vs Charleston -5.5 -224, Total 138.5
  ["towson",         +5.5, "+224", "charleston",    -5.5, "-224", 138.5],
  // Marist -1.5 -124 vs Merrimack +1.5 +124, Total 129.5
  ["marist",         -1.5, "-124", "merrimack",     +1.5, "+124", 129.5],
  // Southern Miss -0.5 -108 vs Troy +0.5 +108, Total 147.5
  ["southern_miss",  -0.5, "-108", "troy",          +0.5, "+108", 147.5],
  // Houston Christian +4.5 +197 vs New Orleans -4.5 -197, Total 145.5
  ["houston_christian", +4.5, "+197", "new_orleans", -4.5, "-197", 145.5],
  // UNC-Greensboro +4.5 +197 vs Furman -4.5 -197, Total 146.5
  ["unc_greensboro", +4.5, "+197", "furman",        -4.5, "-197", 146.5],
  // Idaho ST +3.5 +164 vs Portland ST -3.5 -164, Total 141.5
  ["idaho_st",       +3.5, "+164", "portland_st",   -3.5, "-164", 141.5],
  // William & Mary +3.5 +164 vs Hofstra -3.5 -164, Total 150.5
  ["william_and_mary", +3.5, "+164", "hofstra",     -3.5, "-164", 150.5],
  // Fairfield +1.5 +124 vs Siena -1.5 -124, Total 136.5
  ["fairfield",      +1.5, "+124", "siena",         -1.5, "-124", 136.5],
  // Georgia Southern +2.5 +144 vs Marshall -2.5 -144, Total 164.5
  ["georgia_southern", +2.5, "+144", "marshall",    -2.5, "-144", 164.5],
  // San Francisco -4.5 -197 vs Oregon ST +4.5 +197, Total 141.5
  ["san_francisco",  -4.5, "-197", "oregon_st",     +4.5, "+197", 141.5],
  // Northwestern ST +3.5 +164 vs Nicholls ST -3.5 -164, Total 142.5
  ["northwestern_st", +3.5, "+164", "nicholls_st",  -3.5, "-164", 142.5],
  // N Dakota +6.5 +265 vs N Dakota ST -6.5 -265, Total 145.5
  ["n_dakota",       +6.5, "+265", "n_dakota_st",   -6.5, "-265", 145.5],
  // Idaho +3.5 +164 vs Montana ST -3.5 -164, Total 139.5
  ["idaho",          +3.5, "+164", "montana_st",    -3.5, "-164", 139.5],
  // Pacific +7.5 +303 vs Santa Clara -7.5 -303, Total 148.5
  ["pacific",        +7.5, "+303", "santa_clara",   -7.5, "-303", 148.5],
];

const GAME_DATE = "2026-03-08";
const SPORT = "NCAAM";

async function main() {
  const conn = await mysql.createConnection(DB_URL);
  console.log("Connected to DB");

  let inserted = 0;
  let updated = 0;

  for (const [awaySlug, awaySpread, awayML, homeSlug, homeSpread, homeML, total] of GAMES) {
    // Check if game already exists
    const [rows] = await conn.execute(
      `SELECT id FROM games WHERE gameDate = ? AND awayTeam = ? AND homeTeam = ?`,
      [GAME_DATE, awaySlug, homeSlug]
    );

    if (rows.length > 0) {
      // Update model fields
      await conn.execute(
        `UPDATE games SET
          awayModelSpread = ?,
          homeModelSpread = ?,
          modelTotal = ?,
          modelAwayML = ?,
          modelHomeML = ?
        WHERE id = ?`,
        [awaySpread, homeSpread, total, awayML, homeML, rows[0].id]
      );
      console.log(`UPDATED: ${awaySlug} vs ${homeSlug}`);
      updated++;
    } else {
      // Insert new game
      await conn.execute(
        `INSERT INTO games (
          gameDate, sport, awayTeam, homeTeam,
          awayModelSpread, homeModelSpread, modelTotal,
          modelAwayML, modelHomeML,
          gameStatus, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', NOW())`,
        [GAME_DATE, SPORT, awaySlug, homeSlug, awaySpread, homeSpread, total, awayML, homeML]
      );
      console.log(`INSERTED: ${awaySlug} vs ${homeSlug}`);
      inserted++;
    }
  }

  await conn.end();
  console.log(`\nDone. Inserted: ${inserted}, Updated: ${updated}`);
}

main().catch(console.error);
