/**
 * Direct model runner for all 8 March 22 NCAA Tournament games.
 * Runs sequentially to respect KenPom rate limits.
 * Usage: npx tsx run_march22_models.ts
 */
import { runModelForGame } from "./server/ncaamModelEngine";
import { updateGameProjections, setGameModelPublished, bulkApproveModels } from "./server/db";

const GAME_IDS = [1890025, 1890027, 1890028, 1890032, 1890035, 1890037, 1890038, 1890039];

// Game data: [id, awayKenpom, homeKenpom, awayConf, homeConf, mktSpread, mktTotal, awayML, homeML]
const GAME_DATA = [
  { id: 1890025, away: "St. John's", home: "Kansas",     confA: "Big East",     confH: "Big 12",   mktSp: -3.5,  mktTo: 144.5, awayML: -166, homeML: 140,  awaySpreadOdds: -110, homeSpreadOdds: -110 },
  { id: 1890027, away: "UCLA",       home: "Connecticut", confA: "Big Ten",      confH: "Big East",  mktSp: 4.5,   mktTo: 136.5, awayML: 164,  homeML: -198, awaySpreadOdds: -110, homeSpreadOdds: -110 },
  { id: 1890028, away: "Florida",    home: "Iowa",        confA: "SEC",          confH: "Big Ten",   mktSp: -10.5, mktTo: 145.5, awayML: -600, homeML: 440,  awaySpreadOdds: -110, homeSpreadOdds: -110 },
  { id: 1890032, away: "Arizona",    home: "Utah St.",    confA: "Big 12",       confH: "Mountain West", mktSp: -12.5, mktTo: 154.5, awayML: -800, homeML: 550, awaySpreadOdds: -110, homeSpreadOdds: -110 },
  { id: 1890035, away: "Miami FL",   home: "Purdue",      confA: "ACC",          confH: "Big Ten",   mktSp: 7.5,   mktTo: 147.5, awayML: 270,  homeML: -340, awaySpreadOdds: -110, homeSpreadOdds: -110 },
  { id: 1890037, away: "Texas Tech", home: "Alabama",     confA: "Big 12",       confH: "SEC",       mktSp: -1.5,  mktTo: 164.5, awayML: -118, homeML: -102, awaySpreadOdds: -110, homeSpreadOdds: -110 },
  { id: 1890038, away: "Tennessee",  home: "Virginia",    confA: "SEC",          confH: "ACC",       mktSp: -1.5,  mktTo: 137.5, awayML: -118, homeML: -102, awaySpreadOdds: -110, homeSpreadOdds: -110 },
  { id: 1890039, away: "Kentucky",   home: "Iowa St.",    confA: "SEC",          confH: "Big 12",    mktSp: 4.5,   mktTo: 145.5, awayML: 180,  homeML: -218, awaySpreadOdds: -110, homeSpreadOdds: -110 },
];

const KENPOM_EMAIL = process.env.KENPOM_EMAIL!;
const KENPOM_PASS = process.env.KENPOM_PASSWORD!;

if (!KENPOM_EMAIL || !KENPOM_PASS) {
  console.error("Missing KENPOM_EMAIL or KENPOM_PASSWORD env vars");
  process.exit(1);
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log(`[March22Models] Starting model run for ${GAME_DATA.length} games...`);
  
  for (let i = 0; i < GAME_DATA.length; i++) {
    const g = GAME_DATA[i];
    console.log(`\n[March22Models] [${i+1}/${GAME_DATA.length}] Running: ${g.away} @ ${g.home} (id=${g.id})`);
    
    try {
      const result = await runModelForGame({
        away_team: g.away,
        home_team: g.home,
        conf_a: g.confA,
        conf_h: g.confH,
        mkt_sp: g.mktSp,
        mkt_to: g.mktTo,
        mkt_ml_a: g.awayML,
        mkt_ml_h: g.homeML,
        spread_away_odds: g.awaySpreadOdds,
        spread_home_odds: g.homeSpreadOdds,
        over_odds: -110,
        under_odds: -110,
        kenpom_email: KENPOM_EMAIL,
        kenpom_pass: KENPOM_PASS,
      });
      
      const awayModelSpread = result.orig_away_sp;
      const homeModelSpread = result.orig_home_sp;
      const modelTotal = result.orig_total;
      
      console.log(`[March22Models] Result: ${g.away} ${result.orig_away_score.toFixed(2)} - ${g.home} ${result.orig_home_score.toFixed(2)}`);
      console.log(`[March22Models] Spread: ${awayModelSpread} | Total: ${modelTotal} | ML: ${result.away_ml_fair}/${result.home_ml_fair}`);
      
      // Update the DB
      await updateGameProjections(g.id, {
        modelAwayScore: String(result.orig_away_score),
        modelHomeScore: String(result.orig_home_score),
        modelTotal: String(modelTotal),
        awayModelSpread: String(awayModelSpread),
        homeModelSpread: String(homeModelSpread),
        modelAwayML: String(Math.round(result.away_ml_fair)),
        modelHomeML: String(Math.round(result.home_ml_fair)),
        modelAwayWinPct: String(result.ml_away_pct),
        modelHomeWinPct: String(result.ml_home_pct),
        modelOverRate: String(result.over_rate),
        modelUnderRate: String(result.under_rate),
        modelSpreadClamped: result.spread_clamped,
        modelTotalClamped: result.total_clamped,
        modelCoverDirection: result.cover_direction,
        modelAwaySpreadOdds: String(result.mkt_spread_away_odds),
        modelHomeSpreadOdds: String(result.mkt_spread_home_odds),
        modelOverOdds: String(result.mkt_total_over_odds),
        modelUnderOdds: String(result.mkt_total_under_odds),
        modelRunAt: Date.now(),
      });
      
      console.log(`[March22Models] ✅ DB updated for game ${g.id}`);
      
    } catch (err) {
      console.error(`[March22Models] ❌ Error for game ${g.id}:`, err);
    }
    
    // 35s stagger between games to respect KenPom rate limits
    if (i < GAME_DATA.length - 1) {
      console.log(`[March22Models] Waiting 35s before next game...`);
      await sleep(35000);
    }
  }
  
  console.log(`\n[March22Models] All games processed. Now publishing...`);
  
  // Bulk publish all 8 games
  const approved = await bulkApproveModels("2026-03-22", "NCAAM");
  console.log(`[March22Models] Bulk approved ${approved} games`);
  // Also set publishedToFeed for all 8
  for (const id of GAME_IDS) {
    await setGameModelPublished(id, true);
  }
  
  console.log(`[March22Models] ✅ All 8 games published!`);
  process.exit(0);
}

main().catch(err => {
  console.error("[March22Models] Fatal error:", err);
  process.exit(1);
});
