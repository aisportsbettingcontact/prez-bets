/**
 * WagerTalk Live Odds Scraper
 *
 * Uses Puppeteer to load the WagerTalk NCAAM odds page and extract
 * the current consensus spread and total for each game by rotation number.
 *
 * HTML structure (per game):
 *   <tr id="g689" class="reg|alt">
 *     <th class="gnum" id="t689g">
 *       <div id="t689g0">689</div>   ← away rot num
 *       <div id="t689g1">690</div>   ← home rot num
 *     </th>
 *     ... book columns ...
 *     <td class="book b15" id="t689b...">   ← last book = Consensus
 *       <div id="t689p0b...r1">155½ </div>  ← total (row 1)
 *       <div id="t689p0b...r2">-2½-10 </div> ← spread (row 2)
 *     </td>
 *   </tr>
 */

import puppeteer from "puppeteer";

export interface ScrapedOdds {
  rotAway: string;
  rotHome: string;
  awaySpread: number | null;
  homeSpread: number | null;
  total: number | null;
}

function parseSpread(text: string): number | null {
  if (!text) return null;
  const clean = text.trim().replace(/\s+/g, "");
  // Spread looks like "-3½-10", "+7-10", "-14", "pk", "-2.5-10"
  // We only want the numeric spread part, not the juice
  const match = clean.match(/^([+-]?\d+\.?\d*|[+-]?\d+½)(?:[+-]\d+)?$/);
  if (!match) {
    if (clean.toLowerCase() === "pk") return 0;
    return null;
  }
  const val = parseFloat(match[1].replace("½", ".5"));
  if (isNaN(val) || Math.abs(val) > 60) return null;
  return val;
}

function parseTotal(text: string): number | null {
  if (!text) return null;
  const clean = text.trim().replace(/\s+/g, "");
  // Total looks like "155½", "148.5", "148½o-15", "O148½"
  const match = clean.match(/^[OU]?(\d{2,3}\.?\d*|½)/i) || clean.match(/(\d{2,3}[½.]?\d*)/);
  if (!match) return null;
  const val = parseFloat(match[1].replace("½", ".5"));
  if (isNaN(val) || val < 100 || val > 300) return null;
  return val;
}

export async function scrapeWagerTalkNcaam(): Promise<ScrapedOdds[]> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Set a longer default timeout for this page
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(60000);

    // Navigate to NCAAM odds page (sport=L4)
    // Use domcontentloaded (faster) then wait for the JS to inject game rows
    await page.goto("https://www.wagertalk.com/odds?sport=L4", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Wait for game rows to appear (JS-rendered)
    await page.waitForSelector("tr[id^='g']", { timeout: 45000 }).catch(() => {});
    // Extra settle time for all book columns to populate
    await new Promise((r) => setTimeout(r, 2000));

    // Extract odds data from the rendered DOM
    const rawGames = await page.evaluate(() => {
      const results: Array<{
        rotAway: string;
        rotHome: string;
        spreadRaw: string;
        totalRaw: string;
      }> = [];

      // Each game is a single <tr id="gXXX">
      const gameRows = Array.from(document.querySelectorAll("tr[id^='g']"));

      for (const row of gameRows) {
        const rowId = row.id; // e.g. "g689"
        const rotBase = rowId.slice(1); // e.g. "689"

        // Get rotation numbers from the gnum th
        const gnumTh = document.getElementById(`t${rotBase}g`);
        if (!gnumTh) continue;

        const rotAway = gnumTh.querySelector(`#t${rotBase}g0`)?.textContent?.trim() ?? "";
        const rotHome = gnumTh.querySelector(`#t${rotBase}g1`)?.textContent?.trim() ?? "";

        if (!rotAway || !rotHome || isNaN(parseInt(rotAway))) continue;

        // Get all book columns — the LAST one is Consensus
        const bookCells = Array.from(row.querySelectorAll("td.book"));
        if (bookCells.length === 0) continue;

        const consensusCell = bookCells[bookCells.length - 1];
        const divs = Array.from(consensusCell.querySelectorAll("div"));

        // r1 and r2 can be in either order depending on the game
        // Detect which is spread vs total by value range:
        // - Total: 3-digit number like "155½", "148.5"
        // - Spread: small number like "-2½-15", "+7-10"
        const r1 = divs.find((d) => d.id.endsWith("r1"))?.textContent?.trim() ?? "";
        const r2 = divs.find((d) => d.id.endsWith("r2"))?.textContent?.trim() ?? "";

        // Determine which is total (contains 3-digit number) and which is spread
        const looksLikeTotal = (s: string) => /\d{3}/.test(s);
        const totalRaw = looksLikeTotal(r1) ? r1 : looksLikeTotal(r2) ? r2 : r1;
        const spreadRaw = looksLikeTotal(r1) ? r2 : looksLikeTotal(r2) ? r1 : r2;

        results.push({
          rotAway,
          rotHome,
          spreadRaw,
          totalRaw,
        });
      }

      return results;
    });

    // Parse the raw strings into numbers
    const results: ScrapedOdds[] = rawGames.map((g) => {
      const awaySpread = parseSpread(g.spreadRaw);
      return {
        rotAway: g.rotAway,
        rotHome: g.rotHome,
        awaySpread,
        homeSpread: awaySpread !== null ? -awaySpread : null,
        total: parseTotal(g.totalRaw),
      };
    });

    return results;
  } finally {
    await browser.close();
  }
}
