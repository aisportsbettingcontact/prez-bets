/**
 * Directly runs the MetaBet odds update for today's NBA and NHL games,
 * then publishes them to the feed.
 */
import { config } from 'dotenv';
config();

import mysql from 'mysql2/promise';

const METABET_API_KEY = "219f64094f67ed781035f5f7a08840fc";
const METABET_BASE = "https://metabet.static.api.areyouwatchingthis.com/api/odds.json";

function decimalToAmerican(d) {
  if (d == null || isNaN(d) || d <= 1) return null;
  if (d >= 2.0) return `+${Math.round((d - 1) * 100)}`;
  return `${Math.round(-100 / (d - 1))}`;
}

function roundToHalf(v) {
  if (v == null || isNaN(v)) return null;
  return Math.round(v * 2) / 2;
}

async function fetchOdds(leagueCode) {
  const url = `${METABET_BASE}?apiKey=${METABET_API_KEY}&includeDonBestData&leagueCode=${leagueCode}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://vsin.com/',
      'Origin': 'https://vsin.com',
    }
  });
  const data = await resp.json();
  return data.results || [];
}

function getTodayPst() {
  const now = new Date();
  const str = now.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const [mm, dd, yyyy] = str.split("/");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeToSlug(s) {
  return s.toLowerCase().replace(/-/g, " ").replace(/[^a-z0-9\s]/g, "").trim().replace(/\s+/g, "_");
}

const todayStr = getTodayPst();
console.log(`Today (PST): ${todayStr}`);

const todayStart = new Date(todayStr + "T00:00:00-08:00").getTime();
const tomorrowStart = todayStart + 86400000;

// Connect to DB
const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 5 });

// NBA team slug overrides (MetaBet city+name → DB slug)
const NBA_SLUG_OVERRIDES = {
  'los_angeles_clippers': 'los_angeles_clippers',
  'la_clippers': 'los_angeles_clippers',
  'los_angeles_lakers': 'los_angeles_lakers',
  'la_lakers': 'los_angeles_lakers',
  'golden_state_warriors': 'golden_state_warriors',
  'golden_state': 'golden_state_warriors',
  'new_york_knicks': 'new_york_knicks',
  'new_york': 'new_york_knicks',
  'oklahoma_city_thunder': 'oklahoma_city_thunder',
  'oklahoma_city': 'oklahoma_city_thunder',
  'san_antonio_spurs': 'san_antonio_spurs',
  'san_antonio': 'san_antonio_spurs',
  'utah_jazz': 'utah_jazz',
  'utah': 'utah_jazz',
  'memphis_grizzlies': 'memphis_grizzlies',
  'memphis': 'memphis_grizzlies',
};

// NHL team abbreviation → DB slug
const NHL_ABBREV_MAP = {
  'LAK': 'los_angeles_kings',
  'NYI': 'new_york_islanders',
  'EDM': 'edmonton_oilers',
  'STL': 'st_louis_blues',
  'BOS': 'boston_bruins',
  'TOR': 'toronto_maple_leafs',
  'MTL': 'montreal_canadiens',
  'CHI': 'chicago_blackhawks',
  'DET': 'detroit_red_wings',
  'NYR': 'new_york_rangers',
  'PHI': 'philadelphia_flyers',
  'PIT': 'pittsburgh_penguins',
  'WSH': 'washington_capitals',
  'CAR': 'carolina_hurricanes',
  'FLA': 'florida_panthers',
  'TBL': 'tampa_bay_lightning',
  'TB': 'tampa_bay_lightning',
  'OTT': 'ottawa_senators',
  'BUF': 'buffalo_sabres',
  'CBJ': 'columbus_blue_jackets',
  'NJD': 'new_jersey_devils',
  'NJ': 'new_jersey_devils',
  'MIN': 'minnesota_wild',
  'COL': 'colorado_avalanche',
  'DAL': 'dallas_stars',
  'NSH': 'nashville_predators',
  'WPG': 'winnipeg_jets',
  'ARI': 'arizona_coyotes',
  'UTA': 'utah_mammoth',
  'VGK': 'vegas_golden_knights',
  'VGS': 'vegas_golden_knights',
  'SEA': 'seattle_kraken',
  'ANA': 'anaheim_ducks',
  'SJS': 'san_jose_sharks',
  'SJ': 'san_jose_sharks',
  'CGY': 'calgary_flames',
  'VAN': 'vancouver_canucks',
};

for (const [leagueCode, sport] of [['BKP', 'NBA'], ['HKN', 'NHL']]) {
  console.log(`\n=== ${sport} (${leagueCode}) ===`);
  const results = await fetchOdds(leagueCode);
  const todayGames = results.filter(g => g.date >= todayStart && g.date < tomorrowStart);
  console.log(`Today's games: ${todayGames.length}`);

  // Get existing DB games for today
  const [dbRows] = await pool.execute(
    `SELECT id, awayTeam, homeTeam, awayBookSpread, bookTotal, awayML FROM games WHERE sport=? AND gameDate=?`,
    [sport, todayStr]
  );
  console.log(`DB games for today: ${dbRows.length}`);

  for (const game of todayGames) {
    const dk = game.odds?.find(o => o.provider === 'DRAFTKINGS');
    const consensus = game.odds?.find(o => o.provider === 'CONSENSUS');
    const src = dk || consensus;
    if (!src) continue;

    const awaySpread = roundToHalf(src.spread);
    const homeSpread = awaySpread != null ? roundToHalf(-awaySpread) : null;
    const total = roundToHalf(src.overUnder);
    const awaySpreadOdds = decimalToAmerican(src.spreadLine1);
    const homeSpreadOdds = decimalToAmerican(src.spreadLine2);
    const overOdds = decimalToAmerican(src.overUnderLineOver);
    const underOdds = decimalToAmerican(src.overUnderLineUnder);
    const awayML = decimalToAmerican(src.moneyLine1);
    const homeML = decimalToAmerican(src.moneyLine2);

    let dbGame = null;

    if (sport === 'NHL') {
      const awaySlug = NHL_ABBREV_MAP[game.team1Initials];
      const homeSlug = NHL_ABBREV_MAP[game.team2Initials];
      if (awaySlug && homeSlug) {
        dbGame = dbRows.find(r => r.awayTeam === awaySlug && r.homeTeam === homeSlug);
      }
    } else {
      // NBA: match by city+name
      const awayKey = normalizeToSlug(`${game.team1City} ${game.team1Name || ''}`);
      const homeKey = normalizeToSlug(`${game.team2City} ${game.team2Name || ''}`);
      const awaySlug = NBA_SLUG_OVERRIDES[awayKey] || awayKey;
      const homeSlug = NBA_SLUG_OVERRIDES[homeKey] || homeKey;
      dbGame = dbRows.find(r => r.awayTeam === awaySlug && r.homeTeam === homeSlug);
      if (!dbGame) {
        // Try direct key match
        dbGame = dbRows.find(r => r.awayTeam === awayKey && r.homeTeam === homeKey);
      }
    }

    const awayName = `${game.team1City} ${game.team1Name || game.team1Nickname || ''}`;
    const homeName = `${game.team2City} ${game.team2Name || game.team2Nickname || ''}`;

    if (!dbGame) {
      console.log(`  NO_MATCH: ${awayName} @ ${homeName}`);
      continue;
    }

    // Update the DB game with MetaBet odds
    const updates = [];
    const params = [];

    if (dbGame.awayBookSpread == null && awaySpread != null) {
      updates.push('awayBookSpread=?', 'homeBookSpread=?');
      params.push(String(awaySpread), String(homeSpread));
    }
    if (dbGame.bookTotal == null && total != null) {
      updates.push('bookTotal=?');
      params.push(String(total));
    }
    if (dbGame.awayML == null && awayML != null) {
      updates.push('awayML=?', 'homeML=?');
      params.push(awayML, homeML);
    }
    updates.push('awaySpreadOdds=?', 'homeSpreadOdds=?', 'overOdds=?', 'underOdds=?');
    params.push(awaySpreadOdds, homeSpreadOdds, overOdds, underOdds);

    params.push(dbGame.id);
    await pool.execute(`UPDATE games SET ${updates.join(', ')} WHERE id=?`, params);
    console.log(`  UPDATED: ${awayName} @ ${homeName} (id=${dbGame.id})`);
    console.log(`    spread: ${awaySpread}/${homeSpread} (${awaySpreadOdds}/${homeSpreadOdds})`);
    console.log(`    total: ${total} (o:${overOdds} u:${underOdds})`);
    console.log(`    ML: ${awayML}/${homeML}`);
  }
}

await pool.end();
console.log('\nDone!');
