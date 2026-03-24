/**
 * Embed Builder — converts a single GameSplits record into a Discord APIEmbed.
 * One embed = one game. No game data is combined or omitted.
 */

import { EmbedBuilder, type APIEmbed } from "discord.js";
import type { GameSplits } from "./fetchSplits";

type Pct = number | null;

function pct(value: Pct): string {
  if (value === null || value === undefined) return "N/A";
  return `${value}%`;
}

function splitsLine(label: string, ticketPct: Pct, moneyPct: Pct): string {
  return `**${label}** → ${pct(ticketPct)} tickets · ${pct(moneyPct)} money`;
}

const LEAGUE_COLORS: Record<string, number> = {
  NCAAM: 0x1a6faf,
  NBA: 0xc9082a,
  NHL: 0x003f7f,
};

function leagueColor(league: string): number {
  return LEAGUE_COLORS[league.toUpperCase()] ?? 0x5865f2;
}

/**
 * Builds a Discord embed for a single game's betting splits.
 *
 * Title:     AWAY TEAM @ HOME TEAM
 * Thumbnail: away team logo (top-right)
 * Image:     home team logo (bottom)
 * Fields:    SPREAD / TOTAL / MONEYLINE splits
 * Footer:    {league} · Daily Betting Splits · {date} · {time}
 */
export function buildSplitsEmbed(game: GameSplits): APIEmbed {
  const embed = new EmbedBuilder()
    .setColor(leagueColor(game.league))
    .setTitle(`${game.away_team} @ ${game.home_team}`)
    .setFooter({
      text: `${game.league} · Daily Betting Splits · ${game.game_date} · ${game.start_time}`,
    });

  // Away logo as thumbnail (top-right), home logo as image (bottom)
  if (game.away_logo) embed.setThumbnail(game.away_logo);
  if (game.home_logo) embed.setImage(game.home_logo);

  embed.addFields(
    {
      name: "📊 SPREAD",
      value: [
        splitsLine("AWAY", game.spread.away_ticket_pct, game.spread.away_money_pct),
        splitsLine("HOME", game.spread.home_ticket_pct, game.spread.home_money_pct),
      ].join("\n"),
      inline: false,
    },
    {
      name: "📈 TOTAL (OVER/UNDER)",
      value: [
        splitsLine("OVER ", game.total.over_ticket_pct, game.total.over_money_pct),
        splitsLine("UNDER", game.total.under_ticket_pct, game.total.under_money_pct),
      ].join("\n"),
      inline: false,
    },
    {
      name: "💰 MONEYLINE",
      value: [
        splitsLine("AWAY", game.moneyline.away_ticket_pct, game.moneyline.away_money_pct),
        splitsLine("HOME", game.moneyline.home_ticket_pct, game.moneyline.home_money_pct),
      ].join("\n"),
      inline: false,
    }
  );

  return embed.toJSON();
}

/**
 * Header embed that precedes the per-game embeds.
 * Shows total game count and league breakdown.
 */
export function buildHeaderEmbed(games: GameSplits[], dateLabel: string): APIEmbed {
  const byLeague = games.reduce<Record<string, number>>((acc, g) => {
    acc[g.league] = (acc[g.league] ?? 0) + 1;
    return acc;
  }, {});

  const leagueLines = Object.entries(byLeague)
    .sort(([a], [b]) => {
      const order: Record<string, number> = { NHL: 0, NBA: 1, NCAAM: 2 };
      return (order[a] ?? 9) - (order[b] ?? 9);
    })
    .map(([league, count]) => `**${league}**: ${count} game${count !== 1 ? "s" : ""}`)
    .join("\n");

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📋 Daily Betting Splits — ${dateLabel}`)
    .setDescription(
      `**${games.length} game${games.length !== 1 ? "s" : ""} today**\n\n${leagueLines}`
    )
    .setFooter({ text: "Powered by AI Sports Betting Models · aisportsbettingmodels.com" })
    .setTimestamp()
    .toJSON();
}
