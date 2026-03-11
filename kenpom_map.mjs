/**
 * KenPom → DB Slug mapping generator
 * Reads the 365-team KenPom list and matches each to the ncaamTeams registry
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

// Read KenPom team names from the pasted content
const kenpomRaw = readFileSync('/home/ubuntu/upload/pasted_content_5.txt', 'utf8');
const kenpomTeams = kenpomRaw
  .split('\n')
  .map(l => l.trim())
  .filter(l => l && l !== 'KenPom' && l !== 'Team');

console.log(`KenPom teams extracted: ${kenpomTeams.length}`);

// Load the registry via tsx-compiled output — use direct JSON parse of the TS file
const registryRaw = readFileSync('/home/ubuntu/ai-sports-betting/shared/ncaamTeams.ts', 'utf8');

// Extract all entries: ncaaName, dbSlug, vsinName, ncaaNickname
const entries = [];
const blocks = registryRaw.split(/\{[\s\n]+conference:/g).slice(1);
for (const block of blocks) {
  const get = (field) => {
    const m = block.match(new RegExp(`${field}:\\s*"([^"]+)"`));
    return m ? m[1] : null;
  };
  entries.push({
    ncaaName: get('ncaaName'),
    ncaaNickname: get('ncaaNickname'),
    vsinName: get('vsinName'),
    dbSlug: get('dbSlug'),
    ncaaSlug: get('ncaaSlug'),
  });
}
console.log(`Registry entries loaded: ${entries.length}`);

// Build lookup maps for matching
const byNcaaName = new Map(entries.map(e => [e.ncaaName?.toLowerCase(), e]));
const byVsinName = new Map(entries.map(e => [e.vsinName?.toLowerCase(), e]));
const byDbSlug = new Map(entries.map(e => [e.dbSlug, e]));

// KenPom name → DB slug normalization rules
// KenPom uses shortened/abbreviated names that differ from NCAA/VSiN
const KENPOM_OVERRIDES = {
  // KenPom name → dbSlug
  'Iowa St.': 'iowa_st',
  'Michigan St.': 'michigan_st',
  'Ohio St.': 'ohio_st',
  'N.C. State': 'nc_state',
  'Saint Mary\'s': 'saint_marys',
  'St. John\'s': 'st_johns',
  'Miami FL': 'miami_fl',
  'BYU': 'brigham_young',
  'UCLA': 'ucla',
  'USC': 'usc',
  'VCU': 'vcu',
  'San Diego St.': 'san_diego_st',
  'Virginia Tech': 'virginia_tech',
  'West Virginia': 'west_virginia',
  'Florida St.': 'florida_st',
  'Arizona St.': 'arizona_st',
  'Colorado St.': 'colorado_st',
  'Oklahoma St.': 'oklahoma_st',
  'Northern Iowa': 'northern_iowa',
  'Mississippi': 'ole_miss',
  'George Washington': 'george_washington',
  'Stephen F. Austin': 'stephen_f_austin',
  'Utah Valley': 'utah_valley',
  'Miami OH': 'miami_oh',
  'Notre Dame': 'notre_dame',
  'High Point': 'high_point',
  'George Mason': 'george_mason',
  'South Carolina': 'south_carolina',
  'Kansas St.': 'kansas_st',
  'Illinois St.': 'illinois_st',
  'Illinois Chicago': 'illinois_chicago',
  'UC Irvine': 'uc_irvine',
  'Sam Houston St.': 'sam_houston_st',
  'St. Thomas': 'st_thomas',
  'UNC Wilmington': 'unc_wilmington',
  'Cal Baptist': 'cal_baptist',
  'UC San Diego': 'uc_san_diego',
  'North Dakota St.': 'north_dakota_st',
  'Saint Joseph\'s': 'saint_josephs',
  'UAB': 'uab',
  'UC Santa Barbara': 'uc_santa_barbara',
  'Florida Atlantic': 'florida_atlantic',
  'Montana St.': 'montana_st',
  'Washington St.': 'washington_st',
  'Penn St.': 'penn_st',
  'Wright St.': 'wright_st',
  'North Texas': 'north_texas',
  'Northern Colorado': 'northern_colorado',
  'Portland St.': 'portland_st',
  'Robert Morris': 'robert_morris',
  'William & Mary': 'william_mary',
  'Bowling Green': 'bowling_green',
  'Arkansas St.': 'arkansas_st',
  'Central Arkansas': 'central_arkansas',
  'Boston College': 'boston_college',
  'UC Davis': 'uc_davis',
  'UT Arlington': 'ut_arlington',
  'St. Bonaventure': 'st_bonaventure',
  'Loyola Marymount': 'loyola_marymount',
  'Georgia Tech': 'georgia_tech',
  'Eastern Washington': 'eastern_washington',
  'East Tennessee St.': 'east_tennessee_st',
  'Western Kentucky': 'western_kentucky',
  'Cal St. Fullerton': 'cal_st_fullerton',
  'Middle Tennessee': 'middle_tennessee',
  'Austin Peay': 'austin_peay',
  'Texas A&M Corpus Chris': 'texas_am_corpus_christi',
  'Oregon St.': 'oregon_st',
  'Northern Kentucky': 'northern_kentucky',
  'CSUN': 'csun',
  'Kennesaw St.': 'kennesaw_st',
  'Utah Tech': 'utah_tech',
  'New Mexico St.': 'new_mexico_st',
  'Tennessee St.': 'tennessee_st',
  'New Orleans': 'new_orleans',
  'Appalachian St.': 'appalachian_st',
  'Weber St.': 'weber_st',
  'Indiana St.': 'indiana_st',
  'Jacksonville St.': 'jacksonville_st',
  'South Alabama': 'south_alabama',
  'Louisiana Tech': 'louisiana_tech',
  'Green Bay': 'green_bay',
  'Cal Poly': 'cal_poly',
  'James Madison': 'james_madison',
  'Missouri St.': 'missouri_st',
  'Tarleton St.': 'tarleton_st',
  'Youngstown St.': 'youngstown_st',
  'Southern Miss': 'southern_miss',
  'Detroit Mercy': 'detroit_mercy',
  'South Dakota St.': 'south_dakota_st',
  'Tennessee Martin': 'tennessee_martin',
  'La Salle': 'la_salle',
  'Stony Brook': 'stony_brook',
  'Western Carolina': 'western_carolina',
  'Southeast Missouri': 'southeast_missouri',
  'Long Beach St.': 'long_beach_st',
  'Georgia Southern': 'georgia_southern',
  'San Jose St.': 'san_jose_st',
  'Bethune Cookman': 'bethune_cookman',
  'Eastern Michigan': 'eastern_michigan',
  'Charleston Southern': 'charleston_southern',
  'Florida Gulf Coast': 'florida_gulf_coast',
  'Texas St.': 'texas_st',
  'UNC Asheville': 'unc_asheville',
  'Abilene Christian': 'abilene_christian',
  'Coastal Carolina': 'coastal_carolina',
  'Old Dominion': 'old_dominion',
  'Idaho St.': 'idaho_st',
  'Boston University': 'boston_university',
  'Southern Utah': 'southern_utah',
  'East Carolina': 'east_carolina',
  'Saint Peter\'s': 'saint_peters',
  'SIUE': 'siue',
  'UC Riverside': 'uc_riverside',
  'Purdue Fort Wayne': 'purdue_fort_wayne',
  'Nebraska Omaha': 'nebraska_omaha',
  'Sacramento St.': 'sacramento_st',
  'Incarnate Word': 'incarnate_word',
  'Central Michigan': 'central_michigan',
  'Western Michigan': 'western_michigan',
  'Mount St. Mary\'s': 'mount_st_marys',
  'Northwestern St.': 'northwestern_st',
  'Morehead St.': 'morehead_st',
  'Southeastern Louisiana': 'southeastern_louisiana',
  'East Texas A&M': 'east_texas_am',
  'North Carolina A&T': 'north_carolina_at',
  'Houston Christian': 'houston_christian',
  'Ball St.': 'ball_st',
  'Loyola Chicago': 'loyola_chicago',
  'Grambling St.': 'grambling_st',
  'Sacred Heart': 'sacred_heart',
  'Eastern Kentucky': 'eastern_kentucky',
  'Le Moyne': 'le_moyne',
  'UNC Greensboro': 'unc_greensboro',
  'Alabama A&M': 'alabama_am',
  'USC Upstate': 'usc_upstate',
  'West Georgia': 'west_georgia',
  'Central Connecticut': 'c_conn_st',
  'Texas Southern': 'texas_southern',
  'Little Rock': 'little_rock',
  'Georgia St.': 'georgia_st',
  'Oral Roberts': 'oral_roberts',
  'Prairie View A&M': 'prairie_view_a_and_m',
  'Tennessee Tech': 'tennessee_tech',
  'Florida A&M': 'florida_am',
  'Arkansas Pine Bluff': 'arkansas_pine_bluff',
  'IU Indy': 'iu_indy',
  'UMass Lowell': 'umass_lowell',
  'Alabama St.': 'alabama_st',
  'Northern Arizona': 'northern_arizona',
  'Norfolk St.': 'norfolk_st',
  'Cleveland St.': 'cleveland_st',
  'Loyola MD': 'loyola_md',
  'Eastern Illinois': 'eastern_illinois',
  'Cal St. Bakersfield': 'cal_st_bakersfield',
  'Holy Cross': 'holy_cross',
  'Northern Illinois': 'northern_illinois',
  'North Florida': 'north_florida',
  'Fairleigh Dickinson': 'fairleigh_dickinson',
  'Southern Indiana': 'southern_indiana',
  'Jackson St.': 'jackson_st',
  'North Alabama': 'north_alabama',
  'Air Force': 'air_force',
  'Chicago St.': 'chicago_st',
  'The Citadel': 'the_citadel',
  'Alcorn St.': 'alcorn_st',
  'Maryland Eastern Shore': 'maryland_eastern_shore',
  'New Hampshire': 'new_hampshire',
  'Louisiana Monroe': 'louisiana_monroe',
  'Morgan St.': 'morgan_st',
  'North Carolina Central': 'north_carolina_central',
  'Saint Francis': 'saint_francis',
  'South Carolina St.': 'south_carolina_st',
  'Kansas City': 'kansas_city',
  'Gardner Webb': 'gardner_webb',
  'Delaware St.': 'delaware_st',
  'Coppin St.': 'coppin_st',
  'Western Illinois': 'western_illinois',
  'Mississippi Valley St.': 'mississippi_valley_st',
  'Fresno St.': 'fresno_st',
  'Kent St.': 'kent_st',
  'Grand Canyon': 'grand_canyon',
  'Texas A&M': 'texas_am',
  'Utah St.': 'utah_st',
  'San Francisco': 'san_francisco',
  'Murray St.': 'murray_st',
  'North Dakota': 'north_dakota',
  'UTEP': 'utep',
  'South Dakota': 'south_dakota',
  'Mercyhurst': 'mercyhurst',
  'UTSA': 'utsa',
  'Niagara': 'niagara',
  'VMI': 'vmi',
  'Bryant': 'bryant',
  'Rider': 'rider',
  'Binghamton': 'binghamton',
};

// Simple slug-based matching: convert KenPom name to candidate dbSlug
function kenpomToSlugCandidate(name) {
  return name
    .toLowerCase()
    .replace(/\./g, '')        // remove periods
    .replace(/&/g, 'and')      // & → and
    .replace(/['']/g, '')      // remove apostrophes
    .replace(/[^a-z0-9]+/g, '_') // non-alphanumeric → underscore
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

const results = [];
const unmatched = [];

for (const kenpomName of kenpomTeams) {
  // 1. Check explicit override first
  if (KENPOM_OVERRIDES[kenpomName]) {
    const dbSlug = KENPOM_OVERRIDES[kenpomName];
    const entry = byDbSlug.get(dbSlug);
    results.push({
      kenpomName,
      dbSlug,
      ncaaName: entry?.ncaaName ?? '???',
      matchMethod: 'OVERRIDE',
    });
    continue;
  }

  // 2. Try direct ncaaName match (case-insensitive)
  const byNcaa = byNcaaName.get(kenpomName.toLowerCase());
  if (byNcaa) {
    results.push({
      kenpomName,
      dbSlug: byNcaa.dbSlug,
      ncaaName: byNcaa.ncaaName,
      matchMethod: 'NCAA_NAME',
    });
    continue;
  }

  // 3. Try vsinName match
  const byVsin = byVsinName.get(kenpomName.toLowerCase());
  if (byVsin) {
    results.push({
      kenpomName,
      dbSlug: byVsin.dbSlug,
      ncaaName: byVsin.ncaaName,
      matchMethod: 'VSIN_NAME',
    });
    continue;
  }

  // 4. Try slug candidate
  const candidate = kenpomToSlugCandidate(kenpomName);
  const byCandidate = byDbSlug.get(candidate);
  if (byCandidate) {
    results.push({
      kenpomName,
      dbSlug: candidate,
      ncaaName: byCandidate.ncaaName,
      matchMethod: 'SLUG_CANDIDATE',
    });
    continue;
  }

  // 5. No match
  unmatched.push(kenpomName);
  results.push({
    kenpomName,
    dbSlug: '??? UNMATCHED',
    ncaaName: '???',
    matchMethod: 'UNMATCHED',
  });
}

// Print results
console.log('\n=== KENPOM → DB SLUG MAPPING (365 teams) ===\n');
console.log(`${'#'.padStart(3)} | ${'KenPom Name'.padEnd(30)} | ${'DB Slug'.padEnd(35)} | ${'NCAA Name'.padEnd(30)} | Method`);
console.log('-'.repeat(130));
results.forEach((r, i) => {
  const flag = r.matchMethod === 'UNMATCHED' ? ' ❌' : '';
  console.log(`${String(i+1).padStart(3)} | ${r.kenpomName.padEnd(30)} | ${r.dbSlug.padEnd(35)} | ${r.ncaaName.padEnd(30)} | ${r.matchMethod}${flag}`);
});

console.log(`\nTotal: ${results.length} | Matched: ${results.filter(r => r.matchMethod !== 'UNMATCHED').length} | Unmatched: ${unmatched.length}`);
if (unmatched.length > 0) {
  console.log('\nUNMATCHED TEAMS:');
  unmatched.forEach(t => console.log('  - ' + t));
}
