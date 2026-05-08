/**
 * rotogrinderProxy.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Server-side proxy for Rotogrinders THE BAT X projection pages.
 *
 * Rotogrinders sets X-Frame-Options: sameorigin, blocking direct iframes.
 * This proxy:
 *   1. Validates the requesting user's app_session JWT cookie
 *   2. Enforces allowlist: only @prez and @lucianobets may access
 *   3. Authenticates with Rotogrinders using stored credentials (cached 23h)
 *   4. Fetches the requested grid page with the authenticated session cookie
 *   5. Rewrites all relative/absolute asset URLs to absolute Rotogrinders URLs
 *   6. Returns the full HTML through our same-origin endpoint (bypassing X-Frame-Options)
 *
 * Route: GET /api/rg-proxy?page=<pageKey>
 * Page keys:
 *   - today-pitchers    → standard-projections-the-bat-x-3372510
 *   - today-hitters     → standard-projections-the-bat-x-hitters-3372512
 *   - tomorrow-pitchers → tomorrow-projections-the-bat-x-3375509
 *   - tomorrow-hitters  → tomorrow-projections-the-bat-x-hitters-3375510
 */

import type { Express, Request, Response } from "express";
import { verifyAppUserToken } from "./routers/appUsers";
import { getAppUserById } from "./db";

// ─── Constants ────────────────────────────────────────────────────────────────

const RG_BASE = "https://rotogrinders.com";
const RG_LOGIN_URL = `${RG_BASE}/sign-in`;

const ALLOWED_USERNAMES = new Set(["prez", "lucianobets"]);

const PAGE_SLUGS: Record<string, string> = {
  "today-pitchers":    "/grids/standard-projections-the-bat-x-3372510",
  "today-hitters":     "/grids/standard-projections-the-bat-x-hitters-3372512",
  "tomorrow-pitchers": "/grids/tomorrow-projections-the-bat-x-3375509",
  "tomorrow-hitters":  "/grids/tomorrow-projections-the-bat-x-hitters-3375510",
};

// ─── Session cache ─────────────────────────────────────────────────────────────
// Cache the Rotogrinders session cookie to avoid logging in on every request.
// The rguid cookie has a 1-year TTL; we refresh it if the fetch returns a 401/403.

let cachedRgCookie: string | null = null;
let cookieFetchedAt = 0;
const COOKIE_TTL_MS = 23 * 60 * 60 * 1000; // 23 hours (well within 1-year expiry)

// ─── Cookie parser (inline — no extra dep) ────────────────────────────────────
function parseCookieHeader(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    result[key] = val;
  }
  return result;
}

// ─── Rotogrinders login ────────────────────────────────────────────────────────

async function getRgSessionCookie(): Promise<string> {
  const now = Date.now();
  if (cachedRgCookie && now - cookieFetchedAt < COOKIE_TTL_MS) {
    return cachedRgCookie;
  }

  const username = process.env.ROTOGRINDERS_USERNAME;
  const password = process.env.ROTOGRINDERS_PASSWORD;

  if (!username || !password) {
    throw new Error("[RGProxy] ROTOGRINDERS_USERNAME or ROTOGRINDERS_PASSWORD not set");
  }

  console.log("[RGProxy] [STEP] Authenticating with Rotogrinders...");

  const loginRes = await fetch(RG_LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": RG_LOGIN_URL,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    },
    body: new URLSearchParams({ username, password }).toString(),
    redirect: "manual",
  });

  // Rotogrinders returns 302 on successful login; collect all Set-Cookie headers
  const setCookieHeaders: string[] = [];
  loginRes.headers.forEach((value, name) => {
    if (name.toLowerCase() === "set-cookie") {
      setCookieHeaders.push(value);
    }
  });

  const cookieString = setCookieHeaders
    .map((h: string) => h.split(";")[0]) // strip attributes (expires, path, etc.)
    .join("; ");

  if (!cookieString.includes("rguid")) {
    console.error("[RGProxy] [VERIFY] FAIL — rguid cookie not found in login response. Status:", loginRes.status);
    throw new Error("[RGProxy] Rotogrinders login failed — rguid cookie not returned");
  }

  console.log(`[RGProxy] [VERIFY] PASS — Authenticated. Cookie length=${cookieString.length}`);
  cachedRgCookie = cookieString;
  cookieFetchedAt = now;
  return cookieString;
}

// ─── HTML rewriting ────────────────────────────────────────────────────────────
// Rewrite relative URLs in the fetched HTML to absolute Rotogrinders URLs so
// that CSS, JS, and images load correctly when served through our proxy.

function rewriteHtml(html: string): string {
  return html
    // Absolute-ify root-relative paths
    .replace(/(src|href|action)="(\/[^"]*?)"/g, `$1="${RG_BASE}$2"`)
    // Absolute-ify protocol-relative paths
    .replace(/(src|href)="(\/\/[^"]*?)"/g, `$1="https:$2"`)
    // Remove X-Frame-Options meta tags if any
    .replace(/<meta[^>]*x-frame-options[^>]*>/gi, "")
    // Inject a base tag so relative URLs resolve correctly
    .replace(/<head>/i, `<head><base href="${RG_BASE}/">`);
}

// ─── Express route registration ───────────────────────────────────────────────

export function registerRgProxyRoute(app: Express): void {
  app.get("/api/rg-proxy", async (req: Request, res: Response) => {
    const startMs = Date.now();

    // ── Step 1: Validate app_session JWT cookie ───────────────────────────────
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
      console.warn(`[RGProxy] [VERIFY] FAIL — userId=${payload.userId} not found in DB. Returning 401.`);
      res.status(401).json({ error: "User not found" });
      return;
    }

    if (!ALLOWED_USERNAMES.has(appUser.username)) {
      console.warn(`[RGProxy] [VERIFY] FAIL — @${appUser.username} (id=${appUser.id}) not in allowlist. Returning 403.`);
      res.status(403).json({ error: "Access denied" });
      return;
    }

    console.log(`[RGProxy] [INPUT] User=@${appUser.username} (id=${appUser.id}) page=${req.query.page}`);

    // ── Step 3: Validate page key ─────────────────────────────────────────────
    const pageKey = (req.query.page as string) ?? "";
    const pageSlug = PAGE_SLUGS[pageKey];

    if (!pageSlug) {
      console.warn(`[RGProxy] [VERIFY] FAIL — Invalid page key: "${pageKey}"`);
      res.status(400).json({ error: `Invalid page key. Valid: ${Object.keys(PAGE_SLUGS).join(", ")}` });
      return;
    }

    const pageUrl = `${RG_BASE}${pageSlug}`;
    console.log(`[RGProxy] [STEP] Fetching: ${pageUrl}`);

    // ── Step 4: Get Rotogrinders session cookie ───────────────────────────────
    let rgCookie: string;
    try {
      rgCookie = await getRgSessionCookie();
    } catch (err) {
      console.error("[RGProxy] [VERIFY] FAIL — Could not obtain RG session:", (err as Error).message);
      res.status(502).json({ error: "Failed to authenticate with Rotogrinders" });
      return;
    }

    // ── Step 5: Fetch the page from Rotogrinders ──────────────────────────────
    let html: string;
    try {
      const fetchRes = await fetch(pageUrl, {
        headers: {
          "Cookie": rgCookie,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
          "Referer": RG_BASE,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if (!fetchRes.ok) {
        // If 401/403, clear the cookie cache and retry once with fresh login
        if (fetchRes.status === 401 || fetchRes.status === 403) {
          console.warn(`[RGProxy] [STATE] RG returned ${fetchRes.status} — clearing cookie cache and retrying login`);
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
          if (!retryRes.ok) {
            throw new Error(`Rotogrinders returned ${retryRes.status} after re-auth`);
          }
          html = await retryRes.text();
        } else {
          throw new Error(`Rotogrinders returned ${fetchRes.status}`);
        }
      } else {
        html = await fetchRes.text();
      }
    } catch (err) {
      console.error("[RGProxy] [VERIFY] FAIL — Fetch error:", (err as Error).message);
      res.status(502).json({ error: "Failed to fetch from Rotogrinders" });
      return;
    }

    // ── Step 6: Rewrite HTML and return ──────────────────────────────────────
    const rewritten = rewriteHtml(html);
    const elapsed = Date.now() - startMs;

    console.log(`[RGProxy] [OUTPUT] page=${pageKey} user=@${appUser.username} size=${rewritten.length} elapsed=${elapsed}ms`);
    console.log(`[RGProxy] [VERIFY] PASS — Proxy response sent successfully`);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.status(200).send(rewritten);
  });

  console.log("[RGProxy] Route registered: GET /api/rg-proxy?page=<key>");
}
