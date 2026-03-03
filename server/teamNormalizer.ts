/**
 * teamNormalizer.ts
 *
 * Converts team display names (as they appear in Google Sheets) to
 * canonical snake_case slugs used throughout the app.
 *
 * e.g. "Tennessee" → "tennessee"
 *      "South Carolina" → "south_carolina"
 *      "St. John's" → "st_johns"
 *      "NC Wilmington" → "nc_wilmington"
 */

// Map from display name (lowercase, trimmed) → canonical slug
const NAME_TO_SLUG: Record<string, string> = {
  // A
  "air force": "air_force",
  "akron": "akron",
  "alabama": "alabama",
  "alabama a&m": "alabama_am",
  "alabama state": "alabama_state",
  "appalachian state": "appalachian_state",
  "arizona": "arizona",
  "arizona state": "arizona_state",
  "arkansas": "arkansas",
  "arkansas pine bluff": "arkansas_pine_bluff",
  "arkansas state": "arkansas_state",
  "army": "army",
  "auburn": "auburn",
  "austin peay": "austin_peay",

  // B
  "ball state": "ball_state",
  "belmont": "belmont",
  "bethune-cookman": "bethune_cookman",
  "boise state": "boise_state",
  "boston college": "boston_college",
  "boston university": "boston_university",
  "bowling green": "bowling_green",
  "bradley": "bradley",
  "brown": "brown",
  "bucknell": "bucknell",
  "buffalo": "buffalo",
  "butler": "butler",
  "byu": "byu",

  // C
  "cal poly": "cal_poly",
  "cal state bakersfield": "cal_state_bakersfield",
  "cal state fullerton": "cal_state_fullerton",
  "cal state northridge": "cal_state_northridge",
  "campbell": "campbell",
  "canisius": "canisius",
  "central arkansas": "central_arkansas",
  "central connecticut": "central_connecticut",
  "central florida": "central_florida",
  "ucf": "central_florida",
  "central michigan": "central_michigan",
  "charleston": "charleston",
  "charlotte": "charlotte",
  "chicago state": "chicago_state",
  "cincinnati": "cincinnati",
  "citadel": "citadel",
  "clemson": "clemson",
  "cleveland state": "cleveland_state",
  "coastal carolina": "coastal_carolina",
  "colgate": "colgate",
  "colorado": "colorado",
  "colorado state": "colorado_state",
  "columbia": "columbia",
  "connecticut": "connecticut",
  "uconn": "connecticut",
  "coppin state": "coppin_state",
  "cornell": "cornell",
  "creighton": "creighton",

  // D
  "dartmouth": "dartmouth",
  "davidson": "davidson",
  "dayton": "dayton",
  "depaul": "depaul",
  "delaware": "delaware",
  "delaware state": "delaware_state",
  "denver": "denver",
  "drake": "drake",
  "drexel": "drexel",
  "duke": "duke",
  "duquesne": "duquesne",

  // E
  "east carolina": "east_carolina",
  "east tennessee state": "east_tennessee_state",
  "eastern illinois": "eastern_illinois",
  "eastern kentucky": "eastern_kentucky",
  "eastern michigan": "eastern_michigan",
  "eastern washington": "eastern_washington",
  "ewu": "eastern_washington",
  "elon": "elon",
  "elon university": "elon",
  "evansville": "evansville",

  // F
  "fairfield": "fairfield",
  "fairleigh dickinson": "fairleigh_dickinson",
  "fdu": "fairleigh_dickinson",
  "florida": "florida",
  "florida a&m": "florida_am",
  "florida atlantic": "florida_atlantic",
  "florida gulf coast": "florida_gulf_coast",
  "fgcu": "florida_gulf_coast",
  "florida international": "florida_international",
  "fiu": "florida_international",
  "florida state": "florida_state",
  "fordham": "fordham",
  "fresno state": "fresno_state",
  "furman": "furman",

  // G
  "gardner-webb": "gardner_webb",
  "george mason": "george_mason",
  "george washington": "george_washington",
  "georgetown": "georgetown",
  "georgia": "georgia",
  "georgia southern": "georgia_southern",
  "georgia state": "georgia_state",
  "georgia tech": "georgia_tech",
  "gonzaga": "gonzaga",
  "grambling": "grambling",
  "grand canyon": "grand_canyon",
  "gcu": "grand_canyon",

  // H
  "hampton": "hampton",
  "harvard": "harvard",
  "hawaii": "hawaii",
  "high point": "high_point",
  "hofstra": "hofstra",
  "holy cross": "holy_cross",
  "houston": "houston",
  "houston baptist": "houston_baptist",
  "hbu": "houston_baptist",

  // I
  "idaho": "idaho",
  "idaho state": "idaho_state",
  "illinois": "illinois",
  "illinois state": "illinois_state",
  "uic": "illinois_chicago",
  "illinois-chicago": "illinois_chicago",
  "illinois chicago": "illinois_chicago",
  "incarnate word": "incarnate_word",
  "indiana": "indiana",
  "indiana state": "indiana_state",
  "iona": "iona",
  "iowa": "iowa",
  "iowa state": "iowa_state",
  "iupui": "iupui",

  // J
  "jackson state": "jackson_state",
  "jacksonville": "jacksonville",
  "jacksonville state": "jacksonville_state",
  "james madison": "james_madison",

  // K
  "kansas": "kansas",
  "kansas state": "kansas_state",
  "kent state": "kent_state",
  "kentucky": "kentucky",

  // L
  "la salle": "la_salle",
  "lafayette": "lafayette",
  "lamar": "lamar",
  "lehigh": "lehigh",
  "liberty": "liberty",
  "lipscomb": "lipscomb",
  "long beach state": "long_beach_state",
  "long island": "long_island",
  "longwood": "longwood",
  "louisiana": "louisiana",
  "ul lafayette": "louisiana",
  "louisiana lafayette": "louisiana",
  "louisiana monroe": "louisiana_monroe",
  "ul monroe": "louisiana_monroe",
  "louisiana tech": "louisiana_tech",
  "louisville": "louisville",
  "loyola chicago": "loyola_chicago",
  "loyola maryland": "loyola_maryland",
  "loyola marymount": "loyola_marymount",
  "lmu": "loyola_marymount",
  "lsu": "lsu",

  // M
  "maine": "maine",
  "manhattan": "manhattan",
  "marist": "marist",
  "marquette": "marquette",
  "marshall": "marshall",
  "maryland": "maryland",
  "massachusetts": "massachusetts",
  "umass": "massachusetts",
  "mcneese": "mcneese",
  "mcneese state": "mcneese",
  "memphis": "memphis",
  "merrimack": "merrimack",
  "miami": "miami",
  "miami fl": "miami",
  "miami ohio": "miami_ohio",
  "miami (oh)": "miami_ohio",
  "michigan": "michigan",
  "michigan state": "michigan_state",
  "middle tennessee": "middle_tennessee",
  "minnesota": "minnesota",
  "mississippi": "mississippi",
  "ole miss": "mississippi",
  "mississippi state": "mississippi_state",
  "mississippi valley state": "mississippi_valley_state",
  "missouri": "missouri",
  "monmouth": "monmouth",
  "montana": "montana",
  "montana state": "montana_state",
  "morehead state": "morehead_state",
  "morgan state": "morgan_state",
  "mount st. mary's": "mount_st_marys",
  "mount st marys": "mount_st_marys",
  "murray state": "murray_state",

  // N
  "navy": "navy",
  "nc state": "nc_state",
  "north carolina state": "nc_state",
  "nc wilmington": "nc_wilmington",
  "unc wilmington": "nc_wilmington",
  "nebraska": "nebraska",
  "nevada": "nevada",
  "new mexico": "new_mexico",
  "new mexico state": "new_mexico_state",
  "niagara": "niagara",
  "nicholls": "nicholls",
  "nicholls state": "nicholls",
  "njit": "njit",
  "norfolk state": "norfolk_state",
  "north carolina": "north_carolina",
  "unc": "north_carolina",
  "north carolina a&t": "north_carolina_at",
  "north carolina at": "north_carolina_at",
  "north carolina central": "north_carolina_central",
  "north dakota": "north_dakota",
  "north dakota state": "north_dakota_state",
  "north florida": "north_florida",
  "north texas": "north_texas",
  "northeastern": "northeastern",
  "northern arizona": "northern_arizona",
  "nau": "northern_arizona",
  "northern colorado": "northern_colorado",
  "northern illinois": "northern_illinois",
  "northern iowa": "northern_iowa",
  "northern kentucky": "northern_kentucky",
  "northwestern": "northwestern",
  "northwestern state": "northwestern_state",
  "notre dame": "notre_dame",

  // O
  "ohio": "ohio",
  "ohio state": "ohio_state",
  "oklahoma": "oklahoma",
  "oklahoma state": "oklahoma_state",
  "old dominion": "old_dominion",
  "oral roberts": "oral_roberts",
  "oregon": "oregon",
  "oregon state": "oregon_state",

  // P
  "penn": "penn",
  "penn state": "penn_state",
  "pepperdine": "pepperdine",
  "pittsburgh": "pittsburgh",
  "pitt": "pittsburgh",
  "portland": "portland",
  "portland state": "portland_state",
  "prairie view a&m": "prairie_view_am",
  "presbyterian": "presbyterian",
  "princeton": "princeton",
  "providence": "providence",
  "purdue": "purdue",
  "purdue fort wayne": "purdue_fort_wayne",

  // Q
  "quinnipiac": "quinnipiac",

  // R
  "radford": "radford",
  "rhode island": "rhode_island",
  "rice": "rice",
  "richmond": "richmond",
  "rider": "rider",
  "robert morris": "robert_morris",
  "rutgers": "rutgers",

  // S
  "sacramento state": "sacramento_state",
  "sac state": "sacramento_state",
  "saint joseph's": "saint_josephs",
  "saint louis": "saint_louis",
  "saint mary's": "saint_marys",
  "saint peter's": "saint_peters",
  "saint peters": "saint_peters",
  "sam houston": "sam_houston",
  "sam houston state": "sam_houston",
  "samford": "samford",
  "san diego": "san_diego",
  "san diego state": "san_diego_state",
  "sdsu": "san_diego_state",
  "san francisco": "san_francisco",
  "san jose state": "san_jose_state",
  "santa barbara": "santa_barbara",
  "ucsb": "santa_barbara",
  "seattle": "seattle",
  "seton hall": "seton_hall",
  "siena": "siena",
  "smu": "smu",
  "south alabama": "south_alabama",
  "south carolina": "south_carolina",
  "south carolina state": "south_carolina_state",
  "south dakota": "south_dakota",
  "south dakota state": "south_dakota_state",
  "south florida": "south_florida",
  "usf": "south_florida",
  "southeast missouri state": "southeast_missouri_state",
  "southeastern louisiana": "southeastern_louisiana",
  "southern": "southern",
  "southern illinois": "southern_illinois",
  "southern miss": "southern_miss",
  "southern mississippi": "southern_miss",
  "southern utah": "southern_utah",
  "st. bonaventure": "st_bonaventure",
  "st bonaventure": "st_bonaventure",
  "st. francis": "st_francis",
  "st. john's": "st_johns",
  "st. johns": "st_johns",
  "st johns": "st_johns",
  "st. joseph's": "saint_josephs",
  "st. louis": "saint_louis",
  "st. mary's": "saint_marys",
  "st. peter's": "saint_peters",
  "stanford": "stanford",
  "stephen f. austin": "stephen_f_austin",
  "sfa": "stephen_f_austin",
  "stetson": "stetson",
  "stony brook": "stony_brook",
  "syracuse": "syracuse",

  // T
  "tcu": "tcu",
  "temple": "temple",
  "tennessee": "tennessee",
  "tennessee state": "tennessee_state",
  "tennessee tech": "tennessee_tech",
  "texas": "texas",
  "texas a&m": "texas_am",
  "texas am": "texas_am",
  "texas a&m corpus christi": "texas_am_corpus_christi",
  "texas southern": "texas_southern",
  "texas state": "texas_state",
  "texas tech": "texas_tech",
  "toledo": "toledo",
  "towson": "towson",
  "troy": "troy",
  "tulane": "tulane",
  "tulsa": "tulsa",

  // U
  "uab": "uab",
  "uc davis": "uc_davis",
  "uc irvine": "uc_irvine",
  "uc riverside": "uc_riverside",
  "uc san diego": "uc_san_diego",
  "ucsd": "uc_san_diego",
  "ucla": "ucla",
  "umbc": "umbc",
  "unc asheville": "unc_asheville",
  "unc greensboro": "unc_greensboro",
  "unlv": "unlv",
  "utah": "utah",
  "utah state": "utah_state",
  "utah tech": "utah_tech",
  "utsa": "utsa",
  "utep": "utep",

  // V
  "valparaiso": "valparaiso",
  "vanderbilt": "vanderbilt",
  "vcu": "vcu",
  "vermont": "vermont",
  "villanova": "villanova",
  "virginia": "virginia",
  "virginia tech": "virginia_tech",

  // W
  "wagner": "wagner",
  "wake forest": "wake_forest",
  "washington": "washington",
  "washington state": "washington_state",
  "weber state": "weber_state",
  "west virginia": "west_virginia",
  "western carolina": "western_carolina",
  "western illinois": "western_illinois",
  "western kentucky": "western_kentucky",
  "western michigan": "western_michigan",
  "wichita state": "wichita_state",
  "william & mary": "william_and_mary",
  "william and mary": "william_and_mary",
  "winthrop": "winthrop",
  "wisconsin": "wisconsin",
  "wofford": "wofford",
  "wright state": "wright_state",
  "wyoming": "wyoming",

  // X-Y-Z
  "xavier": "xavier",
  "yale": "yale",
  "youngstown state": "youngstown_state",
};

/**
 * Normalize a team name to a canonical slug.
 * Handles both display names ("Tennessee") and existing slugs ("tennessee").
 *
 * Strategy:
 * 1. If it's already a snake_case slug (no spaces, lowercase), return as-is.
 * 2. Look up the display name in the map (case-insensitive).
 * 3. Fall back to auto-slugifying: lowercase, replace spaces/special chars with _.
 */
export function normalizeTeamSlug(raw: string): string {
  if (!raw) return raw;

  const trimmed = raw.trim();

  // Already a snake_case slug (no spaces, all lowercase/digits/underscores)
  if (/^[a-z0-9_]+$/.test(trimmed)) return trimmed;

  // Look up in the map
  const key = trimmed.toLowerCase();
  if (NAME_TO_SLUG[key]) return NAME_TO_SLUG[key];

  // Auto-slugify: lowercase, replace non-alphanumeric with _, collapse multiple _
  return trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
