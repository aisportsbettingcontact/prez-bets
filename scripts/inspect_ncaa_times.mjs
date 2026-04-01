/**
 * Inspect raw NCAA API data for problem games:
 * - Youngstown St. vs Robert Morris (Mar 5)
 * - UC Riverside vs Hawaii (Mar 6)
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
  const d = new Date(epochSec * 1000);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function epochToUtc(epochSec) {
  return new Date(epochSec * 1000).toISOString();
}

function epochToPt(epochSec) {
  const d = new Date(epochSec * 1000);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

async function inspectDate(dateYYYYMMDD, searchTerms) {
  console.log(`\n=== NCAA data for ${dateYYYYMMDD} ===`);
  const contests = await fetchRaw(dateYYYYMMDD);
  console.log(`Total contests: ${contests.length}`);

  for (const c of contests) {
    const away = c.teams?.find(t => !t.isHome);
    const home = c.teams?.find(t => t.isHome);
    if (!away || !home) continue;

    const awayName = away.seoname ?? "?";
    const homeName = home.seoname ?? "?";

    // Check if this matches any of our search terms
    const matchesSearch = searchTerms.some(term =>
      awayName.includes(term) || homeName.includes(term)
    );

    if (matchesSearch) {
      console.log(`\n--- MATCH: ${awayName} @ ${homeName} ---`);
      console.log(`  contestId:     ${c.contestId}`);
      console.log(`  startTime:     ${c.startTime ?? "null"}`);
      console.log(`  hasStartTime:  ${c.hasStartTime}`);
      console.log(`  startTimeEpoch: ${c.startTimeEpoch}`);
      if (c.startTimeEpoch) {
        console.log(`  epoch → ET:    ${epochToEt(c.startTimeEpoch)}`);
        console.log(`  epoch → PT:    ${epochToPt(c.startTimeEpoch)}`);
        console.log(`  epoch → UTC:   ${epochToUtc(c.startTimeEpoch)}`);
      }
    }
  }

  // Also show all games with 00:00 or midnight-ish times
  console.log(`\n--- All games with suspicious times (00:00 or epoch near midnight) ---`);
  for (const c of contests) {
    const away = c.teams?.find(t => !t.isHome);
    const home = c.teams?.find(t => t.isHome);
    if (!away || !home) continue;

    const etTime = c.startTimeEpoch ? epochToEt(c.startTimeEpoch) : "no-epoch";
    const isMidnight = etTime === "00:00" || etTime === "24:00" || (c.startTimeEpoch && epochToEt(c.startTimeEpoch).startsWith("00:"));

    if (isMidnight || c.startTime === "00:00" || !c.hasStartTime) {
      const awayName = away.seoname ?? "?";
      const homeName = home.seoname ?? "?";
      console.log(`  ${awayName} @ ${homeName} | startTime=${c.startTime ?? "null"} | hasStartTime=${c.hasStartTime} | epoch=${c.startTimeEpoch} | ET=${etTime} | PT=${c.startTimeEpoch ? epochToPt(c.startTimeEpoch) : "?"}`);
    }
  }
}

// Inspect March 5 (Youngstown St @ Robert Morris)
await inspectDate("20260305", ["youngstown", "robert-morris", "uc-riverside", "hawaii"]);

// Inspect March 6 (UC Riverside @ Hawaii)
await inspectDate("20260306", ["youngstown", "robert-morris", "uc-riverside", "hawaii"]);
