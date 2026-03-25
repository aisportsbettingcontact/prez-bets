/**
 * /lineups — Slash Command Handler
 *
 * Posts today's MLB lineup cards as PNG images to the target channel.
 *
 * Behaviour:
 *   1. Validates that the invoking user is the allowed user ID.
 *   2. Defers the reply (ephemeral) so Discord doesn't time out.
 *   3. Fetches today's MLB games from the database.
 *   4. Fetches the corresponding lineup records (pitchers, batters, weather).
 *   5. Renders each game as a PNG via Playwright.
 *   6. Posts each PNG to the target channel (default: Test Channel).
 *   7. Replies to the invoker with an ephemeral summary.
 *
 * Default target channel: 1400758184188186744 (Test Channel)
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  TextChannel,
  AttachmentBuilder,
  type Client,
} from "discord.js";
import { listGamesByDate } from "../db.js";
import { getMlbLineupsByGameIds } from "../db.js";
import { MLB_BY_DB_SLUG } from "@shared/mlbTeams.js";
import { renderLineupCard, type LineupCardData, type LineupCardPlayer, type LineupCardPitcher } from "./renderLineupCard.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const ALLOWED_USER_ID = "1098485718734602281";
const DEFAULT_CHANNEL_ID = "1400758184188186744"; // Test Channel
const IMAGE_DELAY_MS = 800;

// ─── Logger ───────────────────────────────────────────────────────────────────
type LogLevel = "info" | "warn" | "error" | "debug";
function log(stage: string, msg: string, level: LogLevel = "info"): void {
  const ts = new Date().toISOString();
  const prefix = `[${ts}][LineupsBot][${stage}]`;
  if (level === "error")      console.error(`${prefix} ❌ ${msg}`);
  else if (level === "warn")  console.warn(`${prefix} ⚠️  ${msg}`);
  else if (level === "debug") { if (process.env.LOG_LEVEL === "debug") console.log(`${prefix} 🔍 ${msg}`); }
  else                        console.log(`${prefix} ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayEtDate(): string {
  return new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$3-$1-$2");
}

function todayEtLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(raw: string | null | undefined): string {
  if (!raw) return "TBD";
  const [hStr, mStr] = raw.split(":");
  const h = parseInt(hStr ?? "0", 10);
  const m = parseInt(mStr ?? "0", 10);
  if (isNaN(h) || isNaN(m)) return raw;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period} ET`;
}

/** Darken a hex color by subtracting from each channel */
function darkShade(hex: string): string {
  const clean = hex.replace("#", "");
  const r = Math.max(0, parseInt(clean.slice(0, 2), 16) - 60);
  const g = Math.max(0, parseInt(clean.slice(2, 4), 16) - 60);
  const b = Math.max(0, parseInt(clean.slice(4, 6), 16) - 60);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ─── Command definition ───────────────────────────────────────────────────────
export const lineupsCommandData = new SlashCommandBuilder()
  .setName("lineups")
  .setDescription("Post today's MLB lineup cards to the channel")
  .addStringOption((opt) =>
    opt
      .setName("date")
      .setDescription("Optional date override in YYYY-MM-DD format (defaults to today ET)")
      .setRequired(false)
  )
  .addStringOption((opt) =>
    opt
      .setName("channel")
      .setDescription("Target channel ID (defaults to Test Channel)")
      .setRequired(false)
  );

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function handleLineupsCommand(
  interaction: ChatInputCommandInteraction,
  client: Client
): Promise<void> {
  const t0 = Date.now();
  const interactionId = interaction.id;

  log("init", `Interaction ${interactionId} — user=${interaction.user.id} (${interaction.user.tag})`);

  // ── STEP 1: Defer immediately ──────────────────────────────────────────────
  if (!interaction.deferred && !interaction.replied) {
    try {
      await interaction.deferReply({ ephemeral: true });
      log("defer", `Interaction ${interactionId} — deferred (${Date.now() - t0}ms)`);
    } catch (deferErr) {
      const msg = deferErr instanceof Error ? deferErr.message : String(deferErr);
      log("defer", `deferReply FAILED: ${msg} — bailing out`, "error");
      return;
    }
  }

  // ── STEP 2: Access control ─────────────────────────────────────────────────
  if (interaction.user.id !== ALLOWED_USER_ID) {
    log("auth", `REJECTED user ${interaction.user.id}`, "warn");
    await interaction.editReply("❌ You are not authorised to use this command.");
    return;
  }

  const dateOverride = interaction.options.getString("date") ?? undefined;
  const channelOverride = interaction.options.getString("channel") ?? undefined;

  if (dateOverride && !/^\d{4}-\d{2}-\d{2}$/.test(dateOverride)) {
    await interaction.editReply("❌ Invalid date format. Use YYYY-MM-DD (e.g. 2026-03-25).");
    return;
  }

  const gameDate = dateOverride ?? todayEtDate();
  const targetChannelId = channelOverride ?? DEFAULT_CHANNEL_ID;

  log("input", `date=${gameDate} channel=${targetChannelId}`);

  // ── STEP 3: Resolve target channel ────────────────────────────────────────
  let channel: TextChannel;
  try {
    const rawChannel = await client.channels.fetch(targetChannelId);
    if (!rawChannel || !rawChannel.isTextBased()) {
      await interaction.editReply(`❌ Channel ${targetChannelId} is not a text channel or could not be fetched.`);
      return;
    }
    channel = rawChannel as TextChannel;
    log("channel", `Resolved: #${channel.name} in ${channel.guild?.name ?? "unknown"}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("channel", `Failed to fetch channel ${targetChannelId}: ${msg}`, "error");
    await interaction.editReply(`❌ Could not access channel ${targetChannelId}: ${msg}`);
    return;
  }

  // ── STEP 4: Fetch today's MLB games ───────────────────────────────────────
  log("fetch", `Fetching MLB games for ${gameDate}...`);
  let games: Awaited<ReturnType<typeof listGamesByDate>>;
  try {
    games = await listGamesByDate(gameDate, "MLB");
    log("fetch", `Found ${games.length} MLB game(s)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("fetch", `DB error: ${msg}`, "error");
    await interaction.editReply(`❌ Failed to fetch MLB games: ${msg}`);
    return;
  }

  if (games.length === 0) {
    const label = dateOverride
      ? new Date(dateOverride + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      : todayEtLabel();
    await interaction.editReply(`ℹ️ No MLB games found for ${label}.`);
    return;
  }

  // ── STEP 5: Fetch lineup records ──────────────────────────────────────────
  const gameIds = games.map((g) => g.id);
  log("lineups", `Fetching lineups for ${gameIds.length} game(s)...`);
  let lineupsMap: Map<number, Awaited<ReturnType<typeof getMlbLineupsByGameIds>> extends Map<number, infer V> ? V : never>;
  try {
    lineupsMap = await getMlbLineupsByGameIds(gameIds) as any;
    log("lineups", `Got ${lineupsMap.size}/${gameIds.length} lineup records`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("lineups", `DB error: ${msg}`, "warn");
    lineupsMap = new Map();
  }

  // ── STEP 6: Post header ───────────────────────────────────────────────────
  const dateLabel = dateOverride
    ? new Date(dateOverride + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : todayEtLabel();

  await channel.send({
    content: `⚾ **MLB LINEUPS — ${dateLabel.toUpperCase()}** ⚾\n${games.length} game${games.length !== 1 ? "s" : ""} today`,
  });

  // ── STEP 7: Render and post each card ─────────────────────────────────────
  let posted = 0;
  const errors: string[] = [];

  for (const game of games) {
    const awayEntry = MLB_BY_DB_SLUG.get(game.awayTeam);
    const homeEntry = MLB_BY_DB_SLUG.get(game.homeTeam);

    if (!awayEntry || !homeEntry) {
      const msg = `Unknown team slug: away=${game.awayTeam} home=${game.homeTeam}`;
      log("card", msg, "warn");
      errors.push(msg);
      continue;
    }

    const lineup = lineupsMap.get(game.id);

    // Parse lineup JSON arrays
    let awayPlayers: LineupCardPlayer[] = [];
    let homePlayers: LineupCardPlayer[] = [];
    try {
      if (lineup?.awayLineup) awayPlayers = JSON.parse(lineup.awayLineup) as LineupCardPlayer[];
    } catch { /* empty lineup */ }
    try {
      if (lineup?.homeLineup) homePlayers = JSON.parse(lineup.homeLineup) as LineupCardPlayer[];
    } catch { /* empty lineup */ }

    const awayPitcher: LineupCardPitcher = {
      name: lineup?.awayPitcherName ?? null,
      hand: lineup?.awayPitcherHand ?? null,
      era: lineup?.awayPitcherEra ?? null,
      mlbamId: lineup?.awayPitcherMlbamId ?? null,
      confirmed: lineup?.awayPitcherConfirmed ?? false,
    };
    const homePitcher: LineupCardPitcher = {
      name: lineup?.homePitcherName ?? null,
      hand: lineup?.homePitcherHand ?? null,
      era: lineup?.homePitcherEra ?? null,
      mlbamId: lineup?.homePitcherMlbamId ?? null,
      confirmed: lineup?.homePitcherConfirmed ?? false,
    };

    const cardData: LineupCardData = {
      away: {
        city: awayEntry.city,
        nickname: awayEntry.nickname,
        abbrev: awayEntry.abbrev,
        primaryColor: awayEntry.primaryColor,
        darkColor: darkShade(awayEntry.primaryColor),
        logoUrl: awayEntry.logoUrl,
      },
      home: {
        city: homeEntry.city,
        nickname: homeEntry.nickname,
        abbrev: homeEntry.abbrev,
        primaryColor: homeEntry.primaryColor,
        darkColor: darkShade(homeEntry.primaryColor),
        logoUrl: homeEntry.logoUrl,
      },
      startTime: formatTime(game.startTimeEst),
      lineup: {
        awayPitcher,
        homePitcher,
        awayPlayers,
        homePlayers,
        weather: lineup ? {
          icon: lineup.weatherIcon ?? null,
          temp: lineup.weatherTemp ?? null,
          wind: lineup.weatherWind ?? null,
          precip: lineup.weatherPrecip ?? null,
          dome: lineup.weatherDome ?? false,
        } : null,
      },
    };

    const matchup = `${awayEntry.abbrev} @ ${homeEntry.abbrev}`;
    log("render", `Rendering ${matchup}...`);

    try {
      const pngBuffer = await renderLineupCard(cardData);
      const attachment = new AttachmentBuilder(pngBuffer, { name: `lineup_${awayEntry.abbrev}_${homeEntry.abbrev}.png` });
      await channel.send({ files: [attachment] });
      posted++;
      log("post", `Posted ${matchup} (${pngBuffer.length} bytes)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log("render", `Failed to render/post ${matchup}: ${msg}`, "error");
      errors.push(`${matchup}: ${msg}`);
    }

    if (posted < games.length) await sleep(IMAGE_DELAY_MS);
  }

  // ── STEP 8: Ephemeral summary ─────────────────────────────────────────────
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const summary = [
    `✅ Posted **${posted}/${games.length}** lineup card${posted !== 1 ? "s" : ""} to <#${targetChannelId}>`,
    `⏱️ Completed in ${elapsed}s`,
    errors.length > 0 ? `⚠️ ${errors.length} error(s):\n${errors.map((e) => `• ${e}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");

  await interaction.editReply(summary);
  log("done", `Complete — posted=${posted} errors=${errors.length} elapsed=${elapsed}s`);
}
