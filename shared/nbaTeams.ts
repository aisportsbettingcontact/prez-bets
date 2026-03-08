/**
 * NBA Team Registry — 30 NBA teams
 * Generated from NBAMapping-MASTERSHEET.csv — this is the authoritative source.
 * DO NOT edit manually — regenerate from NBAMapping-MASTERSHEET.csv
 *
 * Key fields:
 *   nbaSlug   — NBA.com team slug (short form, e.g. "celtics")
 *   vsinSlug  — VSiN href slug (hyphen format, e.g. "boston-celtics")
 *   dbSlug    — Database storage key (vsinSlug with hyphens → underscores)
 *   logoUrl   — Official NBA.com SVG logo URL (cdn.nba.com)
 *
 * VSiN href aliases (live page uses shortened forms):
 *   "la-clippers"  → los-angeles-clippers (Los Angeles Clippers)
 *   "la-lakers"    → los-angeles-lakers   (Los Angeles Lakers)
 * These are handled in the NBA VSiN scraper via VSIN_HREF_ALIASES.
 */
export interface NbaTeam {
  conference: string;
  division: string;
  city: string;
  name: string;
  nickname: string;
  vsinName: string;
  nbaSlug: string;
  vsinSlug: string;
  dbSlug: string;
  logoUrl: string;
}

export const NBA_TEAMS: NbaTeam[] = [
  // ── Eastern Conference — Atlantic Division ────────────────────────────────
  {
    conference: "East",
    division: "Atlantic",
    city: "Boston",
    name: "Boston Celtics",
    nickname: "Celtics",
    vsinName: "Boston Celtics",
    nbaSlug: "celtics",
    vsinSlug: "boston-celtics",
    dbSlug: "boston_celtics",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612738/primary/L/logo.svg",
  },
  {
    conference: "East",
    division: "Atlantic",
    city: "Brooklyn",
    name: "Brooklyn Nets",
    nickname: "Nets",
    vsinName: "Brooklyn Nets",
    nbaSlug: "nets",
    vsinSlug: "brooklyn-nets",
    dbSlug: "brooklyn_nets",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612751/primary/L/logo.svg",
  },
  {
    conference: "East",
    division: "Atlantic",
    city: "New York",
    name: "New York Knicks",
    nickname: "Knicks",
    vsinName: "New York Knicks",
    nbaSlug: "knicks",
    vsinSlug: "new-york-knicks",
    dbSlug: "new_york_knicks",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612752/primary/L/logo.svg",
  },
  {
    conference: "East",
    division: "Atlantic",
    city: "Philadelphia",
    name: "Philadelphia 76ers",
    nickname: "76ers",
    vsinName: "Philadelphia 76ers",
    nbaSlug: "sixers",
    vsinSlug: "philadelphia-76ers",
    dbSlug: "philadelphia_76ers",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612755/primary/L/logo.svg",
  },
  {
    conference: "East",
    division: "Atlantic",
    city: "Toronto",
    name: "Toronto Raptors",
    nickname: "Raptors",
    vsinName: "Toronto Raptors",
    nbaSlug: "raptors",
    vsinSlug: "toronto-raptors",
    dbSlug: "toronto_raptors",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612761/primary/L/logo.svg",
  },
  // ── Eastern Conference — Central Division ────────────────────────────────
  {
    conference: "East",
    division: "Central",
    city: "Chicago",
    name: "Chicago Bulls",
    nickname: "Bulls",
    vsinName: "Chicago Bulls",
    nbaSlug: "bulls",
    vsinSlug: "chicago-bulls",
    dbSlug: "chicago_bulls",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612741/primary/L/logo.svg",
  },
  {
    conference: "East",
    division: "Central",
    city: "Cleveland",
    name: "Cleveland Cavaliers",
    nickname: "Cavaliers",
    vsinName: "Cleveland Cavaliers",
    nbaSlug: "cavaliers",
    vsinSlug: "cleveland-cavaliers",
    dbSlug: "cleveland_cavaliers",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612739/primary/L/logo.svg",
  },
  {
    conference: "East",
    division: "Central",
    city: "Detroit",
    name: "Detroit Pistons",
    nickname: "Pistons",
    vsinName: "Detroit Pistons",
    nbaSlug: "pistons",
    vsinSlug: "detroit-pistons",
    dbSlug: "detroit_pistons",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612765/primary/L/logo.svg",
  },
  {
    conference: "East",
    division: "Central",
    city: "Indiana",
    name: "Indiana Pacers",
    nickname: "Pacers",
    vsinName: "Indiana Pacers",
    nbaSlug: "pacers",
    vsinSlug: "indiana-pacers",
    dbSlug: "indiana_pacers",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612754/primary/L/logo.svg",
  },
  {
    conference: "East",
    division: "Central",
    city: "Milwaukee",
    name: "Milwaukee Bucks",
    nickname: "Bucks",
    vsinName: "Milwaukee Bucks",
    nbaSlug: "bucks",
    vsinSlug: "milwaukee-bucks",
    dbSlug: "milwaukee_bucks",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612749/primary/L/logo.svg",
  },
  // ── Eastern Conference — Southeast Division ───────────────────────────────
  {
    conference: "East",
    division: "Southeast",
    city: "Atlanta",
    name: "Atlanta Hawks",
    nickname: "Hawks",
    vsinName: "Atlanta Hawks",
    nbaSlug: "hawks",
    vsinSlug: "atlanta-hawks",
    dbSlug: "atlanta_hawks",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612737/primary/L/logo.svg",
  },
  {
    conference: "East",
    division: "Southeast",
    city: "Charlotte",
    name: "Charlotte Hornets",
    nickname: "Hornets",
    vsinName: "Charlotte Hornets",
    nbaSlug: "hornets",
    vsinSlug: "charlotte-hornets",
    dbSlug: "charlotte_hornets",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612766/primary/L/logo.svg",
  },
  {
    conference: "East",
    division: "Southeast",
    city: "Miami",
    name: "Miami Heat",
    nickname: "Heat",
    vsinName: "Miami Heat",
    nbaSlug: "heat",
    vsinSlug: "miami-heat",
    dbSlug: "miami_heat",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612748/primary/L/logo.svg",
  },
  {
    conference: "East",
    division: "Southeast",
    city: "Orlando",
    name: "Orlando Magic",
    nickname: "Magic",
    vsinName: "Orlando Magic",
    nbaSlug: "magic",
    vsinSlug: "orlando-magic",
    dbSlug: "orlando_magic",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612753/primary/L/logo.svg",
  },
  {
    conference: "East",
    division: "Southeast",
    city: "Washington",
    name: "Washington Wizards",
    nickname: "Wizards",
    vsinName: "Washington Wizards",
    nbaSlug: "wizards",
    vsinSlug: "washington-wizards",
    dbSlug: "washington_wizards",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612764/primary/L/logo.svg",
  },
  // ── Western Conference — Northwest Division ───────────────────────────────
  {
    conference: "West",
    division: "Northwest",
    city: "Denver",
    name: "Denver Nuggets",
    nickname: "Nuggets",
    vsinName: "Denver Nuggets",
    nbaSlug: "nuggets",
    vsinSlug: "denver-nuggets",
    dbSlug: "denver_nuggets",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612743/primary/L/logo.svg",
  },
  {
    conference: "West",
    division: "Northwest",
    city: "Minnesota",
    name: "Minnesota Timberwolves",
    nickname: "Timberwolves",
    vsinName: "Minnesota Timberwolves",
    nbaSlug: "timberwolves",
    vsinSlug: "minnesota-timberwolves",
    dbSlug: "minnesota_timberwolves",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612750/primary/L/logo.svg",
  },
  {
    conference: "West",
    division: "Northwest",
    city: "Oklahoma City",
    name: "Oklahoma City Thunder",
    nickname: "Thunder",
    vsinName: "Oklahoma City Thunder",
    nbaSlug: "thunder",
    vsinSlug: "oklahoma-city-thunder",
    dbSlug: "oklahoma_city_thunder",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612760/primary/L/logo.svg",
  },
  {
    conference: "West",
    division: "Northwest",
    city: "Portland",
    name: "Portland Trail Blazers",
    nickname: "Trail Blazers",
    vsinName: "Portland Trail Blazers",
    nbaSlug: "trailblazers",
    vsinSlug: "portland-trail-blazers",
    dbSlug: "portland_trail_blazers",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612757/primary/L/logo.svg",
  },
  {
    conference: "West",
    division: "Northwest",
    city: "Utah",
    name: "Utah Jazz",
    nickname: "Jazz",
    vsinName: "Utah Jazz",
    nbaSlug: "jazz",
    vsinSlug: "utah-jazz",
    dbSlug: "utah_jazz",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612762/primary/L/logo.svg",
  },
  // ── Western Conference — Pacific Division ────────────────────────────────
  {
    conference: "West",
    division: "Pacific",
    city: "Golden State",
    name: "Golden State Warriors",
    nickname: "Warriors",
    vsinName: "Golden State Warriors",
    nbaSlug: "warriors",
    vsinSlug: "golden-state-warriors",
    dbSlug: "golden_state_warriors",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612744/primary/L/logo.svg",
  },
  {
    conference: "West",
    division: "Pacific",
    city: "LA",
    name: "Los Angeles Clippers",
    nickname: "Clippers",
    vsinName: "Los Angeles Clippers",
    nbaSlug: "clippers",
    vsinSlug: "los-angeles-clippers",
    dbSlug: "los_angeles_clippers",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612746/primary/L/logo.svg",
  },
  {
    conference: "West",
    division: "Pacific",
    city: "Los Angeles",
    name: "Los Angeles Lakers",
    nickname: "Lakers",
    vsinName: "Los Angeles Lakers",
    nbaSlug: "lakers",
    vsinSlug: "los-angeles-lakers",
    dbSlug: "los_angeles_lakers",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612747/primary/L/logo.svg",
  },
  {
    conference: "West",
    division: "Pacific",
    city: "Phoenix",
    name: "Phoenix Suns",
    nickname: "Suns",
    vsinName: "Phoenix Suns",
    nbaSlug: "suns",
    vsinSlug: "phoenix-suns",
    dbSlug: "phoenix_suns",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612756/primary/L/logo.svg",
  },
  {
    conference: "West",
    division: "Pacific",
    city: "Sacramento",
    name: "Sacramento Kings",
    nickname: "Kings",
    vsinName: "Sacramento Kings",
    nbaSlug: "kings",
    vsinSlug: "sacramento-kings",
    dbSlug: "sacramento_kings",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612758/primary/L/logo.svg",
  },
  // ── Western Conference — Southwest Division ───────────────────────────────
  {
    conference: "West",
    division: "Southwest",
    city: "Dallas",
    name: "Dallas Mavericks",
    nickname: "Mavericks",
    vsinName: "Dallas Mavericks",
    nbaSlug: "mavericks",
    vsinSlug: "dallas-mavericks",
    dbSlug: "dallas_mavericks",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612742/primary/L/logo.svg",
  },
  {
    conference: "West",
    division: "Southwest",
    city: "Houston",
    name: "Houston Rockets",
    nickname: "Rockets",
    vsinName: "Houston Rockets",
    nbaSlug: "rockets",
    vsinSlug: "houston-rockets",
    dbSlug: "houston_rockets",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612745/primary/L/logo.svg",
  },
  {
    conference: "West",
    division: "Southwest",
    city: "Memphis",
    name: "Memphis Grizzlies",
    nickname: "Grizzlies",
    vsinName: "Memphis Grizzlies",
    nbaSlug: "grizzlies",
    vsinSlug: "memphis-grizzlies",
    dbSlug: "memphis_grizzlies",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612763/primary/L/logo.svg",
  },
  {
    conference: "West",
    division: "Southwest",
    city: "New Orleans",
    name: "New Orleans Pelicans",
    nickname: "Pelicans",
    vsinName: "New Orleans Pelicans",
    nbaSlug: "pelicans",
    vsinSlug: "new-orleans-pelicans",
    dbSlug: "new_orleans_pelicans",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612740/primary/L/logo.svg",
  },
  {
    conference: "West",
    division: "Southwest",
    city: "San Antonio",
    name: "San Antonio Spurs",
    nickname: "Spurs",
    vsinName: "San Antonio Spurs",
    nbaSlug: "spurs",
    vsinSlug: "san-antonio-spurs",
    dbSlug: "san_antonio_spurs",
    logoUrl: "https://cdn.nba.com/logos/nba/1610612759/primary/L/logo.svg",
  },
];

// ─── Lookup maps ─────────────────────────────────────────────────────────────
/** Lookup by DB slug (vsinSlug with hyphens replaced by underscores) */
export const NBA_BY_DB_SLUG = new Map<string, NbaTeam>(
  NBA_TEAMS.map(t => [t.dbSlug, t])
);
/** Lookup by NBA.com slug (short form, e.g. "celtics") */
export const NBA_BY_NBA_SLUG = new Map<string, NbaTeam>(
  NBA_TEAMS.map(t => [t.nbaSlug, t])
);
/** Lookup by VSiN slug (hyphen format from VSiN) */
export const NBA_BY_VSIN_SLUG = new Map<string, NbaTeam>(
  NBA_TEAMS.map(t => [t.vsinSlug, t])
);
/** Set of all valid DB slugs — used for server-side filtering */
export const NBA_VALID_DB_SLUGS = new Set<string>(NBA_TEAMS.map(t => t.dbSlug));
/** Set of all valid NBA.com slugs — used for NBA scoreboard filtering */
export const NBA_VALID_NBA_SLUGS = new Set<string>(NBA_TEAMS.map(t => t.nbaSlug));
/**
 * Lookup by NBA teamId (numeric, extracted from logo URL).
 * Logo URL format: https://cdn.nba.com/logos/nba/{teamId}/primary/L/logo.svg
 * Used to match live scoreboard API responses (which use teamId) to DB slugs.
 */
export const NBA_BY_TEAM_ID = new Map<number, NbaTeam>(
  NBA_TEAMS.flatMap(t => {
    const m = t.logoUrl.match(/\/logos\/nba\/(\d+)\//); 
    return m ? [[parseInt(m[1], 10), t]] : [];
  })
);

/**
 * VSiN href aliases — the live VSiN page sometimes uses shortened slugs
 * that differ from the canonical vsinSlug in the master sheet.
 * Maps the live href slug → canonical vsinSlug.
 */
export const VSIN_HREF_ALIASES: Record<string, string> = {
  "la-clippers": "los-angeles-clippers",
  "la-lakers": "los-angeles-lakers",
};

// ─── Helper functions ─────────────────────────────────────────────────────────
/** Get team by DB slug (the key stored in the games table) */
export function getNbaTeamByDbSlug(dbSlug: string): NbaTeam | undefined {
  return NBA_BY_DB_SLUG.get(dbSlug);
}
/** Get team by NBA.com slug */
export function getNbaTeamByNbaSlug(nbaSlug: string): NbaTeam | undefined {
  return NBA_BY_NBA_SLUG.get(nbaSlug);
}
/** Get team by VSiN slug (from VSiN href), with alias resolution */
export function getNbaTeamByVsinSlug(vsinSlug: string): NbaTeam | undefined {
  const canonical = VSIN_HREF_ALIASES[vsinSlug] ?? vsinSlug;
  return NBA_BY_VSIN_SLUG.get(canonical);
}
