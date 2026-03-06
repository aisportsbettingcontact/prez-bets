/**
 * Search all 7 days of NCAA data for Youngstown St @ Robert Morris
 */

const NCAA_API = "https://sdataprod.ncaa.com/";
const GET_CONTESTS_SHA = "7287cda610a9326931931080cb3a604828febe6fe3c9016a7e4a36db99efdb7c";

async function fetchRaw(dateYYYYMMDD) {
  const [y, m, d] = [dateYYYYMMDD.slice(0,4), dateYYYYMMDD.slice(4,6), dateYYYYMMDD.slice(6,8)];
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
  return data?.data?.contests ?? [];
}

function epochToEt(epochSec) {
  if (!epochSec) return "no-epoch";
  const d = new Date(epochSec * 1000);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

// Search March 4-11
const dates = ["20260304","20260305","20260306","20260307","20260308","20260309","20260310","20260311"];
const searchTerms = ["youngstown", "robert-morris"];

for (const date of dates) {
  const contests = await fetchRaw(date);
  for (const c of contests) {
    const away = c.teams?.find(t => !t.isHome);
    const home = c.teams?.find(t => t.isHome);
    if (!away || !home) continue;

    const awayName = away.seoname ?? "?";
    const homeName = home.seoname ?? "?";

    if (searchTerms.some(t => awayName.includes(t) || homeName.includes(t))) {
      console.log(`\n[${date}] ${awayName} @ ${homeName}`);
      console.log(`  contestId: ${c.contestId}`);
      console.log(`  startTime: ${c.startTime ?? "null"}`);
      console.log(`  hasStartTime: ${c.hasStartTime}`);
      console.log(`  epoch: ${c.startTimeEpoch}`);
      console.log(`  ET: ${epochToEt(c.startTimeEpoch)}`);
    }
  }
}

console.log("\nDone.");
