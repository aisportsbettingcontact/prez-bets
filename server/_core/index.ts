import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerDiscordAuthRoutes } from "../discordAuth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startDailyPurgeSchedule } from "../dailyPurge";
import { startVsinAutoRefresh } from "../vsinAutoRefresh";
import { startNbaModelSyncScheduler } from "../nbaModelSync";
import { startNhlModelSyncScheduler } from "../nhlModelSync";
import { startNhlGoalieWatcher } from "../nhlGoalieWatcher";
import { startDiscordBot } from "../discord/bot";
import { startMlbPlayerSyncScheduler } from "../mlbPlayerSync";

// ─── Global crash protection ─────────────────────────────────────────────────
// Prevent unhandled promise rejections and uncaught exceptions from killing the
// process. Log them instead so the server stays alive and serves requests.
process.on("unhandledRejection", (reason, promise) => {
  console.error("[CRASH GUARD] Unhandled promise rejection:", reason, "at:", promise);
});

process.on("uncaughtException", (err) => {
  console.error("[CRASH GUARD] Uncaught exception — server will continue:", err);
});

// ─── Rate limiters ────────────────────────────────────────────────────────────
// Global limiter: 200 requests per minute per IP across all API routes.
// Generous enough for legitimate use; blocks automated scraping/flooding.
const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,          // 1 minute window
  max: 200,                      // max 200 requests per window per IP
  standardHeaders: "draft-7",    // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
  skip: (req) => req.path === "/health", // never throttle health probes
  handler: (req, res, _next, options) => {
    console.warn(`[RATE LIMIT] Global limit hit: IP=${req.ip} path=${req.path}`);
    res.status(options.statusCode).json(options.message);
  },
});

// Auth limiter: max 5 login/auth attempts per 15 minutes per IP.
// Prevents brute-force credential stuffing on login and OAuth routes.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,     // 15-minute window
  max: 5,                        // max 5 attempts per window per IP
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please wait 15 minutes before trying again." },
  handler: (req, res, _next, options) => {
    console.warn(`[RATE LIMIT] Auth limit hit: IP=${req.ip} path=${req.path}`);
    res.status(options.statusCode).json(options.message);
  },
});

// tRPC auth procedure limiter: 5 login mutations per 15 minutes per IP.
// Applied specifically to /api/trpc/appUsers.login and /api/trpc/auth.* paths.
const trpcAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait 15 minutes." },
  keyGenerator: (req) => {
    // Key by IP + procedure path for precise per-procedure limiting
    const path = req.path.replace(/^\//, "");
    return `${req.ip}:${path}`;
  },
  handler: (req, res, _next, options) => {
    console.warn(`[RATE LIMIT] tRPC auth limit hit: IP=${req.ip} path=${req.path}`);
    res.status(options.statusCode).json(options.message);
  },
});

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Trust the first proxy (Cloudflare / Manus edge) so req.protocol reflects
  // the original HTTPS scheme and cookies are set correctly (sameSite+secure).
  // Also required for express-rate-limit to read the real client IP from
  // X-Forwarded-For rather than the proxy IP.
  app.set('trust proxy', 1);

  // ─── Security headers (helmet) ────────────────────────────────────────────
  // Sets X-Content-Type-Options, X-Frame-Options, X-XSS-Protection,
  // Strict-Transport-Security, Referrer-Policy, and a Content-Security-Policy
  // that allows our own origin + CDN assets. Vite HMR websocket is allowed in dev.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // unsafe-eval needed for Vite HMR in dev
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        connectSrc: ["'self'", "wss:", "ws:", "https:"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false, // Allow embedding external resources (logos, CDN)
  }));

  // ─── Body parser with tight size limits ──────────────────────────────────
  // 10kb for JSON API calls (tRPC procedures never need more than a few KB).
  // 1mb for URL-encoded forms. The previous 50mb limit was a DoS vector.
  // Note: file upload procedures use base64 strings — if needed, raise to 2mb max.
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  // ─── Health check endpoint ────────────────────────────────────────────────
  // Lightweight endpoint for load balancer health probes and uptime monitoring.
  // Returns 200 immediately without hitting the DB so it never times out.
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", ts: Date.now() });
  });

  // ─── Global API rate limiter ──────────────────────────────────────────────
  // Applied to all /api/* routes. Skips /health (handled above).
  app.use("/api", globalApiLimiter);

  // ─── Auth-specific rate limiters ─────────────────────────────────────────
  // Manus OAuth callback — 5 attempts per 15 min per IP
  app.use("/api/oauth", authLimiter);

  // Discord OAuth routes — 5 attempts per 15 min per IP
  app.use("/api/discord-auth", authLimiter);

  // tRPC login mutation — 5 attempts per 15 min per IP
  // Matches both batch (?batch=1) and direct calls to appUsers.login
  app.use("/api/trpc/appUsers.login", trpcAuthLimiter);
  app.use("/api/trpc/auth.login", trpcAuthLimiter);

  // ─── Request timeout middleware ───────────────────────────────────────────
  // Kill requests that take > 30s to prevent hanging connections from exhausting
  // the server's connection pool under load.
  app.use((req, res, next) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        console.error(`[TIMEOUT] Request timed out: ${req.method} ${req.path}`);
        res.status(503).json({ error: "Request timeout" });
      }
    }, 30_000);
    res.on("finish", () => clearTimeout(timeout));
    res.on("close", () => clearTimeout(timeout));
    next();
  });

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // Discord account linking routes
  registerDiscordAuthRoutes(app);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError: ({ error, path }) => {
        // Log server-side errors (not client errors like UNAUTHORIZED/NOT_FOUND)
        if (error.code === "INTERNAL_SERVER_ERROR") {
          console.error(`[tRPC ERROR] ${path}:`, error);
        }
      },
    })
  );

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Start daily 6am EST game purge (removes previous day's games)
    startDailyPurgeSchedule();
    // Auto-refresh VSiN book odds every 30 minutes (6am–midnight PST)
    startVsinAutoRefresh();
    // Auto-sync NBA model projections from Google Sheet every 3 hours (9AM–midnight PST)
    startNbaModelSyncScheduler();
    // NHL model sync — runs every 30 min (9AM–9PM PST), models unmodeled NHL games
    startNhlModelSyncScheduler();
    // NHL goalie watcher — checks RotoWire every 10 min for goalie changes, re-runs model on scratch
    startNhlGoalieWatcher();
    // Discord bot — listens for /splits slash command
    startDiscordBot();
    // MLB player sync — nightly at 08:00 UTC, updates active rosters from MLB Stats API
    startMlbPlayerSyncScheduler();
  });
}

startServer().catch(console.error);
