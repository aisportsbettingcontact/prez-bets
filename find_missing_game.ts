import dotenv from 'dotenv';
dotenv.config();
import mysql from 'mysql2/promise';
import { BY_NCAA_SLUG } from './shared/ncaamTeams';

const SHA = "7287cda610a9326931931080cb3a604828febe6fe3c9016a7e4a36db99efdb7c";
const NCAA_API = "https://sdataprod.ncaa.com/";

async function fetchNcaaDay(date: string) {
  const variables = { sportCode: "MBB", divisionId: 1, contestDate: date, seasonYear: 2025 };
  const extensions = { persistedQuery: { version: 1, sha256Hash: SHA } };
  const url = `${NCAA_API}?variables=${encodeURIComponent(JSON.stringify(variables))}&extensions=${encodeURIComponent(JSON.stringify(extensions))}`;
  const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Origin: "https://www.ncaa.com", Referer: "https://www.ncaa.com/", Accept: "application/json" } });
  return (await resp.json())?.data?.contests ?? [];
}

function epochToPstDate(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function epochToPst(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
}

// Fetch BOTH March 13 and March 14 from NCAA API (to catch late-night games)
const [mar13, mar14] = await Promise.all([
  fetchNcaaDay("03/13/2026"),
  fetchNcaaDay("03/14/2026"),
]);

// Combine and deduplicate by contestId
const allContests = new Map<string, any>();
for (const c of [...mar13, ...mar14]) {
  if (c.contestId) allContests.set(String(c.contestId), c);
}

// Filter to D1 games with tracked teams, using PST date = March 14
const mar14Games: any[] = [];
for (const c of allContests.values()) {
  const away = c.teams?.find((t: any) => !t.isHome);
  const home = c.teams?.find((t: any) => t.isHome);
  if (!away || !home) continue;
  
  const awayTeam = BY_NCAA_SLUG.get(away.seoname);
  const homeTeam = BY_NCAA_SLUG.get(home.seoname);
  if (!awayTeam || !homeTeam) continue; // not in 365-team registry
  
  const epoch = c.startTimeEpoch;
  const pstDate = epoch ? epochToPstDate(epoch) : "2026-03-14";
  const pstTime = epoch ? epochToPst(epoch) : "TBD";
  
  if (pstDate === "2026-03-14") {
    mar14Games.push({
      away: awayTeam.dbSlug,
      home: homeTeam.dbSlug,
      awayNcaa: away.seoname,
      homeNcaa: home.seoname,
      pstDate,
      pstTime,
      contestId: String(c.contestId),
      gameState: c.gameState,
      awayScore: away.score,
      homeScore: home.score,
    });
  }
}

mar14Games.sort((a, b) => a.pstTime.localeCompare(b.pstTime));
console.log(`\nNCAA API - tracked D1 games with PST date = March 14: ${mar14Games.length}`);
for (const g of mar14Games) {
  console.log(`  ${g.pstTime} PST | ${g.away} @ ${g.home} | state=${g.gameState} | id=${g.contestId}`);
}

// Now check DB
const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const [dbGames] = await conn.execute(
  "SELECT id, awayTeam, homeTeam, startTimeEst, gameStatus, ncaaContestId FROM games WHERE gameDate='2026-03-14' AND sport='NCAAM' ORDER BY startTimeEst"
) as any[];
console.log(`\nDB March 14 NCAAM games: ${dbGames.length}`);
for (const g of dbGames) {
  console.log(`  ${g.startTimeEst} PST | ${g.awayTeam} @ ${g.homeTeam} | status=${g.gameStatus}`);
}

// Find games in NCAA API but not in DB
const dbSlugs = new Set(dbGames.map((g: any) => `${g.awayTeam}@${g.homeTeam}`));
const dbContestIds = new Set(dbGames.map((g: any) => g.ncaaContestId).filter(Boolean));
const missing = mar14Games.filter(g => 
  !dbSlugs.has(`${g.away}@${g.home}`) && 
  !dbSlugs.has(`${g.home}@${g.away}`) &&
  !dbContestIds.has(g.contestId)
);
console.log(`\nMissing from DB (in NCAA API but not in DB for March 14 PST):`);
for (const g of missing) {
  console.log(`  ${g.pstTime} PST | ${g.away} @ ${g.home} | contestId=${g.contestId} | state=${g.gameState}`);
}

// Also check games in DB but not in NCAA API
const apiSlugs = new Set(mar14Games.map(g => `${g.away}@${g.home}`));
const extra = dbGames.filter((g: any) => 
  !apiSlugs.has(`${g.awayTeam}@${g.homeTeam}`) && 
  !apiSlugs.has(`${g.homeTeam}@${g.awayTeam}`)
);
console.log(`\nExtra in DB (not in NCAA API for March 14 PST):`);
for (const g of extra) {
  console.log(`  ${g.startTimeEst} PST | ${g.awayTeam} @ ${g.homeTeam} | status=${g.gameStatus}`);
}

await conn.end();
