/**
 * renderLineupCard.ts
 *
 * Renders an MLB lineup card to a PNG buffer using the shared Playwright
 * browser singleton from renderSplitsCard.ts.
 *
 * The lineup_card.html template is loaded once from disk and cached.
 * Data is injected via window.LINEUP_DATA before the script runs.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { warmUpRenderer, closeSplitsRenderer } from "./renderSplitsCard.js";
import { chromium, type Browser, type Page } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, "lineup_card.html");

// ─── Template cache ───────────────────────────────────────────────────────────
let _templateHtml: string | null = null;
function getTemplateHtml(): string {
  if (_templateHtml) return _templateHtml;
  const t0 = Date.now();
  _templateHtml = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  console.log(`[LineupRenderer] Template loaded: ${(_templateHtml.length / 1024).toFixed(0)} KB in ${Date.now() - t0}ms`);
  return _templateHtml;
}

// ─── Shared browser singleton (same as splits renderer) ───────────────────────
// We reuse the same Chromium process to avoid double memory usage.
// warmUpRenderer() from renderSplitsCard.ts already launches it at startup.
let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  console.log("[LineupRenderer] Launching headless Chromium...");
  const t0 = Date.now();
  _browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--force-device-scale-factor=2",
    ],
  });
  console.log(`[LineupRenderer] Chromium ready in ${Date.now() - t0}ms`);
  return _browser;
}

// ─── Data types ───────────────────────────────────────────────────────────────

export interface LineupCardTeam {
  city: string;
  nickname: string;
  abbrev: string;
  primaryColor: string;
  darkColor: string;
  logoUrl: string;
}

export interface LineupCardPlayer {
  battingOrder: number;
  position: string;
  name: string;
  bats: string;
  mlbamId: number | null;
}

export interface LineupCardPitcher {
  name: string | null;
  hand: string | null;
  era: string | null;
  mlbamId: number | null;
  confirmed: boolean;
}

export interface LineupCardWeather {
  icon: string | null;
  temp: string | null;
  wind: string | null;
  precip: number | null;
  dome: boolean;
}

export interface LineupCardData {
  away: LineupCardTeam;
  home: LineupCardTeam;
  startTime: string;
  lineup: {
    awayPitcher: LineupCardPitcher;
    homePitcher: LineupCardPitcher;
    awayPlayers: LineupCardPlayer[];
    homePlayers: LineupCardPlayer[];
    weather: LineupCardWeather | null;
  };
}

// ─── Main render function ─────────────────────────────────────────────────────

/**
 * Renders an MLB lineup card to a PNG buffer.
 * The card is 680px wide × auto height at 2x device pixel ratio.
 */
export async function renderLineupCard(data: LineupCardData): Promise<Buffer> {
  const t0 = Date.now();
  const matchup = `${data.away.abbrev} @ ${data.home.abbrev}`;
  console.log(`[LineupRenderer] Rendering: ${matchup}`);

  const templateHtml = getTemplateHtml();

  // Inject data into the template via script tag replacement
  const injectedHtml = templateHtml.replace(
    "// window.LINEUP_DATA is injected by renderLineupCard.ts before this script runs",
    `window.LINEUP_DATA = ${JSON.stringify(data)};`
  );

  const browser = await getBrowser();
  const page: Page = await browser.newPage();

  try {
    // Set viewport wide enough for the 680px card at 2x DPR
    await page.setViewportSize({ width: 720, height: 1200 });

    // Load the template HTML
    await page.setContent(injectedHtml, { waitUntil: "networkidle", timeout: 30_000 });

    // Wait for images to load (player headshots)
    await page.waitForFunction(() => {
      const imgs = Array.from(document.querySelectorAll("img"));
      return imgs.every(img => img.complete);
    }, { timeout: 15_000 }).catch(() => {
      console.warn(`[LineupRenderer] ${matchup} — some images did not load in time (non-fatal)`);
    });

    // Screenshot just the card element
    const cardEl = await page.$("#card > div");
    if (!cardEl) {
      throw new Error("Card element not found in rendered HTML");
    }

    const buffer = await cardEl.screenshot({ type: "png" });
    console.log(`[LineupRenderer] ${matchup} — rendered in ${Date.now() - t0}ms (${buffer.length} bytes)`);
    return buffer as Buffer;
  } finally {
    await page.close();
  }
}

// Re-export warm-up and close from the shared renderer
export { warmUpRenderer, closeSplitsRenderer as closeLineupRenderer };
