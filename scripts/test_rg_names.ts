/**
 * test_rg_names.ts
 * Quick end-to-end test: login → fetch hitters page → parse table → verify NAME column.
 */
import { config } from "dotenv";
import * as cheerio from "cheerio";
config();

const RG_BASE = "https://rotogrinders.com";

async function main() {
  const username = process.env.ROTOGRINDERS_USERNAME!;
  const password = process.env.ROTOGRINDERS_PASSWORD!;

  console.log("[INPUT] Testing Rotogrinders proxy name extraction");
  console.log(`[INPUT] Username: ${username}`);

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

  if (loginRes.status !== 301 && loginRes.status !== 302) {
    console.error(`[VERIFY] FAIL — Login returned ${loginRes.status}, expected 301/302`);
    return;
  }
  console.log("[VERIFY] PASS — Login redirect received");

  // Fetch hitters page
  const pageRes = await fetch(`${RG_BASE}/grids/standard-projections-the-bat-x-hitters-3372512`, {
    headers: {
      "Cookie": cookieStr,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": RG_BASE,
    },
  });

  const html = await pageRes.text();
  console.log(`[STATE] Page status=${pageRes.status} size=${html.length} bytes`);

  // Parse
  const $ = cheerio.load(html);

  let maxCols = 0;
  let $best: cheerio.Cheerio<cheerio.AnyNode> | null = null;
  $("table").each(function () {
    const c = $(this).find("thead tr th").length;
    if (c > maxCols) { maxCols = c; $best = $(this); }
  });

  if (!$best) {
    console.error("[VERIFY] FAIL — No table found in page HTML");
    return;
  }

  console.log(`[STATE] Table found: ${maxCols} columns`);

  // Get headers
  const headers: string[] = [];
  ($best as cheerio.Cheerio<cheerio.AnyNode>).find("thead tr th").each(function () {
    headers.push($(this).text().trim());
  });

  const nameIdx = headers.indexOf("NAME");
  console.log(`[STATE] NAME column index: ${nameIdx}`);

  // Extract first 10 rows NAME values
  const names: string[] = [];
  ($best as cheerio.Cheerio<cheerio.AnyNode>).find("tbody tr").slice(0, 10).each(function () {
    const tds = $(this).find("td");
    const nameTd = tds.eq(nameIdx);
    // Use first span (the player name span)
    const firstSpan = nameTd.find("span").first();
    const name = firstSpan.length ? firstSpan.text().trim() : nameTd.text().trim().split("\n")[0]?.trim() ?? "";
    names.push(name);
  });

  console.log("\n[OUTPUT] First 10 player names:");
  names.forEach((n, i) => console.log(`  [${i + 1}] "${n}"`));

  const allNonEmpty = names.every(n => n.length > 0);
  console.log(`\n[VERIFY] ${allNonEmpty ? "PASS" : "FAIL"} — All ${names.length} names non-empty: ${allNonEmpty}`);

  // Also check a few key columns
  const fptIdx = headers.indexOf("FPTS");
  const teamIdx = headers.indexOf("TEAM");
  const posIdx = headers.indexOf("POS");
  console.log(`\n[STATE] Key column indices: FPTS=${fptIdx} TEAM=${teamIdx} POS=${posIdx}`);

  // Sample row
  const firstRow = ($best as cheerio.Cheerio<cheerio.AnyNode>).find("tbody tr").first();
  const firstTds = firstRow.find("td");
  const sampleFpts = firstTds.eq(fptIdx).text().trim();
  const sampleTeam = firstTds.eq(teamIdx).text().trim();
  const samplePos  = firstTds.eq(posIdx).text().trim();
  console.log(`\n[OUTPUT] First row sample: NAME="${names[0]}" TEAM="${sampleTeam}" POS="${samplePos}" FPTS="${sampleFpts}"`);

  const valid = names[0].length > 0 && sampleFpts.length > 0;
  console.log(`[VERIFY] ${valid ? "PASS" : "FAIL"} — First row has valid NAME and FPTS`);
}

main().catch(e => { console.error("[FATAL]", e.message); process.exit(1); });
