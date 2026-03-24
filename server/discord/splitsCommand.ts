/**
 * /splits — Slash Command Handler
 *
 * Behaviour:
 *   1. Validates that the invoking user is the allowed user ID.
 *   2. Defers the reply (ephemeral) so Discord doesn't time out.
 *   3. Fetches all daily splits directly from the database.
 *   4. Posts a header embed + one embed per game into the target channel.
 *   5. Adds a 1.2s delay between each embed to respect Discord rate limits.
 *   6. Replies to the invoker with an ephemeral summary.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  TextChannel,
  type Client,
} from "discord.js";
import { ENV } from "../_core/env";
import { fetchAllDailySplits } from "./fetchSplits";
import { buildSplitsEmbed, buildHeaderEmbed } from "./embedBuilder";

// ─── Constants ────────────────────────────────────────────────────────────────
const ALLOWED_USER_ID = "1098485718734602281";
const SPLITS_CHANNEL_ID = "1400758184188186744";
const EMBED_DELAY_MS = 1_200;

// ─── Command definition (used by register script) ─────────────────────────────
export const splitsCommandData = new SlashCommandBuilder()
  .setName("splits")
  .setDescription("Post today's full daily betting splits into the splits channel")
  .addStringOption((opt) =>
    opt
      .setName("date")
      .setDescription("Optional date override in YYYY-MM-DD format (defaults to today ET)")
      .setRequired(false)
  );

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function handleSplitsCommand(
  interaction: ChatInputCommandInteraction,
  client: Client
): Promise<void> {
  // 1. Access control
  if (interaction.user.id !== ALLOWED_USER_ID) {
    await interaction.reply({
      content: "❌ You are not authorised to use this command.",
      ephemeral: true,
    });
    console.warn(
      `[SplitsBot] Unauthorised /splits attempt by ${interaction.user.id} (${interaction.user.tag})`
    );
    return;
  }

  // 2. Defer reply (up to 15 min to respond)
  await interaction.deferReply({ ephemeral: true });

  const dateOverride = interaction.options.getString("date") ?? undefined;

  if (dateOverride && !/^\d{4}-\d{2}-\d{2}$/.test(dateOverride)) {
    await interaction.editReply("❌ Invalid date format. Use YYYY-MM-DD (e.g. 2026-03-23).");
    return;
  }

  // 3. Resolve target channel
  let channel: TextChannel;
  try {
    const ch = await client.channels.fetch(SPLITS_CHANNEL_ID);
    if (!ch || !ch.isTextBased()) {
      throw new Error(`Channel ${SPLITS_CHANNEL_ID} is not a text channel`);
    }
    channel = ch as TextChannel;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SplitsBot] Failed to fetch channel: ${msg}`);
    await interaction.editReply(`❌ Could not access the target channel: ${msg}`);
    return;
  }

  // 4. Fetch splits data from DB
  let games;
  try {
    games = await fetchAllDailySplits(dateOverride);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SplitsBot] Data fetch failed: ${msg}`);
    await interaction.editReply(`❌ Failed to fetch splits data: ${msg}`);
    return;
  }

  if (games.length === 0) {
    const dateLabel = dateOverride ?? todayEtLabel();
    await interaction.editReply(`ℹ️ No games found for ${dateLabel}.`);
    return;
  }

  // 5. Post embeds
  const dateLabel = dateOverride
    ? new Date(dateOverride + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : todayEtLabel();

  let posted = 0;
  const errors: string[] = [];

  try {
    // Header embed
    await channel.send({ embeds: [buildHeaderEmbed(games, dateLabel)] });
    await sleep(EMBED_DELAY_MS);

    // One embed per game
    for (const game of games) {
      try {
        await channel.send({ embeds: [buildSplitsEmbed(game)] });
        posted++;
        console.log(
          `[SplitsBot] Posted embed ${posted}/${games.length}: ${game.away_team} @ ${game.home_team}`
        );
      } catch (embedErr) {
        const msg = embedErr instanceof Error ? embedErr.message : String(embedErr);
        console.error(`[SplitsBot] Failed embed for ${game.away_team} @ ${game.home_team}: ${msg}`);
        errors.push(`${game.away_team} @ ${game.home_team}: ${msg}`);
      }
      await sleep(EMBED_DELAY_MS);
    }
  } catch (channelErr) {
    const msg = channelErr instanceof Error ? channelErr.message : String(channelErr);
    console.error(`[SplitsBot] Channel send error: ${msg}`);
    await interaction.editReply(`❌ Error posting to channel: ${msg}`);
    return;
  }

  // 6. Ephemeral summary
  const summary = [
    `✅ Posted **${posted}/${games.length}** game embeds to <#${SPLITS_CHANNEL_ID}>`,
    `📅 Date: **${dateLabel}**`,
    errors.length > 0
      ? `⚠️ ${errors.length} embed(s) failed:\n${errors.map((e) => `• ${e}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  await interaction.editReply(summary);
  console.log(
    `[SplitsBot] /splits complete — ${posted}/${games.length} embeds posted` +
      (errors.length > 0 ? ` (${errors.length} errors)` : "")
  );
}
