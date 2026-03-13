// Debug script to check NBA slug matching between VSiN and DB
import * as cheerio from 'cheerio';
import mysql from 'mysql2/promise';

const VSIN_EMAIL = process.env.VSIN_EMAIL;
const VSIN_PASSWORD = process.env.VSIN_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;

// Login and fetch VSiN page
const loginResp = await fetch(
  "https://auth.vsin.com/id/api/v1/identity/login/token?aid=N1owYIiApu&lang=en_US",
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://auth.vsin.com", "Referer": "https://auth.vsin.com/id/", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({ password: VSIN_PASSWORD, remember: true, login: VSIN_EMAIL, loginType: "email" }),
  }
);
const { access_token: token } = await loginResp.json();

const pageResp = await fetch("https://data.vsin.com/nba/betting-splits/", {
  headers: {
    "Authorization": `Bearer ${token}`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Accept": "text/html",
    "Referer": "https://data.vsin.com/",
  }
});
const html = await pageResp.text();
const $ = cheerio.load(html);

// Extract today's games from VSiN
const vsinGames = [];
$("table.freezetable tr").each((_i, tr) => {
  const tds = $(tr).find("td").toArray();
  if (tds.length < 10) return;
  const teamAnchors = $(tds[0]).find('a.txt-color-vsinred[href*="/teams/"]').toArray().filter(a => $(a).closest(".collapse").length === 0);
  if (teamAnchors.length < 2) return;
  let gameId = null;
  $(tds[0]).find("[data-param2]").each((_j, el) => {
    if (!gameId && $(el).closest(".collapse").length === 0) gameId = $(el).attr("data-param2");
  });
  if (!gameId) return;
  const dateMatch = gameId.match(/^(\d{8})/);
  if (!dateMatch) return;
  const gameDate = dateMatch[1];
  if (!gameDate.startsWith('20260313')) return;
  
  const awayHref = $(teamAnchors[0]).attr("href") || "";
  const homeHref = $(teamAnchors[1]).attr("href") || "";
  const awayRaw = awayHref.split("/").pop()?.toLowerCase() || "";
  const homeRaw = homeHref.split("/").pop()?.toLowerCase() || "";
  const awaySlug = awayRaw.replace(/-/g, '_');
  const homeSlug = homeRaw.replace(/-/g, '_');
  
  const spreadAnchors = $(tds[1]).find('a').toArray().filter(a => $(a).closest('.collapse').length === 0);
  const spreadTexts = spreadAnchors.map(a => $(a).text().trim());
  
  vsinGames.push({ awaySlug, homeSlug, awayRaw, homeRaw, spread: spreadTexts.join('/'), gameDate });
});

console.log('\nVSiN games for 2026-03-13:');
vsinGames.forEach(g => console.log(`  ${g.awaySlug} @ ${g.homeSlug} | spread: ${g.spread}`));

// Get DB games
const conn = await mysql.createConnection(DATABASE_URL);
const [dbRows] = await conn.execute("SELECT awayTeam, homeTeam, awayBookSpread, homeBookSpread FROM games WHERE sport='NBA' AND gameDate='2026-03-13' ORDER BY id");
await conn.end();

console.log('\nDB games for 2026-03-13:');
dbRows.forEach(r => console.log(`  ${r.awayTeam} @ ${r.homeTeam} | spread: ${r.awayBookSpread}/${r.homeBookSpread}`));

console.log('\nMatching:');
vsinGames.forEach(g => {
  const match = dbRows.find(r => r.awayTeam === g.awaySlug && r.homeTeam === g.homeSlug);
  console.log(`  ${g.awaySlug} @ ${g.homeSlug} → ${match ? 'MATCH' : 'NO MATCH'}`);
});
