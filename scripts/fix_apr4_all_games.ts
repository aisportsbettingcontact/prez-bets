/**
 * fix_apr4_all_games.ts
 * 
 * Fixes:
 * 1. Run NHL model for ALL April 4 games including live (Red Wings/Rangers + Wild/Senators)
 * 2. Publish ALL 15 NHL games to feed
 * 3. Set publishedModel=true for both NCAAM F4 games
 * 4. Compute spreadEdge and totalEdge for both NCAAM F4 games
 * 5. Full verification of all games
 */

import { syncNhlModelForToday } from "../server/nhlModelSync.js";
import { getDb } from "../server/db.js";
import { games } from "../drizzle/schema.js";
import { eq, and, inArray } from "drizzle-orm";

const NCAAM_F4_IDS = [2640001, 1890053]; // illinois@connecticut, michigan@arizona

async function computeEdge(
  modelLine: number | null,
  bookLine: number | null
): Promise<string | null> {
  if (modelLine === null || bookLine === null) return null;
  const diff = bookLine - modelLine;
  if (Math.abs(diff) < 0.5) return null;
  return diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
}

async function main() {
  console.log("=".repeat(70));
  console.log("[FIX] April 4 All Games — NHL + NCAAM F4");
  console.log("=".repeat(70));

  const db = await getDb();

  // ── STEP 1: Run NHL model with runAllStatuses=true (includes live games) ──
  console.log("\n[STEP 1] Running NHL model for ALL April 4 games (including live)...");
  console.log("[INPUT] source=manual, forceRerun=true, runAllStatuses=true");
  
  const nhlResult = await syncNhlModelForToday("manual", true, true);
  
  console.log(`[STATE] NHL model result: synced=${nhlResult.synced} skipped=${nhlResult.skipped} errors=${nhlResult.errors.length}`);
  if (nhlResult.errors.length > 0) {
    nhlResult.errors.forEach(e => console.error("[ERROR]", e));
  }
  console.log("[VERIFY] NHL model run complete");

  // ── STEP 2: Publish ALL 15 NHL games ──────────────────────────────────────
  console.log("\n[STEP 2] Publishing ALL 15 NHL April 4 games to feed...");
  
  const nhlGames = await db
    .select({ id: games.id, awayTeam: games.awayTeam, homeTeam: games.homeTeam, 
              awayModelSpread: games.awayModelSpread, publishedToFeed: games.publishedToFeed,
              publishedModel: games.publishedModel, gameStatus: games.gameStatus })
    .from(games)
    .where(and(eq(games.gameDate, "2026-04-04"), eq(games.sport, "NHL")));
  
  console.log(`[STATE] Found ${nhlGames.length} NHL games for April 4`);
  
  let nhlPublished = 0;
  let nhlModelPublished = 0;
  
  for (const g of nhlGames) {
    const hasModel = g.awayModelSpread !== null;
    const updateData: Record<string, unknown> = { publishedToFeed: true };
    if (hasModel) {
      updateData.publishedModel = true;
      nhlModelPublished++;
    }
    await db.update(games).set(updateData).where(eq(games.id, g.id));
    nhlPublished++;
    console.log(`  [STEP 2.${nhlPublished}] Published id=${g.id} | ${g.awayTeam}@${g.homeTeam} | status=${g.gameStatus} | hasModel=${hasModel}`);
  }
  
  console.log(`[VERIFY] NHL: ${nhlPublished}/15 publishedToFeed=true, ${nhlModelPublished}/15 publishedModel=true`);

  // ── STEP 3: Fix NCAAM F4 publishedModel + compute edges ───────────────────
  console.log("\n[STEP 3] Fixing NCAAM F4 games: publishedModel=true + computing edges...");
  
  const ncaamGames = await db
    .select({
      id: games.id, awayTeam: games.awayTeam, homeTeam: games.homeTeam,
      awayBookSpread: games.awayBookSpread, homeBookSpread: games.homeBookSpread,
      bookTotal: games.bookTotal,
      awayModelSpread: games.awayModelSpread, homeModelSpread: games.homeModelSpread,
      modelTotal: games.modelTotal,
      modelAwayWinPct: games.modelAwayWinPct, modelHomeWinPct: games.modelHomeWinPct,
      spreadEdge: games.spreadEdge, totalEdge: games.totalEdge,
      publishedToFeed: games.publishedToFeed, publishedModel: games.publishedModel,
      bracketRound: games.bracketRound
    })
    .from(games)
    .where(inArray(games.id, NCAAM_F4_IDS));
  
  for (const g of ncaamGames) {
    console.log(`\n  [STEP 3] Processing id=${g.id} | ${g.awayTeam}@${g.homeTeam} [${g.bracketRound}]`);
    console.log(`    [INPUT] book_sp=${g.awayBookSpread}/${g.homeBookSpread} book_total=${g.bookTotal}`);
    console.log(`    [INPUT] model_sp=${g.awayModelSpread}/${g.homeModelSpread} model_total=${g.modelTotal}`);
    console.log(`    [INPUT] win%=${g.modelAwayWinPct}/${g.modelHomeWinPct}`);
    
    // Compute spread edge: positive = away team has edge (model thinks away covers)
    // spreadEdge = bookSpread - modelSpread (from away perspective)
    let spreadEdge: string | null = null;
    if (g.awayBookSpread !== null && g.awayModelSpread !== null) {
      const bookSp = parseFloat(String(g.awayBookSpread));
      const modelSp = parseFloat(String(g.awayModelSpread));
      const diff = bookSp - modelSp; // positive = book gives more points to away than model thinks needed
      if (Math.abs(diff) >= 0.5) {
        spreadEdge = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
      }
    }
    
    // Compute total edge: positive = OVER edge (model projects more than book total)
    let totalEdge: string | null = null;
    if (g.bookTotal !== null && g.modelTotal !== null) {
      const bookTot = parseFloat(String(g.bookTotal));
      const modelTot = parseFloat(String(g.modelTotal));
      const diff = modelTot - bookTot; // positive = model projects more = OVER edge
      if (Math.abs(diff) >= 0.5) {
        totalEdge = diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1);
      }
    }
    
    console.log(`    [STATE] computed spreadEdge=${spreadEdge} totalEdge=${totalEdge}`);
    
    await db.update(games).set({
      publishedToFeed: true,
      publishedModel: true,
      spreadEdge,
      totalEdge
    }).where(eq(games.id, g.id));
    
    console.log(`    [VERIFY] id=${g.id} publishedModel=true spreadEdge=${spreadEdge} totalEdge=${totalEdge} ✓`);
  }

  // ── STEP 4: Final verification ────────────────────────────────────────────
  console.log("\n[STEP 4] Final verification of all April 4 games...");
  
  const [nhlFinal] = await (await getDb()).execute(`
    SELECT id, awayTeam, homeTeam, gameStatus,
           awayModelSpread IS NOT NULL AS modeled,
           publishedToFeed, publishedModel
    FROM games WHERE sport='NHL' AND gameDate='2026-04-04'
    ORDER BY startTimeEst
  `) as [Array<{id: number, awayTeam: string, homeTeam: string, gameStatus: string, modeled: number, publishedToFeed: number, publishedModel: number}>];
  
  console.log(`\n[VERIFY] NHL April 4 (${nhlFinal.length} games):`);
  let nhlOk = 0;
  for (const g of nhlFinal) {
    const ok = g.publishedToFeed === 1;
    const status = ok ? "✓" : "✗";
    console.log(`  ${status} id=${g.id} | ${g.awayTeam}@${g.homeTeam} | status=${g.gameStatus} | modeled=${!!g.modeled} | pub=${!!g.publishedToFeed} | pubModel=${!!g.publishedModel}`);
    if (ok) nhlOk++;
  }
  console.log(`[VERIFY] NHL: ${nhlOk}/${nhlFinal.length} published to feed`);
  
  const [ncaamFinal] = await (await getDb()).execute(`
    SELECT id, awayTeam, homeTeam, bracketRound,
           awayModelSpread IS NOT NULL AS modeled,
           publishedToFeed, publishedModel, spreadEdge, totalEdge
    FROM games WHERE sport='NCAAM' AND gameDate='2026-04-04'
    ORDER BY startTimeEst
  `) as [Array<{id: number, awayTeam: string, homeTeam: string, bracketRound: string, modeled: number, publishedToFeed: number, publishedModel: number, spreadEdge: string|null, totalEdge: string|null}>];
  
  console.log(`\n[VERIFY] NCAAM F4 April 4 (${ncaamFinal.length} games):`);
  let ncaamOk = 0;
  for (const g of ncaamFinal) {
    const ok = g.publishedToFeed === 1 && g.publishedModel === 1;
    const status = ok ? "✓" : "✗";
    console.log(`  ${status} id=${g.id} | ${g.awayTeam}@${g.homeTeam} [${g.bracketRound}] | modeled=${!!g.modeled} | pub=${!!g.publishedToFeed} | pubModel=${!!g.publishedModel} | spreadEdge=${g.spreadEdge} | totalEdge=${g.totalEdge}`);
    if (ok) ncaamOk++;
  }
  console.log(`[VERIFY] NCAAM: ${ncaamOk}/${ncaamFinal.length} fully published with model`);
  
  console.log("\n" + "=".repeat(70));
  console.log(`[OUTPUT] COMPLETE — NHL: ${nhlOk}/15 published | NCAAM: ${ncaamOk}/2 fully published`);
  console.log("=".repeat(70));
  
  process.exit(0);
}

main().catch(e => {
  console.error("[FATAL]", e.message, e.stack);
  process.exit(1);
});
