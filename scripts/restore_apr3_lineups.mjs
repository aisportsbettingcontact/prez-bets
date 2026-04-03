/**
 * restore_apr3_lineups.mjs
 * 
 * Restores correct April 3, 2026 MLB lineups from the saved Rotowire HTML.
 * The DB was overwritten by tomorrow's (April 4) scrape due to the cross-day bug.
 * This script parses the saved today HTML and upserts with targetDate='2026-04-03'.
 * 
 * Usage: node --import tsx/esm scripts/restore_apr3_lineups.mjs
 */

import * as cheerio from 'cheerio';
import { readFileSync } from 'fs';
import { getDb, upsertMlbLineup } from '../server/db.js';
import { games, mlbPlayers } from '../drizzle/schema.js';
import { eq, and } from 'drizzle-orm';

const TARGET_DATE = '2026-04-03';
const HTML_FILE = '/home/ubuntu/upload/pasted_content_16.txt';

console.log('[INPUT] Reading Rotowire HTML from:', HTML_FILE);
const html = readFileSync(HTML_FILE, 'utf-8');
console.log('[INPUT] HTML length:', html.length, 'chars');

const $ = cheerio.load(html);

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractRotowireId(href) {
  if (!href) return null;
  const oldFmt = href.match(/[?&]id=(\d+)/i);
  if (oldFmt) return parseInt(oldFmt[1], 10);
  const newFmt = href.match(/-(\d+)\s*$/);
  if (newFmt) return parseInt(newFmt[1], 10);
  return null;
}

function normalizePitcherHand(text) {
  const t = (text || '').trim().toUpperCase();
  if (t.includes('L')) return 'L';
  if (t.includes('R')) return 'R';
  return '?';
}

function parseWeatherText(rawText, isDome) {
  if (isDome || /dome|retractable|indoor|roof/i.test(rawText)) {
    return { icon: '🏟️', temp: 'Dome', wind: 'Indoor', precip: 0, dome: true };
  }
  const text = rawText.trim();
  const precipMatch = text.match(/(\d+)%/);
  const precip = precipMatch ? parseInt(precipMatch[1], 10) : 0;
  const tempMatch = text.match(/(\d+)\s*°/);
  const temp = tempMatch ? `${tempMatch[1]}°F` : '?°F';
  const windMatch = text.match(/Wind\s+(\d+)\s*mph(?:\s+(In|Out|L-R|R-L|Calm|N|S|E|W|NE|NW|SE|SW))?/i);
  let wind = 'Calm';
  if (windMatch) {
    const speed = windMatch[1];
    const dir = windMatch[2] ? ` ${windMatch[2]}` : '';
    wind = `${speed} mph${dir}`;
  }
  let icon = '⛅';
  if (precip >= 60) icon = '🌧️';
  else if (precip >= 30) icon = '⛅';
  else if (precip === 0) icon = /rain|drizzle/i.test(text) ? '🌧️' : /snow/i.test(text) ? '❄️' : /clear|sunny/i.test(text) ? '☀️' : '💨';
  return { icon, temp, wind, precip, dome: false };
}

const ROTO_ABBREV_OVERRIDES = { 'OAK': 'ATH', 'SAC': 'ATH' };
function normalizeAbbrev(raw) {
  const upper = (raw || '').trim().toUpperCase();
  return ROTO_ABBREV_OVERRIDES[upper] ?? upper;
}

// ── Parse HTML ────────────────────────────────────────────────────────────────

const cards = $('.lineup.is-mlb');
console.log(`[STEP] Found ${cards.length} .lineup.is-mlb cards`);

const parsedGames = [];

cards.each((i, cardEl) => {
  const $card = $(cardEl);
  
  // Team abbrevs
  const abbrevEls = $card.find('.lineup__abbr');
  const rawAway = abbrevEls.eq(0).text().trim();
  const rawHome = abbrevEls.eq(1).text().trim();
  const awayAbbrev = normalizeAbbrev(rawAway);
  const homeAbbrev = normalizeAbbrev(rawHome);
  
  if (!awayAbbrev || !homeAbbrev) return;
  
  // Start time
  const startTime = $card.find('.lineup__time').first().text().trim() || 'TBD';
  
  // Parse one column
  const parseColumn = ($col, side) => {
    let pitcher = null;
    const $highlight = $col.find('.lineup__player-highlight').first();
    if ($highlight.length) {
      const $link = $highlight.find('a').first();
      const pitcherName = ($link.attr('title') || $link.text()).trim();
      const rotowireId = extractRotowireId($link.attr('href'));
      const throwsRaw = $highlight.find('.lineup__throws').text().trim();
      const hand = normalizePitcherHand(throwsRaw || 'R');
      const statsRaw = $highlight.find('.lineup__stats').text().trim();
      const era = statsRaw.replace(/\s+/g, ' ').trim() || '0-0 · 0.00 ERA';
      const statusText = $col.find('.lineup__status').first().text().trim();
      const confirmed = /confirmed/i.test(statusText);
      if (pitcherName) {
        pitcher = { name: pitcherName, hand, era, rotowireId, confirmed };
      }
    }
    
    const lineup = [];
    const statusText = $col.find('.lineup__status').first().text().trim();
    const lineupConfirmed = /confirmed/i.test(statusText);
    
    $col.find('.lineup__player').each((j, playerEl) => {
      const battingOrder = j + 1;
      if (battingOrder > 9) return false;
      const $p = $(playerEl);
      const position = $p.find('.lineup__pos').text().trim() || '?';
      const $nameLink = $p.find('a').first();
      const name = ($nameLink.attr('title') || $nameLink.text()).trim();
      const rotowireId = extractRotowireId($nameLink.attr('href'));
      const bats = $p.find('.lineup__bats').text().trim() || '?';
      if (name) lineup.push({ battingOrder, position, name, bats, rotowireId });
    });
    
    return { pitcher, lineup, lineupConfirmed };
  };
  
  const awayData = parseColumn($card.find('.lineup__list.is-visit').first(), 'away');
  const homeData = parseColumn($card.find('.lineup__list.is-home').first(), 'home');
  
  // Weather
  let weather = null;
  const $bottom = $card.find('.lineup__bottom').first();
  if ($bottom.length) {
    const isDome = $bottom.find('.lineup__weather-icon--dome').length > 0 || /dome|retractable|roof/i.test($bottom.text());
    const weatherText = $bottom.find('.lineup__weather-text').text().trim();
    if (weatherText || isDome) weather = parseWeatherText(weatherText, isDome);
  }
  
  // Umpire
  let umpire = null;
  const umpireRaw = $bottom?.find('.lineup__umpire').text().trim() || '';
  if (umpireRaw) umpire = umpireRaw.replace(/^HP:\s*/i, '').trim() || null;
  
  parsedGames.push({ awayAbbrev, homeAbbrev, startTime, awayData, homeData, weather, umpire });
  
  console.log(
    `[STATE] Parsed ${awayAbbrev}@${homeAbbrev} | ${startTime} | ` +
    `awayP=${awayData.pitcher?.name ?? 'TBD'} (${awayData.pitcher?.hand ?? '?'}) | ` +
    `homeP=${homeData.pitcher?.name ?? 'TBD'} (${homeData.pitcher?.hand ?? '?'}) | ` +
    `awayLineup=${awayData.lineup.length}/9 | homeLineup=${homeData.lineup.length}/9`
  );
});

console.log(`[STEP] Parsed ${parsedGames.length} games from HTML`);

// ── DB Upsert ─────────────────────────────────────────────────────────────────

const db = await getDb();
if (!db) throw new Error('DB not available');

// Load player name → mlbamId map
const playerRows = await db.select({ name: mlbPlayers.name, mlbamId: mlbPlayers.mlbamId })
  .from(mlbPlayers)
  .where(eq(mlbPlayers.isActive, true));

const normalize = (s) =>
  s.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(jr\.?|sr\.?|ii|iii|iv)\b/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const nameToMlbamId = new Map();
for (const p of playerRows) {
  if (p.mlbamId != null) nameToMlbamId.set(normalize(p.name), p.mlbamId);
}
console.log(`[STEP] Loaded ${nameToMlbamId.size} active players for mlbamId lookup`);

const resolveMlbamId = (name) => name ? (nameToMlbamId.get(normalize(name)) ?? null) : null;

let saved = 0, skipped = 0, errors = 0;

for (const g of parsedGames) {
  const gameTag = `[${g.awayAbbrev}@${g.homeAbbrev}]`;
  try {
    // Exact date match for April 3 only
    const rows = await db.select({ id: games.id })
      .from(games)
      .where(and(
        eq(games.awayTeam, g.awayAbbrev),
        eq(games.homeTeam, g.homeAbbrev),
        eq(games.sport, 'MLB'),
        eq(games.gameDate, TARGET_DATE)
      ))
      .limit(1);
    
    if (rows.length === 0) {
      console.log(`${gameTag} NO_MATCH in DB for ${TARGET_DATE} — skipping`);
      skipped++;
      continue;
    }
    
    const gameId = rows[0].id;
    
    const enrichLineup = (players) => {
      if (players.length === 0) return null;
      return JSON.stringify(players.map(p => ({ ...p, mlbamId: resolveMlbamId(p.name) })));
    };
    
    const payload = {
      gameId,
      scrapedAt: Date.now(),
      awayPitcherName: g.awayData.pitcher?.name ?? null,
      awayPitcherHand: g.awayData.pitcher?.hand ?? null,
      awayPitcherEra: g.awayData.pitcher?.era ?? null,
      awayPitcherRotowireId: g.awayData.pitcher?.rotowireId ?? null,
      awayPitcherMlbamId: resolveMlbamId(g.awayData.pitcher?.name),
      awayPitcherConfirmed: g.awayData.pitcher?.confirmed ?? false,
      homePitcherName: g.homeData.pitcher?.name ?? null,
      homePitcherHand: g.homeData.pitcher?.hand ?? null,
      homePitcherEra: g.homeData.pitcher?.era ?? null,
      homePitcherRotowireId: g.homeData.pitcher?.rotowireId ?? null,
      homePitcherMlbamId: resolveMlbamId(g.homeData.pitcher?.name),
      homePitcherConfirmed: g.homeData.pitcher?.confirmed ?? false,
      awayLineup: enrichLineup(g.awayData.lineup),
      homeLineup: enrichLineup(g.homeData.lineup),
      awayLineupConfirmed: g.awayData.lineupConfirmed,
      homeLineupConfirmed: g.homeData.lineupConfirmed,
      weatherIcon: g.weather?.icon ?? null,
      weatherTemp: g.weather?.temp ?? null,
      weatherWind: g.weather?.wind ?? null,
      weatherPrecip: g.weather?.precip ?? null,
      weatherDome: g.weather?.dome ?? false,
      umpire: g.umpire ?? null,
    };
    
    await upsertMlbLineup(payload);
    saved++;
    
    console.log(
      `[OUTPUT] ${gameTag} SAVED gameId=${gameId} | ` +
      `awayP="${payload.awayPitcherName ?? 'TBD'}" (${payload.awayPitcherHand ?? '?'}) | ` +
      `homeP="${payload.homePitcherName ?? 'TBD'}" (${payload.homePitcherHand ?? '?'}) | ` +
      `awayLineup=${g.awayData.lineup.length}/9 (${g.awayData.lineupConfirmed ? 'CONFIRMED' : 'expected'}) | ` +
      `homeLineup=${g.homeData.lineup.length}/9 (${g.homeData.lineupConfirmed ? 'CONFIRMED' : 'expected'}) | ` +
      `weather=${payload.weatherIcon ?? 'none'} ${payload.weatherTemp ?? ''}`
    );
  } catch (err) {
    console.error(`${gameTag} ERROR: ${err.message}`);
    errors++;
  }
}

console.log(`\n[OUTPUT] Done — saved=${saved} skipped=${skipped} errors=${errors}`);
console.log('[VERIFY]', saved >= 14 ? '✅ PASS — All April 3 games restored' : `❌ FAIL — Only ${saved}/14 games restored`);
process.exit(0);
