/**
 * NCAAM team slug → { school, nickname } map.
 * School name is the short/display version (e.g. "Duke", not "Duke University").
 * Nickname is the team mascot/name (e.g. "Blue Devils").
 */

export interface TeamName {
  school: string;
  nickname: string;
}

export const TEAM_NAMES: Record<string, TeamName> = {
  arizona: { school: "Arizona", nickname: "Wildcats" },
  belmont: { school: "Belmont", nickname: "Bruins" },
  bradley: { school: "Bradley", nickname: "Braves" },
  canisius: { school: "Canisius", nickname: "Golden Griffins" },
  charlotte: { school: "Charlotte", nickname: "49ers" },
  cleveland_state: { school: "Cleveland State", nickname: "Vikings" },
  college_of_charleston: { school: "Charleston", nickname: "Cougars" },
  davidson: { school: "Davidson", nickname: "Wildcats" },
  depaul: { school: "DePaul", nickname: "Blue Demons" },
  drake: { school: "Drake", nickname: "Bulldogs" },
  duke: { school: "Duke", nickname: "Blue Devils" },
  east_carolina: { school: "East Carolina", nickname: "Pirates" },
  eastern_washington: { school: "Eastern Washington", nickname: "Eagles" },
  evansville: { school: "Evansville", nickname: "Purple Aces" },
  fairfield: { school: "Fairfield", nickname: "Stags" },
  florida_atlantic: { school: "Florida Atlantic", nickname: "Owls" },
  idaho: { school: "Idaho", nickname: "Vandals" },
  idaho_state: { school: "Idaho State", nickname: "Bengals" },
  illinois_chicago: { school: "UIC", nickname: "Flames" },
  illinois_state: { school: "Illinois State", nickname: "Redbirds" },
  indiana: { school: "Indiana", nickname: "Hoosiers" },
  indiana_state: { school: "Indiana State", nickname: "Sycamores" },
  iona: { school: "Iona", nickname: "Gaels" },
  iowa_state: { school: "Iowa State", nickname: "Cyclones" },
  iupui: { school: "IUPUI", nickname: "Jaguars" },
  la_salle: { school: "La Salle", nickname: "Explorers" },
  manhattan: { school: "Manhattan", nickname: "Jaspers" },
  marist: { school: "Marist", nickname: "Red Foxes" },
  marquette: { school: "Marquette", nickname: "Golden Eagles" },
  maryland: { school: "Maryland", nickname: "Terrapins" },
  memphis: { school: "Memphis", nickname: "Tigers" },
  merrimack: { school: "Merrimack", nickname: "Warriors" },
  michigan_state: { school: "Michigan State", nickname: "Spartans" },
  montana: { school: "Montana", nickname: "Grizzlies" },
  montana_state: { school: "Montana State", nickname: "Bobcats" },
  mount_st_marys: { school: "Mount St. Mary's", nickname: "Mountaineers" },
  murray_state: { school: "Murray State", nickname: "Racers" },
  nc_state: { school: "NC State", nickname: "Wolfpack" },
  nc_wilmington: { school: "UNC Wilmington", nickname: "Seahawks" },
  niagara: { school: "Niagara", nickname: "Purple Eagles" },
  north_texas: { school: "North Texas", nickname: "Mean Green" },
  northern_arizona: { school: "Northern Arizona", nickname: "Lumberjacks" },
  northern_colorado: { school: "Northern Colorado", nickname: "Bears" },
  northern_iowa: { school: "Northern Iowa", nickname: "Panthers" },
  ohio_state: { school: "Ohio State", nickname: "Buckeyes" },
  portland_state: { school: "Portland State", nickname: "Vikings" },
  purdue: { school: "Purdue", nickname: "Boilermakers" },
  quinnipiac: { school: "Quinnipiac", nickname: "Bobcats" },
  rice: { school: "Rice", nickname: "Owls" },
  rider: { school: "Rider", nickname: "Broncs" },
  rutgers: { school: "Rutgers", nickname: "Scarlet Knights" },
  sacramento_state: { school: "Sacramento State", nickname: "Hornets" },
  saint_peters: { school: "Saint Peter's", nickname: "Peacocks" },
  siena: { school: "Siena", nickname: "Saints" },
  south_florida: { school: "South Florida", nickname: "Bulls" },
  southern_illinois: { school: "Southern Illinois", nickname: "Salukis" },
  temple: { school: "Temple", nickname: "Owls" },
  tulane: { school: "Tulane", nickname: "Green Wave" },
  uab: { school: "UAB", nickname: "Blazers" },
  utsa: { school: "UTSA", nickname: "Roadrunners" },
  weber_state: { school: "Weber State", nickname: "Wildcats" },
  wichita_state: { school: "Wichita State", nickname: "Shockers" },
};

/**
 * Get the school name and nickname for a given team slug.
 * Falls back to a formatted version of the slug if not found.
 */
export function getTeamName(slug: string): TeamName {
  if (TEAM_NAMES[slug]) return TEAM_NAMES[slug]!;
  // Fallback: format the slug as a title-cased school name
  const school = slug
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return { school, nickname: "" };
}
