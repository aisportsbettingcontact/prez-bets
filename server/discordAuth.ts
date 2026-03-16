/**
 * Discord Account Linking Routes
 *
 * Provides three Express routes for linking/unlinking a Discord account
 * to an existing app_users session:
 *
 *   GET  /auth/discord/connect    — redirect user to Discord OAuth consent screen
 *   GET  /auth/discord/callback   — handle OAuth code exchange, save Discord profile, redirect
 *   POST /auth/discord/disconnect — clear Discord fields from the user's record
 *
 * Security:
 *   - Discord access_token is NEVER stored in the DB or logged
 *   - Secrets are read from ENV (server-side only, never exposed to frontend)
 *   - State parameter prevents CSRF on the callback
 *   - discordId uniqueness is enforced before saving (prevents account takeover)
 */

import type { Express, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { ENV } from "./_core/env";
import { verifyAppUserToken } from "./routers/appUsers";
import { getAppUserById, updateAppUser, getDb } from "./db";
import { appUsers } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const APP_USER_COOKIE = "app_session";
const DISCORD_API = "https://discord.com/api/v10";

// In-memory CSRF state store (TTL 10 min)
const pendingStates = new Map<string, { userId: number; expiresAt: number }>();

function getAppCookie(req: Request): string | undefined {
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  return cookies[APP_USER_COOKIE];
}

function generateState(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function cleanExpiredStates() {
  const now = Date.now();
  for (const [key, val] of Array.from(pendingStates.entries())) {
    if (val.expiresAt < now) pendingStates.delete(key);
  }
}

export function registerDiscordAuthRoutes(app: Express) {
  // ─── Step 1: Redirect to Discord OAuth ────────────────────────────────────
  app.get("/auth/discord/connect", async (req: Request, res: Response) => {
    const token = getAppCookie(req);
    if (!token) {
      console.log("[DiscordAuth] /connect — rejected: no app_session cookie");
      res.redirect(302, "/?error=not_logged_in");
      return;
    }

    const payload = await verifyAppUserToken(token);
    if (!payload) {
      console.log("[DiscordAuth] /connect — rejected: invalid JWT");
      res.redirect(302, "/?error=invalid_session");
      return;
    }

    cleanExpiredStates();
    const state = generateState();
    pendingStates.set(state, { userId: payload.userId, expiresAt: Date.now() + 10 * 60 * 1000 });

    // Build the redirect_uri from the request origin so it works on any domain
    const origin = `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${origin}/auth/discord/callback`;

    const params = new URLSearchParams({
      client_id: ENV.discordClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "identify",
      state,
    });

    const authorizeUrl = `https://discord.com/oauth2/authorize?${params.toString()}`;
    console.log(`[DiscordAuth] /connect — userId=${payload.userId} → redirecting to Discord OAuth`);
    res.redirect(302, authorizeUrl);
  });

  // ─── Step 2: Handle Discord OAuth callback ─────────────────────────────────
  app.get("/auth/discord/callback", async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    const error = typeof req.query.error === "string" ? req.query.error : null;

    if (error) {
      console.log(`[DiscordAuth] /callback — Discord returned error: ${error}`);
      res.redirect(302, "/dashboard?discord_error=denied");
      return;
    }

    if (!code || !state) {
      console.log("[DiscordAuth] /callback — missing code or state");
      res.redirect(302, "/dashboard?discord_error=invalid_request");
      return;
    }

    cleanExpiredStates();
    const stateData = pendingStates.get(state);
    if (!stateData || stateData.expiresAt < Date.now()) {
      console.log(`[DiscordAuth] /callback — invalid or expired state: ${state}`);
      res.redirect(302, "/dashboard?discord_error=state_mismatch");
      return;
    }
    pendingStates.delete(state);

    const { userId } = stateData;
    const origin = `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${origin}/auth/discord/callback`;

    try {
      // Exchange code for access token
      console.log(`[DiscordAuth] /callback — userId=${userId} exchanging code for token`);
      const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: ENV.discordClientId,
          client_secret: ENV.discordClientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error(`[DiscordAuth] /callback — token exchange failed (${tokenRes.status}): ${errText}`);
        res.redirect(302, "/dashboard?discord_error=token_exchange_failed");
        return;
      }

      const tokenData = await tokenRes.json() as { access_token: string; token_type: string };
      const accessToken = tokenData.access_token;
      // NOTE: access_token is intentionally NOT stored anywhere

      // Fetch Discord user profile
      console.log(`[DiscordAuth] /callback — userId=${userId} fetching Discord user profile`);
      const profileRes = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!profileRes.ok) {
        const errText = await profileRes.text();
        console.error(`[DiscordAuth] /callback — profile fetch failed (${profileRes.status}): ${errText}`);
        res.redirect(302, "/dashboard?discord_error=profile_fetch_failed");
        return;
      }

      const profile = await profileRes.json() as {
        id: string;
        username: string;
        discriminator?: string;
        avatar?: string;
      };

      const discordId = profile.id;
      const discordUsername = profile.discriminator && profile.discriminator !== "0"
        ? `${profile.username}#${profile.discriminator}`
        : profile.username;
      const discordAvatar = profile.avatar ?? null;

      console.log(`[DiscordAuth] /callback — userId=${userId} Discord profile: id=${discordId} username=${discordUsername}`);

      // Check if this Discord account is already linked to a DIFFERENT user
      const db = await getDb();
      if (db) {
        const existing = await db
          .select({ id: appUsers.id })
          .from(appUsers)
          .where(eq(appUsers.discordId, discordId))
          .limit(1);

        if (existing.length > 0 && existing[0].id !== userId) {
          console.warn(`[DiscordAuth] /callback — discordId=${discordId} already linked to userId=${existing[0].id} (conflict with userId=${userId})`);
          res.redirect(302, "/dashboard?discord_error=already_linked");
          return;
        }
      }

      // Save Discord fields to the user record
      await updateAppUser(userId, {
        discordId,
        discordUsername,
        discordAvatar,
        discordConnectedAt: Date.now(),
      } as Parameters<typeof updateAppUser>[1]);

      console.log(`[DiscordAuth] /callback — SUCCESS: userId=${userId} linked to Discord @${discordUsername} (id=${discordId})`);
      res.redirect(302, "/dashboard?discord_linked=1");
    } catch (err) {
      console.error("[DiscordAuth] /callback — unexpected error:", err);
      res.redirect(302, "/dashboard?discord_error=server_error");
    }
  });

  // ─── Step 3: Disconnect Discord account ───────────────────────────────────
  app.post("/auth/discord/disconnect", async (req: Request, res: Response) => {
    const token = getAppCookie(req);
    if (!token) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const payload = await verifyAppUserToken(token);
    if (!payload) {
      res.status(401).json({ error: "Invalid session" });
      return;
    }

    const user = await getAppUserById(payload.userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    console.log(`[DiscordAuth] /disconnect — userId=${payload.userId} username=${user.username} clearing Discord fields`);

    await updateAppUser(payload.userId, {
      discordId: null,
      discordUsername: null,
      discordAvatar: null,
      discordConnectedAt: null,
    } as Parameters<typeof updateAppUser>[1]);

    console.log(`[DiscordAuth] /disconnect — SUCCESS: userId=${payload.userId} Discord account unlinked`);
    res.json({ success: true });
  });
}
