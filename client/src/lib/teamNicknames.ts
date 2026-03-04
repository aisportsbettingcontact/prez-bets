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
  // A
  air_force: { school: "Air Force", nickname: "Falcons" },
  akron: { school: "Akron", nickname: "Zips" },
  alabama: { school: "Alabama", nickname: "Crimson Tide" },
  appalachian_state: { school: "App State", nickname: "Mountaineers" },
  arizona: { school: "Arizona", nickname: "Wildcats" },
  arizona_state: { school: "Arizona State", nickname: "Sun Devils" },
  arkansas: { school: "Arkansas", nickname: "Razorbacks" },
  arkansas_state: { school: "Arkansas State", nickname: "Red Wolves" },
  army: { school: "Army", nickname: "Black Knights" },
  auburn: { school: "Auburn", nickname: "Tigers" },

  // B
  ball_state: { school: "Ball State", nickname: "Cardinals" },
  baylor: { school: "Baylor", nickname: "Bears" },
  belmont: { school: "Belmont", nickname: "Bruins" },
  boise_state: { school: "Boise State", nickname: "Broncos" },
  boston_college: { school: "Boston College", nickname: "Eagles" },
  bowling_green: { school: "Bowling Green", nickname: "Falcons" },
  bradley: { school: "Bradley", nickname: "Braves" },
  bucknell: { school: "Bucknell", nickname: "Bison" },
  buffalo: { school: "Buffalo", nickname: "Bulls" },
  butler: { school: "Butler", nickname: "Bulldogs" },
  byu: { school: "BYU", nickname: "Cougars" },

  // C
  california: { school: "California", nickname: "Golden Bears" },
  campbell: { school: "Campbell", nickname: "Fighting Camels" },
  canisius: { school: "Canisius", nickname: "Golden Griffins" },
  central_florida: { school: "UCF", nickname: "Knights" },
  central_michigan: { school: "Central Michigan", nickname: "Chippewas" },
  charlotte: { school: "Charlotte", nickname: "49ers" },
  cincinnati: { school: "Cincinnati", nickname: "Bearcats" },
  clemson: { school: "Clemson", nickname: "Tigers" },
  cleveland_state: { school: "Cleveland State", nickname: "Vikings" },
  coastal_carolina: { school: "Coastal Carolina", nickname: "Chanticleers" },
  college_of_charleston: { school: "Charleston", nickname: "Cougars" },
  colorado: { school: "Colorado", nickname: "Buffaloes" },
  colorado_state: { school: "Colorado State", nickname: "Rams" },

  // D
  davidson: { school: "Davidson", nickname: "Wildcats" },
  dayton: { school: "Dayton", nickname: "Flyers" },
  depaul: { school: "DePaul", nickname: "Blue Demons" },
  drake: { school: "Drake", nickname: "Bulldogs" },
  drexel: { school: "Drexel", nickname: "Dragons" },
  duke: { school: "Duke", nickname: "Blue Devils" },

  // E
  east_carolina: { school: "East Carolina", nickname: "Pirates" },
  eastern_michigan: { school: "Eastern Michigan", nickname: "Eagles" },
  eastern_washington: { school: "Eastern Washington", nickname: "Eagles" },
  elon: { school: "Elon", nickname: "Phoenix" },
  evansville: { school: "Evansville", nickname: "Purple Aces" },

  // F
  fairfield: { school: "Fairfield", nickname: "Stags" },
  florida: { school: "Florida", nickname: "Gators" },
  florida_atlantic: { school: "Florida Atlantic", nickname: "Owls" },
  florida_international: { school: "FIU", nickname: "Panthers" },
  fresno_state: { school: "Fresno State", nickname: "Bulldogs" },

  // G
  george_mason: { school: "George Mason", nickname: "Patriots" },
  georgetown: { school: "Georgetown", nickname: "Hoyas" },
  georgia: { school: "Georgia", nickname: "Bulldogs" },
  georgia_southern: { school: "Georgia Southern", nickname: "Eagles" },
  georgia_state: { school: "Georgia State", nickname: "Panthers" },
  gonzaga: { school: "Gonzaga", nickname: "Bulldogs" },
  grand_canyon: { school: "Grand Canyon", nickname: "Lopes" },

  // H
  hampton: { school: "Hampton", nickname: "Pirates" },
  hofstra: { school: "Hofstra", nickname: "Pride" },
  holy_cross: { school: "Holy Cross", nickname: "Crusaders" },
  houston: { school: "Houston", nickname: "Cougars" },

  // I
  idaho: { school: "Idaho", nickname: "Vandals" },
  idaho_state: { school: "Idaho State", nickname: "Bengals" },
  illinois: { school: "Illinois", nickname: "Fighting Illini" },
  illinois_chicago: { school: "UIC", nickname: "Flames" },
  illinois_state: { school: "Illinois State", nickname: "Redbirds" },
  indiana: { school: "Indiana", nickname: "Hoosiers" },
  indiana_state: { school: "Indiana State", nickname: "Sycamores" },
  iona: { school: "Iona", nickname: "Gaels" },
  iowa: { school: "Iowa", nickname: "Hawkeyes" },
  iowa_state: { school: "Iowa State", nickname: "Cyclones" },
  iupui: { school: "IUPUI", nickname: "Jaguars" },

  // K
  kansas: { school: "Kansas", nickname: "Jayhawks" },
  kansas_state: { school: "Kansas State", nickname: "Wildcats" },
  kent_state: { school: "Kent State", nickname: "Golden Flashes" },
  kentucky: { school: "Kentucky", nickname: "Wildcats" },

  // L
  la_salle: { school: "La Salle", nickname: "Explorers" },
  lafayette: { school: "Lafayette", nickname: "Leopards" },
  louisiana: { school: "Louisiana", nickname: "Ragin' Cajuns" },
  louisiana_monroe: { school: "ULM", nickname: "Warhawks" },
  louisiana_tech: { school: "Louisiana Tech", nickname: "Bulldogs" },
  louisville: { school: "Louisville", nickname: "Cardinals" },
  lsu: { school: "LSU", nickname: "Tigers" },

  // M
  manhattan: { school: "Manhattan", nickname: "Jaspers" },
  marist: { school: "Marist", nickname: "Red Foxes" },
  marquette: { school: "Marquette", nickname: "Golden Eagles" },
  maryland: { school: "Maryland", nickname: "Terrapins" },
  massachusetts: { school: "UMass", nickname: "Minutemen" },
  memphis: { school: "Memphis", nickname: "Tigers" },
  merrimack: { school: "Merrimack", nickname: "Warriors" },
  miami: { school: "Miami", nickname: "Hurricanes" },
  miami_ohio: { school: "Miami (OH)", nickname: "RedHawks" },
  michigan: { school: "Michigan", nickname: "Wolverines" },
  michigan_state: { school: "Michigan State", nickname: "Spartans" },
  minnesota: { school: "Minnesota", nickname: "Golden Gophers" },
  mississippi: { school: "Ole Miss", nickname: "Rebels" },
  mississippi_state: { school: "Mississippi State", nickname: "Bulldogs" },
  missouri: { school: "Missouri", nickname: "Tigers" },
  monmouth: { school: "Monmouth", nickname: "Hawks" },
  montana: { school: "Montana", nickname: "Grizzlies" },
  montana_state: { school: "Montana State", nickname: "Bobcats" },
  mount_st_marys: { school: "Mount St. Mary's", nickname: "Mountaineers" },
  murray_state: { school: "Murray State", nickname: "Racers" },

  // N
  navy: { school: "Navy", nickname: "Midshipmen" },
  nc_state: { school: "NC State", nickname: "Wolfpack" },
  nc_wilmington: { school: "UNC Wilmington", nickname: "Seahawks" },
  nebraska: { school: "Nebraska", nickname: "Cornhuskers" },
  nevada: { school: "Nevada", nickname: "Wolf Pack" },
  new_mexico: { school: "New Mexico", nickname: "Lobos" },
  niagara: { school: "Niagara", nickname: "Purple Eagles" },
  north_carolina: { school: "North Carolina", nickname: "Tar Heels" },
  north_carolina_at: { school: "NC A&T", nickname: "Aggies" },
  north_texas: { school: "North Texas", nickname: "Mean Green" },
  northeastern: { school: "Northeastern", nickname: "Huskies" },
  northern_arizona: { school: "Northern Arizona", nickname: "Lumberjacks" },
  northern_colorado: { school: "Northern Colorado", nickname: "Bears" },
  northern_illinois: { school: "Northern Illinois", nickname: "Huskies" },
  northern_iowa: { school: "Northern Iowa", nickname: "Panthers" },
  northwestern: { school: "Northwestern", nickname: "Wildcats" },
  notre_dame: { school: "Notre Dame", nickname: "Fighting Irish" },

  // O
  ohio: { school: "Ohio", nickname: "Bobcats" },
  ohio_state: { school: "Ohio State", nickname: "Buckeyes" },
  oklahoma: { school: "Oklahoma", nickname: "Sooners" },
  oklahoma_state: { school: "Oklahoma State", nickname: "Cowboys" },
  old_dominion: { school: "Old Dominion", nickname: "Monarchs" },
  oral_roberts: { school: "Oral Roberts", nickname: "Golden Eagles" },
  oregon: { school: "Oregon", nickname: "Ducks" },
  oregon_state: { school: "Oregon State", nickname: "Beavers" },

  // P
  penn_state: { school: "Penn State", nickname: "Nittany Lions" },
  pittsburgh: { school: "Pittsburgh", nickname: "Panthers" },
  portland_state: { school: "Portland State", nickname: "Vikings" },
  purdue: { school: "Purdue", nickname: "Boilermakers" },

  // Q
  quinnipiac: { school: "Quinnipiac", nickname: "Bobcats" },

  // R
  rice: { school: "Rice", nickname: "Owls" },
  richmond: { school: "Richmond", nickname: "Spiders" },
  rider: { school: "Rider", nickname: "Broncs" },
  rutgers: { school: "Rutgers", nickname: "Scarlet Knights" },

  // S
  sacramento_state: { school: "Sacramento State", nickname: "Hornets" },
  saint_josephs: { school: "Saint Joseph's", nickname: "Hawks" },
  saint_louis: { school: "Saint Louis", nickname: "Billikens" },
  saint_marys: { school: "Saint Mary's", nickname: "Gaels" },
  saint_peters: { school: "Saint Peter's", nickname: "Peacocks" },
  sam_houston: { school: "Sam Houston", nickname: "Bearkats" },
  san_diego_state: { school: "San Diego State", nickname: "Aztecs" },
  san_francisco: { school: "San Francisco", nickname: "Dons" },
  san_jose_state: { school: "San Jose State", nickname: "Spartans" },
  seton_hall: { school: "Seton Hall", nickname: "Pirates" },
  siena: { school: "Siena", nickname: "Saints" },
  smu: { school: "SMU", nickname: "Mustangs" },
  south_alabama: { school: "South Alabama", nickname: "Jaguars" },
  south_carolina: { school: "South Carolina", nickname: "Gamecocks" },
  south_florida: { school: "South Florida", nickname: "Bulls" },
  southern_illinois: { school: "Southern Illinois", nickname: "Salukis" },
  southern_miss: { school: "Southern Miss", nickname: "Golden Eagles" },
  stanford: { school: "Stanford", nickname: "Cardinal" },
  st_bonaventure: { school: "St. Bonaventure", nickname: "Bonnies" },
  st_johns: { school: "St. John's", nickname: "Red Storm" },
  stony_brook: { school: "Stony Brook", nickname: "Seawolves" },
  syracuse: { school: "Syracuse", nickname: "Orange" },

  // T
  tcu: { school: "TCU", nickname: "Horned Frogs" },
  temple: { school: "Temple", nickname: "Owls" },
  tennessee: { school: "Tennessee", nickname: "Volunteers" },
  texas: { school: "Texas", nickname: "Longhorns" },
  texas_am: { school: "Texas A&M", nickname: "Aggies" },
  texas_state: { school: "Texas State", nickname: "Bobcats" },
  texas_tech: { school: "Texas Tech", nickname: "Red Raiders" },
  toledo: { school: "Toledo", nickname: "Rockets" },
  towson: { school: "Towson", nickname: "Tigers" },
  troy: { school: "Troy", nickname: "Trojans" },
  tulane: { school: "Tulane", nickname: "Green Wave" },
  tulsa: { school: "Tulsa", nickname: "Golden Hurricane" },

  // U
  uab: { school: "UAB", nickname: "Blazers" },
  ucla: { school: "UCLA", nickname: "Bruins" },
  unlv: { school: "UNLV", nickname: "Rebels" },
  usc: { school: "USC", nickname: "Trojans" },
  utah: { school: "Utah", nickname: "Utes" },
  utah_state: { school: "Utah State", nickname: "Aggies" },
  utah_tech: { school: "Utah Tech", nickname: "Trailblazers" },
  utsa: { school: "UTSA", nickname: "Roadrunners" },

  // V
  vanderbilt: { school: "Vanderbilt", nickname: "Commodores" },
  vcu: { school: "VCU", nickname: "Rams" },
  villanova: { school: "Villanova", nickname: "Wildcats" },
  virginia: { school: "Virginia", nickname: "Cavaliers" },
  virginia_tech: { school: "Virginia Tech", nickname: "Hokies" },

  // W
  wake_forest: { school: "Wake Forest", nickname: "Demon Deacons" },
  washington: { school: "Washington", nickname: "Huskies" },
  washington_state: { school: "Washington State", nickname: "Cougars" },
  weber_state: { school: "Weber State", nickname: "Wildcats" },
  west_virginia: { school: "West Virginia", nickname: "Mountaineers" },
  western_michigan: { school: "Western Michigan", nickname: "Broncos" },
  wichita_state: { school: "Wichita State", nickname: "Shockers" },
  william_and_mary: { school: "William & Mary", nickname: "Tribe" },
  wisconsin: { school: "Wisconsin", nickname: "Badgers" },
  wyoming: { school: "Wyoming", nickname: "Cowboys" },

  // X
  xavier: { school: "Xavier", nickname: "Musketeers" },

  // March 4 WagerTalk additions
  bellarmine: { school: "Bellarmine", nickname: "Knights" },
  central_connecticut: { school: "Central Connecticut", nickname: "Blue Devils" },
  chicago_state: { school: "Chicago State", nickname: "Cougars" },
  creighton: { school: "Creighton", nickname: "Bluejays" },
  detroit_mercy: { school: "Detroit Mercy", nickname: "Titans" },
  duquesne: { school: "Duquesne", nickname: "Dukes" },
  eastern_illinois: { school: "Eastern Illinois", nickname: "Panthers" },
  eastern_kentucky: { school: "Eastern Kentucky", nickname: "Colonels" },
  fairleigh_dickinson: { school: "Fairleigh Dickinson", nickname: "Knights" },
  florida_gulf_coast: { school: "Florida Gulf Coast", nickname: "Eagles" },
  florida_state: { school: "Florida State", nickname: "Seminoles" },
  fordham: { school: "Fordham", nickname: "Rams" },
  gardner_webb: { school: "Gardner-Webb", nickname: "Runnin' Bulldogs" },
  george_washington: { school: "George Washington", nickname: "Revolutionaries" },
  georgia_tech: { school: "Georgia Tech", nickname: "Yellow Jackets" },
  jacksonville: { school: "Jacksonville", nickname: "Dolphins" },
  james_madison: { school: "James Madison", nickname: "Dukes" },
  le_moyne: { school: "Le Moyne", nickname: "Dolphins" },
  lindenwood: { school: "Lindenwood", nickname: "Lions" },
  little_rock: { school: "Little Rock", nickname: "Trojans" },
  liu: { school: "Long Island", nickname: "Sharks" },
  loyola_chicago: { school: "Loyola Chicago", nickname: "Ramblers" },
  mercyhurst: { school: "Mercyhurst", nickname: "Lakers" },
  miami_fl: { school: "Miami", nickname: "Hurricanes" },
  milwaukee: { school: "Milwaukee", nickname: "Panthers" },
  north_alabama: { school: "North Alabama", nickname: "Lions" },
  north_florida: { school: "North Florida", nickname: "Ospreys" },
  northern_kentucky: { school: "Northern Kentucky", nickname: "Norse" },
  oakland: { school: "Oakland", nickname: "Golden Grizzlies" },
  providence: { school: "Providence", nickname: "Friars" },
  rhode_island: { school: "Rhode Island", nickname: "Rams" },
  robert_morris: { school: "Robert Morris", nickname: "Colonials" },
  siu_edwardsville: { school: "SIU Edwardsville", nickname: "Cougars" },
  south_carolina_upstate: { school: "SC Upstate", nickname: "Spartans" },
  st_josephs: { school: "St. Joseph's", nickname: "Hawks" },
  stetson: { school: "Stetson", nickname: "Hatters" },
  stonehill: { school: "Stonehill", nickname: "Skyhawks" },
  umkc: { school: "Kansas City", nickname: "Roos" },
  wagner: { school: "Wagner", nickname: "Seahawks" },
  west_georgia: { school: "West Georgia", nickname: "Wolves" },
  wright_state: { school: "Wright State", nickname: "Raiders" },
  youngstown_state: { school: "Youngstown State", nickname: "Penguins" },
};

/**
 * Get the school name and nickname for a given team slug.
 * Falls back to a formatted version of the slug if not found.
 */
export function getTeamName(slug: string): TeamName {
  if (TEAM_NAMES[slug]) return TEAM_NAMES[slug];
  // Fallback: format the slug as a title-cased school name
  const school = slug
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return { school, nickname: "" };
}
