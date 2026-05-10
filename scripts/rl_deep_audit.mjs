/**
 * Deep audit: compare awayRunLine vs awayBookSpread for May 10 inverted games.
 * awayRunLine = the RL line used as INPUT to the Python engine (rl_home_spread derived from this)
 * awayBookSpread = the authoritative book RL (written by VSiN scraper)
 * The sign guard should catch when Python output flips, but the ROOT CAUSE is:
 *   if awayRunLine itself is wrong (inverted), then rl_home_spread = -awayRunLine is ALSO wrong,
 *   and the Python engine outputs the WRONG sign for away_run_line.
 *   The sign guard compares Python's away_run_line against awayBookSpread — but if awayBookSpread
 *   was ALSO null/wrong at model-run time, the guard is bypassed.
 */
import { createConnection } from 'mysql2/promise';
import { config } from 'dotenv';
config();

async function main() {
  const db = await createConnection(process.env.DATABASE_URL);
  
  // Get the 3 inverted games for May 10
  const [rows] = await db.execute(
    `SELECT id, awayTeam, homeTeam, gameDate,
      awayRunLine, homeRunLine, awayRunLineOdds, homeRunLineOdds,
      awayBookSpread, homeBookSpread,
      awaySpreadOdds, homeSpreadOdds,
      awayModelSpread, homeModelSpread,
      modelAwaySpreadOdds, modelHomeSpreadOdds,
      awayML, homeML, bookTotal, overOdds, underOdds,
      spreadDiff, spreadEdge, modelRunAt
    FROM games 
    WHERE gameDate='2026-05-10' AND sport='MLB' 
      AND awayTeam IN ('HOU','CHC','ATL')
    ORDER BY awayTeam`
  );
  
  console.log('=== DEEP AUDIT: 3 INVERTED GAMES (May 10) ===\n');
  
  for (const r of rows) {
    console.log(`\n--- ${r.awayTeam}@${r.homeTeam} (id=${r.id}) ---`);
    console.log(`[BOOK LINES]`);
    console.log(`  awayBookSpread=${r.awayBookSpread}  homeBookSpread=${r.homeBookSpread}`);
    console.log(`  awaySpreadOdds=${r.awaySpreadOdds}  homeSpreadOdds=${r.homeSpreadOdds}`);
    console.log(`[RUN LINE FIELDS (used as Python engine INPUT)]`);
    console.log(`  awayRunLine=${r.awayRunLine}  homeRunLine=${r.homeRunLine}`);
    console.log(`  awayRunLineOdds=${r.awayRunLineOdds}  homeRunLineOdds=${r.homeRunLineOdds}`);
    console.log(`[MODEL OUTPUT (written by mlbModelRunner)]`);
    console.log(`  awayModelSpread=${r.awayModelSpread}  homeModelSpread=${r.homeModelSpread}`);
    console.log(`  modelAwaySpreadOdds=${r.modelAwaySpreadOdds}  modelHomeSpreadOdds=${r.modelHomeSpreadOdds}`);
    console.log(`[DERIVED rl_home_spread sent to Python]`);
    if (r.awayRunLine) {
      const awayRLNum = parseFloat(String(r.awayRunLine));
      const rlHomeSpread = -awayRLNum;
      console.log(`  awayRunLine=${r.awayRunLine} → rl_home_spread=${rlHomeSpread}`);
      // Check if this matches awayBookSpread
      const bookAway = parseFloat(String(r.awayBookSpread));
      const rlAway = awayRLNum;
      const bookSign = bookAway >= 0 ? 1 : -1;
      const rlSign = rlAway >= 0 ? 1 : -1;
      if (bookSign !== rlSign) {
        console.log(`  *** MISMATCH: awayRunLine sign (${rlSign > 0 ? '+' : '-'}) ≠ awayBookSpread sign (${bookSign > 0 ? '+' : '-'}) ***`);
        console.log(`  *** ROOT CAUSE: awayRunLine is INVERTED vs awayBookSpread ***`);
        console.log(`  *** This means rl_home_spread sent to Python is WRONG ***`);
        console.log(`  *** Python outputs away_run_line with WRONG sign ***`);
        console.log(`  *** Sign guard should catch this — but did it fire? ***`);
      } else {
        console.log(`  Signs match: awayRunLine and awayBookSpread are consistent`);
        console.log(`  *** ROOT CAUSE: Sign guard FAILED to correct the flip ***`);
      }
    } else {
      console.log(`  awayRunLine=NULL → rl_home_spread derived from ML fallback`);
    }
    console.log(`[SIGN GUARD ANALYSIS]`);
    const bookAway = parseFloat(String(r.awayBookSpread));
    const mdlAway = parseFloat(String(r.awayModelSpread));
    if (!isNaN(bookAway) && !isNaN(mdlAway)) {
      const bookSign = bookAway >= 0 ? 1 : -1;
      const mdlSign = mdlAway >= 0 ? 1 : -1;
      if (bookSign !== mdlSign) {
        console.log(`  *** GUARD FAILED: bookAway=${bookAway} mdlAway=${mdlAway} — signs still inverted in DB ***`);
        console.log(`  *** This means awayBookSpread was NULL or wrong when the model ran ***`);
      } else {
        console.log(`  Guard OK: signs match`);
      }
    }
  }
  
  // Also check: what was awayBookSpread for these games BEFORE the model ran?
  // We can check if awayBookSpread is currently populated (it is, since we see it in the audit)
  // The question is: was it populated AT MODEL RUN TIME?
  // modelRunAt is a timestamp — check if awayBookSpread was written before or after modelRunAt
  console.log('\n=== TIMING ANALYSIS ===');
  console.log('If awayBookSpread was NULL when model ran, the sign guard is bypassed.');
  console.log('The guard only fires when bookAwaySpreadForGuard !== null.');
  console.log('\nCurrent awayBookSpread values (should be non-null for all 3):');
  for (const r of rows) {
    console.log(`  ${r.awayTeam}@${r.homeTeam}: awayBookSpread=${r.awayBookSpread} (modelRunAt=${new Date(Number(r.modelRunAt)).toISOString()})`);
  }
  
  await db.end();
}
main().catch(console.error);
