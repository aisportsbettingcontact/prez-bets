/**
 * Debug: Show all NCAA API epochs for March 14, 2026 with UTC/PST/EST conversions.
 * This helps verify the correct PST times from the raw epoch data.
 */
import dotenv from 'dotenv';
dotenv.config();

const NCAA_API = "https://sdataprod.ncaa.com/";
const GET_CONTESTS_SHA = "7287cda610a9326931931080cb3a604828febe6fe3c9016a7e4a36db99efdb7c";

function fmt(epochSec: number, tz: string): string {
  const d = new Date(epochSec * 1000);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

async function main() {
  const contestDate = "03/14/2026";
  const seasonYear = 2025; // 2025-26 season

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

  // Filter to only DI games (those with valid seonames in our 365-team registry)
  // For now, show all and let the user identify which are DI
  console.log(`Total contests returned: ${contests.length}\n`);
  console.log('Away Seoname            | Home Seoname           | Epoch      | UTC   | PST   | EST   | hasTime | gameState');
  console.log('------------------------|------------------------|------------|-------|-------|-------|---------|----------');

  // Sort by epoch for clarity
  const sorted = contests
    .filter(c => c.startTimeEpoch)
    .sort((a, b) => a.startTimeEpoch - b.startTimeEpoch);

  for (const c of sorted) {
    const away = c.teams?.find((t: any) => !t.isHome);
    const home = c.teams?.find((t: any) => t.isHome);
    if (!away || !home) continue;

    const epoch = c.startTimeEpoch;
    const utc = fmt(epoch, "UTC");
    const pst = fmt(epoch, "America/Los_Angeles");
    const est = fmt(epoch, "America/New_York");
    const utcDate = new Date(epoch * 1000).toISOString().slice(0, 10);

    const awaySeo = (away.seoname ?? 'unknown').padEnd(23);
    const homeSeo = (home.seoname ?? 'unknown').padEnd(23);
    const epochStr = String(epoch).padEnd(10);
    const hasTime = c.hasStartTime ? 'YES' : 'NO ';
    const state = c.gameState ?? '?';

    console.log(`${awaySeo} | ${homeSeo} | ${epochStr} | ${utc} | ${pst} | ${est} | ${hasTime}     | ${state} (${utcDate})`);
  }

  // Also show the 21 DI games we have in DB
  console.log('\n\n=== Cross-reference with DB ===');
  console.log('The NCAA API returned these games that match our 21 DI tracked teams:');
  
  // Known DI seonames from our 365-team registry (just the ones we track)
  const knownDiSeonames = new Set([
    'vermont', 'umbc', 'cornell', 'yale', 'dayton', 'saint-louis', 'nc-central', 'howard',
    'vanderbilt', 'florida', 'wisconsin', 'michigan', 'pennsylvania', 'harvard',
    'charlotte', 'south-florida', 'st-josephs', 'vcu', 'mississippi', 'arkansas',
    'purdue', 'ucla', 'tulsa', 'wichita-st', 'houston', 'arizona', 'san-diego-st',
    'utah-st', 'connecticut', 'st-johns', 'prairie-view', 'southern-u', 'toledo', 'akron',
    'virginia', 'duke', 'kennesaw-st', 'louisiana-tech', 'hawaii', 'uc-irvine',
    'new-mexico', 'new-mexico-st'
  ]);

  let diCount = 0;
  for (const c of sorted) {
    const away = c.teams?.find((t: any) => !t.isHome);
    const home = c.teams?.find((t: any) => t.isHome);
    if (!away || !home) continue;

    const awayS = away.seoname ?? '';
    const homeS = home.seoname ?? '';
    
    if (knownDiSeonames.has(awayS) || knownDiSeonames.has(homeS)) {
      const epoch = c.startTimeEpoch;
      const pst = fmt(epoch, "America/Los_Angeles");
      const est = fmt(epoch, "America/New_York");
      
      // Convert PST to 12h
      const parts = pst.split(':');
      const h = parseInt(parts[0] ?? '0', 10);
      const m = parts[1]?.slice(0, 2) ?? '00';
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      const pst12 = `${h12}:${m} ${ampm} PST`;
      
      // Convert EST to 12h
      const partsE = est.split(':');
      const hE = parseInt(partsE[0] ?? '0', 10);
      const mE = partsE[1]?.slice(0, 2) ?? '00';
      const ampmE = hE >= 12 ? 'PM' : 'AM';
      const h12E = hE % 12 || 12;
      const est12 = `${h12E}:${mE} ${ampmE} EST`;
      
      console.log(`  ${awayS} @ ${homeS}: ${pst12} (${est12}) [epoch=${epoch}]`);
      diCount++;
    }
  }
  console.log(`\nTotal DI games found: ${diCount}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
