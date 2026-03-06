/**
 * verify_registry.mjs
 * Verifies the NCAAM registry and DB game data integrity.
 * Run: node scripts/verify_registry.mjs
 */
import { readFileSync } from "fs";
import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

// Parse the registry TS file to extract team data
const registryContent = readFileSync("./shared/ncaamTeams.ts", "utf8");

// Extract team array section
const arrayMatch = registryContent.match(/export const NCAAM_TEAMS[^=]*=\s*\[([\s\S]*?)\n\];/);
if (!arrayMatch) {
  console.error("Could not find NCAAM_TEAMS array in registry");
  process.exit(1);
}

// Count teams by counting ncaaSlug occurrences in the array section
const teamCount = (arrayMatch[1].match(/ncaaSlug:/g) || []).length;
console.log(`\n=== NCAAM Registry Verification ===`);
console.log(`✓ Team count: ${teamCount} (expected: 365)`);

if (teamCount !== 365) {
  console.error(`✗ WRONG COUNT! Expected 365, got ${teamCount}`);
}

// Check for duplicate dbSlugs
const dbSlugMatches = arrayMatch[1].match(/dbSlug:\s*"([^"]+)"/g) || [];
const dbSlugs = dbSlugMatches.map(m => m.match(/"([^"]+)"/)[1]);
const uniqueDbSlugs = new Set(dbSlugs);
console.log(`✓ Unique DB slugs: ${uniqueDbSlugs.size} (expected: 365)`);
if (uniqueDbSlugs.size !== 365) {
  const dupes = dbSlugs.filter((s, i) => dbSlugs.indexOf(s) !== i);
  console.error(`✗ Duplicate DB slugs: ${dupes.join(", ")}`);
}

// Check for duplicate ncaaSlugs
const ncaaSlugMatches = arrayMatch[1].match(/ncaaSlug:\s*"([^"]+)"/g) || [];
const ncaaSlugs = ncaaSlugMatches.map(m => m.match(/"([^"]+)"/)[1]);
const uniqueNcaaSlugs = new Set(ncaaSlugs);
console.log(`✓ Unique NCAA slugs: ${uniqueNcaaSlugs.size} (expected: 365)`);
if (uniqueNcaaSlugs.size !== 365) {
  const dupes = ncaaSlugs.filter((s, i) => ncaaSlugs.indexOf(s) !== i);
  console.error(`✗ Duplicate NCAA slugs: ${dupes.join(", ")}`);
}

// Check for duplicate vsinSlugs
const vsinSlugMatches = arrayMatch[1].match(/vsinSlug:\s*"([^"]+)"/g) || [];
const vsinSlugs = vsinSlugMatches.map(m => m.match(/"([^"]+)"/)[1]);
const uniqueVsinSlugs = new Set(vsinSlugs);
console.log(`✓ Unique VSiN slugs: ${uniqueVsinSlugs.size} (expected: 365)`);
if (uniqueVsinSlugs.size !== 365) {
  const dupes = vsinSlugs.filter((s, i) => vsinSlugs.indexOf(s) !== i);
  console.error(`✗ Duplicate VSiN slugs: ${dupes.join(", ")}`);
}

// Check all teams have logoUrl
const logoMatches = arrayMatch[1].match(/logoUrl:\s*"([^"]+)"/g) || [];
console.log(`✓ Teams with logoUrl: ${logoMatches.length} (expected: 365)`);

// Check DB for invalid games
console.log(`\n=== DB Game Validation ===`);
const db = await createConnection(process.env.DATABASE_URL);

try {
  // Get all games from today onward
  const today = new Date().toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).split("/");
  const todayStr = `${today[2]}-${today[0]}-${today[1]}`;
  
  const [rows] = await db.execute(
    "SELECT awayTeam, homeTeam, gameDate, startTimeEst FROM games WHERE gameDate >= ? ORDER BY gameDate, sortOrder",
    [todayStr]
  );
  
  console.log(`Total games from today (${todayStr}): ${rows.length}`);
  
  // Check which games have teams NOT in the registry
  const invalidGames = rows.filter(r => 
    !uniqueDbSlugs.has(r.awayTeam) || !uniqueDbSlugs.has(r.homeTeam)
  );
  
  if (invalidGames.length === 0) {
    console.log(`✓ All ${rows.length} games have valid 365-team slugs`);
  } else {
    console.log(`✗ ${invalidGames.length} games with invalid slugs:`);
    invalidGames.forEach(g => {
      const awayOk = uniqueDbSlugs.has(g.awayTeam) ? "✓" : "✗";
      const homeOk = uniqueDbSlugs.has(g.homeTeam) ? "✓" : "✗";
      console.log(`  ${awayOk} ${g.awayTeam} @ ${homeOk} ${g.homeTeam} (${g.gameDate})`);
    });
  }
  
  // Check for TBD start times
  const tbdGames = rows.filter(r => r.startTimeEst === "TBD" || !r.startTimeEst);
  if (tbdGames.length === 0) {
    console.log(`✓ No TBD start times`);
  } else {
    console.log(`⚠ ${tbdGames.length} games with TBD start times:`);
    tbdGames.forEach(g => console.log(`  ${g.awayTeam} @ ${g.homeTeam} (${g.gameDate})`));
  }
  
} finally {
  await db.end();
}

console.log(`\n=== Done ===\n`);
