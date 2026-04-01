/**
 * Debug script: check raw NCAA API response for startTime field format
 * Run: node scripts/debugNcaaStartTimes.mjs
 */

const NCAA_API = "https://sdataprod.ncaa.com/";
const GET_CONTESTS_SHA = "7287cda610a9326931931080cb3a604828febe6fe3c9016a7e4a36db99efdb7c";

const variables = {
  sportCode: "MBB",
  divisionId: 1,
  contestDate: "03/04/2026",
  seasonYear: 2025,
};
const extensions = {
  persistedQuery: {
    version: 1,
    sha256Hash: GET_CONTESTS_SHA,
  },
};

const url = `${NCAA_API}?variables=${encodeURIComponent(JSON.stringify(variables))}&extensions=${encodeURIComponent(JSON.stringify(extensions))}`;

const resp = await fetch(url, {
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Origin: "https://www.ncaa.com",
    Referer: "https://www.ncaa.com/",
    Accept: "application/json",
  },
});

const data = await resp.json();
const contests = data?.data?.contests ?? [];

console.log(`Total contests: ${contests.length}`);
console.log("\nFirst 10 games with raw startTime / startTimeEpoch:");

for (const c of contests.slice(0, 10)) {
  const away = c.teams?.find(t => !t.isHome);
  const home = c.teams?.find(t => t.isHome);
  const awayName = away?.seoname ?? "?";
  const homeName = home?.seoname ?? "?";
  
  // Show raw values
  console.log(`  ${awayName} @ ${homeName}`);
  console.log(`    startTime: ${JSON.stringify(c.startTime)}`);
  console.log(`    startTimeEpoch: ${c.startTimeEpoch}`);
  console.log(`    hasStartTime: ${c.hasStartTime}`);
  
  // Convert epoch to EST for comparison
  if (c.startTimeEpoch) {
    const d = new Date(c.startTimeEpoch * 1000);
    const utcH = d.getUTCHours();
    const utcM = d.getUTCMinutes();
    const estH = ((utcH - 5) + 24) % 24;
    const estTime = `${estH.toString().padStart(2,'0')}:${utcM.toString().padStart(2,'0')}`;
    const etH = estH % 12 || 12;
    const ampm = estH >= 12 ? 'PM' : 'AM';
    console.log(`    epoch→EST: ${estTime} (${etH}:${utcM.toString().padStart(2,'0')} ${ampm} ET)`);
  }
  console.log();
}
