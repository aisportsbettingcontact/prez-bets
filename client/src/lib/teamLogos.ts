/**
 * teamLogos.ts
 *
 * Maps snake_case team names (as they appear in the model CSV/XLSX) to their
 * CDN logo URLs. Files are stored as NCAAM/{teamname}.png — original filenames preserved.
 *
 * Falls back to a colored initial badge if no logo is found.
 */

const CDN = "https://d2xsxph8kpxj0f.cloudfront.net/310519663397752079/MW3FicTy7ae3qrm8dx8Lua/NCAAM";

export const NCAAM_LOGOS: Record<string, string> = {
  arizona:               `${CDN}/arizona.png`,
  belmont:               `${CDN}/belmont.png`,
  bradley:               `${CDN}/bradley.png`,
  canisius:              `${CDN}/canisius.png`,
  charlotte:             `${CDN}/charlotte.png`,
  cleveland_state:       `${CDN}/cleveland_state.png`,
  college_of_charleston: `${CDN}/college_of_charleston.png`,
  davidson:              `${CDN}/davidson.png`,
  depaul:                `${CDN}/depaul.png`,
  drake:                 `${CDN}/drake.png`,
  duke:                  `${CDN}/duke.png`,
  east_carolina:         `${CDN}/east_carolina.png`,
  eastern_washington:    `${CDN}/eastern_washington.png`,
  evansville:            `${CDN}/evansville.png`,
  fairfield:             `${CDN}/fairfield.png`,
  florida_atlantic:      `${CDN}/florida_atlantic.png`,
  idaho:                 `${CDN}/idaho.png`,
  idaho_state:           `${CDN}/idaho_state.png`,
  illinois_chicago:      `${CDN}/illinois_chicago.png`,
  illinois_state:        `${CDN}/illinois_state.png`,
  indiana:               `${CDN}/indiana.png`,
  indiana_state:         `${CDN}/indiana_state.png`,
  iona:                  `${CDN}/iona.png`,
  iowa_state:            `${CDN}/iowa_state.png`,
  iupui:                 `${CDN}/iupui.png`,
  la_salle:              `${CDN}/la_salle.png`,
  manhattan:             `${CDN}/manhattan.png`,
  marist:                `${CDN}/marist.png`,
  marquette:             `${CDN}/marquette.png`,
  maryland:              `${CDN}/maryland.png`,
  memphis:               `${CDN}/memphis.png`,
  merrimack:             `${CDN}/merrimack.png`,
  michigan_state:        `${CDN}/michigan_state.png`,
  montana:               `${CDN}/montana.png`,
  montana_state:         `${CDN}/montana_state.png`,
  mount_st_marys:        `${CDN}/mount_st_marys.png`,
  murray_state:          `${CDN}/murray_state.png`,
  nc_state:              `${CDN}/nc_state.png`,
  nc_wilmington:         `${CDN}/nc_wilmington.png`,
  niagara:               `${CDN}/niagara.png`,
  north_texas:           `${CDN}/north_texas.png`,
  northern_arizona:      `${CDN}/northern_arizona.png`,
  northern_colorado:     `${CDN}/northern_colorado.png`,
  northern_iowa:         `${CDN}/northern_iowa.png`,
  ohio_state:            `${CDN}/ohio_state.png`,
  portland_state:        `${CDN}/portland_state.png`,
  purdue:                `${CDN}/purdue.png`,
  quinnipiac:            `${CDN}/quinnipiac.png`,
  rice:                  `${CDN}/rice.png`,
  rider:                 `${CDN}/rider.png`,
  rutgers:               `${CDN}/rutgers.png`,
  sacramento_state:      `${CDN}/sacramento_state.png`,
  saint_peters:          `${CDN}/saint_peters.png`,
  siena:                 `${CDN}/siena.png`,
  south_florida:         `${CDN}/south_florida.png`,
  southern_illinois:     `${CDN}/southern_illinois.png`,
  temple:                `${CDN}/temple.png`,
  tulane:                `${CDN}/tulane.png`,
  uab:                   `${CDN}/uab.png`,
  utsa:                  `${CDN}/utsa.png`,
  weber_state:           `${CDN}/weber_state.png`,
  wichita_state:         `${CDN}/wichita_state.png`,
};

/**
 * Get the logo URL for a team by its snake_case key.
 * Returns null if no logo is available (component falls back to colored badge).
 */
export function getTeamLogoUrl(teamKey: string): string | null {
  const key = teamKey.toLowerCase().trim();
  return NCAAM_LOGOS[key] ?? null;
}
