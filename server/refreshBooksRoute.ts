/**
 * GET /api/refresh-books?gameDate=2026-03-04
 *
 * Server-Sent Events endpoint. Streams one JSON event per game as its
 * book odds are scraped from WagerTalk and written to the DB.
 *
 * Event format:
 *   data: {"type":"start","total":40}
 *   data: {"type":"game","index":1,"total":40,"awayTeam":"Creighton","homeTeam":"Butler","awaySpread":-3.5,"homeSpread":3.5,"total":148.5,"status":"ok"}
 *   data: {"type":"game","index":2,...,"status":"no_match"}
 *   data: {"type":"done","updated":38,"total":40}
 *   data: {"type":"error","message":"..."}
 */

import type { Express, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { jwtVerify } from "jose";
import { ENV } from "./_core/env";
import { listStagingGames, updateBookOdds, getAppUserById } from "./db";
import { scrapeWagerTalkNcaam } from "./wagerTalkScraper";

const APP_USER_COOKIE = "app_session";

async function verifyOwnerSession(req: Request): Promise<boolean> {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const token = cookies[APP_USER_COOKIE];
  if (!token) return false;
  try {
    const secret = new TextEncoder().encode(ENV.cookieSecret);
    const { payload } = await jwtVerify(token, secret);
    if (payload.type !== "app_user" || payload.role !== "owner") return false;
    const user = await getAppUserById(Number(payload.sub));
    return !!(user && user.hasAccess);
  } catch {
    return false;
  }
}

export function registerRefreshBooksRoute(app: Express) {
  app.get("/api/refresh-books", async (req: Request, res: Response) => {
    // ── Auth: owner-only ──────────────────────────────────────────────────────
    const authed = await verifyOwnerSession(req);
    if (!authed) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const gameDate = (req.query.gameDate as string) || "2026-03-04";

    // ── SSE headers ───────────────────────────────────────────────────────────
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      // Flush if available (compression middleware may buffer)
      if (typeof (res as any).flush === "function") (res as any).flush();
    };

    try {
      // 1. Load games with rotation numbers
      const allGames = await listStagingGames(gameDate);
      const gamesWithRot = allGames.filter((g) => g.rotNums);

      if (gamesWithRot.length === 0) {
        send({ type: "error", message: "No games with rotation numbers found for " + gameDate });
        res.end();
        return;
      }

      send({ type: "start", total: gamesWithRot.length });

      // 2. Scrape WagerTalk
      send({ type: "scraping", message: "Loading WagerTalk odds page…" });
      const scraped = await scrapeWagerTalkNcaam();
      const byRotAway = new Map(scraped.map((s) => [s.rotAway, s]));

      // 3. Update each game and stream progress
      let updated = 0;
      for (let i = 0; i < gamesWithRot.length; i++) {
        const game = gamesWithRot[i];
        if (!game.rotNums) continue;

        const rotAway = game.rotNums.split("/")[0];
        const odds = byRotAway.get(rotAway);

        if (odds) {
          await updateBookOdds(game.id, {
            awayBookSpread: odds.awaySpread,
            homeBookSpread: odds.homeSpread,
            bookTotal: odds.total,
          });
          updated++;
          send({
            type: "game",
            index: i + 1,
            total: gamesWithRot.length,
            awayTeam: game.awayTeam,
            homeTeam: game.homeTeam,
            awaySpread: odds.awaySpread,
            homeSpread: odds.homeSpread,
            bookTotal: odds.total,
            status: "ok",
          });
        } else {
          send({
            type: "game",
            index: i + 1,
            total: gamesWithRot.length,
            awayTeam: game.awayTeam,
            homeTeam: game.homeTeam,
            awaySpread: null,
            homeSpread: null,
            bookTotal: null,
            status: "no_match",
          });
        }
      }

      send({ type: "done", updated, total: gamesWithRot.length });
    } catch (err: any) {
      send({ type: "error", message: err?.message ?? "Unknown error" });
    } finally {
      res.end();
    }
  });
}
