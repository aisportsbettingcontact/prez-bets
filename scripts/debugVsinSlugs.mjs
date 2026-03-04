/**
 * Debug: show raw VSiN href slugs for all games
 * Run: node scripts/debugVsinSlugs.mjs
 */
import * as cheerio from "cheerio";
import dotenv from "dotenv";
dotenv.config();

const email = process.env.VSIN_EMAIL;
const password = process.env.VSIN_PASSWORD;

// Login
const loginResp = await fetch(
  "https://auth.vsin.com/id/api/v1/identity/login/token?aid=N1owYIiApu&lang=en_US",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, remember: true, login: email, loginType: "email" }),
  }
);
const loginData = await loginResp.json();
const token = loginData.access_token;
console.log("Login:", loginResp.ok ? "OK" : "FAILED");

// Fetch page
const pageResp = await fetch("https://data.vsin.com/college-basketball/betting-splits/", {
  headers: {
    "User-Agent": "Mozilla/5.0",
    "Cookie": `__utp=${token}`,
    "Accept": "text/html",
  },
});
const html = await pageResp.text();
const $ = cheerio.load(html);

// Parse all games
const results = [];
$("table.freezetable tr").each((_i, tr) => {
  const tds = $(tr).find("td").toArray();
  if (tds.length < 10) return;

  const teamAnchors = $(tds[0])
    .find('a.txt-color-vsinred[href*="/teams/"]')
    .toArray()
    .filter(a => $(a).closest(".collapse").length === 0);

  if (teamAnchors.length < 2) return;

  let gameId = null;
  $(tds[0]).find("[data-param2]").each((_j, el) => {
    if (!gameId && $(el).closest(".collapse").length === 0) {
      gameId = $(el).attr("data-param2") || null;
    }
  });
  if (!gameId) return;

  const gameDate = gameId.match(/^(\d{8})/)?.[1];
  if (!gameDate) return;

  const awayName = $(teamAnchors[0]).text().trim();
  const homeName = $(teamAnchors[1]).text().trim();
  const awayHref = $(teamAnchors[0]).attr("href") || "";
  const homeHref = $(teamAnchors[1]).attr("href") || "";
  const awayRaw = awayHref.split("/").pop()?.toLowerCase() ?? "";
  const homeRaw = homeHref.split("/").pop()?.toLowerCase() ?? "";

  results.push({ gameDate, awayName, homeName, awayRaw, homeRaw });
});

// Show March 5 games specifically
console.log("\n=== March 5 games (raw VSiN hrefs) ===");
results.filter(g => g.gameDate === "20260305").forEach(g => {
  console.log(`  ${g.awayName} (${g.awayRaw}) @ ${g.homeName} (${g.homeRaw})`);
});

// Show all games with slugs that have "-st" or "michigan" or "rutgers"
console.log("\n=== All games with potential slug issues ===");
results.forEach(g => {
  const flagged = [g.awayRaw, g.homeRaw].some(s =>
    s.includes("-st") || s.includes("michigan") || s.includes("rutgers") ||
    s.includes("iowa") || s.includes("penn") || s.includes("ohio") ||
    s.includes("florida") || s.includes("colorado") || s.includes("georgia")
  );
  if (flagged) {
    console.log(`  [${g.gameDate}] ${g.awayName} (${g.awayRaw}) @ ${g.homeName} (${g.homeRaw})`);
  }
});

console.log(`\nTotal games: ${results.length}`);
