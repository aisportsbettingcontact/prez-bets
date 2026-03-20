/**
 * restore_bracket_games.mjs
 * Re-inserts all missing R64 and First Four bracket games with CORRECT data from NCAA.com 2026 bracket.
 *
 * Verified data from NCAA.com:
 * EAST:
 *   201: #1 Duke 71 vs #16 Siena 65 (FINAL - Duke won)
 *   202: #8 Ohio St 64 vs #9 TCU 66 (FINAL - TCU won)
 *   203: #5 St. John's vs #12 Northern Iowa (LIVE/upcoming)
 *   204: #4 Kansas vs #13 Cal Baptist (upcoming)
 *   205: #6 Louisville 83 vs #11 South Florida 79 (FINAL - Louisville won)
 *   206: #3 Michigan St 92 vs #14 North Dakota St 67 (FINAL - Michigan St won)
 *   207: #7 UCLA vs #10 UCF (LIVE)
 *   208: #2 UConn vs #15 Furman (upcoming)
 * SOUTH:
 *   209: #1 Florida vs #16 Prairie View A&M (upcoming)
 *   210: #8 Clemson vs #9 Iowa (LIVE)
 *   211: #5 Vanderbilt 78 vs #12 McNeese 68 (FINAL - Vanderbilt won)
 *   212: #4 Nebraska 76 vs #13 Troy 47 (FINAL - Nebraska won)
 *   213: #6 North Carolina 78 vs #11 VCU 82 (FINAL - VCU won)
 *   214: #3 Illinois 105 vs #14 Penn 70 (FINAL - Illinois won)
 *   215: #7 Saint Mary's 50 vs #10 Texas A&M 63 (FINAL - Texas A&M won)
 *   216: #2 Houston 78 vs #15 Idaho 47 (FINAL - Houston won)
 * WEST:
 *   217: #1 Arizona 92 vs #16 Long Island 58 (FINAL - Arizona won) [EXISTS]
 *   218: #8 Villanova 76 vs #9 Utah St 86 (FINAL - Utah St won) [EXISTS]
 *   219: #5 Wisconsin 82 vs #12 High Point 83 (FINAL - High Point won)
 *   220: #4 Arkansas 97 vs #13 Hawaii 78 (FINAL - Arkansas won)
 *   221: #6 BYU 71 vs #11 Texas 79 (FINAL - Texas won)
 *   222: #3 Gonzaga 73 vs #14 Kennesaw St 64 (FINAL - Gonzaga won)
 *   223: #7 Miami FL vs #10 Missouri (upcoming) [EXISTS]
 *   224: #2 Purdue vs #15 Queens NC (LIVE) [EXISTS]
 * MIDWEST:
 *   225: #1 Michigan 101 vs #16 Howard 80 (FINAL - Michigan won)
 *   226: #8 Georgia 77 vs #9 Saint Louis 102 (FINAL - Saint Louis won)
 *   227-232: all exist
 *
 * First Four:
 *   101: #16 UMBC 83 vs #16 Howard 86 (FINAL - Howard won -> plays 201 as #16 Siena? No - Howard won, but game 201 shows Siena. Siena must be the actual #16 seed, Howard was the First Four winner for a different slot)
 *   Actually: 101: UMBC vs Howard -> Howard won (86-83) -> Howard plays in game 201? But game 201 shows Siena...
 *   Re-reading: game 201 shows "1 Duke 71, 16 Siena 65" - so Siena is the #16 seed in EAST, not Howard.
 *   Howard won First Four 101 and plays in a different slot. Let me check:
 *   - EAST has games 201-208. Game 201 = Duke vs Siena. So Howard must feed into a different game.
 *   - Looking at First Four: 101=UMBC/Howard, 102=Texas/NC State, 103=Prairie View/Lehigh, 104=Miami OH/SMU
 *   - Howard won 101. Howard plays as #16 seed. EAST #16 slot = game 201 (Duke). But 201 shows Siena...
 *   - Actually Siena IS the First Four winner from game 101 (UMBC vs Howard)? No, Howard won 86-83.
 *   - Wait: NCAA shows "16 Siena 65" in game 201. But Howard won First Four. This means Howard IS Siena? No.
 *   - Most likely: game 101 feeds into MIDWEST game 225 (Michigan vs Howard - confirmed in NCAA data: "1 Michigan 101, 16 Howard 80")
 *   - And game 103 (Prairie View vs Lehigh) feeds into SOUTH game 209 (Florida vs Prairie View - confirmed: "1 Florida, 16 Prairie View A&M")
 *   - Game 104 (Miami OH vs SMU): Miami OH won (89-79). Miami OH plays as #11 in SOUTH game 213? But 213 shows VCU...
 *   - Actually game 104 Miami OH won -> feeds SOUTH game 213 as #11? But 213 shows VCU. 
 *   - Re-check: game 213 = "6 North Carolina 78, 11 VCU 82". So VCU is the #11 seed in SOUTH, not Miami OH.
 *   - Game 104 Miami OH won -> must feed into game 229 (Tennessee vs Miami OH) which EXISTS already.
 *   - So: 104 -> 229 (Miami OH is the #11 in MIDWEST/SOUTH game 229 "6 Tennessee 78, 11 Miami (Ohio) 56")
 *   - Game 102 Texas won (68-66 vs NC State) -> feeds WEST game 221 (BYU vs Texas - confirmed: "6 BYU 71, 11 Texas 79")
 *   - Game 101 Howard won -> feeds MIDWEST game 225 (Michigan vs Howard - confirmed)
 *   - Game 103 Prairie View won -> feeds SOUTH game 209 (Florida vs Prairie View - confirmed)
 *   - Game 104 Miami OH won -> feeds game 229 (Tennessee vs Miami OH - confirmed, EXISTS)
 */

import mysql from 'mysql2/promise';

const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 3 });

// DB slugs mapped from NCAA names
// Verified against NCAAM_TEAMS shared constant
const SLUG = {
  duke: 'duke',
  siena: 'siena',
  ohio_st: 'ohio_st',
  tcu: 'tcu',
  st_johns: 'st_johns',
  n_iowa: 'n_iowa',
  kansas: 'kansas',
  cal_baptist: 'california_baptist',
  louisville: 'louisville',
  south_florida: 's_florida',
  michigan_st: 'michigan_st',
  n_dakota_st: 'north_dakota_st',
  ucla: 'ucla',
  ucf: 'c_florida',
  uconn: 'connecticut',
  furman: 'furman',
  florida: 'florida',
  prairie_view: 'prairie_view_a_and_m',
  clemson: 'clemson',
  iowa: 'iowa',
  vanderbilt: 'vanderbilt',
  mcneese: 'mcneese_st',
  nebraska: 'nebraska',
  troy: 'troy',
  north_carolina: 'north_carolina',
  vcu: 'va_commonwealth',
  illinois: 'illinois',
  penn: 'pennsylvania',
  saint_marys: 'saint_marys',
  texas_am: 'texas_a_and_m',
  houston: 'houston',
  idaho: 'idaho',
  arizona: 'arizona',
  liu: 'liu_brooklyn',
  villanova: 'villanova',
  utah_st: 'utah_st',
  wisconsin: 'wisconsin',
  high_point: 'high_point',
  arkansas: 'arkansas',
  hawaii: 'hawaii',
  byu: 'brigham_young',
  texas: 'texas',
  gonzaga: 'gonzaga',
  kennesaw_st: 'kennesaw_st',
  miami_fl: 'miami_fl',
  missouri: 'missouri',
  purdue: 'purdue',
  queens_nc: 'queens_nc',
  michigan: 'michigan',
  howard: 'howard',
  georgia: 'georgia',
  saint_louis: 'saint_louis',
  umbc: 'umbc',
  nc_state: 'north_carolina_st',
  lehigh: 'lehigh',
  miami_oh: 'miami_oh',
  smu: 'smu',
};

const MISSING_GAMES = [
  // ─── EAST R64 ──────────────────────────────────────────────────────────────
  {
    bracketGameId: 201, bracketRegion: 'EAST', bracketRound: 'R64', bracketSlot: 1,
    awayTeam: SLUG.siena,    homeTeam: SLUG.duke,
    awaySeed: 16, homeSeed: 1,
    awayScore: 65, homeScore: 71, gameStatus: 'final',
    gameDate: '2026-03-20', startTimeEst: '12:15',
    nextBracketGameId: 301, nextBracketSlot: 'top',
  },
  {
    bracketGameId: 202, bracketRegion: 'EAST', bracketRound: 'R64', bracketSlot: 2,
    awayTeam: SLUG.ohio_st,  homeTeam: SLUG.tcu,
    awaySeed: 8, homeSeed: 9,
    awayScore: 64, homeScore: 66, gameStatus: 'final',
    gameDate: '2026-03-19', startTimeEst: '19:10',
    nextBracketGameId: 301, nextBracketSlot: 'bottom',
  },
  {
    bracketGameId: 205, bracketRegion: 'EAST', bracketRound: 'R64', bracketSlot: 5,
    awayTeam: SLUG.south_florida, homeTeam: SLUG.louisville,
    awaySeed: 11, homeSeed: 6,
    awayScore: 79, homeScore: 83, gameStatus: 'final',
    gameDate: '2026-03-20', startTimeEst: '14:45',
    nextBracketGameId: 303, nextBracketSlot: 'top',
  },
  {
    bracketGameId: 206, bracketRegion: 'EAST', bracketRound: 'R64', bracketSlot: 6,
    awayTeam: SLUG.n_dakota_st, homeTeam: SLUG.michigan_st,
    awaySeed: 14, homeSeed: 3,
    awayScore: 67, homeScore: 92, gameStatus: 'final',
    gameDate: '2026-03-21', startTimeEst: '09:10',
    nextBracketGameId: 303, nextBracketSlot: 'bottom',
  },

  // ─── SOUTH R64 ─────────────────────────────────────────────────────────────
  {
    bracketGameId: 211, bracketRegion: 'SOUTH', bracketRound: 'R64', bracketSlot: 3,
    awayTeam: SLUG.mcneese,  homeTeam: SLUG.vanderbilt,
    awaySeed: 12, homeSeed: 5,
    awayScore: 68, homeScore: 78, gameStatus: 'final',
    gameDate: '2026-03-20', startTimeEst: '13:30',
    nextBracketGameId: 306, nextBracketSlot: 'top',
  },
  {
    bracketGameId: 212, bracketRegion: 'SOUTH', bracketRound: 'R64', bracketSlot: 4,
    awayTeam: SLUG.troy,     homeTeam: SLUG.nebraska,
    awaySeed: 13, homeSeed: 4,
    awayScore: 47, homeScore: 76, gameStatus: 'final',
    gameDate: '2026-03-19', startTimeEst: '18:30',
    nextBracketGameId: 306, nextBracketSlot: 'bottom',
  },
  {
    bracketGameId: 213, bracketRegion: 'SOUTH', bracketRound: 'R64', bracketSlot: 5,
    awayTeam: SLUG.north_carolina, homeTeam: SLUG.vcu,
    awaySeed: 6, homeSeed: 11,
    awayScore: 78, homeScore: 82, gameStatus: 'final',
    gameDate: '2026-03-20', startTimeEst: '15:10',
    nextBracketGameId: 307, nextBracketSlot: 'top',
  },
  {
    bracketGameId: 214, bracketRegion: 'SOUTH', bracketRound: 'R64', bracketSlot: 6,
    awayTeam: SLUG.penn,     homeTeam: SLUG.illinois,
    awaySeed: 14, homeSeed: 3,
    awayScore: 70, homeScore: 105, gameStatus: 'final',
    gameDate: '2026-03-20', startTimeEst: '15:10',
    nextBracketGameId: 307, nextBracketSlot: 'bottom',
  },
  {
    bracketGameId: 215, bracketRegion: 'SOUTH', bracketRound: 'R64', bracketSlot: 7,
    awayTeam: SLUG.saint_marys, homeTeam: SLUG.texas_am,
    awaySeed: 7, homeSeed: 10,
    awayScore: 50, homeScore: 63, gameStatus: 'final',
    gameDate: '2026-03-20', startTimeEst: '17:20',
    nextBracketGameId: 308, nextBracketSlot: 'top',
  },
  {
    bracketGameId: 216, bracketRegion: 'SOUTH', bracketRound: 'R64', bracketSlot: 8,
    awayTeam: SLUG.idaho,    homeTeam: SLUG.houston,
    awaySeed: 15, homeSeed: 2,
    awayScore: 47, homeScore: 78, gameStatus: 'final',
    gameDate: '2026-03-20', startTimeEst: '17:20',
    nextBracketGameId: 308, nextBracketSlot: 'bottom',
  },

  // ─── WEST R64 ──────────────────────────────────────────────────────────────
  {
    bracketGameId: 219, bracketRegion: 'WEST', bracketRound: 'R64', bracketSlot: 3,
    awayTeam: SLUG.high_point, homeTeam: SLUG.wisconsin,
    awaySeed: 12, homeSeed: 5,
    awayScore: 83, homeScore: 82, gameStatus: 'final',
    gameDate: '2026-03-20', startTimeEst: '16:10',
    nextBracketGameId: 310, nextBracketSlot: 'top',
  },
  {
    bracketGameId: 220, bracketRegion: 'WEST', bracketRound: 'R64', bracketSlot: 4,
    awayTeam: SLUG.hawaii,   homeTeam: SLUG.arkansas,
    awaySeed: 13, homeSeed: 4,
    awayScore: 78, homeScore: 97, gameStatus: 'final',
    gameDate: '2026-03-20', startTimeEst: '18:45',
    nextBracketGameId: 310, nextBracketSlot: 'bottom',
  },
  {
    bracketGameId: 221, bracketRegion: 'WEST', bracketRound: 'R64', bracketSlot: 5,
    awayTeam: SLUG.byu,      homeTeam: SLUG.texas,
    awaySeed: 6, homeSeed: 11,
    awayScore: 71, homeScore: 79, gameStatus: 'final',
    gameDate: '2026-03-20', startTimeEst: '16:10',
    nextBracketGameId: 311, nextBracketSlot: 'top',
  },
  {
    bracketGameId: 222, bracketRegion: 'WEST', bracketRound: 'R64', bracketSlot: 6,
    awayTeam: SLUG.kennesaw_st, homeTeam: SLUG.gonzaga,
    awaySeed: 14, homeSeed: 3,
    awayScore: 64, homeScore: 73, gameStatus: 'final',
    gameDate: '2026-03-20', startTimeEst: '18:45',
    nextBracketGameId: 311, nextBracketSlot: 'bottom',
  },

  // ─── MIDWEST R64 ───────────────────────────────────────────────────────────
  {
    bracketGameId: 225, bracketRegion: 'MIDWEST', bracketRound: 'R64', bracketSlot: 1,
    awayTeam: SLUG.howard,   homeTeam: SLUG.michigan,
    awaySeed: 16, homeSeed: 1,
    awayScore: 80, homeScore: 101, gameStatus: 'final',
    gameDate: '2026-03-21', startTimeEst: '09:10',
    nextBracketGameId: 313, nextBracketSlot: 'top',
  },
  {
    bracketGameId: 226, bracketRegion: 'MIDWEST', bracketRound: 'R64', bracketSlot: 2,
    awayTeam: SLUG.georgia,  homeTeam: SLUG.saint_louis,
    awaySeed: 8, homeSeed: 9,
    awayScore: 77, homeScore: 102, gameStatus: 'final',
    gameDate: '2026-03-21', startTimeEst: '09:10',
    nextBracketGameId: 313, nextBracketSlot: 'bottom',
  },
];

const FIRST_FOUR_GAMES = [
  // 101: #16 UMBC 83 vs #16 Howard 86 -> Howard won -> plays in MIDWEST game 225
  {
    bracketGameId: 101, bracketRegion: 'MIDWEST', bracketRound: 'FIRST_FOUR', bracketSlot: 1,
    awayTeam: SLUG.umbc,    homeTeam: SLUG.howard,
    awaySeed: 16, homeSeed: 16,
    awayScore: 83, homeScore: 86, gameStatus: 'final',
    gameDate: '2026-03-18', startTimeEst: '18:40',
    nextBracketGameId: 225, nextBracketSlot: 'top',
  },
  // 102: #11 Texas 68 vs #11 NC State 66 -> Texas won -> plays in WEST game 221
  {
    bracketGameId: 102, bracketRegion: 'WEST', bracketRound: 'FIRST_FOUR', bracketSlot: 2,
    awayTeam: SLUG.texas,   homeTeam: SLUG.nc_state,
    awaySeed: 11, homeSeed: 11,
    awayScore: 68, homeScore: 66, gameStatus: 'final',
    gameDate: '2026-03-18', startTimeEst: '21:10',
    nextBracketGameId: 221, nextBracketSlot: 'top',
  },
  // 103: #16 Prairie View 67 vs #16 Lehigh 55 -> Prairie View won -> plays in SOUTH game 209
  {
    bracketGameId: 103, bracketRegion: 'SOUTH', bracketRound: 'FIRST_FOUR', bracketSlot: 3,
    awayTeam: SLUG.prairie_view, homeTeam: SLUG.lehigh,
    awaySeed: 16, homeSeed: 16,
    awayScore: 67, homeScore: 55, gameStatus: 'final',
    gameDate: '2026-03-18', startTimeEst: '18:40',
    nextBracketGameId: 209, nextBracketSlot: 'top',
  },
  // 104: #11 Miami OH 89 vs #11 SMU 79 -> Miami OH won -> plays in SOUTH game 229 (Tennessee vs Miami OH)
  {
    bracketGameId: 104, bracketRegion: 'SOUTH', bracketRound: 'FIRST_FOUR', bracketSlot: 4,
    awayTeam: SLUG.miami_oh, homeTeam: SLUG.smu,
    awaySeed: 11, homeSeed: 11,
    awayScore: 89, homeScore: 79, gameStatus: 'final',
    gameDate: '2026-03-18', startTimeEst: '21:10',
    nextBracketGameId: 229, nextBracketSlot: 'bottom',
  },
];

async function upsertGame(g) {
  const [existing] = await pool.query('SELECT id FROM games WHERE bracketGameId=?', [g.bracketGameId]);
  if (existing.length > 0) {
    // Update existing game with correct data
    await pool.query(`
      UPDATE games SET
        awayTeam=?, homeTeam=?, awayScore=?, homeScore=?, gameStatus=?,
        gameDate=?, startTimeEst=?, bracketRound=?, bracketRegion=?, bracketSlot=?,
        nextBracketGameId=?, nextBracketSlot=?
      WHERE bracketGameId=?
    `, [
      g.awayTeam, g.homeTeam, g.awayScore, g.homeScore, g.gameStatus,
      g.gameDate, g.startTimeEst, g.bracketRound, g.bracketRegion, g.bracketSlot,
      g.nextBracketGameId, g.nextBracketSlot,
      g.bracketGameId,
    ]);
    console.log(`[UPDATE] bgId=${g.bracketGameId} ${g.awayTeam}@${g.homeTeam} status=${g.gameStatus} score=${g.awayScore}-${g.homeScore}`);
    return;
  }

  await pool.query(`
    INSERT INTO games (
      fileId, gameDate, startTimeEst, awayTeam, homeTeam,
      sport, gameType, gameStatus, awayScore, homeScore,
      bracketGameId, bracketRound, bracketRegion, bracketSlot,
      nextBracketGameId, nextBracketSlot,
      publishedToFeed, sortOrder, createdAt
    ) VALUES (?, ?, ?, ?, ?, 'NCAAM', 'regular_season', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 9999, NOW())
  `, [
    0, g.gameDate, g.startTimeEst, g.awayTeam, g.homeTeam,
    g.gameStatus, g.awayScore, g.homeScore,
    g.bracketGameId, g.bracketRound, g.bracketRegion, g.bracketSlot,
    g.nextBracketGameId, g.nextBracketSlot,
  ]);
  console.log(`[INSERT] bgId=${g.bracketGameId} ${g.awayTeam}@${g.homeTeam} status=${g.gameStatus} score=${g.awayScore}-${g.homeScore}`);
}

console.log('=== Restoring missing R64 games (verified from NCAA.com) ===');
for (const g of MISSING_GAMES) {
  await upsertGame(g);
}

console.log('\n=== Restoring First Four games ===');
for (const g of FIRST_FOUR_GAMES) {
  await upsertGame(g);
}

// Fix R32 game 307: VCU won game 213, Illinois won game 214
// R32 game 307 should be VCU vs Illinois
const [r307] = await pool.query('SELECT awayTeam, homeTeam FROM games WHERE bracketGameId=307');
if (r307[0]) {
  console.log(`\nR32 game 307 current: ${r307[0].awayTeam}@${r307[0].homeTeam}`);
  if (r307[0].awayTeam !== 'va_commonwealth' || r307[0].homeTeam !== 'illinois') {
    await pool.query('UPDATE games SET awayTeam=?, homeTeam=? WHERE bracketGameId=307', ['va_commonwealth', 'illinois']);
    console.log('[FIX] R32 game 307 -> va_commonwealth@illinois (VCU won 213, Illinois won 214)');
  }
}

// Fix R32 game 308: Texas A&M won game 215, Houston won game 216
const [r308] = await pool.query('SELECT awayTeam, homeTeam FROM games WHERE bracketGameId=308');
if (r308[0]) {
  console.log(`R32 game 308 current: ${r308[0].awayTeam}@${r308[0].homeTeam}`);
  if (r308[0].awayTeam !== 'texas_a_and_m' || r308[0].homeTeam !== 'houston') {
    await pool.query('UPDATE games SET awayTeam=?, homeTeam=? WHERE bracketGameId=308', ['texas_a_and_m', 'houston']);
    console.log('[FIX] R32 game 308 -> texas_a_and_m@houston (TexAM won 215, Houston won 216)');
  }
}

// Fix R32 game 310: High Point won game 219, Arkansas won game 220
const [r310] = await pool.query('SELECT awayTeam, homeTeam FROM games WHERE bracketGameId=310');
if (r310[0]) {
  console.log(`R32 game 310 current: ${r310[0].awayTeam}@${r310[0].homeTeam}`);
  if (r310[0].awayTeam !== 'high_point' || r310[0].homeTeam !== 'arkansas') {
    await pool.query('UPDATE games SET awayTeam=?, homeTeam=? WHERE bracketGameId=310', ['high_point', 'arkansas']);
    console.log('[FIX] R32 game 310 -> high_point@arkansas (HighPoint won 219, Arkansas won 220)');
  }
}

// Fix R32 game 311: Texas won game 221, Gonzaga won game 222
const [r311] = await pool.query('SELECT awayTeam, homeTeam FROM games WHERE bracketGameId=311');
if (r311[0]) {
  console.log(`R32 game 311 current: ${r311[0].awayTeam}@${r311[0].homeTeam}`);
  if (r311[0].awayTeam !== 'texas' || r311[0].homeTeam !== 'gonzaga') {
    await pool.query('UPDATE games SET awayTeam=?, homeTeam=? WHERE bracketGameId=311', ['texas', 'gonzaga']);
    console.log('[FIX] R32 game 311 -> texas@gonzaga (Texas won 221, Gonzaga won 222)');
  }
}

// Fix R32 game 313: Michigan won game 225, Saint Louis won game 226
const [r313] = await pool.query('SELECT awayTeam, homeTeam FROM games WHERE bracketGameId=313');
if (r313[0]) {
  console.log(`R32 game 313 current: ${r313[0].awayTeam}@${r313[0].homeTeam}`);
  if (r313[0].awayTeam !== 'michigan' || r313[0].homeTeam !== 'saint_louis') {
    await pool.query('UPDATE games SET awayTeam=?, homeTeam=? WHERE bracketGameId=313', ['michigan', 'saint_louis']);
    console.log('[FIX] R32 game 313 -> michigan@saint_louis (Michigan won 225, SaintLouis won 226)');
  }
}

// Verify final state
const [all] = await pool.query(`
  SELECT bracketGameId, bracketRound, bracketRegion, bracketSlot, awayTeam, homeTeam, gameStatus, awayScore, homeScore
  FROM games WHERE bracketGameId IS NOT NULL ORDER BY bracketGameId ASC
`);
console.log(`\n=== Final bracket game count: ${all.length} ===`);
const byRound = {};
all.forEach(r => {
  const rnd = r.bracketRound || 'unknown';
  if (!byRound[rnd]) byRound[rnd] = 0;
  byRound[rnd]++;
});
Object.entries(byRound).forEach(([rnd, cnt]) => console.log(`  ${rnd}: ${cnt} games`));

console.log('\nAll bracket games:');
all.forEach(r => {
  const score = r.awayScore !== null ? `${r.awayScore}-${r.homeScore}` : 'no-score';
  console.log(`  bgId=${String(r.bracketGameId).padStart(3)} [${r.bracketRound}/${r.bracketRegion}/slot${r.bracketSlot}] ${r.awayTeam}@${r.homeTeam} ${r.gameStatus} ${score}`);
});

await pool.end();
console.log('\nDone.');
