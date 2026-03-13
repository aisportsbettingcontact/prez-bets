// Debug script to trace why parseNbaGames returns 0 games
import * as cheerio from 'cheerio';

const VSIN_EMAIL = process.env.VSIN_EMAIL;
const VSIN_PASSWORD = process.env.VSIN_PASSWORD;

const loginResp = await fetch(
  "https://auth.vsin.com/id/api/v1/identity/login/token?aid=N1owYIiApu&lang=en_US",
  {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": "https://auth.vsin.com", "Referer": "https://auth.vsin.com/id/", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({ password: VSIN_PASSWORD, remember: true, login: VSIN_EMAIL, loginType: "email" }),
  }
);
const loginData = await loginResp.json();
const token = loginData.access_token;

const pageResp = await fetch("https://data.vsin.com/nba/betting-splits/", {
  headers: {
    "Authorization": `Bearer ${token}`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://data.vsin.com/",
  }
});
const html = await pageResp.text();
const $ = cheerio.load(html);

// Trace each row
let rowNum = 0;
$("table.freezetable tr").each((_i, tr) => {
  rowNum++;
  const tds = $(tr).find("td").toArray();
  if (tds.length < 10) {
    console.log(`Row ${rowNum}: SKIP (${tds.length} tds)`);
    return;
  }
  
  // Check team anchors
  const teamAnchors = $(tds[0])
    .find('a.txt-color-vsinred[href*="/teams/"]')
    .toArray()
    .filter((a) => $(a).closest(".collapse").length === 0);
  
  if (teamAnchors.length < 2) {
    console.log(`Row ${rowNum}: SKIP (${teamAnchors.length} team anchors, td0 text: "${$(tds[0]).text().trim().substring(0, 80)}")`);
    return;
  }
  
  // Check game ID
  let gameId = null;
  $(tds[0]).find("[data-param2]").each((_j, el) => {
    if (!gameId && $(el).closest(".collapse").length === 0) {
      gameId = $(el).attr("data-param2") || null;
    }
  });
  
  if (!gameId) {
    console.log(`Row ${rowNum}: SKIP (no gameId)`);
    return;
  }
  
  const gameDate = gameId.match(/^(\d{8})/)?.[1];
  const awayTeam = $(teamAnchors[0]).text().trim();
  const homeTeam = $(teamAnchors[1]).text().trim();
  
  // Spread from td[1]
  const spreadAnchors = $(tds[1]).find('a').toArray().filter(a => $(a).closest('.collapse').length === 0);
  const spreadTexts = spreadAnchors.map(a => $(a).text().trim());
  
  console.log(`Row ${rowNum}: ${awayTeam} @ ${homeTeam} | gameId=${gameId} | date=${gameDate} | spread td[1] anchors=${spreadTexts.join(',')}`);
});
