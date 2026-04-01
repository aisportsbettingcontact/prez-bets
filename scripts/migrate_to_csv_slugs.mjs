/**
 * migrate_to_csv_slugs.mjs
 * 
 * Uses the CSV (pasted_content_2.txt) as the SINGLE SOURCE OF TRUTH.
 * 
 * Steps:
 * 1. Parse the CSV to get all 365 teams with their vsinSlug → dbSlug mapping
 * 2. Build a comprehensive "old slug → new dbSlug" map covering all known legacy variants
 * 3. Update all game rows in the DB to use the canonical dbSlug
 * 4. Delete all games where either team is not in the 365-team registry
 * 5. Report results
 * 
 * Run: node scripts/migrate_to_csv_slugs.mjs
 */
import { readFileSync } from "fs";
import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

// ─── 1. Parse CSV ────────────────────────────────────────────────────────────
const csvLines = readFileSync("/home/ubuntu/upload/pasted_content_2.txt", "utf8")
  .trim().split("\n").slice(1); // skip header

const teams = csvLines.map(line => {
  const cols = line.split("\t");
  return {
    conference: cols[0]?.trim(),
    ncaaName:   cols[1]?.trim(),
    nickname:   cols[2]?.trim(),
    vsinName:   cols[3]?.trim(),
    ncaaSlug:   cols[4]?.trim().toLowerCase(),
    vsinSlug:   cols[5]?.trim().toLowerCase(),
    logoUrl:    cols[6]?.trim(),
  };
});

// Canonical dbSlug = vsinSlug with hyphens → underscores
teams.forEach(t => { t.dbSlug = t.vsinSlug.replace(/-/g, "_"); });

console.log(`Parsed ${teams.length} teams from CSV`);

// ─── 2. Build old-slug → canonical-dbSlug map ────────────────────────────────
// This covers all the legacy variants that were stored in the DB by the old pipeline
const slugMap = new Map(); // oldDbSlug → newDbSlug

for (const t of teams) {
  const canonical = t.dbSlug;
  
  // The canonical slug maps to itself
  slugMap.set(canonical, canonical);
  
  // NCAA slug (hyphens → underscores) variant
  const ncaaUnder = t.ncaaSlug.replace(/-/g, "_");
  slugMap.set(ncaaUnder, canonical);
  
  // VSiN slug (hyphens → underscores) is the same as dbSlug, already covered
  
  // Common legacy variants:
  // _st → _state and vice versa
  if (canonical.endsWith("_st")) {
    slugMap.set(canonical.replace(/_st$/, "_state"), canonical);
    slugMap.set(canonical.replace(/_st$/, "_st."), canonical);
  }
  if (canonical.endsWith("_state")) {
    slugMap.set(canonical.replace(/_state$/, "_st"), canonical);
  }
}

// Manual overrides for known legacy DB slugs that don't follow the pattern
const MANUAL_OVERRIDES = {
  // Big Ten
  "michigan_state":    "michigan_st",
  "ohio_state":        "ohio_st",
  "penn_state":        "penn_st",
  "iowa_state":        "iowa_st",
  "michigan_st":       "michigan_st",
  // ACC
  "florida_state":     "florida_st",
  "nc_state":          "nc_state",
  // Big 12
  "kansas_state":      "kansas_st",
  "oklahoma_state":    "oklahoma_st",
  "west_virginia":     "west_virginia",
  "byu":               "byu",
  "arizona_state":     "arizona_st",
  "colorado_state":    "colorado_st",
  "iowa_state":        "iowa_st",
  "boise_state":       "boise_st",
  "utah_state":        "utah_st",
  // Mountain West
  "fresno_state":      "fresno_st",
  "san_diego_state":   "san_diego_st",
  "new_mexico_state":  "new_mexico_st",
  // WAC / others
  "sam_houston_state": "sam_houston_st",
  "tarleton_state":    "tarleton_st",
  "kennesaw_state":    "kennesaw_st",
  "jacksonville_state":"jacksonville_st",
  "indiana_state":     "indiana_st",
  "illinois_state":    "illinois_st",
  "north_dakota_state":"n_dakota_st",
  "south_dakota_state":"s_dakota_st",
  "south_carolina_state": "s_carolina_st",
  "southeast_missouri_state": "se_missouri_st",
  "northwest_state":   "nw_state",
  "northwestern_state":"nw_state",
  "nicholls_state":    "nicholls_st",
  "morgan_state":      "morgan_st",
  "norfolk_state":     "norfolk_st",
  "coppin_state":      "coppin_st",
  "humboldt_state":    "cal_poly_humboldt",
  "long_beach_state":  "long_beach_st",
  "portland_state":    "portland_st",
  "montana_state":     "montana_st",
  "idaho_state":       "idaho_st",
  "weber_state":       "weber_st",
  "sacramento_state":  "sacramento_st",
  "northern_arizona":  "n_arizona",
  "northern_colorado": "n_colorado",
  "eastern_washington":"e_washington",
  "eastern_kentucky":  "e_kentucky",
  "eastern_illinois":  "e_illinois",
  "eastern_michigan":  "e_michigan",
  "western_kentucky":  "w_kentucky",
  "western_michigan":  "w_michigan",
  "western_carolina":  "w_carolina",
  "central_michigan":  "c_michigan",
  "central_connecticut_state": "c_connecticut",
  "south_florida":     "s_florida",
  "south_carolina":    "south_carolina",
  "southern_illinois": "s_illinois",
  "southern_utah":     "s_utah",
  "southern_indiana":  "s_indiana",
  "southern_miss":     "southern_miss",
  "virginia_commonwealth": "vcu",
  "va_commonwealth":   "vcu",
  "central_florida":   "ucf",
  "c_florida":         "ucf",
  "uconn":             "connecticut",
  "nebraska_omaha":    "neb_omaha",
  "illinois_chicago":  "ill_chicago",
  "the_citadel":       "citadel",
  "n_illinois":        "n_illinois",
  "n_carolina_a_and_t": "n_carolina_a_t",
  "texas_el_paso":     "utep",
  "florida_intl":      "fiu",
  "st_thomas_mn_":     "st_thomas_mn",
  "abilene_chr":        "abilene_christian",
  "abilene_christian": "abilene_christian",
  "am_corpus_chris":   "tx_a_m_corpus_christi",
  "texas_arlington":   "ut_arlington",
  "utsa":              "ut_san_antonio",
  "col_of_charleston": "charleston",
  "st_marys_ca":       "saint_marys_ca",
  "st_johns":          "st_johns_ny",
  "pennsylvania":      "pennsylvania",
  "albany_ny":         "albany",
  "umass_lowell":      "umass_lowell",
  "boston_university": "boston_u",
  "cal_st_fullerton":  "cal_st_fullerton",
  "cal_st_northridge": "cal_st_northridge",
  "bakersfield":       "csu_bakersfield",
  "northern_ariz":     "n_arizona",
  "n_dakota":          "north_dakota",
  "s_dakota":          "south_dakota",
  "e_kentucky":        "e_kentucky",
  "e_michigan":        "e_michigan",
  "w_kentucky":        "w_kentucky",
  "w_michigan":        "w_michigan",
  "w_carolina":        "w_carolina",
  "c_michigan":        "c_michigan",
  "s_illinois":        "s_illinois",
  "s_utah":            "s_utah",
  "s_florida":         "s_florida",
  "s_indiana":         "s_indiana",
  "n_illinois":        "n_illinois",
  "n_arizona":         "n_arizona",
  "n_colorado":        "n_colorado",
  "e_washington":      "e_washington",
  "e_illinois":        "e_illinois",
  "n_carolina_a_t":    "n_carolina_a_t",
  "fla_atlantic":      "fla_atlantic",
  "wichita_state":     "wichita_st",
  "kent":              "kent_st",
  "coastal_caro":      "coastal_carolina",
  "william_mary":      "william_mary",
  "col_charleston":    "charleston",
  "east_tenn_st":      "e_tenn_st",
  "appalachian_st":    "app_state",
  "mcneese":           "mcneese_st",
  "unc_pembroke":      "unc_pembroke",
  "unc_wilmington":    "unc_wilmington",
};

// Apply manual overrides to the map
for (const [oldSlug, newSlug] of Object.entries(MANUAL_OVERRIDES)) {
  // Only add if newSlug is a valid canonical dbSlug
  const validTeam = teams.find(t => t.dbSlug === newSlug);
  if (validTeam) {
    slugMap.set(oldSlug, newSlug);
  } else {
    console.warn(`⚠ Manual override ${oldSlug} → ${newSlug}: target not in registry`);
  }
}

// Build the set of valid canonical dbSlugs
const validDbSlugs = new Set(teams.map(t => t.dbSlug));

console.log(`Built slug map with ${slugMap.size} entries`);
console.log(`Valid canonical dbSlugs: ${validDbSlugs.size}`);

// ─── 3. Connect to DB and run migration ──────────────────────────────────────
const db = await createConnection(process.env.DATABASE_URL);

try {
  // Get all distinct team slugs currently in the DB
  const [slugRows] = await db.execute(
    "SELECT DISTINCT awayTeam as slug FROM games UNION SELECT DISTINCT homeTeam as slug FROM games"
  );
  const allDbSlugs = slugRows.map(r => r.slug);
  
  console.log(`\n=== DB Slug Audit ===`);
  console.log(`Distinct team slugs in DB: ${allDbSlugs.length}`);
  
  const alreadyCanonical = allDbSlugs.filter(s => validDbSlugs.has(s));
  const needsMigration = allDbSlugs.filter(s => !validDbSlugs.has(s) && slugMap.has(s));
  const unknown = allDbSlugs.filter(s => !validDbSlugs.has(s) && !slugMap.has(s));
  
  console.log(`  Already canonical: ${alreadyCanonical.length}`);
  console.log(`  Needs migration: ${needsMigration.length}`);
  console.log(`  Unknown (will be purged): ${unknown.length}`);
  if (unknown.length > 0) {
    console.log(`  Unknown slugs: ${unknown.join(", ")}`);
  }
  
  // Step 1: Update slugs that can be migrated
  let totalUpdated = 0;
  for (const oldSlug of needsMigration) {
    const newSlug = slugMap.get(oldSlug);
    const [r1] = await db.execute(
      "UPDATE games SET awayTeam = ? WHERE awayTeam = ?", [newSlug, oldSlug]
    );
    const [r2] = await db.execute(
      "UPDATE games SET homeTeam = ? WHERE homeTeam = ?", [newSlug, oldSlug]
    );
    const count = (r1.affectedRows || 0) + (r2.affectedRows || 0);
    if (count > 0) {
      console.log(`  Migrated: ${oldSlug} → ${newSlug} (${count} rows)`);
      totalUpdated += count;
    }
  }
  console.log(`\nTotal rows updated: ${totalUpdated}`);
  
  // Step 2: Delete games where either team is not in the 365-team registry
  // (includes tba, unknown teams, non-D1 teams)
  const validSlugList = [...validDbSlugs].map(s => `'${s}'`).join(",");
  const [deleteResult] = await db.execute(
    `DELETE FROM games WHERE awayTeam NOT IN (${validSlugList}) OR homeTeam NOT IN (${validSlugList})`
  );
  console.log(`\nPurged ${deleteResult.affectedRows} non-365-team games from DB`);
  
  // Step 3: Final count
  const [countResult] = await db.execute("SELECT COUNT(*) as total FROM games");
  console.log(`Games remaining in DB: ${countResult[0].total}`);
  
  // Step 4: Verify no invalid slugs remain
  const [remaining] = await db.execute(
    "SELECT DISTINCT awayTeam as slug FROM games UNION SELECT DISTINCT homeTeam as slug FROM games"
  );
  const invalidRemaining = remaining.filter(r => !validDbSlugs.has(r.slug));
  if (invalidRemaining.length === 0) {
    console.log(`✓ All remaining games use valid 365-team slugs`);
  } else {
    console.error(`✗ Still invalid: ${invalidRemaining.map(r => r.slug).join(", ")}`);
  }
  
} finally {
  await db.end();
}

console.log(`\n=== Migration Complete ===\n`);
