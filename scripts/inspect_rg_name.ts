/**
 * inspect_rg_name.ts
 * Fetches the Rotogrinders hitters page and inspects the NAME cell HTML structure.
 */
import { config } from "dotenv";
import * as cheerio from "cheerio";
import * as fs from "fs";
config();

const RG_BASE = "https://rotogrinders.com";

async function main() {
  const username = process.env.ROTOGRINDERS_USERNAME!;
  const password = process.env.ROTOGRINDERS_PASSWORD!;

  // Login
  const loginRes = await fetch(`${RG_BASE}/sign-in`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": `${RG_BASE}/sign-in`,
    },
    body: new URLSearchParams({ username, password }).toString(),
    redirect: "manual",
  });

  const cookies: string[] = [];
  loginRes.headers.forEach((v: string, n: string) => {
    if (n.toLowerCase() === "set-cookie") cookies.push(v.split(";")[0]);
  });
  const cookieStr = cookies.join("; ");
  console.log(`[STATE] Login status=${loginRes.status} cookies=${cookies.length}`);

  // Fetch page
  const pageRes = await fetch(`${RG_BASE}/grids/standard-projections-the-bat-x-hitters-3372512`, {
    headers: {
      "Cookie": cookieStr,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": RG_BASE,
    },
  });

  const html = await pageRes.text();
  console.log(`[STATE] Page status=${pageRes.status} size=${html.length}`);

  // Save for inspection
  fs.writeFileSync("/tmp/rg_hitters.html", html);
  console.log("[STATE] Saved to /tmp/rg_hitters.html");

  const $ = cheerio.load(html);

  // Find biggest table
  let maxCols = 0;
  let $best: cheerio.Cheerio<cheerio.AnyNode> | null = null;
  $("table").each(function () {
    const c = $(this).find("thead tr th").length;
    if (c > maxCols) { maxCols = c; $best = $(this); }
  });

  if (!$best) { console.error("No table found"); return; }

  console.log(`[STATE] Table: ${maxCols} columns`);

  // Inspect first 3 rows NAME cell
  ($best as cheerio.Cheerio<cheerio.AnyNode>).find("tbody tr").slice(0, 3).each(function (i) {
    const firstTd = $(this).find("td").first();
    const outerHtml = $.html(firstTd).substring(0, 600);
    console.log(`\n[ROW ${i}] NAME cell HTML:\n${outerHtml}`);
    // Also try all text extraction methods
    const rawText = firstTd.text().trim().replace(/\s+/g, " ").substring(0, 100);
    const spanText = firstTd.find("span").first().text().trim();
    const aText = firstTd.find("a").first().text().trim();
    const dataName = firstTd.attr("data-name") ?? firstTd.attr("data-player") ?? "(none)";
    console.log(`  raw="${rawText}" span="${spanText}" a="${aText}" data-name="${dataName}"`);
  });
}

main().catch(e => { console.error("[FATAL]", e.message); process.exit(1); });
