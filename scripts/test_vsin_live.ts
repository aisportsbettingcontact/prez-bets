/**
 * Live test: scrape both the combined VSIN page AND the MLB-specific page
 * to determine which one actually contains MLB games and what column order is used.
 */

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  Referer: "https://data.vsin.com/",
};

async function fetchAndCheck(url: string, label: string) {
  console.log(`\n[${label}] Fetching: ${url}`);
  const resp = await fetch(url, { headers: HEADERS });
  console.log(`[${label}] HTTP ${resp.status}`);
  if (!resp.ok) {
    console.error(`[${label}] FAILED`);
    return;
  }
  const html = await resp.text();
  console.log(`[${label}] HTML length: ${html.length}`);
  
  // Check for MLB content
  const hasMlb = html.includes('MLB') || html.includes('mlb');
  const hasSpTable = html.includes('sp-table');
  const hasSpRow = html.includes('sp-row');
  const gameCodeMatches = html.match(/data-gamecode="(\d{8}MLB\d+)"/g) ?? [];
  
  console.log(`[${label}] Has MLB: ${hasMlb}`);
  console.log(`[${label}] Has sp-table: ${hasSpTable}`);
  console.log(`[${label}] Has sp-row: ${hasSpRow}`);
  console.log(`[${label}] MLB game codes found: ${gameCodeMatches.length}`);
  if (gameCodeMatches.length > 0) {
    console.log(`[${label}] First 3 game codes: ${gameCodeMatches.slice(0, 3).join(', ')}`);
  }
  
  // Check for sport headers
  const sportHeaders = html.match(/sp-sport-header[^>]*>[\s\S]*?<\/tr>/g) ?? [];
  for (const h of sportHeaders.slice(0, 5)) {
    const text = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 100);
    console.log(`[${label}] Sport header: ${text}`);
  }
}

// Test 1: Combined page (what the scraper currently uses)
await fetchAndCheck("https://data.vsin.com/betting-splits/?source=DK&view=today", "COMBINED_TODAY");

// Test 2: MLB-specific page (what the user's HTML is from)
await fetchAndCheck("https://data.vsin.com/mlb/betting-splits/", "MLB_SPECIFIC");

// Test 3: Combined page tomorrow
await fetchAndCheck("https://data.vsin.com/betting-splits/?source=DK&view=tomorrow", "COMBINED_TOMORROW");
