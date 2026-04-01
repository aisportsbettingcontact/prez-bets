/**
 * Fix NCAAM start times: fetch raw epoch from NCAA API, convert to PST,
 * and update all 21 March 14 games in the DB.
 *
 * The NCAA API returns startTimeEpoch as Unix seconds (UTC).
 * We convert to PST (America/Los_Angeles) for display.
 */
import dotenv from 'dotenv';
dotenv.config();

import mysql from 'mysql2/promise';

const DB_URL = process.env.DATABASE_URL!;
const NCAA_API = "https://sdataprod.ncaa.com/";
const GET_CONTESTS_SHA = "7287cda610a9326931931080cb3a604828febe6fe3c9016a7e4a36db99efdb7c";

/** Convert epoch (seconds) to HH:MM in PST (America/Los_Angeles) */
function epochToPst(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Convert epoch (seconds) to HH:MM in EST (America/New_York) for comparison */
function epochToEst(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Convert epoch (seconds) to HH:MM in UTC for comparison */
function epochToUtc(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

async function fetchNcaaEpochs(dateYYYYMMDD: string): Promise<Array<{
  contestId: string;
  awaySeoname: string;
  homeSeoname: string;
  startTimeEpoch: number;
  hasStartTime: boolean;
  pstTime: string;
  estTime: string;
  utcTime: string;
}>> {
  const y = dateYYYYMMDD.slice(0, 4);
  const m = dateYYYYMMDD.slice(4, 6);
  const d = dateYYYYMMDD.slice(6, 8);
  const contestDate = `${m}/${d}/${y}`;
  const seasonYear = parseInt(y) - 1;

  const variables = { sportCode: "MBB", divisionId: 1, contestDate, seasonYear };
  const extensions = { persistedQuery: { version: 1, sha256Hash: GET_CONTESTS_SHA } };
  const url = `${NCAA_API}?variables=${encodeURIComponent(JSON.stringify(variables))}&extensions=${encodeURIComponent(JSON.stringify(extensions))}`;

  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Origin: "https://www.ncaa.com",
      Referer: "https://www.ncaa.com/",
      Accept: "application/json",
    },
  });

  if (!resp.ok) throw new Error(`NCAA API returned HTTP ${resp.status}`);
  const data = await resp.json();
  const contests: any[] = data?.data?.contests ?? [];

  const results = [];
  for (const c of contests) {
    // Only DI games
    if (c.divisionId !== 1 && c.division !== 'I') {
      // Check if it's DI by checking teams
    }
    
    const away = c.teams?.find((t: any) => !t.isHome);
    const home = c.teams?.find((t: any) => t.isHome);
    if (!away || !home) continue;
    if (!c.startTimeEpoch) continue;

    const pstTime = epochToPst(c.startTimeEpoch);
    const estTime = epochToEst(c.startTimeEpoch);
    const utcTime = epochToUtc(c.startTimeEpoch);

    results.push({
      contestId: String(c.contestId),
      awaySeoname: away.seoname ?? 'unknown',
      homeSeoname: home.seoname ?? 'unknown',
      startTimeEpoch: c.startTimeEpoch,
      hasStartTime: c.hasStartTime ?? false,
      pstTime,
      estTime,
      utcTime,
    });
  }

  return results;
}

async function main() {
  const conn = await mysql.createConnection({
    uri: DB_URL,
    ssl: { rejectUnauthorized: false },
  });

  console.log('=== Fetching NCAA API epochs for March 14, 2026 ===\n');
  const ncaaGames = await fetchNcaaEpochs('20260314');
  console.log(`Fetched ${ncaaGames.length} games from NCAA API\n`);

  // Print all games with their UTC → PST conversions
  console.log('Game                                    | UTC    | EST    | PST    | hasTime');
  console.log('----------------------------------------|--------|--------|--------|--------');
  for (const g of ncaaGames) {
    const matchup = `${g.awaySeoname} @ ${g.homeSeoname}`.padEnd(40);
    console.log(`${matchup}| ${g.utcTime} | ${g.estTime} | ${g.pstTime} | ${g.hasStartTime}`);
  }

  console.log('\n=== Updating DB with PST times ===\n');

  // Get all NCAAM games from DB for March 14
  const [dbRows] = await conn.execute(
    `SELECT id, awayTeam, homeTeam, startTimeEst, ncaaContestId FROM games 
     WHERE sport = 'NCAAM' AND gameDate = '2026-03-14'`
  ) as any[];

  console.log(`Found ${(dbRows as any[]).length} NCAAM games in DB for March 14\n`);

  let updated = 0;
  let noMatch = 0;

  for (const g of ncaaGames) {
    const pstTime = g.pstTime;
    
    // Try to match by contestId first
    const [result] = await conn.execute(
      `UPDATE games SET startTimeEst = ? WHERE ncaaContestId = ? AND sport = 'NCAAM'`,
      [pstTime, g.contestId]
    ) as any[];

    if (result.affectedRows > 0) {
      // Find the DB row for logging
      const dbRow = (dbRows as any[]).find((r: any) => r.ncaaContestId === g.contestId);
      const dbTeams = dbRow ? `${dbRow.awayTeam} @ ${dbRow.homeTeam}` : `contestId=${g.contestId}`;
      const oldTime = dbRow?.startTimeEst ?? '?';
      console.log(`  UPDATED: ${dbTeams.padEnd(40)} ${oldTime} → ${pstTime} PST`);
      updated++;
    } else {
      console.log(`  NO MATCH: ${g.awaySeoname} @ ${g.homeSeoname} (contestId=${g.contestId}) → ${pstTime} PST`);
      noMatch++;
    }
  }

  console.log(`\nDone: ${updated} updated, ${noMatch} no match in DB`);

  // Final verification
  const [finalRows] = await conn.execute(
    `SELECT awayTeam, homeTeam, startTimeEst FROM games 
     WHERE sport = 'NCAAM' AND gameDate = '2026-03-14' 
     ORDER BY startTimeEst`
  ) as any[];

  console.log('\n=== Final DB state (all 21 NCAAM games, sorted by PST time) ===');
  for (const row of finalRows as any[]) {
    // Convert PST HH:MM to 12h format for display
    const parts = (row.startTimeEst ?? 'TBD').split(':');
    const h = parseInt(parts[0] ?? '0', 10);
    const m = parts[1]?.slice(0, 2) ?? '00';
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    const display = isNaN(h) ? row.startTimeEst : `${h12}:${m} ${ampm} PST`;
    console.log(`  ${row.awayTeam.padEnd(30)} @ ${row.homeTeam.padEnd(30)} → ${display}`);
  }

  await conn.end();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
