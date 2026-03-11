/**
 * Deep Pipeline Audit Script
 * Cross-references: DB games, VSiN source HTML, NCAA scoreboard API, NBA schedule API
 * Prints detailed print statements for every mismatch found.
 */
import mysql from 'mysql2/promise';
import https from 'https';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

// ─── DB helpers ──────────────────────────────────────────────────────────────
async function getDb() {
  const url = new URL(DB_URL);
  return mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port || '3306'),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
  });
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────
function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.nba.com/',
        ...headers,
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ─── NCAA Scoreboard ──────────────────────────────────────────────────────────
async function fetchNcaaGames(yyyymmdd) {
  const url = `https://data.ncaa.com/casablanca/scoreboard/basketball-men/d1/${yyyymmdd.slice(0,4)}/${yyyymmdd.slice(4,6)}/${yyyymmdd.slice(6,8)}/scoreboard.json`;
  try {
    const { status, body } = await fetchUrl(url);
    if (status !== 200) return [];
    const json = JSON.parse(body);
    const games = json?.games ?? [];
    return games.map(g => {
      const game = g.game;
      const away = game?.away;
      const home = game?.home;
      return {
        contestId: game?.contestId ?? '',
        awaySeoname: away?.nameSeo ?? '',
        homeSeoname: home?.nameSeo ?? '',
        awayName: away?.names?.short ?? '',
        homeName: home?.names?.short ?? '',
        awayScore: away?.score ? parseInt(away.score) : null,
        homeScore: home?.score ? parseInt(home.score) : null,
        gameState: game?.gameState ?? 'pre',
        startTime: game?.startTime ?? '',
      };
    }).filter(g => g.contestId);
  } catch (e) {
    console.error(`NCAA fetch error for ${yyyymmdd}:`, e.message);
    return [];
  }
}

// ─── NBA Live Scoreboard ──────────────────────────────────────────────────────
async function fetchNbaLive() {
  const url = 'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json';
  try {
    const { status, body } = await fetchUrl(url);
    if (status !== 200) return [];
    const json = JSON.parse(body);
    return json?.scoreboard?.games ?? [];
  } catch (e) {
    console.error('NBA live fetch error:', e.message);
    return [];
  }
}

// ─── VSiN NCAAM page ──────────────────────────────────────────────────────────
async function fetchVsinNcaam() {
  const url = 'https://data.vsin.com/college-basketball/betting-splits/';
  try {
    const { status, body } = await fetchUrl(url, {
      'Accept': 'text/html,application/xhtml+xml',
      'Referer': 'https://data.vsin.com/',
    });
    if (status !== 200) return null;
    return body;
  } catch (e) {
    console.error('VSiN NCAAM fetch error:', e.message);
    return null;
  }
}

// ─── VSiN NBA page ────────────────────────────────────────────────────────────
async function fetchVsinNba() {
  const url = 'https://data.vsin.com/nba/betting-splits/';
  try {
    const { status, body } = await fetchUrl(url, {
      'Accept': 'text/html,application/xhtml+xml',
      'Referer': 'https://data.vsin.com/',
    });
    if (status !== 200) return null;
    return body;
  } catch (e) {
    console.error('VSiN NBA fetch error:', e.message);
    return null;
  }
}

// ─── Parse VSiN HTML for game rows ───────────────────────────────────────────
function parseVsinGames(html, sport) {
  if (!html) return [];
  // Extract team slugs from href="/college-basketball/teams/SLUG" or "/nba/teams/SLUG"
  const path = sport === 'NCAAM' ? 'college-basketball' : 'nba';
  const teamPattern = new RegExp(`href="/${path}/teams/([^"]+)"[^>]*>([^<]+)<`, 'g');
  const teams = [];
  let m;
  while ((m = teamPattern.exec(html)) !== null) {
    teams.push({ slug: m[1].trim(), name: m[2].trim() });
  }
  
  // Extract spreads from DraftKings links
  const spreadPattern = /href="https:\/\/sportsbook\.draftkings[^"]*"[^>]*>([+-]?\d+\.?\d*)<\/a>/g;
  const allOdds = [];
  while ((m = spreadPattern.exec(html)) !== null) {
    allOdds.push(m[1]);
  }
  
  // Extract ticket percentages
  const ticketPattern = /box_highlight_even1[^>]*>(\d+)%/g;
  const tickets = [];
  while ((m = ticketPattern.exec(html)) !== null) {
    tickets.push(parseInt(m[1]));
  }
  
  console.log(`\n[VSiN-${sport}] Teams found: ${teams.length}, Odds values: ${allOdds.length}, Ticket%: ${tickets.length}`);
  
  // Pair teams into games (every 2 teams = 1 game)
  const games = [];
  for (let i = 0; i + 1 < teams.length; i += 2) {
    games.push({
      awaySlug: teams[i].slug,
      awayName: teams[i].name,
      homeSlug: teams[i+1].slug,
      homeName: teams[i+1].name,
    });
  }
  return games;
}

// ─── Main audit ───────────────────────────────────────────────────────────────
async function main() {
  const today = new Date();
  const pstOffset = -8 * 60; // PST = UTC-8
  const pstDate = new Date(today.getTime() + pstOffset * 60000);
  const todayStr = pstDate.toISOString().slice(0, 10);
  const yyyymmdd = todayStr.replace(/-/g, '');
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`DEEP PIPELINE AUDIT — ${todayStr} (PST)`);
  console.log(`${'='.repeat(80)}\n`);

  const db = await getDb();

  // ─── 1. DB State ─────────────────────────────────────────────────────────
  const [ncaamRows] = await db.execute(
    `SELECT id, awayTeam, homeTeam, awayBookSpread, homeBookSpread, bookTotal, 
            awayML, homeML, spreadAwayBetsPct, spreadAwayMoneyPct,
            totalOverBetsPct, totalOverMoneyPct, mlAwayBetsPct, mlAwayMoneyPct,
            gameStatus, awayScore, homeScore, gameClock, startTimeEst, ncaaContestId
     FROM games WHERE gameDate = ? AND sport = 'NCAAM' ORDER BY sortOrder, id`,
    [todayStr]
  );
  const [nbaRows] = await db.execute(
    `SELECT id, awayTeam, homeTeam, awayBookSpread, homeBookSpread, bookTotal,
            awayML, homeML, spreadAwayBetsPct, spreadAwayMoneyPct,
            totalOverBetsPct, totalOverMoneyPct, mlAwayBetsPct, mlAwayMoneyPct,
            gameStatus, awayScore, homeScore, gameClock, startTimeEst
     FROM games WHERE gameDate = ? AND sport = 'NBA' ORDER BY sortOrder, id`,
    [todayStr]
  );

  console.log(`[DB] NCAAM games today: ${ncaamRows.length}`);
  console.log(`[DB] NBA games today: ${nbaRows.length}`);

  const ncaamWithOdds = ncaamRows.filter(g => g.awayBookSpread !== null);
  const ncaamWithSplits = ncaamRows.filter(g => g.spreadAwayBetsPct !== null);
  const nbaWithOdds = nbaRows.filter(g => g.awayBookSpread !== null);
  const nbaWithSplits = nbaRows.filter(g => g.spreadAwayBetsPct !== null);

  console.log(`[DB] NCAAM with odds: ${ncaamWithOdds.length}/${ncaamRows.length}`);
  console.log(`[DB] NCAAM with splits: ${ncaamWithSplits.length}/${ncaamRows.length}`);
  console.log(`[DB] NBA with odds: ${nbaWithOdds.length}/${nbaRows.length}`);
  console.log(`[DB] NBA with splits: ${nbaWithSplits.length}/${nbaRows.length}`);

  // ─── 2. Games WITHOUT odds (should have them) ─────────────────────────────
  const ncaamMissingOdds = ncaamRows.filter(g => g.awayBookSpread === null);
  if (ncaamMissingOdds.length > 0) {
    console.log(`\n[AUDIT][NCAAM] ⚠️  ${ncaamMissingOdds.length} games MISSING ODDS:`);
    for (const g of ncaamMissingOdds) {
      console.log(`  id=${g.id} | ${g.awayTeam} @ ${g.homeTeam} | status=${g.gameStatus} | start=${g.startTimeEst}`);
    }
  } else {
    console.log(`\n[AUDIT][NCAAM] ✅ All ${ncaamRows.length} games have odds`);
  }

  const nbaMissingOdds = nbaRows.filter(g => g.awayBookSpread === null);
  if (nbaMissingOdds.length > 0) {
    console.log(`\n[AUDIT][NBA] ⚠️  ${nbaMissingOdds.length} games MISSING ODDS:`);
    for (const g of nbaMissingOdds) {
      console.log(`  id=${g.id} | ${g.awayTeam} @ ${g.homeTeam} | status=${g.gameStatus} | start=${g.startTimeEst}`);
    }
  } else {
    console.log(`[AUDIT][NBA] ✅ All ${nbaRows.length} games have odds`);
  }

  // ─── 3. Games WITHOUT splits ──────────────────────────────────────────────
  const ncaamMissingSplits = ncaamRows.filter(g => g.awayBookSpread !== null && g.spreadAwayBetsPct === null);
  if (ncaamMissingSplits.length > 0) {
    console.log(`\n[AUDIT][NCAAM] ⚠️  ${ncaamMissingSplits.length} games have odds but MISSING SPLITS:`);
    for (const g of ncaamMissingSplits) {
      console.log(`  id=${g.id} | ${g.awayTeam} @ ${g.homeTeam} | spread=${g.awayBookSpread}/${g.homeBookSpread} | total=${g.bookTotal}`);
    }
  } else {
    console.log(`[AUDIT][NCAAM] ✅ All games with odds also have splits`);
  }

  const nbaMissingSplits = nbaRows.filter(g => g.awayBookSpread !== null && g.spreadAwayBetsPct === null);
  if (nbaMissingSplits.length > 0) {
    console.log(`\n[AUDIT][NBA] ⚠️  ${nbaMissingSplits.length} games have odds but MISSING SPLITS:`);
    for (const g of nbaMissingSplits) {
      console.log(`  id=${g.id} | ${g.awayTeam} @ ${g.homeTeam} | spread=${g.awayBookSpread}/${g.homeBookSpread}`);
    }
  } else {
    console.log(`[AUDIT][NBA] ✅ All games with odds also have splits`);
  }

  // ─── 4. Duplicate detection ───────────────────────────────────────────────
  const ncaamSeen = new Map();
  for (const g of ncaamRows) {
    const key1 = `${g.awayTeam}@${g.homeTeam}`;
    const key2 = `${g.homeTeam}@${g.awayTeam}`;
    if (ncaamSeen.has(key1) || ncaamSeen.has(key2)) {
      console.log(`\n[AUDIT][NCAAM] 🔴 DUPLICATE: ${g.awayTeam} @ ${g.homeTeam} (id=${g.id} vs id=${ncaamSeen.get(key1) ?? ncaamSeen.get(key2)})`);
    }
    ncaamSeen.set(key1, g.id);
  }

  // ─── 5. NCAA Scoreboard cross-reference ───────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[NCAA-API] Fetching scoreboard for ${yyyymmdd}...`);
  const ncaaApiGames = await fetchNcaaGames(yyyymmdd);
  console.log(`[NCAA-API] Found ${ncaaApiGames.length} games`);

  // Check for DB games not in NCAA API
  let ncaaMatchCount = 0;
  for (const dbGame of ncaamRows) {
    const match = ncaaApiGames.find(g => 
      (g.awaySeoname === dbGame.awayTeam && g.homeSeoname === dbGame.homeTeam) ||
      (g.awaySeoname === dbGame.homeTeam && g.homeSeoname === dbGame.awayTeam) ||
      g.contestId === dbGame.ncaaContestId
    );
    if (match) {
      ncaaMatchCount++;
      // Check for score/status mismatch
      if (match.awayScore !== null && dbGame.awayScore !== match.awayScore) {
        console.log(`[AUDIT][NCAAM] ⚠️  SCORE MISMATCH: ${dbGame.awayTeam}@${dbGame.homeTeam} | DB=${dbGame.awayScore}-${dbGame.homeScore} | NCAA=${match.awayScore}-${match.homeScore}`);
      }
    } else {
      if (dbGame.gameStatus !== 'final') {
        console.log(`[AUDIT][NCAAM] ℹ️  DB game NOT in NCAA API: ${dbGame.awayTeam}@${dbGame.homeTeam} (id=${dbGame.id}, status=${dbGame.gameStatus})`);
      }
    }
  }
  console.log(`[NCAA-API] Matched ${ncaaMatchCount}/${ncaamRows.length} DB games to NCAA API`);

  // ─── 6. NBA Live Scoreboard cross-reference ───────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[NBA-API] Fetching live scoreboard...`);
  const nbaLiveGames = await fetchNbaLive();
  console.log(`[NBA-API] Found ${nbaLiveGames.length} games`);

  for (const liveGame of nbaLiveGames) {
    const awayId = liveGame.awayTeam?.teamId;
    const homeId = liveGame.homeTeam?.teamId;
    const awayAbbr = liveGame.awayTeam?.teamTricode ?? '';
    const homeAbbr = liveGame.homeTeam?.teamTricode ?? '';
    const status = liveGame.gameStatus;
    const awayScore = liveGame.awayTeam?.score;
    const homeScore = liveGame.homeTeam?.score;
    console.log(`  NBA Live: ${awayAbbr}(${awayId}) @ ${homeAbbr}(${homeId}) | status=${status} | score=${awayScore}-${homeScore}`);
  }

  // ─── 7. Full NCAAM DB dump ────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[DB-DUMP][NCAAM] All ${ncaamRows.length} games for ${todayStr}:`);
  for (const g of ncaamRows) {
    const oddsStr = g.awayBookSpread ? `spread=${g.awayBookSpread}/${g.homeBookSpread} total=${g.bookTotal} ml=${g.awayML}/${g.homeML}` : 'NO_ODDS';
    const splitsStr = g.spreadAwayBetsPct !== null ? `splits=T${g.spreadAwayBetsPct}%/M${g.spreadAwayMoneyPct}%` : 'NO_SPLITS';
    const scoreStr = g.awayScore !== null ? `score=${g.awayScore}-${g.homeScore} [${g.gameClock}]` : '';
    console.log(`  id=${String(g.id).padStart(7)} | ${g.awayTeam.padEnd(25)} @ ${g.homeTeam.padEnd(25)} | ${g.gameStatus.padEnd(8)} | ${oddsStr} | ${splitsStr} ${scoreStr}`);
  }

  // ─── 8. Full NBA DB dump ──────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[DB-DUMP][NBA] All ${nbaRows.length} games for ${todayStr}:`);
  for (const g of nbaRows) {
    const oddsStr = g.awayBookSpread ? `spread=${g.awayBookSpread}/${g.homeBookSpread} total=${g.bookTotal} ml=${g.awayML}/${g.homeML}` : 'NO_ODDS';
    const splitsStr = g.spreadAwayBetsPct !== null ? `splits=T${g.spreadAwayBetsPct}%/M${g.spreadAwayMoneyPct}%` : 'NO_SPLITS';
    const scoreStr = g.awayScore !== null ? `score=${g.awayScore}-${g.homeScore} [${g.gameClock}]` : '';
    console.log(`  id=${String(g.id).padStart(7)} | ${g.awayTeam.padEnd(20)} @ ${g.homeTeam.padEnd(20)} | ${g.gameStatus.padEnd(8)} | ${oddsStr} | ${splitsStr} ${scoreStr}`);
  }

  await db.end();
  console.log(`\n${'='.repeat(80)}`);
  console.log(`AUDIT COMPLETE`);
  console.log(`${'='.repeat(80)}\n`);
}

main().catch(e => { console.error('AUDIT FAILED:', e); process.exit(1); });
