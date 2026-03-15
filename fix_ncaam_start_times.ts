/**
 * Fix NCAAM start times: convert from EST to PST for all March 14 NCAAM games.
 * Fetches fresh data from NCAA API and updates the DB.
 */
import dotenv from 'dotenv';
dotenv.config();

import mysql from 'mysql2/promise';
import { fetchNcaaGames } from './server/ncaaScoreboard';

const DB_URL = process.env.DATABASE_URL!;

async function main() {
  const conn = await mysql.createConnection({
    uri: DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  
  console.log('Fetching NCAA games for March 14 with PST times...');
  const games = await fetchNcaaGames('20260314');
  console.log(`Fetched ${games.length} games from NCAA API`);
  
  let updated = 0;
  let skipped = 0;
  
  for (const g of games) {
    if (g.startTimeEst === 'TBD') {
      console.log(`  SKIP (TBD): ${g.awaySeoname} @ ${g.homeSeoname}`);
      skipped++;
      continue;
    }
    
    // Update by contestId (most reliable)
    const [result] = await conn.execute(
      `UPDATE games SET startTimeEst = ? WHERE ncaaContestId = ? AND sport = 'NCAAM'`,
      [g.startTimeEst, g.contestId]
    ) as any[];
    
    if (result.affectedRows > 0) {
      console.log(`  UPDATED: ${g.awaySeoname} @ ${g.homeSeoname} → ${g.startTimeEst} PST`);
      updated++;
    } else {
      // Try matching by team slugs
      const [result2] = await conn.execute(
        `UPDATE games SET startTimeEst = ? 
         WHERE awayTeam = ? AND homeTeam = ? AND gameDate = '2026-03-14' AND sport = 'NCAAM'`,
        [g.startTimeEst, g.awaySeoname, g.homeSeoname]
      ) as any[];
      
      if (result2.affectedRows > 0) {
        console.log(`  UPDATED (slug match): ${g.awaySeoname} @ ${g.homeSeoname} → ${g.startTimeEst} PST`);
        updated++;
      } else {
        console.log(`  NO MATCH: ${g.awaySeoname} @ ${g.homeSeoname} (contestId=${g.contestId})`);
        skipped++;
      }
    }
  }
  
  console.log(`\nDone: ${updated} updated, ${skipped} skipped`);
  
  // Verify the results
  const [rows] = await conn.execute(
    `SELECT awayTeam, homeTeam, startTimeEst, ncaaContestId FROM games 
     WHERE sport = 'NCAAM' AND gameDate = '2026-03-14' 
     ORDER BY sortOrder, startTimeEst`
  ) as any[];
  
  console.log('\nVerification - All NCAAM games for March 14:');
  for (const row of rows as any[]) {
    console.log(`  ${row.awayTeam} @ ${row.homeTeam}: ${row.startTimeEst} PST`);
  }
  
  await conn.end();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
