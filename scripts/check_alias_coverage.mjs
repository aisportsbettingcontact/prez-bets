/**
 * Check how many entries in ncaaScoreboard's NCAA_ALIAS map are
 * already covered by the registry's BY_NCAA_SLUG lookup.
 * 
 * Run with: node scripts/check_alias_coverage.mjs
 */

import { readFileSync } from "fs";

// Read the registry file and extract all ncaaSlug values
const registryContent = readFileSync("./shared/ncaamTeams.ts", "utf-8");
const ncaaSlugs = new Set();
for (const match of registryContent.matchAll(/ncaaSlug:\s*"([^"]+)"/g)) {
  ncaaSlugs.add(match[1]);
}
console.log(`Registry has ${ncaaSlugs.size} NCAA slugs`);

// The NCAA_ALIAS keys (underscore format) from ncaaScoreboard.ts
// These are the seonames after hyphen→underscore conversion
const aliasKeys = [
  "michigan_st", "ohio_st", "penn_st", "iowa_st", "florida_st", "colorado_st",
  "kansas_st", "oklahoma_st", "oregon_st", "washington_st", "utah_st", "arizona_st",
  "boise_st", "fresno_st", "san_diego_st", "san_jose_st", "wichita_st", "illinois_st",
  "indiana_st", "idaho_st", "montana_st", "north_dakota_st", "south_dakota_st",
  "south_carolina_st", "tennessee_st", "mississippi_st", "missouri_st", "murray_st",
  "morehead_st", "jackson_st", "norfolk_st", "morgan_st", "savannah_st", "kennesaw_st",
  "jacksonville_st", "sam_houston_st", "tarleton_st", "texas_st", "new_mexico_st",
  "portland_st", "sacramento_st", "weber_st", "youngstown_st", "wright_st", "cleveland_st",
  "chicago_st", "georgia_st", "long_beach_st", "kent_st", "pittsburg_st", "fort_hays_st",
  "nicholls_st", "north_carolina_st", "southeast_mo_st", "northwest_mo_st", "northwestern_st",
  "west_virginia_st", "wayne_st_mi", "ualr", "fgcu", "fdu", "usc_upstate", "long_island",
  "lindenwood_mo", "central_conn_st", "north_ala", "south_ala", "west_ala", "west_ga",
  "northern_ky", "eastern_ky", "eastern_ill", "southern_ill", "southern_california",
  "south_fla", "ga_southern", "north_ala_2", "detroit", "saint_josephs", "humboldt_st",
  "middle_tenn", "ut_martin", "md_east_shore", "mississippi_val", "western_ky", "prairie_view",
  "grambling", "uni", "alcorn", "cal_st_northridge", "bakersfield", "cal_st_fullerton",
  "cal_st_san_marcos", "cal_poly", "arkansas_st", "alabama_am", "alabama_st", "south_utah",
  "coppin_st", "delaware_st", "florida_am", "south_miss", "boston_u", "loyola_maryland",
  "fiu", "southern_utah", "utep", "st_thomas_mn", "abilene_christian", "california_baptist",
  "uc_riverside", "uc_davis", "howard", "nc_at", "eastern_mich", "central_ark", "north_dakota",
  "charleston_so", "ill_chicago", "citadel", "northern_ill", "vcu", "central_mich",
  "western_mich", "neb_omaha", "south_dakota", "ucf", "st_johns_ny", "penn", "hawaii",
];

// Check which alias keys (after underscore→hyphen) are in the registry
let covered = 0;
let notCovered = [];
for (const key of aliasKeys) {
  const hyphenKey = key.replace(/_/g, "-");
  if (ncaaSlugs.has(hyphenKey)) {
    covered++;
  } else {
    notCovered.push({ key, hyphenKey });
  }
}

console.log(`\nAlias map: ${aliasKeys.length} entries`);
console.log(`Covered by registry: ${covered}`);
console.log(`NOT covered (need alias): ${notCovered.length}`);
if (notCovered.length > 0) {
  console.log("\nNot covered entries:");
  notCovered.forEach(({ key, hyphenKey }) => console.log(`  ${key} (${hyphenKey})`));
}
