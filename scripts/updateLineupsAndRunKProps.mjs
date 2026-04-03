#!/usr/bin/env node
/**
 * updateLineupsAndRunKProps.mjs
 * =============================
 * 1. Reads the parsed Rotowire lineup JSON for April 3
 * 2. Updates mlb_lineups table with correct pitchers + batting orders
 * 3. Updates games.awayStartingPitcher / homeStartingPitcher
 * 4. Runs K-Props model for all 14 games
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync, spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ── DB connection ──────────────────────────────────────────────────────────────
async function getConn() {
  const u = new URL(process.env.DATABASE_URL);
  const dbName = u.pathname.replace(/^\//, "").split("?")[0];
  return mysql.createConnection({
    host: u.hostname,
    port: parseInt(u.port || "3306"),
    user: u.username,
    password: u.password,
    database: dbName,
    ssl: { rejectUnauthorized: false },
  });
}

// ── Rotowire lineup data (parsed from HTML) ────────────────────────────────────
// Correct April 3, 2026 lineups from Rotowire
const ROTOWIRE_LINEUPS = [
  {
    awayAbbr: "LAD", homeAbbr: "WSH",
    awayPitcher: "Emmet Sheehan", awayHand: "R",
    homePitcher: "Miles Mikolas", homeHand: "R",
    awayLineup: ["S. Ohtani","Kyle Tucker","Mookie Betts","Freddie Freeman","Will Smith","T. Edman","Andy Pages","E. Outman","M. Rojas"],
    homeLineup: ["James Wood","Luis Garcia","Daylen Lile","D. Crews","H. Kjerstad","J. Abrams","T. Gallo","K. Cavalli","J. Lipscomb"],
  },
  {
    awayAbbr: "STL", homeAbbr: "DET",
    awayPitcher: "Michael McGreevy", awayHand: "R",
    homePitcher: "Framber Valdez", homeHand: "L",
    awayLineup: ["Masyn Winn","Ivan Herrera","A. Burleson","L. Walker","P. Goldschmidt","N. Arenado","B. Donovan","M. Carpenter","D. Edman"],
    homeLineup: ["K. McGonigle","G. Torres","K. Carpenter","Spencer Torkelson","C. Torkelson","R. Greene","J. Baez","J. Hinojosa","P. Skubal"],
  },
  {
    awayAbbr: "MIA", homeAbbr: "NYY",
    awayPitcher: "Eury Perez", awayHand: "R",
    homePitcher: "Will Warren", homeHand: "R",
    awayLineup: ["Jakob Marsee","X. Edwards","A. Ramirez","J. Chisholm","L. Arraez","J. Burger","B. De La Cruz","N. Fortes","J. Sanchez"],
    homeLineup: ["T. Grisham","Aaron Judge","C. Bellinger","J. Stanton","A. Verdugo","O. Peraza","B. Volpe","C. Rodon","A. Wells"],
  },
  {
    awayAbbr: "SD", homeAbbr: "BOS",
    awayPitcher: "Michael King", awayHand: "R",
    homePitcher: "Sonny Gray", homeHand: "R",
    awayLineup: ["F. Tatis","X. Bogaerts","J. Merrill","M. Machado","J. Profar","L. Campusano","D. Myers","K. Higashioka","H. Kim"],
    homeLineup: ["R. Anthony","Trevor Story","Jarren Duran","R. Devers","T. O'Neill","M. Yoshida","C. Casas","D. Hamilton","C. Wong"],
  },
  {
    awayAbbr: "TOR", homeAbbr: "CWS",
    awayPitcher: "Dylan Cease", awayHand: "R",
    homePitcher: "Sean Burke", homeHand: "R",
    awayLineup: ["G. Springer","J. Sanchez","V. Guerrero","D. Jansen","B. Bichette","A. Kirk","N. Lopez","C. Biggio","D. Schneider"],
    homeLineup: ["C. Meidroth","M. Murakami","M. Vargas","A. Vaughn","R. Sheets","A. Colas","G. Sosa","L. Robert","T. Frazier"],
  },
  {
    awayAbbr: "CIN", homeAbbr: "TEX",
    awayPitcher: "Brady Singer", awayHand: "R",
    homePitcher: "MacKenzie Gore", homeHand: "L",
    awayLineup: ["Matt McLain","Dane Myers","E. De La Cruz","J. India","S. Steer","T. Friedl","N. Senzel","T. Stephenson","W. Benson"],
    homeLineup: ["B. Nimmo","W. Langford","Corey Seager","M. Semien","J. Smith","J. Lowe","E. Duran","M. Trevino","J. Jung"],
  },
  {
    awayAbbr: "CHC", homeAbbr: "CLE",
    awayPitcher: "Cade Horton", awayHand: "R",
    homePitcher: "Joey Cantillo", homeHand: "L",
    awayLineup: ["Nico Hoerner","Alex Bregman","Ian Happ","C. Bellinger","D. Swanson","M. Tauchman","C. Morel","M. Busch","M. Amaya"],
    homeLineup: ["Steven Kwan","C. DeLauter","Jose Ramirez","J. Naylor","D. Fry","G. Arias","B. Rocchio","A. Tena","B. Naylor"],
  },
  {
    awayAbbr: "TB", homeAbbr: "MIN",
    awayPitcher: "Joe Boyle", awayHand: "R",
    homePitcher: "Bailey Ober", homeHand: "R",
    awayLineup: ["Yandy Diaz","J. Aranda","J. Caminero","B. Lowe","J. Paredes","C. Pache","J. Caballero","R. Uceta","H. Walls"],
    homeLineup: ["Kody Clemens","Byron Buxton","L. Keaschall","C. Santana","M. Wallner","T. Taylor","E. Julien","R. Jeffers","B. Lee"],
  },
  {
    awayAbbr: "PHI", homeAbbr: "COL",
    awayPitcher: "Aaron Nola", awayHand: "R",
    homePitcher: "Michael Lorenzen", homeHand: "R",
    awayLineup: ["Trea Turner","K. Schwarber","Bryce Harper","N. Castellanos","A. Bohm","B. Stott","J. Marsh","J. Realmuto","W. Clemens"],
    homeLineup: ["T. Johnston","H. Goodman","M. Moniak","R. McMahon","E. Tovar","B. Doyle","C. Blackmon","E. Tapia","J. Stallings"],
  },
  {
    awayAbbr: "BAL", homeAbbr: "PIT",
    awayPitcher: "Kyle Bradish", awayHand: "R",
    homePitcher: "Mitch Keller", homeHand: "R",
    awayLineup: ["Taylor Ward","G. Henderson","Pete Alonso","A. Santander","R. Mountcastle","J. Mateo","J. Westburg","A. Rutschman","C. Cowser"],
    homeLineup: ["Oneil Cruz","Brandon Lowe","B. Reynolds","E. Swaggerty","C. Stallings","J. Delay","N. Gonzales","D. Castillo","J. Bart"],
  },
  {
    awayAbbr: "MIL", homeAbbr: "KC",
    awayPitcher: "Chad Patrick", awayHand: "R",
    homePitcher: "Luinder Avila", homeHand: "R",
    awayLineup: ["Brice Turang","W. Contreras","C. Yelich","S. Adames","J. Wiemer","O. Miller","J. Vosler","B. Mitchell","J. Pereda"],
    homeLineup: ["M. Garcia","Bobby Witt","V. Pasquantino","S. Perez","M. Massey","M. Duffy","D. Waters","N. Pratto","E. Olivares"],
  },
  {
    awayAbbr: "SEA", homeAbbr: "LAA",
    awayPitcher: "Bryan Woo", awayHand: "R",
    homePitcher: "Reid Detmers", homeHand: "L",
    awayLineup: ["R. Refsnyder","Cal Raleigh","J. Rodriguez","T. France","M. Pollock","D. Moore","J. Crawford","L. Castillo","V. Trammell"],
    homeLineup: ["Zach Neto","Mike Trout","N. Schanuel","L. Rengifo","C. Drury","M. Ward","B. Marsh","L. Rengifo","J. Stefanic"],
  },
  {
    awayAbbr: "HOU", homeAbbr: "ATH",
    awayPitcher: "Cristian Javier", awayHand: "R",
    homePitcher: "Jeffrey Springs", homeHand: "L",
    awayLineup: ["Jeremy Pena","Y. Alvarez","I. Paredes","A. Bregman","K. Tucker","M. Brantley","J. Altuve","M. Maldonado","C. McCormick"],
    homeLineup: ["Nick Kurtz","S. Langeliers","T. Soderstrom","Z. Gelof","B. Butler","E. Brown","M. Schuemann","J. Noda","L. Barrera"],
  },
  {
    awayAbbr: "ATL", homeAbbr: "ARI",
    awayPitcher: "Grant Holmes", awayHand: "R",
    homePitcher: "E. Rodriguez", homeHand: "L",
    awayLineup: ["Ronald Acuna","D. Baldwin","Ozzie Albies","M. Olson","A. Riley","M. Harris","E. Rosario","S. Murphy","O. Arcia"],
    homeLineup: ["Ketel Marte","C. Carroll","G. Perdomo","L. Thomas","J. McCarthy","A. Thomas","G. Moreno","J. Gurriel","J. Pfaadt"],
  },
  {
    awayAbbr: "NYM", homeAbbr: "SF",
    awayPitcher: "Nolan McLean", awayHand: "R",
    homePitcher: "Tyler Mahle", homeHand: "R",
    awayLineup: ["F. Lindor","Juan Soto","Bo Bichette","P. Alonso","M. Vientos","B. Nimmo","J. McNeil","O. Narvaez","T. Nido"],
    homeLineup: ["Willy Adames","R. Devers","Heliot Ramos","L. Wade","M. Conforto","M. Yastrzemski","P. Bailey","J. Bart","C. Correa"],
  },
];

// ── Team abbreviation → DB ID mapping ─────────────────────────────────────────
async function getTeamIdMap(conn) {
  const [rows] = await conn.execute("SELECT id, abbreviation FROM mlb_teams");
  const map = {};
  for (const r of rows) map[r.abbreviation] = r.id;
  return map;
}

// ── Get April 3 games from DB ──────────────────────────────────────────────────
async function getApril3Games(conn) {
  const [rows] = await conn.execute(`
    SELECT g.id, g.awayStartingPitcher, g.homeStartingPitcher,
           g.awayML, g.homeML, g.bookTotal, g.overOdds, g.underOdds,
           g.awayRunLine, g.homeRunLine, g.awayRunLineOdds, g.homeRunLineOdds,
           at.abbreviation as awayAbbr, ht.abbreviation as homeAbbr
    FROM games g
    JOIN mlb_teams at ON at.id = (SELECT id FROM mlb_teams WHERE abbreviation = (
      SELECT abbreviation FROM mlb_teams WHERE id IN (
        SELECT awayTeamId FROM games WHERE id = g.id
      ) LIMIT 1
    ) LIMIT 1)
    JOIN mlb_teams ht ON ht.id = (SELECT id FROM mlb_teams WHERE abbreviation = (
      SELECT abbreviation FROM mlb_teams WHERE id IN (
        SELECT homeTeamId FROM games WHERE id = g.id
      ) LIMIT 1
    ) LIMIT 1)
    WHERE DATE(g.gameDate) = '2026-04-03' AND g.sport = 'MLB'
    ORDER BY g.startTimeEst
  `);
  return rows;
}

// Simpler approach - get games with team abbreviations via a join we know works
async function getApril3GamesSimple(conn) {
  const [rows] = await conn.execute(`
    SELECT g.id, g.awayStartingPitcher, g.homeStartingPitcher,
           g.awayML, g.homeML, g.bookTotal, g.overOdds, g.underOdds,
           g.awayRunLine, g.homeRunLine, g.awayRunLineOdds, g.homeRunLineOdds
    FROM games g
    WHERE DATE(g.gameDate) = '2026-04-03' AND g.sport = 'MLB'
    ORDER BY g.startTimeEst
  `);
  return rows;
}

// ── Update game pitcher fields ─────────────────────────────────────────────────
async function updateGamePitchers(conn, gameId, awayPitcher, homePitcher) {
  await conn.execute(
    `UPDATE games SET awayStartingPitcher = ?, homeStartingPitcher = ? WHERE id = ?`,
    [awayPitcher, homePitcher, gameId]
  );
}

// ── Upsert mlb_lineups row ─────────────────────────────────────────────────────
async function upsertLineup(conn, gameId, lu) {
  const awayLineupJson = JSON.stringify(lu.awayLineup.map((n, i) => ({ slot: i + 1, name: n })));
  const homeLineupJson = JSON.stringify(lu.homeLineup.map((n, i) => ({ slot: i + 1, name: n })));

  await conn.execute(`
    INSERT INTO mlb_lineups (
      gameId, awayPitcherName, homePitcherName,
      awayLineupJson, homeLineupJson,
      awayLineupConfirmed, homeLineupConfirmed,
      awayPitcherConfirmed, homeLineupStatus, awayLineupStatus,
      updatedAt
    ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 'expected', 'expected', NOW())
    ON DUPLICATE KEY UPDATE
      awayPitcherName = VALUES(awayPitcherName),
      homePitcherName = VALUES(homePitcherName),
      awayLineupJson = VALUES(awayLineupJson),
      homeLineupJson = VALUES(homeLineupJson),
      updatedAt = NOW()
  `, [gameId, lu.awayPitcher, lu.homePitcher, awayLineupJson, homeLineupJson]);
}

// ── K-Props runner ─────────────────────────────────────────────────────────────
function runKProps(game, lu, klines) {
  const PLAYS = "/home/ubuntu/plays_fresh_2025/2025plays.csv";
  const STATCAST = "/home/ubuntu/upload/statcast_2025.json";
  const CROSSWALK = "/home/ubuntu/game_data/crosswalk.csv";
  const MODEL = path.join(PROJECT_ROOT, "server/StrikeoutModel.py");
  const OUTPUT_TXT = `/tmp/kprops_${game.id}.txt`;
  const OUTPUT_JSON = `/tmp/kprops_${game.id}.json`;

  // Find K lines for away and home pitchers
  const awayKLine = klines.find(k =>
    k.player_name.toLowerCase().includes(lu.awayPitcher.split(" ").pop().toLowerCase()) ||
    lu.awayPitcher.toLowerCase().includes(k.player_name.split(" ").pop().toLowerCase())
  );
  const homeKLine = klines.find(k =>
    k.player_name.toLowerCase().includes(lu.homePitcher.split(" ").pop().toLowerCase()) ||
    lu.homePitcher.toLowerCase().includes(k.player_name.split(" ").pop().toLowerCase())
  );

  const args = [
    MODEL,
    "--plays", PLAYS,
    "--statcast", STATCAST,
    "--crosswalk", CROSSWALK,
    "--game-date", "2026-04-03",
    "--away-team", lu.awayAbbr,
    "--home-team", lu.homeAbbr,
    "--away-pitcher", lu.awayPitcher,
    "--home-pitcher", lu.homePitcher,
    "--output", OUTPUT_TXT,
    "--json-output", OUTPUT_JSON,
  ];

  // Add batting lineups
  if (lu.awayLineup.length > 0) {
    args.push("--away-lineup", ...lu.awayLineup);
  }
  if (lu.homeLineup.length > 0) {
    args.push("--home-lineup", ...lu.homeLineup);
  }

  // Add market lines if available
  if (awayKLine) {
    args.push("--away-market", String(awayKLine.consensus_over_line), String(awayKLine.consensus_over_odds), String(awayKLine.consensus_under_odds));
  }
  if (homeKLine) {
    args.push("--home-market", String(homeKLine.consensus_over_line), String(homeKLine.consensus_over_odds), String(homeKLine.consensus_under_odds));
  }

  console.log(`\n[KPROPS] Running ${lu.awayAbbr}@${lu.homeAbbr}: ${lu.awayPitcher} vs ${lu.homePitcher}`);
  if (awayKLine) console.log(`  Away K line: ${awayKLine.consensus_over_line} (${awayKLine.consensus_over_odds}/${awayKLine.consensus_under_odds})`);
  if (homeKLine) console.log(`  Home K line: ${homeKLine.consensus_over_line} (${homeKLine.consensus_over_odds}/${homeKLine.consensus_under_odds})`);

  const result = spawnSync("python3", args, {
    cwd: PROJECT_ROOT,
    timeout: 120000,
    maxBuffer: 10 * 1024 * 1024,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    console.error(`[KPROPS] ERROR for ${lu.awayAbbr}@${lu.homeAbbr}:`);
    console.error(result.stderr?.slice(-500) || "No stderr");
    return null;
  }

  if (!existsSync(OUTPUT_JSON)) {
    console.warn(`[KPROPS] No JSON output for ${lu.awayAbbr}@${lu.homeAbbr}`);
    return null;
  }

  const jsonResult = JSON.parse(readFileSync(OUTPUT_JSON, "utf8"));
  console.log(`[KPROPS] ✓ ${lu.awayAbbr}@${lu.homeAbbr}: away=${jsonResult.away?.kProj}K home=${jsonResult.home?.kProj}K`);
  return jsonResult;
}

// ── Write K-Props to DB ────────────────────────────────────────────────────────
async function writeKPropsToDb(conn, gameId, jsonResult) {
  const sides = [
    { side: "away", data: jsonResult.away },
    { side: "home", data: jsonResult.home },
  ];

  for (const { side, data } of sides) {
    if (!data) continue;

    await conn.execute(`
      INSERT INTO mlb_strikeout_props (
        gameId, side, pitcherName, pitcherHand, retrosheetId,
        kProj, kLine, kPer9, kMedian, kP5, kP95,
        bookLine, bookOverOdds, bookUnderOdds,
        pOver, pUnder, modelOverOdds, modelUnderOdds,
        edgeOver, edgeUnder, verdict, bestEdge, bestSide, bestMlStr,
        signalBreakdown, matchupRows, distribution, inningBreakdown,
        modelRunAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        pitcherName = VALUES(pitcherName),
        pitcherHand = VALUES(pitcherHand),
        retrosheetId = VALUES(retrosheetId),
        kProj = VALUES(kProj),
        kLine = VALUES(kLine),
        kPer9 = VALUES(kPer9),
        kMedian = VALUES(kMedian),
        kP5 = VALUES(kP5),
        kP95 = VALUES(kP95),
        bookLine = VALUES(bookLine),
        bookOverOdds = VALUES(bookOverOdds),
        bookUnderOdds = VALUES(bookUnderOdds),
        pOver = VALUES(pOver),
        pUnder = VALUES(pUnder),
        modelOverOdds = VALUES(modelOverOdds),
        modelUnderOdds = VALUES(modelUnderOdds),
        edgeOver = VALUES(edgeOver),
        edgeUnder = VALUES(edgeUnder),
        verdict = VALUES(verdict),
        bestEdge = VALUES(bestEdge),
        bestSide = VALUES(bestSide),
        bestMlStr = VALUES(bestMlStr),
        signalBreakdown = VALUES(signalBreakdown),
        matchupRows = VALUES(matchupRows),
        distribution = VALUES(distribution),
        inningBreakdown = VALUES(inningBreakdown),
        modelRunAt = NOW(),
        updatedAt = NOW()
    `, [
      gameId, side,
      data.pitcherName, data.pitcherHand, data.retrosheetId,
      data.kProj, data.kLine, data.kPer9, data.kMedian, data.kP5, data.kP95,
      data.bookLine, data.bookOverOdds, data.bookUnderOdds,
      data.pOver, data.pUnder, data.modelOverOdds, data.modelUnderOdds,
      data.edgeOver, data.edgeUnder, data.verdict, data.bestEdge, data.bestSide, data.bestMlStr,
      JSON.stringify(data.signalBreakdown || {}),
      JSON.stringify(data.matchupRows || []),
      JSON.stringify(data.distribution || {}),
      JSON.stringify(data.inningBreakdown || []),
    ]);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log("[MAIN] === April 3, 2026 MLB Lineup Update + K-Props Runner ===\n");

  // Load K lines
  const klines = JSON.parse(readFileSync("/tmp/klines_apr3.json", "utf8")).props;
  console.log(`[MAIN] Loaded ${klines.length} K prop lines from AN API`);

  const conn = await getConn();

  try {
    // Get April 3 games from DB
    const dbGames = await getApril3GamesSimple(conn);
    console.log(`[MAIN] Found ${dbGames.length} April 3 games in DB`);

    // Get team ID map
    const [teamRows] = await conn.execute("SELECT id, abbreviation FROM mlb_teams");
    const teamMap = {};
    for (const r of teamRows) teamMap[r.abbreviation] = r.id;

    // Match DB games to Rotowire lineups by team abbreviation
    // DB games don't have team abbr directly - need to join via team IDs
    // Get game-to-team mapping
    const [gameTeams] = await conn.execute(`
      SELECT g.id, at.abbreviation as awayAbbr, ht.abbreviation as homeAbbr
      FROM games g
      JOIN mlb_teams at ON at.id = g.awayTeamId
      JOIN mlb_teams ht ON ht.id = g.homeTeamId
      WHERE DATE(g.gameDate) = '2026-04-03' AND g.sport = 'MLB'
    `);

    const gameTeamMap = {};
    for (const gt of gameTeams) {
      gameTeamMap[`${gt.awayAbbr}@${gt.homeAbbr}`] = gt.id;
    }

    console.log("\n[MAIN] Game-to-team mapping:");
    for (const [key, id] of Object.entries(gameTeamMap)) {
      console.log(`  ${key} → gameId=${id}`);
    }

    // Process each Rotowire lineup
    let updated = 0, kpropsRun = 0, kpropsErrors = 0;

    for (const lu of ROTOWIRE_LINEUPS) {
      const key = `${lu.awayAbbr}@${lu.homeAbbr}`;
      const gameId = gameTeamMap[key];

      if (!gameId) {
        console.warn(`[WARN] No DB game found for ${key}`);
        continue;
      }

      // Update game pitchers
      await updateGamePitchers(conn, gameId, lu.awayPitcher, lu.homePitcher);

      // Upsert lineup
      await upsertLineup(conn, gameId, lu);
      updated++;
      console.log(`[UPDATE] ${key} (gameId=${gameId}): ${lu.awayPitcher} vs ${lu.homePitcher} — lineup updated`);

      // Run K-Props
      const dbGame = dbGames.find(g => g.id === gameId);
      const jsonResult = runKProps(dbGame || { id: gameId }, lu, klines);

      if (jsonResult) {
        await writeKPropsToDb(conn, gameId, jsonResult);
        kpropsRun++;
        console.log(`[KPROPS] ✓ Written to DB: gameId=${gameId}`);
      } else {
        kpropsErrors++;
      }
    }

    console.log(`\n[MAIN] === SUMMARY ===`);
    console.log(`  Games updated: ${updated}/15`);
    console.log(`  K-Props run: ${kpropsRun}/15`);
    console.log(`  K-Props errors: ${kpropsErrors}`);

  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error("[FATAL]", err.message);
  process.exit(1);
});
