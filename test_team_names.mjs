/**
 * Test render: verify city/nickname display for TOR, CBJ, VGK
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.join(__dirname, "server/discord/splits_card.html");
const htmlTemplate = fs.readFileSync(HTML_PATH, "utf8");

// Test cases: the three problematic teams
const testGames = [
  {
    label: "TOR_vs_BOS",
    awayCity: "Toronto", awayName: "Maple Leafs", awayAbbr: "TOR",
    awayPrimary: "#003E7E", awaySecondary: "#FFFFFF", awayDark: "#001F3F", awayLogoText: "#FFFFFF",
    homeCity: "Boston", homeName: "Bruins", homeAbbr: "BOS",
    homePrimary: "#FFB81C", homeSecondary: "#000000", homeDark: "#7A5500", homeLogoText: "#000000",
  },
  {
    label: "CBJ_vs_PHI",
    awayCity: "Columbus", awayName: "Blue Jackets", awayAbbr: "CBJ",
    awayPrimary: "#002654", awaySecondary: "#CE1126", awayDark: "#001228", awayLogoText: "#FFFFFF",
    homeCity: "Philadelphia", homeName: "Flyers", homeAbbr: "PHI",
    homePrimary: "#F74902", homeSecondary: "#000000", homeDark: "#7A2400", homeLogoText: "#FFFFFF",
  },
  {
    label: "VGK_vs_WPG",
    awayCity: "Vegas", awayName: "Golden Knights", awayAbbr: "VGK",
    awayPrimary: "#B4975A", awaySecondary: "#333F42", awayDark: "#5A4B2D", awayLogoText: "#000000",
    homeCity: "Winnipeg", homeName: "Jets", homeAbbr: "WPG",
    homePrimary: "#041E42", homeSecondary: "#AC162C", homeDark: "#020F21", homeLogoText: "#FFFFFF",
  },
];

const browser = await chromium.launch({
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--force-device-scale-factor=2"],
});

for (const g of testGames) {
  const data = {
    awayTeam: {
      city: g.awayCity, name: g.awayName, abbr: g.awayAbbr,
      primary: g.awayPrimary, secondary: g.awaySecondary, dark: g.awayDark, logoText: g.awayLogoText,
      logoUrl: null, logoSize: "17px",
    },
    homeTeam: {
      city: g.homeCity, name: g.homeName, abbr: g.homeAbbr,
      primary: g.homePrimary, secondary: g.homeSecondary, dark: g.homeDark, logoText: g.homeLogoText,
      logoUrl: null, logoSize: "17px",
    },
    atSign: "@",
    gameTime: "7:00 PM ET",
    gameDate: "March 24, 2026",
    markets: [
      {
        label: "SPREAD",
        awayLine: "+1.5", homeLine: "-1.5",
        awayAbbr: g.awayAbbr, homeAbbr: g.homeAbbr,
        ticketsAway: 45, ticketsHome: 55,
        moneyAway: 40, moneyHome: 60,
      },
      {
        label: "TOTAL",
        awayLine: "O 5.5", homeLine: "U 5.5",
        awayAbbr: "OVER", homeAbbr: "UNDER",
        ticketsAway: 52, ticketsHome: 48,
        moneyAway: 49, moneyHome: 51,
      },
      {
        label: "MONEYLINE",
        awayLine: "+140", homeLine: "-165",
        awayAbbr: g.awayAbbr, homeAbbr: g.homeAbbr,
        ticketsAway: 35, ticketsHome: 65,
        moneyAway: 30, moneyHome: 70,
      },
    ],
  };

  const gameJson = JSON.stringify(data).replace(/</g, "\\u003c");
  const html = htmlTemplate.replace("__GAME_JSON__", gameJson);

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1160, height: 600 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  const outPath = `/tmp/test_${g.label}.png`;
  await page.screenshot({ path: outPath, scale: "device", clip: { x: 0, y: 0, width: 1100, height: 600 } });
  console.log(`✓ Rendered ${g.label} → ${outPath}`);
  await page.close();
}

await browser.close();
console.log("All test renders complete.");
