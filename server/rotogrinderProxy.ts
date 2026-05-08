/**
 * rotogrinderProxy.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side scraper for Rotogrinders THE BAT X projection tables.
 *
 * Authenticates with Rotogrinders, fetches the grid page, parses the
 * <table> via cheerio, and returns clean structured JSON.
 *
 * Access is restricted to @prez and @lucianobets only.
 *
 * Route: GET /api/rg-proxy?page=<key>
 * Valid page keys: today-pitchers | today-hitters | tomorrow-pitchers | tomorrow-hitters
 *
 * Response: { columns: string[], rows: Record<string,string>[], updatedAt: string, title: string, type: string }
 */

import type { Express, Request, Response } from "express";
import * as cheerio from "cheerio";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CheerioEl = any;
import { verifyAppUserToken } from "./routers/appUsers";
import { getAppUserById } from "./db";

// ─── Constants ────────────────────────────────────────────────────────────────

const RG_BASE = "https://rotogrinders.com";
const ALLOWED_USERNAMES = new Set(["prez", "lucianobets"]);

const PAGE_CONFIG: Record<string, { slug: string; title: string; type: "pitchers" | "hitters" }> = {
  "today-pitchers":    { slug: "/grids/standard-projections-the-bat-x-3372510",        title: "Standard Projections — THE BAT X Pitchers (Today)",  type: "pitchers" },
  "today-hitters":     { slug: "/grids/standard-projections-the-bat-x-hitters-3372512", title: "Standard Projections — THE BAT X Hitters (Today)",   type: "hitters"  },
  "tomorrow-pitchers": { slug: "/grids/tomorrow-projections-the-bat-x-3375509",         title: "Tomorrow Projections — THE BAT X Pitchers",          type: "pitchers" },
  "tomorrow-hitters":  { slug: "/grids/tomorrow-projections-the-bat-x-hitters-3375510", title: "Tomorrow Projections — THE BAT X Hitters",           type: "hitters"  },
};

// ─── Session Cookie Cache ─────────────────────────────────────────────────────

let cachedRgCookie: string | null = null;
let cookieFetchedAt = 0;
const COOKIE_TTL_MS = 55 * 60 * 1000; // 55 minutes

function parseCookieHeader(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    result[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return result;
}

async function getRgSessionCookie(): Promise<string> {
  const now = Date.now();
  if (cachedRgCookie && now - cookieFetchedAt < COOKIE_TTL_MS) {
    console.log("[RGProxy] [STATE] Using cached RG session cookie");
    return cachedRgCookie;
  }

  const username = process.env.ROTOGRINDERS_USERNAME;
  const password = process.env.ROTOGRINDERS_PASSWORD;

  if (!username || !password) {
    throw new Error("ROTOGRINDERS_USERNAME or ROTOGRINDERS_PASSWORD not set in environment");
  }

  console.log(`[RGProxy] [STEP] Logging in to Rotogrinders as ${username}...`);

  const loginRes = await fetch(`${RG_BASE}/sign-in`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      "Referer": `${RG_BASE}/sign-in`,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    body: new URLSearchParams({ username, password }).toString(),
    redirect: "manual",
  });

  // Collect all Set-Cookie headers from the login response
  const setCookieHeaders: string[] = [];
  loginRes.headers.forEach((value: string, name: string) => {
    if (name.toLowerCase() === "set-cookie") {
      setCookieHeaders.push(value);
    }
  });

  // Extract only the rguid cookie (the auth token) — ignore consent/tracking cookies
  const rguidCookie = setCookieHeaders
    .map((c: string) => c.split(";")[0])
    .find((c: string) => c.startsWith("rguid="));

  const cookieStr = setCookieHeaders
    .map((c: string) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");

  if (!rguidCookie && !cookieStr) {
    throw new Error(`RG login returned no cookies (status=${loginRes.status})`);
  }

  // Validate that we got the auth cookie (rguid contains user id)
  if (!rguidCookie) {
    console.warn(`[RGProxy] [STATE] Warning — rguid cookie not found in response. Status=${loginRes.status}. Using all cookies.`);
  } else {
    console.log(`[RGProxy] [STATE] RG login success — rguid cookie obtained (status=${loginRes.status})`);
  }

  cachedRgCookie = cookieStr;
  cookieFetchedAt = Date.now();
  return cachedRgCookie;
}

// ─── Fetch with Auto-Retry on 401/403 ────────────────────────────────────────

async function fetchRgPage(pageUrl: string, cookie: string): Promise<string> {
  const res = await fetch(pageUrl, {
    headers: {
      "Cookie": cookie,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      "Referer": RG_BASE,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (res.status === 401 || res.status === 403) {
    console.warn(`[RGProxy] [STATE] RG returned ${res.status} — clearing cookie cache and retrying`);
    cachedRgCookie = null;
    cookieFetchedAt = 0;
    const freshCookie = await getRgSessionCookie();
    const retryRes = await fetch(pageUrl, {
      headers: {
        "Cookie": freshCookie,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "Referer": RG_BASE,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!retryRes.ok) throw new Error(`RG returned ${retryRes.status} after re-auth`);
    return retryRes.text();
  }

  if (!res.ok) throw new Error(`RG returned ${res.status}`);
  return res.text();
}

// ─── HTML → Structured JSON Table Parser ─────────────────────────────────────

export interface RgTableData {
  title: string;
  pageKey: string;
  type: "pitchers" | "hitters";
  updatedAt: string;
  columns: string[];
  rows: Record<string, string>[];
}

function parseRgTable(
  html: string,
  pageKey: string,
  title: string,
  type: "pitchers" | "hitters"
): RgTableData {
  const $ = cheerio.load(html);

  // ── Extract "FPTS Updated" timestamp ─────────────────────────────────────
  let updatedAt = "";
  $("*").each(function () {
    const text = $(this).clone().children().remove().end().text().trim();
    if (text.startsWith("FPTS Updated:") && !updatedAt) {
      updatedAt = text.replace("FPTS Updated:", "").trim();
    }
  });

  // ── Find the main data table ──────────────────────────────────────────────
  // Rotogrinders renders the projection table inside a sortable grid container.
  // We find the table with the most <th> columns as the projection table.
  let $table = $("div[data-role='sortable'] table").first();

  if (!$table.length) {
    // Fallback: pick the table with the most header columns
    let maxCols = 0;
    let bestTable: cheerio.Cheerio<Element> | null = null;

    $("table").each(function () {
      const cols = $(this).find("thead tr th").length;
      if (cols > maxCols) {
        maxCols = cols;
        bestTable = $(this) as unknown as cheerio.Cheerio<CheerioEl>;
      }
    });

    if (bestTable) {
      $table = bestTable;
    }
  }

  if (!$table.length) {
    console.warn(`[RGProxy] [VERIFY] WARN — No table found in HTML for page=${pageKey}`);
    return { title, pageKey, type, updatedAt, columns: [], rows: [] };
  }

  // ── Extract column headers ────────────────────────────────────────────────
  const columns: string[] = [];
  $table.find("thead tr th").each(function () {
    // Prefer data-col attribute; fall back to text content with sort icons stripped
    const dataCol = $(this).attr("data-col") ?? "";
    const textCol = $(this)
      .clone()
      .children("input, select, span.sort-icon, i")
      .remove()
      .end()
      .text()
      .trim();
    columns.push(dataCol || textCol || `col_${columns.length}`);
  });

  console.log(
    `[RGProxy] [STATE] Columns found (${columns.length}): ${columns.slice(0, 12).join(", ")}...`
  );

  // ── Extract data rows ─────────────────────────────────────────────────────
  const rows: Record<string, string>[] = [];

  $table.find("tbody tr").each(function () {
    const $tr = $(this);
    const tds = $tr.find("td");
    if (!tds.length) return;

    const row: Record<string, string> = {};

    // Carry over data attributes from <tr> for potential client-side filtering
    const trTeam = $tr.attr("data-team");
    const trPos  = $tr.attr("data-position");
    if (trTeam) row["_team"]     = trTeam;
    if (trPos)  row["_position"] = trPos;

    tds.each(function (i: number) {
      const col = columns[i] ?? `col_${i}`;
      const $td = $(this);

      // Boolean checkmark cells (e.g., OPENER, DH, ROOF)
      if ($td.hasClass("truefalse") || $td.attr("data-type") === "bool") {
        row[col] = $td.find("i, span").length > 0 ? "true" : ($td.text().trim() ? "true" : "false");
        return;
      }

      // NAME cell: player name is in the first <span> inside the <td>
      // Structure: <td><span>Player Name</span><span data-auth="analyst">...</span></td>
      if (col === "NAME" || col === "name") {
        const firstSpan = $td.find("span").first();
        row[col] = firstSpan.length ? firstSpan.text().trim() : $td.text().trim().split("\n")[0]?.trim() ?? "";
        return;
      }

      // Default: raw text content, trimmed and whitespace-collapsed
      row[col] = $td.text().trim().replace(/\s+/g, " ");
    });

    // Only include rows with a non-empty NAME
    if (row["NAME"] || row["name"]) {
      rows.push(row);
    }
  });

  console.log(
    `[RGProxy] [STATE] Parsed table: page=${pageKey} columns=${columns.length} rows=${rows.length}`
  );
  return { title, pageKey, type, updatedAt, columns, rows };
}

// ─── Express Route Registration ───────────────────────────────────────────────

export function registerRgProxyRoute(app: Express): void {
  app.get("/api/rg-proxy", async (req: Request, res: Response) => {
    const startMs = Date.now();

    // ── Step 1: Verify app session JWT ────────────────────────────────────────
    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    const token = cookies["app_session"];
    if (!token) {
      console.warn("[RGProxy] [VERIFY] FAIL — No app_session cookie. Returning 401.");
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const payload = await verifyAppUserToken(token);
    if (!payload) {
      console.warn("[RGProxy] [VERIFY] FAIL — JWT verification failed. Returning 401.");
      res.status(401).json({ error: "Invalid or expired session" });
      return;
    }

    // ── Step 2: Load user from DB and enforce allowlist ───────────────────────
    let appUser: Awaited<ReturnType<typeof getAppUserById>>;
    try {
      appUser = await getAppUserById(payload.userId);
    } catch (err) {
      console.error("[RGProxy] [VERIFY] FAIL — DB error:", (err as Error).message);
      res.status(500).json({ error: "Internal error" });
      return;
    }

    if (!appUser) {
      console.warn(`[RGProxy] [VERIFY] FAIL — userId=${payload.userId} not found in DB.`);
      res.status(401).json({ error: "User not found" });
      return;
    }

    if (!ALLOWED_USERNAMES.has(appUser.username)) {
      console.warn(`[RGProxy] [VERIFY] FAIL — @${appUser.username} not in allowlist. Returning 403.`);
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // ── Step 3: Validate page key ─────────────────────────────────────────────
    const pageKey = (req.query.page as string) ?? "";
    const pageConf = PAGE_CONFIG[pageKey];
    if (!pageConf) {
      console.warn(`[RGProxy] [VERIFY] FAIL — Invalid page key: "${pageKey}"`);
      res.status(400).json({ error: `Invalid page key. Valid: ${Object.keys(PAGE_CONFIG).join(", ")}` });
      return;
    }

    const pageUrl = `${RG_BASE}${pageConf.slug}#expand`;
    console.log(`[RGProxy] [INPUT] user=@${appUser.username} page=${pageKey} url=${pageUrl}`);

    // ── Step 4: Get Rotogrinders session cookie ───────────────────────────────
    let rgCookie: string;
    try {
      rgCookie = await getRgSessionCookie();
    } catch (err) {
      console.error("[RGProxy] [VERIFY] FAIL — Could not obtain RG session:", (err as Error).message);
      res.status(502).json({ error: "Failed to authenticate with Rotogrinders" });
      return;
    }

    // ── Step 5: Fetch the page ────────────────────────────────────────────────
    let html: string;
    try {
      html = await fetchRgPage(pageUrl, rgCookie);
      console.log(`[RGProxy] [STATE] Fetched HTML: ${html.length} bytes`);
    } catch (err) {
      console.error("[RGProxy] [VERIFY] FAIL — Fetch error:", (err as Error).message);
      res.status(502).json({ error: "Failed to fetch from Rotogrinders" });
      return;
    }

    // ── Step 6: Parse table into structured JSON ──────────────────────────────
    const tableData = parseRgTable(html, pageKey, pageConf.title, pageConf.type);

    const elapsed = Date.now() - startMs;
    console.log(
      `[RGProxy] [OUTPUT] page=${pageKey} user=@${appUser.username} rows=${tableData.rows.length} cols=${tableData.columns.length} elapsed=${elapsed}ms`
    );
    console.log(`[RGProxy] [VERIFY] PASS — JSON response sent`);

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.status(200).json(tableData);
  });

  console.log("[RGProxy] Route registered: GET /api/rg-proxy?page=<key> → JSON table data");
}
