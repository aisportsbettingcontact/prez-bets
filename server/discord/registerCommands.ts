/**
 * One-time slash command registration script.
 *
 * Registers /splits as a guild-scoped command so it appears instantly
 * (global commands can take up to 1 hour to propagate).
 *
 * Run with:
 *   cd /home/ubuntu/ai-sports-betting
 *   npx tsx server/discord/registerCommands.ts
 */

import "dotenv/config";
import { REST, Routes } from "discord.js";
import { ENV } from "../_core/env";
import { splitsCommandData } from "./splitsCommand";
import { lineupsCommandData } from "./lineupsCommand";

async function register(): Promise<void> {
  if (!ENV.discordBotToken) {
    console.error("[Register] DISCORD_BOT_TOKEN is not set");
    process.exit(1);
  }
  if (!ENV.discordClientId) {
    console.error("[Register] DISCORD_CLIENT_ID is not set");
    process.exit(1);
  }
  if (!ENV.discordGuildId) {
    console.error("[Register] DISCORD_GUILD_ID is not set");
    process.exit(1);
  }

  const rest = new REST({ version: "10" }).setToken(ENV.discordBotToken);
  const commands = [splitsCommandData.toJSON(), lineupsCommandData.toJSON()];

  console.log(
    `[Register] Registering ${commands.length} command(s) to guild ${ENV.discordGuildId}...`
  );

  try {
    const data = (await rest.put(
      Routes.applicationGuildCommands(ENV.discordClientId, ENV.discordGuildId),
      { body: commands }
    )) as unknown[];

    console.log(`[Register] ✅ Registered ${data.length} command(s):`);
    for (const cmd of commands) {
      console.log(`  • /${cmd.name} — ${cmd.description}`);
    }
  } catch (err) {
    console.error("[Register] ❌ Registration failed:", err);
    process.exit(1);
  }
}

register();
