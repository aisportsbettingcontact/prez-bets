// Debug script to check what the NBA VSiN scraper fetches
import * as cheerio from 'cheerio';

const VSIN_EMAIL = process.env.VSIN_EMAIL;
const VSIN_PASSWORD = process.env.VSIN_PASSWORD;

if (!VSIN_EMAIL || !VSIN_PASSWORD) {
  console.error('Missing VSIN_EMAIL or VSIN_PASSWORD env vars');
  process.exit(1);
}

// Login
const loginResp = await fetch(
  "https://auth.vsin.com/id/api/v1/identity/login/token?aid=N1owYIiApu&lang=en_US",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://auth.vsin.com",
      "Referer": "https://auth.vsin.com/id/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({ password: VSIN_PASSWORD, remember: true, login: VSIN_EMAIL, loginType: "email" }),
  }
);

const loginData = await loginResp.json();
const token = loginData.access_token;
console.log('Login status:', loginResp.status, 'token:', token ? 'OK' : 'MISSING');

// Fetch NBA page
const pageResp = await fetch("https://data.vsin.com/nba/betting-splits/", {
  headers: {
    "Authorization": `Bearer ${token}`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://data.vsin.com/",
  }
});

const html = await pageResp.text();
console.log('Page size:', html.length, 'bytes');

// Parse with cheerio
const $ = cheerio.load(html);
const freezeRows = $('table.freezetable tr').length;
const allRows = $('table tr').length;
console.log('freezetable rows:', freezeRows, '| all table rows:', allRows);

// Check for game IDs
const gameIds = [];
$('[data-param2]').each((i, el) => {
  const id = $(el).attr('data-param2');
  if (id && id.includes('NBA')) gameIds.push(id);
});
console.log('Game IDs found:', gameIds.slice(0, 5));

// Check team anchors
const teamAnchors = $('a.txt-color-vsinred[href*="/teams/"]').length;
console.log('Team anchors:', teamAnchors);

// Check if page has login wall
const hasLoginWall = html.includes('Sign in') || html.includes('login') || html.includes('subscribe');
console.log('Has login wall indicators:', hasLoginWall);
console.log('First 500 chars of body:', html.substring(0, 500));
