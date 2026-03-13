/**
 * Manually triggers the MetaBet odds update for today's NBA and NHL games.
 * Run with: node trigger-metabet-update.mjs
 */
import { config } from 'dotenv';
config();

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

// Get today's date in PST
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

const todayStr = getTodayPst();
console.log(`Today (PST): ${todayStr}`);

// Filter to today's games
const todayStart = new Date(todayStr + "T00:00:00-08:00").getTime();
const tomorrowStart = todayStart + 86400000;

for (const [leagueCode, sport] of [['BKP', 'NBA'], ['HKN', 'NHL']]) {
  console.log(`\n=== ${sport} (${leagueCode}) ===`);
  const results = await fetchOdds(leagueCode);
  const todayGames = results.filter(g => g.date >= todayStart && g.date < tomorrowStart);
  console.log(`Total from API: ${results.length}, Today: ${todayGames.length}`);
  
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
    
    const awayName = game.team1City + ' ' + (game.team1Name || game.team1Nickname || '');
    const homeName = game.team2City + ' ' + (game.team2Name || game.team2Nickname || '');
    console.log(`  ${awayName} (${game.team1Initials}) @ ${homeName} (${game.team2Initials})`);
    console.log(`    spread: ${awaySpread}/${homeSpread} (${awaySpreadOdds}/${homeSpreadOdds})`);
    console.log(`    total: ${total} (o:${overOdds} u:${underOdds})`);
    console.log(`    ML: ${awayML}/${homeML}`);
  }
}
