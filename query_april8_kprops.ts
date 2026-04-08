/**
 * query_april8_kprops.ts
 * Query April 8 K-Props and NHL model results from DB
 */
import "dotenv/config";
import { getDb } from "./server/db.js";
import { games, mlbStrikeoutProps } from "./drizzle/schema.js";
import { eq, and, inArray } from "drizzle-orm";

const DATE = "2026-04-08";
const db = await getDb();

// Get April 8 MLB game IDs
const mlbGames = await db.select({ id: games.id, away: games.awayTeam, home: games.homeTeam })
  .from(games).where(and(eq(games.gameDate, DATE), eq(games.sport, "MLB")));
const gameIds = mlbGames.map(g => g.id);

// ── K-Props ──────────────────────────────────────────────────────────────────
const kProps = await db.select({
  pitcherName: mlbStrikeoutProps.pitcherName,
  side: mlbStrikeoutProps.side,
  bookLine: mlbStrikeoutProps.bookLine,
  kProj: mlbStrikeoutProps.kProj,
  pOver: mlbStrikeoutProps.pOver,
  edgeOver: mlbStrikeoutProps.edgeOver,
  edgeUnder: mlbStrikeoutProps.edgeUnder,
  bestEdge: mlbStrikeoutProps.bestEdge,
  verdict: mlbStrikeoutProps.verdict,
  anNoVigOverPct: mlbStrikeoutProps.anNoVigOverPct,
  modelOverOdds: mlbStrikeoutProps.modelOverOdds,
  gameId: mlbStrikeoutProps.gameId,
}).from(mlbStrikeoutProps).where(inArray(mlbStrikeoutProps.gameId, gameIds));

// Build game lookup
const gameLookup = new Map(mlbGames.map(g => [g.id, `${g.away}@${g.home}`]));

console.log(`\n${"═".repeat(80)}`);
console.log(`APRIL 8, 2026 — K-PROPS MODEL (${kProps.length} pitchers)`);
console.log(`${"═".repeat(80)}`);

const overPicks = kProps.filter(k => k.verdict === "OVER").sort((a, b) => Number(b.edgeOver ?? 0) - Number(a.edgeOver ?? 0));
const underPicks = kProps.filter(k => k.verdict === "UNDER");
const passPicks = kProps.filter(k => k.verdict === "PASS" || !k.verdict);

console.log(`\n  ✅ OVER picks (${overPicks.length}):`);
for (const k of overPicks) {
  const game = gameLookup.get(k.gameId) ?? "?";
  const proj = Number(k.kProj ?? 0).toFixed(1);
  const pOv = (Number(k.pOver ?? 0) * 100).toFixed(1);
  const edge = Number(k.edgeOver ?? 0).toFixed(3);
  const anNv = k.anNoVigOverPct ? (Number(k.anNoVigOverPct) * 100).toFixed(1) + "%" : "null";
  const modelOdds = k.modelOverOdds ?? "null";
  console.log(`    ► ${k.pitcherName} [${game}]: line=${k.bookLine} proj=${proj}K pOver=${pOv}% anNoVig=${anNv} edge=${edge} modelOdds=${modelOdds}`);
}

console.log(`\n  ❌ UNDER picks (${underPicks.length}):`);
for (const k of underPicks) {
  const game = gameLookup.get(k.gameId) ?? "?";
  const proj = Number(k.kProj ?? 0).toFixed(1);
  const pOv = (Number(k.pOver ?? 0) * 100).toFixed(1);
  const edge = Number(k.edgeUnder ?? 0).toFixed(3);
  console.log(`    ► ${k.pitcherName} [${game}]: line=${k.bookLine} proj=${proj}K pOver=${pOv}% edgeUnder=${edge}`);
}

console.log(`\n  — PASS: ${passPicks.length}`);

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
  // modelAwayWinPct is stored as decimal 0-100 (e.g. 48.26 not 0.4826)
  const awayWin = g.modelAwayWinPct ? Number(g.modelAwayWinPct).toFixed(1) + "%" : "null";
  const homeWin = g.modelHomeWinPct ? Number(g.modelHomeWinPct).toFixed(1) + "%" : "null";
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
