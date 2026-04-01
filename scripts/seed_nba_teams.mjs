/**
 * Seed script: insert all 30 NBA teams from the shared registry into nba_teams table.
 * Run: node scripts/seed_nba_teams.mjs
 */
import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
const envPath = resolve(__dirname, "../.env");
let DATABASE_URL;
try {
  const env = readFileSync(envPath, "utf8");
  const match = env.match(/DATABASE_URL=(.+)/);
  if (match) DATABASE_URL = match[1].trim();
} catch {}
DATABASE_URL = DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

// Import registry via dynamic import
const { NBA_TEAMS } = await import("../shared/nbaTeams.ts").catch(async () => {
  // Try compiled version
  const mod = await import("../shared/nbaTeams.js");
  return mod;
});

const conn = await createConnection(DATABASE_URL);

let inserted = 0;
let updated = 0;

for (const team of NBA_TEAMS) {
  const [rows] = await conn.execute(
    "SELECT id FROM nba_teams WHERE dbSlug = ?",
    [team.dbSlug]
  );
  
  if (rows.length > 0) {
    await conn.execute(
      `UPDATE nba_teams SET nbaSlug=?, vsinSlug=?, name=?, nickname=?, city=?, conference=?, division=?, logoUrl=? WHERE dbSlug=?`,
      [team.nbaSlug, team.vsinSlug, team.name, team.nickname, team.city, team.conference, team.division, team.logoUrl, team.dbSlug]
    );
    updated++;
  } else {
    await conn.execute(
      `INSERT INTO nba_teams (dbSlug, nbaSlug, vsinSlug, name, nickname, city, conference, division, logoUrl) VALUES (?,?,?,?,?,?,?,?,?)`,
      [team.dbSlug, team.nbaSlug, team.vsinSlug, team.name, team.nickname, team.city, team.conference, team.division, team.logoUrl]
    );
    inserted++;
  }
}

await conn.end();
console.log(`✓ NBA teams seeded: ${inserted} inserted, ${updated} updated (${NBA_TEAMS.length} total)`);
