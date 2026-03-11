/**
 * CORRECTED KENPOM MAP — using actual registry dbSlugs
 * This patches the 68 teams that were NOT_MAPPED in the first audit pass
 * because the KENPOM_MAP was using clean slugs instead of the VSiN-derived
 * abbreviated slugs that the registry actually uses.
 *
 * Run: node kenpom_corrections.mjs 2>&1
 */

import { readFileSync } from 'fs';

// The 68 corrections: actual_registry_dbSlug → KenPom display name
const CORRECTIONS = {
  // VSiN abbreviated → KenPom full name
  'texas_san_antonio':   'UTSA',
  'c_arkansas':          'Central Arkansas',
  'w_georgia':           'West Georgia',
  'fl_gulf_coast':       'Florida Gulf Coast',
  'e_kentucky':          'Eastern Kentucky',
  'n_alabama':           'North Alabama',
  'va_commonwealth':     'VCU',
  'st_josephs':          "Saint Joseph's",
  'e_washington':        'Eastern Washington',
  'n_colorado':          'Northern Colorado',
  'n_arizona':           'Northern Arizona',
  'sc_upstate':          'USC Upstate',
  'csu_northridge':      'CSUN',
  'csu_fullerton':       'Cal St. Fullerton',
  'cal_poly_slo':        'Cal Poly',
  'csu_bakersfield':     'Cal St. Bakersfield',
  'william_and_mary':    'William & Mary',
  'w_kentucky':          'Western Kentucky',
  'middle_tenn_st':      'Middle Tennessee',
  'texas_el_paso':       'UTEP',
  'uw_green_bay':        'Green Bay',
  'detroit':             'Detroit Mercy',
  'ipfw':                'Purdue Fort Wayne',
  'n_kentucky':          'Northern Kentucky',
  'uw_milwaukee':        'Milwaukee',
  'iupui':               'IU Indy',
  'pennsylvania':        'Penn',
  'st_peters':           "Saint Peter's",
  'mt_st_marys':         "Mount St. Mary's",
  'kent':                'Kent St.',
  'c_michigan':          'Central Michigan',
  'w_michigan':          'Western Michigan',
  'e_michigan':          'Eastern Michigan',
  'n_illinois':          'Northern Illinois',
  'nc_central':          'North Carolina Central',
  'md_e_shore':          'Maryland Eastern Shore',
  'n_iowa':              'Northern Iowa',
  'liu_brooklyn':        'LIU',
  'lemoyne':             'Le Moyne',
  'st_francis_pa':       'Saint Francis',
  'se_missouri_st':      'Southeast Missouri',
  'siu_edwardsville':    'SIUE',
  'ark_little_rock':     'Little Rock',
  'e_illinois':          'Eastern Illinois',
  'w_illinois':          'Western Illinois',
  'boston_u':            'Boston University',
  'loyola_maryland':     'Loyola MD',
  'texas_a_and_m':       'Texas A&M',
  'e_tennessee_st':      'East Tennessee St.',
  'texas_a_and_m_cc':    'Texas A&M Corpus Chris',
  'east_texas_a_and_m':  'East Texas A&M',
  'se_louisiana':        'Southeastern Louisiana',
  'n_dakota_st':         'North Dakota St.',
  'st_thomas_mn_':       'St. Thomas',
  'n_dakota':            'North Dakota',
  's_dakota':            'South Dakota',
  's_dakota_st':         'South Dakota St.',
  'umkc':                'Kansas City',
  's_alabama':           'South Alabama',
  'la_monroe':           'Louisiana Monroe',
  'alabama_a_and_m':     'Alabama A&M',
  'ark_pine_bluff':      'Arkansas Pine Bluff',
  'miss_valley_st':      'Mississippi Valley St.',
  'california_baptist':  'Cal Baptist',
  'texas_arlington':     'UT Arlington',
  'abilene_chr':         'Abilene Christian',
  'st_marys':            "Saint Mary's",
  'fl_atlantic':         'Florida Atlantic',
};

// Also the 1 FAIL team: umbc has dbSlug='umbc' but vsinSlug='md-balt-co'
// → dbSlug should be 'md_balt_co' to be consistent with vsinSlug
// This is a registry bug we need to flag separately.

// Parse registry
const registryRaw = readFileSync('./shared/ncaamTeams.ts', 'utf8');
const blocks = registryRaw.split(/\{\s*conference:/g).slice(1);
const teams = blocks.map((block, idx) => {
  const get = (f) => { const m = block.match(new RegExp(f + ':\\s*"([^"]+)"')); return m ? m[1] : null; };
  const t = { idx: idx+1, ncaaName: get('ncaaName'), dbSlug: get('dbSlug'), vsinSlug: get('vsinSlug') };
  return t.ncaaName ? t : null;
}).filter(Boolean);

console.log(`\n${'='.repeat(100)}`);
console.log('  KENPOM CORRECTION VERIFICATION — checking all 68 previously unmapped teams');
console.log(`${'='.repeat(100)}\n`);

let corrected = 0;
let stillMissing = 0;

for (const t of teams) {
  const kenpomName = CORRECTIONS[t.dbSlug];
  if (kenpomName) {
    // Verify the dbSlug exists in registry
    const expectedDbFromVsin = t.vsinSlug?.replace(/-/g, '_');
    const dbConsistent = expectedDbFromVsin === t.dbSlug;
    console.log(`  ✅ CORRECTED: dbSlug="${t.dbSlug.padEnd(30)}" → KenPom="${kenpomName.padEnd(30)}" | ncaaName="${t.ncaaName}" | DB_CONSISTENT=${dbConsistent}`);
    corrected++;
  }
}

// Check for any dbSlugs in registry that have NO kenpom mapping at all
// (neither in original KENPOM_MAP nor in CORRECTIONS)
const ORIGINAL_KENPOM_MAP_KEYS = new Set([
  'duke','michigan','arizona','florida','illinois','houston','iowa_st','purdue','michigan_st',
  'connecticut','gonzaga','nebraska','vanderbilt','louisville','tennessee','texas_tech','alabama',
  'arkansas','kansas','virginia','st_johns','saint_marys','wisconsin','iowa','brigham_young',
  'ohio_st','kentucky','ucla','miami_fl','north_carolina','georgia','villanova','texas','santa_clara',
  'texas_am','utah_st','nc_state','clemson','auburn','saint_louis','indiana','cincinnati','smu',
  'tcu','vcu','oklahoma','san_diego_st','baylor','new_mexico','missouri','seton_hall','south_florida',
  'c_florida','washington','boise_st','virginia_tech','west_virginia','tulsa','stanford',
  'grand_canyon','akron','lsu','arizona_st','colorado','florida_st','northwestern','belmont',
  'mcneese_st','oklahoma_st','northern_iowa','california','minnesota','providence','creighton',
  'wake_forest','nevada','usc','yale','dayton','syracuse','mississippi','butler','george_washington',
  'colorado_st','marquette','georgetown','hofstra','wichita_st','stephen_f_austin','utah_valley',
  'miami_oh','notre_dame','high_point','george_mason','south_carolina','xavier','oregon','wyoming',
  'pittsburgh','mississippi_st','kansas_st','depaul','illinois_st','unlv','illinois_chicago',
  'uc_irvine','davidson','sam_houston_st','st_thomas','unc_wilmington','pacific','cal_baptist',
  'uc_san_diego','north_dakota_st','hawaii','liberty','s_illinois','seattle_u','utrgv',
  'san_francisco','murray_st','saint_josephs','bradley','uab','uc_santa_barbara','utah',
  'florida_atlantic','maryland','rutgers','memphis','fresno_st','montana_st','duquesne',
  'rhode_island','toledo','washington_st','penn_st','wright_st','north_texas','northern_colorado',
  'portland_st','navy','troy','richmond','robert_morris','william_mary','bowling_green',
  'arkansas_st','harvard','central_arkansas','winthrop','towson','kent_st','boston_college',
  'uc_davis','ut_arlington','cornell','valparaiso','st_bonaventure','loyola_marymount','temple',
  'penn','georgia_tech','idaho','eastern_washington','east_tennessee_st','western_kentucky',
  'fordham','cal_st_fullerton','oakland','middle_tennessee','charleston','merrimack','austin_peay',
  'texas_am_corpus_christi','oregon_st','northern_kentucky','csun','monmouth','kennesaw_st',
  'campbell','montana','queens_nc','utah_tech','new_mexico_st','tennessee_st','furman','columbia',
  'mercer','florida_intl','new_orleans','charlotte','appalachian_st','weber_st','drake','siena',
  'portland','lipscomb','umbc','indiana_st','massachusetts','howard','marist','jacksonville_st',
  'marshall','south_alabama','buffalo','louisiana_tech','green_bay','tulane','cal_poly','samford',
  'james_madison','missouri_st','tarleton_st','youngstown_st','liu','quinnipiac','southern_miss',
  'detroit_mercy','south_dakota_st','drexel','tennessee_martin','san_diego','la_salle','rice',
  'ohio','stony_brook','w_carolina','elon','southeast_missouri','vermont','long_beach_st','denver',
  'georgia_southern','san_jose_st','nicholls_st','bethune_cookman','lamar','eastern_michigan',
  'american','charleston_southern','florida_gulf_coast','texas_st','unc_asheville',
  'abilene_christian','coastal_carolina','old_dominion','idaho_st','colgate','princeton','s_utah',
  'boston_university','wofford','east_carolina','saint_peters','siue','radford','iona',
  'uc_riverside','purdue_fort_wayne','nebraska_omaha','pepperdine','fairfield','sacramento_st',
  'incarnate_word','lindenwood','milwaukee','presbyterian','central_michigan','longwood','hampton',
  'western_michigan','dartmouth','southern_u','north_dakota','utep','mount_st_marys','bellarmine',
  'northwestern_st','south_dakota','morehead_st','northeastern','mercyhurst','southeastern_louisiana',
  'east_texas_am','brown','n_carolina_a_and_t','houston_christian','lehigh','ball_st','delaware',
  'loyola_chicago','grambling_st','jacksonville','sacred_heart','eastern_kentucky','le_moyne',
  'unc_greensboro','chattanooga','alabama_am','usc_upstate','stetson','west_georgia','c_conn_st',
  'wagner','evansville','texas_southern','little_rock','georgia_st','oral_roberts',
  'prairie_view_a_and_m','la_lafayette','tennessee_tech','florida_a_and_m','arkansas_pine_bluff',
  'iu_indy','umass_lowell','alabama_st','northern_arizona','norfolk_st','cleveland_st','loyola_md',
  'albany','eastern_illinois','lafayette','cal_st_bakersfield','new_haven','manhattan','holy_cross',
  'bucknell','njit','stonehill','northern_illinois','n_florida','fairleigh_dickinson','army',
  'niagara','s_indiana','utsa','jackson_st','north_alabama','canisius','air_force','chicago_st',
  'the_citadel','alcorn_st','maine','maryland_eastern_shore','new_hampshire','louisiana_monroe',
  'morgan_st','north_carolina_central','saint_francis','bryant','s_carolina_st','rider',
  'kansas_city','binghamton','vmi','gardner_webb','delaware_st','coppin_st','western_illinois',
  'mississippi_valley_st',
]);

const ALL_KENPOM = new Set([...ORIGINAL_KENPOM_MAP_KEYS, ...Object.keys(CORRECTIONS)]);

console.log(`\n── TEAMS STILL WITHOUT KENPOM MAPPING ──`);
let totalMissing = 0;
for (const t of teams) {
  if (!ALL_KENPOM.has(t.dbSlug)) {
    console.log(`  ❌ STILL MISSING: dbSlug="${t.dbSlug}" | ncaaName="${t.ncaaName}" | vsinSlug="${t.vsinSlug}"`);
    totalMissing++;
  }
}
if (totalMissing === 0) {
  console.log('  ✅ ALL 365 teams now have KenPom mappings!');
}

console.log(`\n── SUMMARY ──`);
console.log(`  Corrections applied: ${corrected}`);
console.log(`  Still missing:       ${totalMissing}`);
console.log(`  Total coverage:      ${365 - totalMissing}/365`);

// Special: flag the UMBC dbSlug inconsistency
console.log(`\n── SPECIAL FLAG: UMBC DB SLUG INCONSISTENCY ──`);
const umbc = teams.find(t => t.ncaaName === 'UMBC');
if (umbc) {
  console.log(`  Team: UMBC`);
  console.log(`  Current dbSlug: "${umbc.dbSlug}"`);
  console.log(`  vsinSlug: "${umbc.vsinSlug}"`);
  console.log(`  Expected dbSlug (from vsinSlug): "${umbc.vsinSlug?.replace(/-/g,'_')}"`);
  console.log(`  → dbSlug should be "md_balt_co" to match vsinSlug "md-balt-co"`);
  console.log(`  → OR vsinSlug should be "umbc" to match dbSlug "umbc"`);
  console.log(`  → ACTION REQUIRED: verify which VSiN URL actually works`);
}
