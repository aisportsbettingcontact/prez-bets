/**
 * audit_phi_bos2.mjs — corrected column names
 */
import { createConnection } from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const db = await createConnection(process.env.DATABASE_URL);

const [rows] = await db.execute(
  `SELECT id, awayTeam, homeTeam, gameDate,
     awaySpread, homeSpread, awaySpreadOdds, homeSpreadOdds,
     bookTotal, overOdds, underOdds,
     awayML, homeML,
     modelAwaySpread, modelHomeSpread, modelAwaySpreadOdds, modelHomeSpreadOdds,
     modelTotal, modelOverOdds, modelUnderOdds,
     modelAwayML, modelHomeML,
     spreadDiff, spreadEdge, totalDiff, totalEdge,
     gameStatus, awayScore, homeScore, modelRunAt,
     openAwaySpread, openHomeSpread, openAwaySpreadOdds, openHomeSpreadOdds,
     openTotal, openOverOdds, openUnderOdds, openAwayML, openHomeML,
     spreadAwayBetsPct, spreadAwayMoneyPct,
     totalOverBetsPct, totalOverMoneyPct,
     mlAwayBetsPct, mlAwayMoneyPct,
     awayWinPct, homeWinPct, awayRunsProjected, homeRunsProjected,
     overPct, underPct, awaySpreadCoverPct, homeSpreadCoverPct
   FROM games
   WHERE id = 2250616`
);

const g = rows[0];
if (!g) { console.log('Game not found'); await db.end(); process.exit(1); }

console.log('\n[BOOK LINES]');
console.log(`  awaySpread=${g.awaySpread} awaySpreadOdds=${g.awaySpreadOdds}`);
console.log(`  homeSpread=${g.homeSpread} homeSpreadOdds=${g.homeSpreadOdds}`);
console.log(`  bookTotal=${g.bookTotal} overOdds=${g.overOdds} underOdds=${g.underOdds}`);
console.log(`  awayML=${g.awayML} homeML=${g.homeML}`);

console.log('\n[MODEL LINES]');
console.log(`  modelAwaySpread=${g.modelAwaySpread} modelAwaySpreadOdds=${g.modelAwaySpreadOdds}`);
console.log(`  modelHomeSpread=${g.modelHomeSpread} modelHomeSpreadOdds=${g.modelHomeSpreadOdds}`);
console.log(`  modelTotal=${g.modelTotal} modelOverOdds=${g.modelOverOdds} modelUnderOdds=${g.modelUnderOdds}`);
console.log(`  modelAwayML=${g.modelAwayML} modelHomeML=${g.modelHomeML}`);

console.log('\n[EDGE FIELDS]');
console.log(`  spreadDiff=${g.spreadDiff} spreadEdge=${g.spreadEdge}`);
console.log(`  totalDiff=${g.totalDiff} totalEdge=${g.totalEdge}`);

console.log('\n[GAME STATE]');
console.log(`  gameStatus=${g.gameStatus} awayScore=${g.awayScore} homeScore=${g.homeScore}`);
console.log(`  modelRunAt=${g.modelRunAt}`);

console.log('\n[OPEN LINES]');
console.log(`  openAwaySpread=${g.openAwaySpread} openAwaySpreadOdds=${g.openAwaySpreadOdds}`);
console.log(`  openHomeSpread=${g.openHomeSpread} openHomeSpreadOdds=${g.openHomeSpreadOdds}`);
console.log(`  openTotal=${g.openTotal} openOverOdds=${g.openOverOdds} openUnderOdds=${g.openUnderOdds}`);
console.log(`  openAwayML=${g.openAwayML} openHomeML=${g.openHomeML}`);

console.log('\n[SIMULATION OUTPUTS]');
console.log(`  awayWinPct=${g.awayWinPct} homeWinPct=${g.homeWinPct}`);
console.log(`  awayRunsProjected=${g.awayRunsProjected} homeRunsProjected=${g.homeRunsProjected}`);
console.log(`  overPct=${g.overPct} underPct=${g.underPct}`);
console.log(`  awaySpreadCoverPct=${g.awaySpreadCoverPct} homeSpreadCoverPct=${g.homeSpreadCoverPct}`);

console.log('\n[VALIDATION CHECKS]');

// Check 1: bookTotal vs modelTotal
const modelTotal = parseFloat(g.modelTotal ?? 'NaN');
const bookTotal = parseFloat(g.bookTotal ?? 'NaN');
console.log(`  [C1] bookTotal=${g.bookTotal} modelTotal=${g.modelTotal} diff=${isNaN(modelTotal)||isNaN(bookTotal)?'N/A':(Math.abs(modelTotal-bookTotal)).toFixed(2)}`);

// Check 2: modelAwayML vs awayML
const modelAwayML = parseInt(g.modelAwayML ?? 'NaN');
const bookAwayML = parseInt(g.awayML ?? 'NaN');
if (!isNaN(modelAwayML) && !isNaN(bookAwayML)) {
  const diff = Math.abs(modelAwayML - bookAwayML);
  console.log(`  [C2] modelAwayML=${modelAwayML} vs bookAwayML=${bookAwayML}: diff=${diff} ${diff > 100 ? '⚠️ LARGE DIFF — model may be wrong' : '✓'}`);
}

// Check 3: awaySpread null check
console.log(`  [C3] awaySpread=${g.awaySpread} (${g.awaySpread == null ? '⚠️ NULL — book spread not ingested' : '✓'})`);

// Check 4: modelOverOdds vs modelUnderOdds — should be opposite signs
if (g.modelOverOdds && g.modelUnderOdds) {
  const over = parseInt(g.modelOverOdds);
  const under = parseInt(g.modelUnderOdds);
  const overProb = over > 0 ? 100/(100+over) : Math.abs(over)/(Math.abs(over)+100);
  const underProb = under > 0 ? 100/(100+under) : Math.abs(under)/(Math.abs(under)+100);
  const sum = overProb + underProb;
  console.log(`  [C4] modelOverOdds=${g.modelOverOdds}(${(overProb*100).toFixed(1)}%) + modelUnderOdds=${g.modelUnderOdds}(${(underProb*100).toFixed(1)}%) = ${(sum*100).toFixed(1)}% ${Math.abs(sum-1)>0.05?'⚠️ DOES NOT SUM TO 100%':'✓'}`);
}

// Check 5: awayWinPct + homeWinPct
if (g.awayWinPct != null && g.homeWinPct != null) {
  const sum = parseFloat(g.awayWinPct) + parseFloat(g.homeWinPct);
  console.log(`  [C5] awayWinPct(${g.awayWinPct}) + homeWinPct(${g.homeWinPct}) = ${sum.toFixed(1)}% ${Math.abs(sum-100)>5?'⚠️ DOES NOT SUM TO 100':'✓'}`);
} else {
  console.log(`  [C5] awayWinPct=${g.awayWinPct} homeWinPct=${g.homeWinPct} ⚠️ NULL — simulation outputs not stored`);
}

// Check 6: modelAwaySpread null
console.log(`  [C6] modelAwaySpread=${g.modelAwaySpread} (${g.modelAwaySpread == null ? '⚠️ NULL — model spread not stored' : '✓'})`);

// Check 7: Consistency — if PHI is +1.5 edge (spreadEdge), model should favor PHI ML
if (g.spreadEdge && g.spreadEdge.includes('PHI') && g.modelAwayML) {
  const ml = parseInt(g.modelAwayML);
  const bookMl = parseInt(g.awayML ?? '0');
  console.log(`  [C7] spreadEdge favors PHI (away) but modelAwayML=${ml} bookAwayML=${bookMl}`);
  if (ml > 0 && bookMl > 0 && ml > bookMl + 50) {
    console.log(`       ⚠️ MODEL has PHI as bigger underdog (+${ml}) than book (+${bookMl}) — INCONSISTENT with spread edge`);
  }
}

await db.end();
