/**
 * NCAAM team slug → ESPN team ID map.
 * Used to build ESPN CDN logo URLs directly without a DB/API call.
 * Logo URL: https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/{id}.png&scale=crop&cquality=40&location=origin&w=80&h=80
 *
 * IDs sourced from ESPN public API (site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams)
 * and validated against the ESPN CDN (all return HTTP 200).
 */

export const NCAAM_ESPN_IDS: Record<string, string> = {
  arizona: "12",
  belmont: "2057",
  bradley: "71",
  canisius: "2099",
  charlotte: "2429",
  cleveland_state: "325",
  college_of_charleston: "232",
  davidson: "2166",
  depaul: "305",
  drake: "2181",
  duke: "150",
  east_carolina: "151",
  eastern_washington: "331",
  evansville: "339",
  fairfield: "2217",
  florida_atlantic: "2226",
  idaho: "70",
  idaho_state: "304",
  illinois_chicago: "82",
  illinois_state: "2287",
  indiana: "84",
  indiana_state: "282",
  iona: "314",
  iowa_state: "66",
  iupui: "2870",
  la_salle: "2325",
  manhattan: "2363",
  marist: "2368",
  marquette: "269",
  maryland: "120",
  memphis: "235",
  merrimack: "2771",
  michigan_state: "127",
  montana: "149",
  montana_state: "147",
  mount_st_marys: "116",
  murray_state: "93",
  nc_state: "152",
  nc_wilmington: "350",
  niagara: "315",
  north_texas: "249",
  northern_arizona: "2464",
  northern_colorado: "2458",
  northern_iowa: "2460",
  ohio_state: "194",
  portland_state: "2502",
  purdue: "2509",
  quinnipiac: "2514",
  rice: "242",
  rider: "2520",
  rutgers: "164",
  sacramento_state: "16",
  saint_peters: "2612",
  siena: "2561",
  south_florida: "58",
  southern_illinois: "79",
  temple: "218",
  tulane: "2655",
  uab: "5",
  utsa: "2636",
  weber_state: "2692",
  wichita_state: "2724",
};

/**
 * Build an ESPN CDN logo URL for a given team slug.
 * Returns null if the team is not in the map.
 */
export function getEspnLogoUrl(slug: string, size = 80): string | null {
  const id = NCAAM_ESPN_IDS[slug];
  if (!id) return null;
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/${id}.png&scale=crop&cquality=40&location=origin&w=${size}&h=${size}`;
}
