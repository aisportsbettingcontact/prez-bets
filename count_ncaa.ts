import { VALID_DB_SLUGS, BY_NCAA_SLUG } from './shared/ncaamTeams';

const NCAA_API = "https://sdataprod.ncaa.com/";
const GET_CONTESTS_SHA = "7287cda610a9326931931080cb3a604828febe6fe3c9016a7e4a36db99efdb7c";

async function main() {
  const variables = { sportCode: "MBB", divisionId: 1, contestDate: "03/14/2026", seasonYear: 2025 };
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
  const data = await resp.json();
  const contests: any[] = data?.data?.contests ?? [];
  console.log(`Total contests from NCAA API: ${contests.length}`);

  let validGames = 0;
  for (const c of contests) {
    const away = c.teams?.find((t: any) => !t.isHome);
    const home = c.teams?.find((t: any) => t.isHome);
    if (!away || !home) continue;
    
    const awaySeo = away.seoname || '';
    const homeSeo = home.seoname || '';
    const awayTeam = BY_NCAA_SLUG.get(awaySeo);
    const homeTeam = BY_NCAA_SLUG.get(homeSeo);
    
    if (awayTeam && homeTeam && VALID_DB_SLUGS.has(awayTeam.dbSlug) && VALID_DB_SLUGS.has(homeTeam.dbSlug)) {
      validGames++;
      console.log(`  ${awayTeam.dbSlug} @ ${homeTeam.dbSlug} | ${c.startTime}`);
    }
  }
  console.log(`\nTotal valid DI games on March 14: ${validGames}`);
}

main().catch(console.error);
