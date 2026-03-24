import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const htmlPath = '/home/ubuntu/ai-sports-betting/server/discord/splits_card.html';

// Use a real NBA logo URL (Warriors from ESPN CDN)
const GAME = {
  away: { 
    city: "Golden State", name: "Warriors", abbr: "GSW", 
    primary: "#FFC72C", secondary: "#1D428A", dark: "#0A1F4E", 
    logoText: "#FFFFFF", logoSize: "20px",
    logoUrl: "https://a.espncdn.com/i/teamlogos/nba/500/gs.png"
  },
  home: { 
    city: "Dallas", name: "Mavericks", abbr: "DAL", 
    primary: "#00538C", secondary: "#002B5E", dark: "#001A3A", 
    logoText: "#FFFFFF", logoSize: "20px",
    logoUrl: "https://a.espncdn.com/i/teamlogos/nba/500/dal.png"
  },
  league: "NBA",
  time: "9:30 PM ET",
  date: "March 23, 2026",
  liveSplits: false,
  spread: { awayLine: "-3.5", homeLine: "+3.5", tickets: { away: 49, home: 51 }, money: { away: 39, home: 61 } },
  total: { line: "230.5", tickets: { over: 59, under: 41 }, money: { over: 74, under: 26 } },
  moneyline: { awayLine: "-135", homeLine: "+114", tickets: { away: 42, home: 58 }, money: { away: 33, home: 67 } },
};

const htmlTemplate = readFileSync(htmlPath, 'utf8');
const html = htmlTemplate.replace('__GAME_JSON__', JSON.stringify(GAME));

const browser = await chromium.launch({ 
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-device-scale-factor=2'],
  headless: true
});
const page = await browser.newPage();

// Capture ALL console messages
const consoleLogs = [];
page.on('console', msg => {
  consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', err => {
  consoleLogs.push(`[PAGEERROR] ${err.message}`);
});

// Intercept network requests to see what logo URLs are being requested
const networkRequests = [];
page.on('request', req => {
  if (req.resourceType() === 'image') {
    networkRequests.push(`REQUEST: ${req.url().substring(0, 80)}`);
  }
});
page.on('response', res => {
  if (res.request().resourceType() === 'image') {
    networkRequests.push(`RESPONSE: ${res.status()} ${res.url().substring(0, 80)}`);
  }
});
page.on('requestfailed', req => {
  if (req.resourceType() === 'image') {
    networkRequests.push(`FAILED: ${req.failure()?.errorText} ${req.url().substring(0, 80)}`);
  }
});

await page.setViewportSize({ width: 1160, height: 700 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1000);

// Deep inspect the logo DOM
const logoDebug = await page.evaluate(() => {
  const results = {};
  
  // Check logo-away
  const awayLogo = document.getElementById('logo-away');
  if (awayLogo) {
    results.away = {
      outerHTML: awayLogo.outerHTML.substring(0, 500),
      childCount: awayLogo.children.length,
      innerHTML: awayLogo.innerHTML.substring(0, 500),
      children: Array.from(awayLogo.children).map(c => ({
        tag: c.tagName,
        src: c.getAttribute('src')?.substring(0, 60),
        display: c.style?.display,
        text: c.textContent?.substring(0, 50)
      }))
    };
  } else {
    results.away = 'NOT FOUND';
  }
  
  // Check logo-home
  const homeLogo = document.getElementById('logo-home');
  if (homeLogo) {
    results.home = {
      outerHTML: homeLogo.outerHTML.substring(0, 500),
      childCount: homeLogo.children.length,
      innerHTML: homeLogo.innerHTML.substring(0, 500),
      children: Array.from(homeLogo.children).map(c => ({
        tag: c.tagName,
        src: c.getAttribute('src')?.substring(0, 60),
        display: c.style?.display,
        text: c.textContent?.substring(0, 50)
      }))
    };
  } else {
    results.home = 'NOT FOUND';
  }
  
  return results;
});

console.log('\n=== LOGO DOM DEBUG ===');
console.log(JSON.stringify(logoDebug, null, 2));

console.log('\n=== NETWORK REQUESTS ===');
networkRequests.forEach(r => console.log(r));

console.log('\n=== CONSOLE LOGS ===');
consoleLogs.forEach(l => console.log(l));

// Screenshot
const el = await page.$('#splits-card');
const buf = await el.screenshot({ type: 'png', scale: 'device' });
writeFileSync('/tmp/test_logo_debug.png', buf);
console.log('\nRendered to /tmp/test_logo_debug.png');

await browser.close();
