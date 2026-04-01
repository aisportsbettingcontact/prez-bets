/**
 * Test script: fetch NCAA games for March 8 to see TBA handling
 */
import { createRequire } from "module";
import { execSync } from "child_process";

const NCAA_API = "https://sdataprod.ncaa.com/";
const GET_CONTESTS_SHA = "7287cda610a9326931931080cb3a604828febe6fe3c9016a7e4a36db99efdb7c";

async function fetchNcaaGames(dateYYYYMMDD) {
  const [y, m, d] = [dateYYYYMMDD.slice(0,4), dateYYYYMMDD.slice(4,6), dateYYYYMMDD.slice(6,8)];
  const contestDate = `${m}/${d}/${y}`;
  const seasonYear = parseInt(y) - 1;
  const variables = { sportCode: "MBB", divisionId: 1, contestDate, seasonYear };
  const extensions = { persistedQuery: { version: 1, sha256Hash: GET_CONTESTS_SHA } };
  const url = `${NCAA_API}?variables=${encodeURIComponent(JSON.stringify(variables))}&extensions=${encodeURIComponent(JSON.stringify(extensions))}`;

  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Origin: "https://www.ncaa.com",
      Referer: "https://www.ncaa.com/",
      Accept: "application/json",
    },
  });

  if (!resp.ok) throw new Error(`NCAA API returned HTTP ${resp.status}`);
  const data = await resp.json();
  return data?.data?.contests ?? [];
}

const contests = await fetchNcaaGames("20260308");
console.log("Total contests:", contests.length);

const tbaGames = contests.filter(c => {
  const away = c.teams?.find(t => !t.isHome);
  const home = c.teams?.find(t => t.isHome);
  return away?.seoname === "tba" || home?.seoname === "tba";
});

console.log("TBA games:", tbaGames.length);
console.log("\nSample TBA game:");
if (tbaGames[0]) {
  const g = tbaGames[0];
  const away = g.teams?.find(t => !t.isHome);
  const home = g.teams?.find(t => t.isHome);
  console.log({
    contestId: g.contestId,
    away: away?.seoname,
    home: home?.seoname,
    startTime: g.startTime,
    startTimeEpoch: g.startTimeEpoch,
    hasStartTime: g.hasStartTime,
  });
}

console.log("\nAll games (away @ home, time):");
for (const c of contests) {
  const away = c.teams?.find(t => !t.isHome);
  const home = c.teams?.find(t => t.isHome);
  if (!away || !home) continue;
  console.log(`  ${away.seoname} @ ${home.seoname} — ${c.startTime || "TBD"} (epoch: ${c.startTimeEpoch})`);
}
