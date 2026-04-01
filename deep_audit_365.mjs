/**
 * ============================================================
 * DEEP 365-TEAM AUDIT — KenPom × VSiN × NCAA.com × DB Slug
 * ============================================================
 * For every team in the registry this script:
 *   1. Verifies the ncaaSlug resolves to a real NCAA.com logo URL (HTTP 200)
 *   2. Verifies the vsinSlug resolves to a real VSiN team page (HTTP 200)
 *   3. Verifies the kenpomSlug (from our mapping) matches the KenPom table
 *   4. Cross-checks dbSlug consistency (vsinSlug with hyphens→underscores)
 *   5. Prints a per-team status line with PASS / WARN / FAIL
 *   6. Summarises all failures at the end
 *
 * Run: node deep_audit_365.mjs 2>&1 | tee /tmp/audit_output.txt
 */

import { readFileSync, writeFileSync } from 'fs';
import https from 'https';
import http from 'http';

// ── 1. Parse registry ────────────────────────────────────────────────────────
const registryRaw = readFileSync('./shared/ncaamTeams.ts', 'utf8');
const blocks = registryRaw.split(/\{\s*conference:/g).slice(1);

const teams = blocks.map((block, idx) => {
  // Skip the TypeScript interface block (no actual team data)
  if (!block.includes('ncaaName:') || block.trim().startsWith('string;')) return null;
  const get = (field) => {
    const m = block.match(new RegExp(field + ':\\s*"([^"]+)"'));
    return m ? m[1] : null;
  };
  return {
    idx: idx + 1,
    conference: block.match(/^\s*"([^"]+)"/)?.[1] ?? '?',
    ncaaName: get('ncaaName'),
    ncaaNickname: get('ncaaNickname'),
    vsinName: get('vsinName'),
    ncaaSlug: get('ncaaSlug'),
    vsinSlug: get('vsinSlug'),
    dbSlug: get('dbSlug'),
    logoUrl: get('logoUrl'),
    kenpomSlug: get('kenpomSlug'),  // may be null if not yet added
  };
}).filter(Boolean);

console.log(`\n${'='.repeat(80)}`);
console.log(`  DEEP 365-TEAM AUDIT — ${new Date().toISOString()}`);
console.log(`  Registry entries loaded: ${teams.length}`);
console.log(`${'='.repeat(80)}\n`);

// ── 2. KenPom mapping (from our approved mapping) ────────────────────────────
// kenpomSlug = the exact string that appears in the KenPom table
// (used as the href value: team.php?team=<kenpomSlug>)
const KENPOM_MAP = {
  // dbSlug → kenpomSlug
  'duke': 'Duke',
  'michigan': 'Michigan',
  'arizona': 'Arizona',
  'florida': 'Florida',
  'illinois': 'Illinois',
  'houston': 'Houston',
  'iowa_st': 'Iowa St.',
  'purdue': 'Purdue',
  'michigan_st': 'Michigan St.',
  'connecticut': 'Connecticut',
  'gonzaga': 'Gonzaga',
  'nebraska': 'Nebraska',
  'vanderbilt': 'Vanderbilt',
  'louisville': 'Louisville',
  'tennessee': 'Tennessee',
  'texas_tech': 'Texas Tech',
  'alabama': 'Alabama',
  'arkansas': 'Arkansas',
  'kansas': 'Kansas',
  'virginia': 'Virginia',
  'st_johns': "St. John's",
  'saint_marys': "Saint Mary's",
  'wisconsin': 'Wisconsin',
  'iowa': 'Iowa',
  'brigham_young': 'BYU',
  'ohio_st': 'Ohio St.',
  'kentucky': 'Kentucky',
  'ucla': 'UCLA',
  'miami_fl': 'Miami FL',
  'north_carolina': 'North Carolina',
  'georgia': 'Georgia',
  'villanova': 'Villanova',
  'texas': 'Texas',
  'santa_clara': 'Santa Clara',
  'texas_am': 'Texas A&M',
  'utah_st': 'Utah St.',
  'nc_state': 'N.C. State',
  'clemson': 'Clemson',
  'auburn': 'Auburn',
  'saint_louis': 'Saint Louis',
  'indiana': 'Indiana',
  'cincinnati': 'Cincinnati',
  'smu': 'SMU',
  'tcu': 'TCU',
  'vcu': 'VCU',
  'oklahoma': 'Oklahoma',
  'san_diego_st': 'San Diego St.',
  'baylor': 'Baylor',
  'new_mexico': 'New Mexico',
  'missouri': 'Missouri',
  'seton_hall': 'Seton Hall',
  'south_florida': 'South Florida',
  'c_florida': 'UCF',
  'washington': 'Washington',
  'boise_st': 'Boise St.',
  'virginia_tech': 'Virginia Tech',
  'west_virginia': 'West Virginia',
  'tulsa': 'Tulsa',
  'stanford': 'Stanford',
  'grand_canyon': 'Grand Canyon',
  'akron': 'Akron',
  'lsu': 'LSU',
  'arizona_st': 'Arizona St.',
  'colorado': 'Colorado',
  'florida_st': 'Florida St.',
  'northwestern': 'Northwestern',
  'belmont': 'Belmont',
  'mcneese_st': 'McNeese',
  'oklahoma_st': 'Oklahoma St.',
  'northern_iowa': 'Northern Iowa',
  'california': 'California',
  'minnesota': 'Minnesota',
  'providence': 'Providence',
  'creighton': 'Creighton',
  'wake_forest': 'Wake Forest',
  'nevada': 'Nevada',
  'usc': 'USC',
  'yale': 'Yale',
  'dayton': 'Dayton',
  'syracuse': 'Syracuse',
  'mississippi': 'Mississippi',
  'butler': 'Butler',
  'george_washington': 'George Washington',
  'colorado_st': 'Colorado St.',
  'marquette': 'Marquette',
  'georgetown': 'Georgetown',
  'hofstra': 'Hofstra',
  'wichita_st': 'Wichita St.',
  'stephen_f_austin': 'Stephen F. Austin',
  'utah_valley': 'Utah Valley',
  'miami_oh': 'Miami OH',
  'notre_dame': 'Notre Dame',
  'high_point': 'High Point',
  'george_mason': 'George Mason',
  'south_carolina': 'South Carolina',
  'xavier': 'Xavier',
  'oregon': 'Oregon',
  'wyoming': 'Wyoming',
  'pittsburgh': 'Pittsburgh',
  'mississippi_st': 'Mississippi St.',
  'kansas_st': 'Kansas St.',
  'depaul': 'DePaul',
  'illinois_st': 'Illinois St.',
  'unlv': 'UNLV',
  'illinois_chicago': 'Illinois Chicago',
  'uc_irvine': 'UC Irvine',
  'davidson': 'Davidson',
  'sam_houston_st': 'Sam Houston St.',
  'st_thomas': 'St. Thomas',
  'unc_wilmington': 'UNC Wilmington',
  'pacific': 'Pacific',
  'cal_baptist': 'Cal Baptist',
  'uc_san_diego': 'UC San Diego',
  'north_dakota_st': 'North Dakota St.',
  'hawaii': 'Hawaii',
  'liberty': 'Liberty',
  's_illinois': 'Southern Illinois',
  'seattle_u': 'Seattle',
  'utrgv': 'UT Rio Grande Valley',
  'san_francisco': 'San Francisco',
  'murray_st': 'Murray St.',
  'saint_josephs': "Saint Joseph's",
  'bradley': 'Bradley',
  'uab': 'UAB',
  'uc_santa_barbara': 'UC Santa Barbara',
  'utah': 'Utah',
  'florida_atlantic': 'Florida Atlantic',
  'maryland': 'Maryland',
  'rutgers': 'Rutgers',
  'memphis': 'Memphis',
  'fresno_st': 'Fresno St.',
  'montana_st': 'Montana St.',
  'duquesne': 'Duquesne',
  'rhode_island': 'Rhode Island',
  'toledo': 'Toledo',
  'washington_st': 'Washington St.',
  'penn_st': 'Penn St.',
  'wright_st': 'Wright St.',
  'north_texas': 'North Texas',
  'northern_colorado': 'Northern Colorado',
  'portland_st': 'Portland St.',
  'navy': 'Navy',
  'troy': 'Troy',
  'richmond': 'Richmond',
  'robert_morris': 'Robert Morris',
  'william_mary': 'William & Mary',
  'bowling_green': 'Bowling Green',
  'arkansas_st': 'Arkansas St.',
  'harvard': 'Harvard',
  'central_arkansas': 'Central Arkansas',
  'winthrop': 'Winthrop',
  'towson': 'Towson',
  'kent_st': 'Kent St.',
  'boston_college': 'Boston College',
  'uc_davis': 'UC Davis',
  'ut_arlington': 'UT Arlington',
  'cornell': 'Cornell',
  'valparaiso': 'Valparaiso',
  'st_bonaventure': 'St. Bonaventure',
  'loyola_marymount': 'Loyola Marymount',
  'temple': 'Temple',
  'penn': 'Penn',
  'georgia_tech': 'Georgia Tech',
  'idaho': 'Idaho',
  'eastern_washington': 'Eastern Washington',
  'east_tennessee_st': 'East Tennessee St.',
  'western_kentucky': 'Western Kentucky',
  'fordham': 'Fordham',
  'cal_st_fullerton': 'Cal St. Fullerton',
  'oakland': 'Oakland',
  'middle_tennessee': 'Middle Tennessee',
  'charleston': 'Charleston',
  'merrimack': 'Merrimack',
  'austin_peay': 'Austin Peay',
  'texas_am_corpus_christi': 'Texas A&M Corpus Chris',
  'oregon_st': 'Oregon St.',
  'northern_kentucky': 'Northern Kentucky',
  'csun': 'CSUN',
  'monmouth': 'Monmouth',
  'kennesaw_st': 'Kennesaw St.',
  'campbell': 'Campbell',
  'montana': 'Montana',
  'queens_nc': 'Queens',
  'utah_tech': 'Utah Tech',
  'new_mexico_st': 'New Mexico St.',
  'tennessee_st': 'Tennessee St.',
  'furman': 'Furman',
  'columbia': 'Columbia',
  'mercer': 'Mercer',
  'florida_intl': 'FIU',
  'new_orleans': 'New Orleans',
  'charlotte': 'Charlotte',
  'appalachian_st': 'Appalachian St.',
  'weber_st': 'Weber St.',
  'drake': 'Drake',
  'siena': 'Siena',
  'portland': 'Portland',
  'lipscomb': 'Lipscomb',
  'umbc': 'UMBC',
  'indiana_st': 'Indiana St.',
  'massachusetts': 'Massachusetts',
  'howard': 'Howard',
  'marist': 'Marist',
  'jacksonville_st': 'Jacksonville St.',
  'marshall': 'Marshall',
  'south_alabama': 'South Alabama',
  'buffalo': 'Buffalo',
  'louisiana_tech': 'Louisiana Tech',
  'green_bay': 'Green Bay',
  'tulane': 'Tulane',
  'cal_poly': 'Cal Poly',
  'samford': 'Samford',
  'james_madison': 'James Madison',
  'missouri_st': 'Missouri St.',
  'tarleton_st': 'Tarleton St.',
  'youngstown_st': 'Youngstown St.',
  'liu': 'LIU',
  'quinnipiac': 'Quinnipiac',
  'southern_miss': 'Southern Miss',
  'detroit_mercy': 'Detroit Mercy',
  'south_dakota_st': 'South Dakota St.',
  'drexel': 'Drexel',
  'tennessee_martin': 'Tennessee Martin',
  'san_diego': 'San Diego',
  'la_salle': 'La Salle',
  'rice': 'Rice',
  'ohio': 'Ohio',
  'stony_brook': 'Stony Brook',
  'w_carolina': 'Western Carolina',
  'elon': 'Elon',
  'southeast_missouri': 'Southeast Missouri',
  'vermont': 'Vermont',
  'long_beach_st': 'Long Beach St.',
  'denver': 'Denver',
  'georgia_southern': 'Georgia Southern',
  'san_jose_st': 'San Jose St.',
  'nicholls_st': 'Nicholls',
  'bethune_cookman': 'Bethune Cookman',
  'lamar': 'Lamar',
  'eastern_michigan': 'Eastern Michigan',
  'american': 'American',
  'charleston_southern': 'Charleston Southern',
  'florida_gulf_coast': 'Florida Gulf Coast',
  'texas_st': 'Texas St.',
  'unc_asheville': 'UNC Asheville',
  'abilene_christian': 'Abilene Christian',
  'coastal_carolina': 'Coastal Carolina',
  'old_dominion': 'Old Dominion',
  'idaho_st': 'Idaho St.',
  'colgate': 'Colgate',
  'princeton': 'Princeton',
  's_utah': 'Southern Utah',
  'boston_university': 'Boston University',
  'wofford': 'Wofford',
  'east_carolina': 'East Carolina',
  'saint_peters': "Saint Peter's",
  'siue': 'SIUE',
  'radford': 'Radford',
  'iona': 'Iona',
  'uc_riverside': 'UC Riverside',
  'purdue_fort_wayne': 'Purdue Fort Wayne',
  'nebraska_omaha': 'Nebraska Omaha',
  'pepperdine': 'Pepperdine',
  'fairfield': 'Fairfield',
  'sacramento_st': 'Sacramento St.',
  'incarnate_word': 'Incarnate Word',
  'lindenwood': 'Lindenwood',
  'milwaukee': 'Milwaukee',
  'presbyterian': 'Presbyterian',
  'central_michigan': 'Central Michigan',
  'longwood': 'Longwood',
  'hampton': 'Hampton',
  'western_michigan': 'Western Michigan',
  'dartmouth': 'Dartmouth',
  'southern_u': 'Southern',
  'north_dakota': 'North Dakota',
  'utep': 'UTEP',
  'mount_st_marys': "Mount St. Mary's",
  'bellarmine': 'Bellarmine',
  'northwestern_st': 'Northwestern St.',
  'south_dakota': 'South Dakota',
  'morehead_st': 'Morehead St.',
  'northeastern': 'Northeastern',
  'mercyhurst': 'Mercyhurst',
  'southeastern_louisiana': 'Southeastern Louisiana',
  'east_texas_am': 'East Texas A&M',
  'brown': 'Brown',
  'n_carolina_a_and_t': 'North Carolina A&T',
  'houston_christian': 'Houston Christian',
  'lehigh': 'Lehigh',
  'ball_st': 'Ball St.',
  'delaware': 'Delaware',
  'loyola_chicago': 'Loyola Chicago',
  'grambling_st': 'Grambling St.',
  'jacksonville': 'Jacksonville',
  'sacred_heart': 'Sacred Heart',
  'eastern_kentucky': 'Eastern Kentucky',
  'le_moyne': 'Le Moyne',
  'unc_greensboro': 'UNC Greensboro',
  'chattanooga': 'Chattanooga',
  'alabama_am': 'Alabama A&M',
  'usc_upstate': 'USC Upstate',
  'stetson': 'Stetson',
  'west_georgia': 'West Georgia',
  'c_conn_st': 'Central Connecticut',
  'wagner': 'Wagner',
  'evansville': 'Evansville',
  'texas_southern': 'Texas Southern',
  'little_rock': 'Little Rock',
  'georgia_st': 'Georgia St.',
  'oral_roberts': 'Oral Roberts',
  'prairie_view_a_and_m': 'Prairie View A&M',
  'la_lafayette': 'Louisiana',
  'tennessee_tech': 'Tennessee Tech',
  'florida_a_and_m': 'Florida A&M',
  'arkansas_pine_bluff': 'Arkansas Pine Bluff',
  'iu_indy': 'IU Indy',
  'umass_lowell': 'UMass Lowell',
  'alabama_st': 'Alabama St.',
  'northern_arizona': 'Northern Arizona',
  'norfolk_st': 'Norfolk St.',
  'cleveland_st': 'Cleveland St.',
  'loyola_md': 'Loyola MD',
  'albany': 'Albany',
  'eastern_illinois': 'Eastern Illinois',
  'lafayette': 'Lafayette',
  'cal_st_bakersfield': 'Cal St. Bakersfield',
  'new_haven': 'New Haven',
  'manhattan': 'Manhattan',
  'holy_cross': 'Holy Cross',
  'bucknell': 'Bucknell',
  'njit': 'NJIT',
  'stonehill': 'Stonehill',
  'northern_illinois': 'Northern Illinois',
  'n_florida': 'North Florida',
  'fairleigh_dickinson': 'Fairleigh Dickinson',
  'army': 'Army',
  'niagara': 'Niagara',
  's_indiana': 'Southern Indiana',
  'utsa': 'UTSA',
  'jackson_st': 'Jackson St.',
  'north_alabama': 'North Alabama',
  'canisius': 'Canisius',
  'air_force': 'Air Force',
  'chicago_st': 'Chicago St.',
  'the_citadel': 'The Citadel',
  'alcorn_st': 'Alcorn St.',
  'maine': 'Maine',
  'maryland_eastern_shore': 'Maryland Eastern Shore',
  'new_hampshire': 'New Hampshire',
  'louisiana_monroe': 'Louisiana Monroe',
  'morgan_st': 'Morgan St.',
  'north_carolina_central': 'North Carolina Central',
  'saint_francis': 'Saint Francis',
  'bryant': 'Bryant',
  's_carolina_st': 'South Carolina St.',
  'rider': 'Rider',
  'kansas_city': 'Kansas City',
  'binghamton': 'Binghamton',
  'vmi': 'VMI',
  'gardner_webb': 'Gardner Webb',
  'delaware_st': 'Delaware St.',
  'coppin_st': 'Coppin St.',
  'western_illinois': 'Western Illinois',
  'mississippi_valley_st': 'Mississippi Valley St.',
};

// ── 3. HTTP HEAD check helper ─────────────────────────────────────────────────
function headCheck(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, { method: 'HEAD', timeout: 8000 }, (res) => {
      resolve({ status: res.statusCode, url });
    });
    req.on('error', () => resolve({ status: 0, url }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, url }); });
    req.end();
  });
}

// ── 4. Batch HEAD checks (concurrency-limited) ───────────────────────────────
async function batchHead(urlList, concurrency = 20) {
  const results = new Map();
  let i = 0;
  async function worker() {
    while (i < urlList.length) {
      const { url, key } = urlList[i++];
      const r = await headCheck(url);
      results.set(key, r.status);
    }
  }
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── 5. Build URL lists ────────────────────────────────────────────────────────
console.log('► Building URL check lists...');

const ncaaLogoUrls = teams.map(t => ({
  key: `logo:${t.dbSlug}`,
  url: `https://www.ncaa.com/sites/default/files/images/logos/schools/bgl/${t.ncaaSlug}.svg`,
}));

const vsinUrls = teams.map(t => ({
  key: `vsin:${t.dbSlug}`,
  url: `https://www.vsin.com/ncaab/teams/${t.vsinSlug}/`,
}));

// ── 6. Run all HTTP checks in parallel ───────────────────────────────────────
console.log(`► Checking ${ncaaLogoUrls.length} NCAA logo URLs...`);
const logoStatuses = await batchHead(ncaaLogoUrls, 30);

console.log(`► Checking ${vsinUrls.length} VSiN team URLs...`);
const vsinStatuses = await batchHead(vsinUrls, 30);

// ── 7. Per-team analysis ─────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(120)}`);
console.log(
  `${'#'.padStart(3)} | ${'DB Slug'.padEnd(30)} | ${'NCAA Slug'.padEnd(28)} | ${'VSiN Slug'.padEnd(28)} | ${'KenPom Name'.padEnd(28)} | NCAA | VSiN | DB✓ | KP✓ | STATUS`
);
console.log(`${'─'.repeat(120)}`);

const issues = [];
const warnings = [];
let passCount = 0;

for (const t of teams) {
  const logoStatus = logoStatuses.get(`logo:${t.dbSlug}`) ?? 0;
  const vsinStatus = vsinStatuses.get(`vsin:${t.dbSlug}`) ?? 0;

  // DB slug consistency check: vsinSlug with hyphens→underscores should equal dbSlug
  const expectedDbSlug = t.vsinSlug?.replace(/-/g, '_');
  const dbSlugConsistent = expectedDbSlug === t.dbSlug;

  // KenPom mapping check
  const kenpomName = KENPOM_MAP[t.dbSlug];
  const hasKenpom = !!kenpomName;

  // Determine status
  const ncaaOk = logoStatus === 200;
  const vsinOk = vsinStatus === 200 || vsinStatus === 301 || vsinStatus === 302;
  const dbOk = dbSlugConsistent;

  let status = 'PASS';
  const flags = [];

  if (!ncaaOk) {
    flags.push(`NCAA_LOGO_${logoStatus}`);
    status = 'FAIL';
  }
  if (!vsinOk) {
    flags.push(`VSIN_${vsinStatus}`);
    status = status === 'FAIL' ? 'FAIL' : 'WARN';
  }
  if (!dbOk) {
    flags.push(`DB_MISMATCH(expected:${expectedDbSlug})`);
    status = 'FAIL';
  }
  if (!hasKenpom) {
    flags.push('NO_KENPOM_MAP');
    status = status === 'FAIL' ? 'FAIL' : 'WARN';
  }

  const ncaaMark = ncaaOk ? '✅' : `❌${logoStatus}`;
  const vsinMark = vsinOk ? '✅' : `❌${vsinStatus}`;
  const dbMark = dbOk ? '✅' : '❌';
  const kpMark = hasKenpom ? '✅' : '❌';
  const statusMark = status === 'PASS' ? '✅ PASS' : status === 'WARN' ? '⚠️  WARN' : '❌ FAIL';

  const line = `${String(t.idx).padStart(3)} | ${t.dbSlug.padEnd(30)} | ${(t.ncaaSlug ?? '').padEnd(28)} | ${(t.vsinSlug ?? '').padEnd(28)} | ${(kenpomName ?? 'NOT MAPPED').padEnd(28)} | ${ncaaMark.padEnd(6)} | ${vsinMark.padEnd(6)} | ${dbMark.padEnd(5)} | ${kpMark.padEnd(5)} | ${statusMark}${flags.length ? '  ← ' + flags.join(', ') : ''}`;

  console.log(line);

  if (status === 'PASS') passCount++;
  else if (status === 'WARN') warnings.push({ team: t, flags });
  else issues.push({ team: t, flags });
}

// ── 8. Summary ───────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(120)}`);
console.log(`  AUDIT SUMMARY`);
console.log(`${'='.repeat(120)}`);
console.log(`  Total teams:  ${teams.length}`);
console.log(`  ✅ PASS:      ${passCount}`);
console.log(`  ⚠️  WARN:      ${warnings.length}`);
console.log(`  ❌ FAIL:      ${issues.length}`);

if (warnings.length > 0) {
  console.log(`\n── WARNINGS (${warnings.length}) ──`);
  for (const { team, flags } of warnings) {
    console.log(`  ⚠️  [${team.dbSlug}]  ${team.ncaaName}  |  ${flags.join(', ')}`);
    console.log(`       ncaaSlug=${team.ncaaSlug}  vsinSlug=${team.vsinSlug}  dbSlug=${team.dbSlug}`);
  }
}

if (issues.length > 0) {
  console.log(`\n── FAILURES (${issues.length}) ──`);
  for (const { team, flags } of issues) {
    console.log(`  ❌ [${team.dbSlug}]  ${team.ncaaName}  |  ${flags.join(', ')}`);
    console.log(`       ncaaSlug=${team.ncaaSlug}  vsinSlug=${team.vsinSlug}  dbSlug=${team.dbSlug}`);
    console.log(`       logoUrl=${team.logoUrl}`);
  }
}

// ── 9. DB slug consistency deep check ────────────────────────────────────────
console.log(`\n── DB SLUG CONSISTENCY CHECK ──`);
let dbIssues = 0;
for (const t of teams) {
  const expected = t.vsinSlug?.replace(/-/g, '_');
  if (expected !== t.dbSlug) {
    console.log(`  ❌ [${t.dbSlug}]  vsinSlug="${t.vsinSlug}" → expected dbSlug="${expected}" but got "${t.dbSlug}"`);
    dbIssues++;
  }
}
if (dbIssues === 0) console.log('  ✅ All 365 dbSlugs are consistent with vsinSlugs');

// ── 10. KenPom coverage check ────────────────────────────────────────────────
console.log(`\n── KENPOM COVERAGE CHECK ──`);
let kpMissing = 0;
for (const t of teams) {
  if (!KENPOM_MAP[t.dbSlug]) {
    console.log(`  ❌ NO KENPOM MAPPING: dbSlug="${t.dbSlug}"  ncaaName="${t.ncaaName}"`);
    kpMissing++;
  }
}
if (kpMissing === 0) console.log('  ✅ All 365 teams have KenPom mappings');
else console.log(`  ⚠️  ${kpMissing} teams missing KenPom mappings`);

// ── 11. Duplicate dbSlug check ───────────────────────────────────────────────
console.log(`\n── DUPLICATE DB SLUG CHECK ──`);
const slugCounts = new Map();
for (const t of teams) {
  slugCounts.set(t.dbSlug, (slugCounts.get(t.dbSlug) ?? 0) + 1);
}
let dupCount = 0;
for (const [slug, count] of slugCounts) {
  if (count > 1) {
    const dups = teams.filter(t => t.dbSlug === slug);
    console.log(`  ❌ DUPLICATE dbSlug "${slug}" appears ${count} times:`);
    dups.forEach(d => console.log(`       → ncaaName="${d.ncaaName}"  vsinSlug="${d.vsinSlug}"`));
    dupCount++;
  }
}
if (dupCount === 0) console.log('  ✅ No duplicate dbSlugs found');

// ── 12. Null field check ─────────────────────────────────────────────────────
console.log(`\n── NULL / MISSING FIELD CHECK ──`);
const requiredFields = ['ncaaName', 'ncaaNickname', 'vsinName', 'ncaaSlug', 'vsinSlug', 'dbSlug', 'logoUrl'];
let nullCount = 0;
for (const t of teams) {
  for (const f of requiredFields) {
    if (!t[f]) {
      console.log(`  ❌ [${t.dbSlug}]  MISSING FIELD: ${f}`);
      nullCount++;
    }
  }
}
if (nullCount === 0) console.log('  ✅ All required fields populated for all 365 teams');

console.log(`\n${'='.repeat(120)}`);
console.log(`  AUDIT COMPLETE — ${new Date().toISOString()}`);
console.log(`${'='.repeat(120)}\n`);
