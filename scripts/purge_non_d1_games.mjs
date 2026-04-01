/**
 * Delete all games where either team is NOT in the 365-team registry.
 * These are non-D1 or non-qualifying teams that slipped through the filter.
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import { createRequire } from 'module';
dotenv.config();

// Load the registry
const require = createRequire(import.meta.url);

// We need to import the TypeScript registry — use a compiled approach
// Read the VALID_DB_SLUGS from the shared module
const { execSync } = await import('child_process');

// Get all valid slugs by running a quick node script
const validSlugsJson = execSync(
  `node -e "
    import('/home/ubuntu/ai-sports-betting/shared/ncaamTeams.ts').catch(() => {
      // Try compiled version
      const { VALID_DB_SLUGS } = require('/home/ubuntu/ai-sports-betting/shared/ncaamTeams.js');
      console.log(JSON.stringify([...VALID_DB_SLUGS]));
    });
  "`,
  { cwd: '/home/ubuntu/ai-sports-betting' }
).toString().trim();

// Alternative: use tsx to run the check
const validSlugsOutput = execSync(
  `cd /home/ubuntu/ai-sports-betting && node --input-type=module <<'EOF'
import { VALID_DB_SLUGS } from './shared/ncaamTeams.ts';
console.log(JSON.stringify([...VALID_DB_SLUGS]));
EOF`,
  { shell: '/bin/bash' }
).toString().trim();

const VALID_SLUGS = new Set(JSON.parse(validSlugsOutput));
console.log(`Registry has ${VALID_SLUGS.size} valid DB slugs`);

const db = await mysql.createConnection(process.env.DATABASE_URL);

// Find all games where either team is NOT in the registry
const [allGames] = await db.execute(`
  SELECT id, gameDate, awayTeam, homeTeam, startTimeEst, sortOrder
  FROM games
  ORDER BY gameDate, sortOrder
`);

const invalidGames = allGames.filter(g => 
  !VALID_SLUGS.has(g.awayTeam) || !VALID_SLUGS.has(g.homeTeam)
);

console.log(`\nFound ${invalidGames.length} games with non-registry teams:`);
console.table(invalidGames);

if (invalidGames.length > 0) {
  const ids = invalidGames.map(g => g.id);
  await db.execute(`DELETE FROM games WHERE id IN (${ids.join(',')})`);
  console.log(`Deleted ${invalidGames.length} non-D1 game rows`);
}

// Final count
const [countResult] = await db.execute(`SELECT COUNT(*) as total FROM games`);
console.log(`\nTotal games remaining in DB: ${countResult[0].total}`);

await db.end();
console.log('Done.');
