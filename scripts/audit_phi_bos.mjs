/**
 * audit_phi_bos.mjs
 * Deep diagnostic: audit ALL fields for the PHI @ BOS game.
 * Run: node scripts/audit_phi_bos.mjs
 */
import { createConnection } from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const db = await createConnection(process.env.DATABASE_URL);

// Find PHI @ BOS game (today or most recent)
const [rows] = await db.execute(
  `SELECT * FROM games
   WHERE sport = 'MLB'
     AND (awayTeam LIKE '%phi%' OR awayTeam LIKE '%phillies%' OR awayTeam LIKE '%PHI%')
     AND (homeTeam LIKE '%bos%' OR homeTeam LIKE '%red%sox%' OR homeTeam LIKE '%BOS%')
   ORDER BY gameDate DESC
   LIMIT 3`
);

if (rows.length === 0) {
  // Try reverse
  const [rows2] = await db.execute(
    `SELECT * FROM games
     WHERE sport = 'MLB'
       AND (homeTeam LIKE '%phi%' OR homeTeam LIKE '%phillies%' OR homeTeam LIKE '%PHI%')
       AND (awayTeam LIKE '%bos%' OR awayTeam LIKE '%red%sox%' OR awayTeam LIKE '%BOS%')
     ORDER BY gameDate DESC
     LIMIT 3`
  );
  if (rows2.length === 0) {
    console.log('[AUDIT] No PHI/BOS game found. Searching by team slug...');
    const [rows3] = await db.execute(
      `SELECT id, awayTeam, homeTeam, gameDate, sport FROM games
       WHERE sport = 'MLB' AND gameDate >= DATE_SUB(NOW(), INTERVAL 2 DAY)
       ORDER BY gameDate DESC LIMIT 30`
    );
    console.log('[AUDIT] Recent MLB games:');
    for (const r of rows3) {
      console.log(`  [${r.id}] ${r.awayTeam} @ ${r.homeTeam} on ${r.gameDate}`);
    }
    await db.end();
    process.exit(0);
  }
  rows.push(...rows2);
}

for (const game of rows) {
  console.log('\n' + '='.repeat(80));
  console.log(`[GAME] id=${game.id} | ${game.awayTeam} @ ${game.homeTeam} | ${game.gameDate} | sport=${game.sport}`);
  console.log('='.repeat(80));

  // ── BOOK LINES ──
  console.log('\n[BOOK LINES]');
  console.log(`  awaySpread=${game.awaySpread} awaySpreadOdds=${game.awaySpreadOdds}`);
  console.log(`  homeSpread=${game.homeSpread} homeSpreadOdds=${game.homeSpreadOdds}`);
  console.log(`  overTotal=${game.overTotal} overOdds=${game.overOdds}`);
  console.log(`  underTotal=${game.underTotal} underOdds=${game.underOdds}`);
  console.log(`  awayML=${game.awayML} homeML=${game.homeML}`);

  // ── MODEL LINES ──
  console.log('\n[MODEL LINES]');
  console.log(`  modelAwaySpread=${game.modelAwaySpread} modelAwaySpreadOdds=${game.modelAwaySpreadOdds}`);
  console.log(`  modelHomeSpread=${game.modelHomeSpread} modelHomeSpreadOdds=${game.modelHomeSpreadOdds}`);
  console.log(`  modelTotal=${game.modelTotal} modelOverOdds=${game.modelOverOdds} modelUnderOdds=${game.modelUnderOdds}`);
  console.log(`  modelAwayML=${game.modelAwayML} modelHomeML=${game.modelHomeML}`);

  // ── EDGE FIELDS ──
  console.log('\n[EDGE FIELDS]');
  console.log(`  spreadDiff=${game.spreadDiff} spreadEdge=${game.spreadEdge}`);
  console.log(`  totalDiff=${game.totalDiff} totalEdge=${game.totalEdge}`);
  console.log(`  mlEdge=${game.mlEdge} mlEdgePP=${game.mlEdgePP}`);

  // ── GAME STATE ──
  console.log('\n[GAME STATE]');
  console.log(`  gameStatus=${game.gameStatus} liveInning=${game.liveInning} liveInningHalf=${game.liveInningHalf}`);
  console.log(`  awayScore=${game.awayScore} homeScore=${game.homeScore}`);
  console.log(`  modelRunAt=${game.modelRunAt}`);

  // ── OPEN LINES ──
  console.log('\n[OPEN LINES]');
  console.log(`  openAwaySpread=${game.openAwaySpread} openAwaySpreadOdds=${game.openAwaySpreadOdds}`);
  console.log(`  openHomeSpread=${game.openHomeSpread} openHomeSpreadOdds=${game.openHomeSpreadOdds}`);
  console.log(`  openTotal=${game.openTotal} openOverOdds=${game.openOverOdds} openUnderOdds=${game.openUnderOdds}`);
  console.log(`  openAwayML=${game.openAwayML} openHomeML=${game.openHomeML}`);

  // ── SPLITS ──
  console.log('\n[SPLITS]');
  console.log(`  spreadAwayBetsPct=${game.spreadAwayBetsPct} spreadAwayMoneyPct=${game.spreadAwayMoneyPct}`);
  console.log(`  totalOverBetsPct=${game.totalOverBetsPct} totalOverMoneyPct=${game.totalOverMoneyPct}`);
  console.log(`  mlAwayBetsPct=${game.mlAwayBetsPct} mlAwayMoneyPct=${game.mlAwayMoneyPct}`);

  // ── SIMULATION OUTPUTS ──
  console.log('\n[SIMULATION OUTPUTS]');
  console.log(`  awayWinPct=${game.awayWinPct} homeWinPct=${game.homeWinPct}`);
  console.log(`  awayRunsProjected=${game.awayRunsProjected} homeRunsProjected=${game.homeRunsProjected}`);
  console.log(`  overPct=${game.overPct} underPct=${game.underPct}`);
  console.log(`  awaySpreadCoverPct=${game.awaySpreadCoverPct} homeSpreadCoverPct=${game.homeSpreadCoverPct}`);

  // ── VALIDATION CHECKS ──
  console.log('\n[VALIDATION CHECKS]');
  
  // Check 1: modelTotal vs overTotal
  const modelTotal = parseFloat(game.modelTotal ?? 'NaN');
  const bookTotal = parseFloat(game.overTotal ?? 'NaN');
  if (!isNaN(modelTotal) && !isNaN(bookTotal)) {
    const diff = Math.abs(modelTotal - bookTotal);
    console.log(`  [CHECK 1] modelTotal(${modelTotal}) vs bookTotal(${bookTotal}): diff=${diff.toFixed(2)} ${diff > 2 ? '⚠️ LARGE DIFF' : '✓'}`);
  }

  // Check 2: modelAwayML vs awayML
  const modelAwayML = parseInt(game.modelAwayML ?? 'NaN');
  const bookAwayML = parseInt(game.awayML ?? 'NaN');
  if (!isNaN(modelAwayML) && !isNaN(bookAwayML)) {
    const diff = Math.abs(modelAwayML - bookAwayML);
    console.log(`  [CHECK 2] modelAwayML(${modelAwayML}) vs bookAwayML(${bookAwayML}): diff=${diff} ${diff > 100 ? '⚠️ LARGE DIFF' : '✓'}`);
  }

  // Check 3: modelOverOdds format
  if (game.modelOverOdds) {
    const val = parseInt(game.modelOverOdds);
    console.log(`  [CHECK 3] modelOverOdds=${game.modelOverOdds} parsed=${val} ${Math.abs(val) > 500 ? '⚠️ EXTREME VALUE' : '✓'}`);
  }

  // Check 4: modelUnderOdds format
  if (game.modelUnderOdds) {
    const val = parseInt(game.modelUnderOdds);
    console.log(`  [CHECK 4] modelUnderOdds=${game.modelUnderOdds} parsed=${val} ${Math.abs(val) > 500 ? '⚠️ EXTREME VALUE' : '✓'}`);
  }

  // Check 5: awayWinPct + homeWinPct should sum to ~100
  if (game.awayWinPct != null && game.homeWinPct != null) {
    const sum = parseFloat(game.awayWinPct) + parseFloat(game.homeWinPct);
    console.log(`  [CHECK 5] awayWinPct(${game.awayWinPct}) + homeWinPct(${game.homeWinPct}) = ${sum.toFixed(2)}% ${Math.abs(sum - 100) > 5 ? '⚠️ DOES NOT SUM TO 100' : '✓'}`);
  }

  // Check 6: overPct + underPct should sum to ~100
  if (game.overPct != null && game.underPct != null) {
    const sum = parseFloat(game.overPct) + parseFloat(game.underPct);
    console.log(`  [CHECK 6] overPct(${game.overPct}) + underPct(${game.underPct}) = ${sum.toFixed(2)}% ${Math.abs(sum - 100) > 5 ? '⚠️ DOES NOT SUM TO 100' : '✓'}`);
  }

  // Check 7: modelAwaySpread + modelHomeSpread should sum to 0
  if (game.modelAwaySpread != null && game.modelHomeSpread != null) {
    const sum = parseFloat(game.modelAwaySpread) + parseFloat(game.modelHomeSpread);
    console.log(`  [CHECK 7] modelAwaySpread(${game.modelAwaySpread}) + modelHomeSpread(${game.modelHomeSpread}) = ${sum.toFixed(2)} ${Math.abs(sum) > 0.1 ? '⚠️ DOES NOT SUM TO 0' : '✓'}`);
  }
}

await db.end();
