/**
 * testAnMlb.mjs
 * Directly calls the Action Network v2 API for MLB April 1, 2026
 * to check what odds data is available right now.
 */

import dotenv from "dotenv";
dotenv.config();

const AN_BASE = "https://api.actionnetwork.com/web/v2/scoreboard";

async function fetchAnMlb(date) {
  const url = `${AN_BASE}/mlb?period=game&bookIds=68,30,69&date=${date}`;
  console.log(`[INPUT] Fetching: ${url}`);

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; sports-model/1.0)",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    console.error(`[ERROR] HTTP ${res.status} ${res.statusText}`);
    const body = await res.text();
    console.error("[BODY]", body.slice(0, 500));
    return;
  }

  const data = await res.json();
  const games = data?.games ?? [];
  console.log(`\n[STATE] Total games in API response: ${games.length}`);

  for (const game of games) {
    const away = game.teams?.find((t) => t.id === game.away_team_id);
    const home = game.teams?.find((t) => t.id === game.home_team_id);
    const awayAbbr = away?.abbr ?? "?";
    const homeAbbr = home?.abbr ?? "?";

    // DraftKings NJ = book_id 68
    const dkMarkets = game.markets?.[68]?.event ?? {};
    const dkSpreadAway = dkMarkets.spread?.find((s) => s.side === "away");
    const dkSpreadHome = dkMarkets.spread?.find((s) => s.side === "home");
    const dkTotalOver = dkMarkets.total?.find((t) => t.side === "over");
    const dkTotalUnder = dkMarkets.total?.find((t) => t.side === "under");
    const dkMlAway = dkMarkets.moneyline?.find((m) => m.side === "away");
    const dkMlHome = dkMarkets.moneyline?.find((m) => m.side === "home");

    console.log(`\n[GAME] ${awayAbbr} @ ${homeAbbr} | id=${game.id} | status=${game.status}`);
    console.log(`  DK Spread:    away=${dkSpreadAway?.value ?? "NULL"}(${dkSpreadAway?.odds ?? "NULL"}) home=${dkSpreadHome?.value ?? "NULL"}(${dkSpreadHome?.odds ?? "NULL"})`);
    console.log(`  DK Total:     over=${dkTotalOver?.value ?? "NULL"}(${dkTotalOver?.odds ?? "NULL"}) under=${dkTotalUnder?.value ?? "NULL"}(${dkTotalUnder?.odds ?? "NULL"})`);
    console.log(`  DK ML:        away=${dkMlAway?.odds ?? "NULL"} home=${dkMlHome?.odds ?? "NULL"}`);

    // Check if any book has total data
    const bookIds = Object.keys(game.markets ?? {});
    const booksWithTotal = bookIds.filter((bid) => {
      const ev = game.markets[bid]?.event;
      return ev?.total?.length > 0;
    });
    const booksWithSpread = bookIds.filter((bid) => {
      const ev = game.markets[bid]?.event;
      return ev?.spread?.length > 0;
    });
    console.log(`  Books with total data: [${booksWithTotal.join(", ")}]`);
    console.log(`  Books with spread data: [${booksWithSpread.join(", ")}]`);
  }

  console.log("\n[OUTPUT] Summary:");
  const withDkTotal = games.filter((g) => g.markets?.[68]?.event?.total?.length > 0);
  const withDkSpread = games.filter((g) => g.markets?.[68]?.event?.spread?.length > 0);
  const withDkML = games.filter((g) => g.markets?.[68]?.event?.moneyline?.length > 0);
  console.log(`  Games with DK total:  ${withDkTotal.length} / ${games.length}`);
  console.log(`  Games with DK spread: ${withDkSpread.length} / ${games.length}`);
  console.log(`  Games with DK ML:     ${withDkML.length} / ${games.length}`);
}

await fetchAnMlb("2026-04-01");
