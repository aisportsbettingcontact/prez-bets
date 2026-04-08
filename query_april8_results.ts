/**
 * query_april8_results.ts
 * Query April 8 model results, edges, and K-Props from DB for final summary
 */
import "dotenv/config";
import { getDb } from "./server/db.js";
import { games, mlbStrikeoutProps } from "./drizzle/schema.js";
import { eq, and, inArray } from "drizzle-orm";

const DATE = "2026-04-08";
const db = await getDb();

// ── MLB games ────────────────────────────────────────────────────────────────
const mlbGames = await db.select({
  id: games.id,
  away: games.awayTeam,
  home: games.homeTeam,
  awayML: games.awayML,
  homeML: games.homeML,
  bookTotal: games.bookTotal,
  awayBookSpread: games.awayBookSpread,
  modelTotal: games.modelTotal,
  awayModelSpread: games.awayModelSpread,
  modelAwayWinPct: games.modelAwayWinPct,
  modelHomeWinPct: games.modelHomeWinPct,
  modelAwayML: games.modelAwayML,
  modelHomeML: games.modelHomeML,
  modelAwayScore: games.modelAwayScore,
  modelHomeScore: games.modelHomeScore,
  spreadEdge: games.spreadEdge,
  totalEdge: games.totalEdge,
  publishedModel: games.publishedModel,
  awayStartingPitcher: games.awayStartingPitcher,
  homeStartingPitcher: games.homeStartingPitcher,
}).from(games).where(and(eq(games.gameDate, DATE), eq(games.sport, "MLB")));

console.log(`\n${"═".repeat(80)}`);
console.log(`APRIL 8, 2026 — MLB MODEL RESULTS (${mlbGames.length} games)`);
console.log(`${"═".repeat(80)}`);

for (const g of mlbGames) {
  const pub = g.publishedModel ? "✅ PUB" : "❌ UNPUB";
  const awayWin = g.modelAwayWinPct ? (Number(g.modelAwayWinPct) * 100).toFixed(1) + "%" : "null";
  const homeWin = g.modelHomeWinPct ? (Number(g.modelHomeWinPct) * 100).toFixed(1) + "%" : "null";
  const awayScore = g.modelAwayScore ? Number(g.modelAwayScore).toFixed(2) : "null";
  const homeScore = g.modelHomeScore ? Number(g.modelHomeScore).toFixed(2) : "null";

  const edges: string[] = [];
  if (g.spreadEdge && g.spreadEdge !== "NONE" && g.spreadEdge !== "") edges.push(`SPR: ${g.spreadEdge}`);
  if (g.totalEdge && g.totalEdge !== "NONE" && g.totalEdge !== "") edges.push(`TOT: ${g.totalEdge}`);

  const edgeStr = edges.length > 0 ? `\n    EDGES: ${edges.join(" | ")}` : "";

  console.log(`\n  ${g.away}@${g.home} [${pub}]`);
  console.log(`    SP: ${g.awayStartingPitcher ?? "TBD"} vs ${g.homeStartingPitcher ?? "TBD"}`);
  console.log(`    Book: ML=${g.awayML ?? "null"}/${g.homeML ?? "null"} | SPR=${g.awayBookSpread ?? "null"} | TOT=${g.bookTotal ?? "null"}`);
  console.log(`    Model: win%=${awayWin}/${homeWin} | projScore=${awayScore}-${homeScore} | modelML=${g.modelAwayML ?? "null"}/${g.modelHomeML ?? "null"}`);
  console.log(`    Model: modelTOT=${g.modelTotal ?? "null"} | modelSPR=${g.awayModelSpread ?? "null"}`);
  if (edgeStr) console.log(edgeStr);
}

// ── K-Props ──────────────────────────────────────────────────────────────────
const gameIds = mlbGames.map(g => g.id);
const kProps = await db.select({
  pitcherName: mlbStrikeoutProps.pitcherName,
  teamAbbrev: mlbStrikeoutProps.teamAbbrev,
  bookLine: mlbStrikeoutProps.bookLine,
  kProj: mlbStrikeoutProps.kProj,
  pOver: mlbStrikeoutProps.pOver,
  edgeOver: mlbStrikeoutProps.edgeOver,
  evOver: mlbStrikeoutProps.evOver,
  verdict: mlbStrikeoutProps.verdict,
}).from(mlbStrikeoutProps).where(inArray(mlbStrikeoutProps.gameId, gameIds));

console.log(`\n${"═".repeat(80)}`);
console.log(`APRIL 8, 2026 — K-PROPS MODEL (${kProps.length} pitchers)`);
console.log(`${"═".repeat(80)}`);

const overPicks = kProps.filter(k => k.verdict === "OVER");
const underPicks = kProps.filter(k => k.verdict === "UNDER");
const passPicks = kProps.filter(k => k.verdict === "PASS" || !k.verdict);

console.log(`\n  OVER picks (${overPicks.length}):`);
for (const k of overPicks) {
  const proj = Number(k.kProj ?? 0).toFixed(1);
  const pOv = (Number(k.pOver ?? 0) * 100).toFixed(1);
  const edge = Number(k.edgeOver ?? 0).toFixed(3);
  const ev = Number(k.evOver ?? 0).toFixed(1);
  console.log(`    ► ${k.pitcherName} (${k.teamAbbrev}): line=${k.bookLine} proj=${proj} pOver=${pOv}% edge=${edge} EV=${ev}`);
}
console.log(`\n  UNDER picks (${underPicks.length}):`);
for (const k of underPicks) {
  const proj = Number(k.kProj ?? 0).toFixed(1);
  const pOv = (Number(k.pOver ?? 0) * 100).toFixed(1);
  console.log(`    ► ${k.pitcherName} (${k.teamAbbrev}): line=${k.bookLine} proj=${proj} pOver=${pOv}%`);
}
console.log(`\n  PASS: ${passPicks.length}`);

// ── NHL games ────────────────────────────────────────────────────────────────
const nhlGames = await db.select({
  away: games.awayTeam,
  home: games.homeTeam,
  awayML: games.awayML,
  homeML: games.homeML,
  bookTotal: games.bookTotal,
  awayBookSpread: games.awayBookSpread,
  modelTotal: games.modelTotal,
  awayModelSpread: games.awayModelSpread,
  modelAwayWinPct: games.modelAwayWinPct,
  modelHomeWinPct: games.modelHomeWinPct,
  modelAwayML: games.modelAwayML,
  modelHomeML: games.modelHomeML,
  modelAwayScore: games.modelAwayScore,
  modelHomeScore: games.modelHomeScore,
  spreadEdge: games.spreadEdge,
  totalEdge: games.totalEdge,
  publishedModel: games.publishedModel,
}).from(games).where(and(eq(games.gameDate, DATE), eq(games.sport, "NHL")));

console.log(`\n${"═".repeat(80)}`);
console.log(`APRIL 8, 2026 — NHL MODEL RESULTS (${nhlGames.length} games)`);
console.log(`${"═".repeat(80)}`);

for (const g of nhlGames) {
  const pub = g.publishedModel ? "✅ PUB" : "❌ UNPUB";
  const awayWin = g.modelAwayWinPct ? (Number(g.modelAwayWinPct) * 100).toFixed(1) + "%" : "null";
  const homeWin = g.modelHomeWinPct ? (Number(g.modelHomeWinPct) * 100).toFixed(1) + "%" : "null";
  const awayScore = g.modelAwayScore ? Number(g.modelAwayScore).toFixed(2) : "null";
  const homeScore = g.modelHomeScore ? Number(g.modelHomeScore).toFixed(2) : "null";

  const edges: string[] = [];
  if (g.spreadEdge && g.spreadEdge !== "NONE" && g.spreadEdge !== "") edges.push(`PL: ${g.spreadEdge}`);
  if (g.totalEdge && g.totalEdge !== "NONE" && g.totalEdge !== "") edges.push(`TOT: ${g.totalEdge}`);

  const edgeStr = edges.length > 0 ? `\n    EDGES: ${edges.join(" | ")}` : "";

  console.log(`\n  ${g.away}@${g.home} [${pub}]`);
  console.log(`    Book: ML=${g.awayML ?? "null"}/${g.homeML ?? "null"} | PL=${g.awayBookSpread ?? "null"} | TOT=${g.bookTotal ?? "null"}`);
  console.log(`    Model: win%=${awayWin}/${homeWin} | projGoals=${awayScore}-${homeScore} | modelML=${g.modelAwayML ?? "null"}/${g.modelHomeML ?? "null"}`);
  console.log(`    Model: modelTOT=${g.modelTotal ?? "null"} | modelPL=${g.awayModelSpread ?? "null"}`);
  if (edgeStr) console.log(edgeStr);
}

process.exit(0);
