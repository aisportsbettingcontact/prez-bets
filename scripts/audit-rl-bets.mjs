/**
 * audit-rl-bets.mjs
 * 
 * Comprehensive audit of all RL bets in the database.
 * 
 * The Math.abs() bug stored line=+1.5 for HOME picks on favorites (should be -1.5).
 * This script:
 *   1. Fetches all RL bets with scores
 *   2. Recomputes the CORRECT grade using the proper signed line convention
 *   3. Identifies misgraded bets
 *   4. Outputs SQL corrections
 * 
 * RL grading formula (from scoreGrader.ts):
 *   pickedMargin = (pickSide=HOME) ? homeScore - awayScore : awayScore - homeScore
 *   coverValue   = pickedMargin + rlLine
 *   WIN  if coverValue > 0
 *   LOSS if coverValue < 0
 *   PUSH if coverValue = 0
 * 
 * Sign convention (from AN API):
 *   HOME favorite: homeRl.value = -1.5 (must win by >1.5)
 *   AWAY underdog: awayRl.value = +1.5 (can lose by <1.5)
 * 
 * The Math.abs() bug stored +1.5 for HOME favorites, causing:
 *   coverValue = homeMargin + 1.5 (WRONG — adds instead of subtracts)
 * 
 * However, some bets were created BEFORE the Math.abs() bug with line=-1.5 (correct).
 * We must determine the CORRECT line for each bet based on context:
 *   - If pickSide=HOME and line=+1.5: this is the WRONG sign (Math.abs bug)
 *     → correct line should be -1.5 (HOME is the favorite)
 *   - If pickSide=HOME and line=-1.5: this is CORRECT (stored before bug or manually set)
 *   - If pickSide=AWAY and line=+1.5: this is CORRECT (AWAY underdog gets +1.5)
 *   - If pickSide=AWAY and line=-1.5: this is the WRONG sign (AWAY is the favorite, rare)
 * 
 * IMPORTANT: The "correct" line depends on whether the picked team is the FAVORITE or UNDERDOG.
 * For standard MLB RL: the line is always ±1.5.
 *   - If picked team is FAVORITE: line = -1.5 (must win by 2+)
 *   - If picked team is UNDERDOG: line = +1.5 (can lose by 1 or win)
 * 
 * We can infer the correct sign from the odds:
 *   - Negative odds (e.g., -120): picked team is FAVORITE → line should be -1.5
 *   - Positive odds (e.g., +150): picked team is UNDERDOG → line should be +1.5
 *   - BUT: standard RL has the favorite at -1.5 with POSITIVE odds (e.g., +150)
 *     because giving -1.5 is harder, so you get paid more.
 *     And the underdog at +1.5 has NEGATIVE odds (e.g., -130) because +1.5 is easier.
 * 
 * CORRECT inference: For standard MLB RL ±1.5:
 *   - The STORED line sign tells us which side was picked:
 *     line=-1.5 → picked team is FAVORITE (must win by 2+)
 *     line=+1.5 → picked team is UNDERDOG (can lose by 1)
 *   - Math.abs() bug made ALL lines positive, so we lost the sign for favorites.
 * 
 * To determine if a HOME pick with line=+1.5 is the FAVORITE or UNDERDOG:
 *   We need to check the actual game result and odds context.
 *   However, the simplest heuristic: if the bet was created AFTER the Math.abs() bug
 *   was introduced, and the line is +1.5 for a HOME pick, we need to check if the
 *   HOME team was the favorite or underdog.
 * 
 * For this audit, we'll recompute BOTH possible grades (line=-1.5 and line=+1.5)
 * and flag cases where they differ from the stored result.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

console.log('\n' + '='.repeat(80));
console.log('RL BET AUDIT — Comprehensive Grade Verification');
console.log('='.repeat(80));

// Fetch all RL bets with scores
const [rows] = await conn.execute(
  `SELECT id, gameDate, awayTeam, homeTeam, market, pickSide, odds, line, customLine, 
          result, awayScore, homeScore, riskUnits, toWinUnits
   FROM tracked_bets 
   WHERE market = 'RL' AND awayScore IS NOT NULL AND homeScore IS NOT NULL
   ORDER BY gameDate DESC, id`
);

console.log(`\n[INPUT] Found ${rows.length} RL bets with scores\n`);

/**
 * Grade a bet using the correct signed formula.
 * @param {number} awayScore
 * @param {number} homeScore
 * @param {'AWAY'|'HOME'} pickSide
 * @param {number} rlLine - signed line value
 * @returns {'WIN'|'LOSS'|'PUSH'}
 */
function gradeBet(awayScore, homeScore, pickSide, rlLine) {
  const awayMargin = awayScore - homeScore;
  const homeMargin = homeScore - awayScore;
  const pickedMargin = pickSide === 'AWAY' ? awayMargin : homeMargin;
  const coverValue = pickedMargin + rlLine;
  if (coverValue > 0) return 'WIN';
  if (coverValue < 0) return 'LOSS';
  return 'PUSH';
}

const misgraded = [];
const correct = [];
const ambiguous = [];

for (const row of rows) {
  const away = parseInt(row.awayScore);
  const home = parseInt(row.homeScore);
  const storedLine = parseFloat(row.line);
  const pickSide = row.pickSide;
  const storedResult = row.result;
  const odds = parseInt(row.odds);

  // Compute grade with stored line (what the grader actually used)
  const gradeWithStoredLine = gradeBet(away, home, pickSide, storedLine);

  // Determine the "correct" line based on sign convention:
  // For standard MLB RL (|line| = 1.5):
  //   If stored line is POSITIVE (+1.5) for a HOME pick:
  //     This could be either:
  //     (a) CORRECT: HOME is the underdog getting +1.5 (rare in MLB RL)
  //     (b) WRONG (Math.abs bug): HOME is the favorite, should be -1.5
  //   We determine which by checking if the stored result makes sense:
  //     If gradeWithStoredLine matches storedResult → possibly correct
  //     If gradeWithStoredLine does NOT match storedResult → definitely wrong
  
  // Also compute grade with NEGATED line (what it would be if sign was wrong)
  const negatedLine = -storedLine;
  const gradeWithNegatedLine = gradeBet(away, home, pickSide, negatedLine);

  const awayMargin = away - home;
  const homeMargin = home - away;
  const pickedMargin = pickSide === 'AWAY' ? awayMargin : homeMargin;

  console.log(`[BET ${row.id}] ${row.gameDate} ${row.awayTeam}@${row.homeTeam}`);
  console.log(`  pickSide=${pickSide} odds=${odds} storedLine=${storedLine}`);
  console.log(`  score: ${row.awayTeam} ${away} - ${home} ${row.homeTeam}`);
  console.log(`  pickedMargin=${pickedMargin}`);
  console.log(`  gradeWithStoredLine(${storedLine}) = ${gradeWithStoredLine}`);
  console.log(`  gradeWithNegatedLine(${negatedLine}) = ${gradeWithNegatedLine}`);
  console.log(`  storedResult = ${storedResult}`);

  // Determine if the stored result matches the grade with stored line
  const storedLineMatchesResult = gradeWithStoredLine === storedResult;
  const negatedLineMatchesResult = gradeWithNegatedLine === storedResult;

  // For HOME picks with line=+1.5 (potential Math.abs bug victims):
  // The correct line for a HOME FAVORITE is -1.5
  // The correct line for a HOME UNDERDOG is +1.5
  // 
  // Standard MLB RL: HOME -1.5 means HOME is the favorite
  //   → HOME must win by 2+ to cover
  //   → If HOME wins by 1: coverValue = 1 + (-1.5) = -0.5 → LOSS
  //   → If HOME wins by 2+: coverValue = margin + (-1.5) > 0 → WIN
  //
  // With Math.abs bug (line=+1.5 for HOME favorite):
  //   → If HOME wins by 1: coverValue = 1 + 1.5 = 2.5 → WIN (WRONG!)
  //   → If HOME wins by 2+: coverValue = margin + 1.5 > 0 → WIN (happens to be correct)
  //   → If HOME loses: coverValue = negative + 1.5 → could be WIN or LOSS depending on margin

  // Flag bets where the stored result does NOT match the grade with stored line
  // (these are definitively wrong — the grader produced a different result than stored)
  if (!storedLineMatchesResult) {
    console.log(`  ⚠️  MISMATCH: storedResult=${storedResult} but gradeWithStoredLine=${gradeWithStoredLine}`);
    console.log(`  → This bet was graded incorrectly by the grader itself`);
    misgraded.push({ ...row, correctGrade: gradeWithStoredLine, issue: 'GRADER_MISMATCH' });
  }
  // Flag HOME picks with line=+1.5 where the correct grade (with -1.5) differs
  else if (pickSide === 'HOME' && storedLine === 1.5 && gradeWithNegatedLine !== gradeWithStoredLine) {
    console.log(`  ⚠️  SIGN BUG: HOME pick with line=+1.5 (should be -1.5 for favorite)`);
    console.log(`  → With correct line (-1.5): ${gradeWithNegatedLine} vs stored ${storedResult}`);
    if (gradeWithNegatedLine !== storedResult) {
      console.log(`  → WRONG GRADE: stored=${storedResult}, correct=${gradeWithNegatedLine}`);
      misgraded.push({ ...row, correctGrade: gradeWithNegatedLine, correctLine: -1.5, issue: 'SIGN_BUG' });
    } else {
      console.log(`  → Grade happens to be correct despite wrong sign (margin was large enough)`);
      ambiguous.push({ ...row, note: 'sign_bug_but_correct_grade' });
    }
  } else {
    console.log(`  ✅ Grade appears correct`);
    correct.push(row);
  }
  console.log('');
}

console.log('='.repeat(80));
console.log('AUDIT SUMMARY');
console.log('='.repeat(80));
console.log(`Total RL bets audited: ${rows.length}`);
console.log(`Correctly graded: ${correct.length}`);
console.log(`Ambiguous (sign bug but correct grade): ${ambiguous.length}`);
console.log(`MISGRADED (need correction): ${misgraded.length}`);

if (misgraded.length > 0) {
  console.log('\n' + '='.repeat(80));
  console.log('MISGRADED BETS — SQL CORRECTIONS REQUIRED');
  console.log('='.repeat(80));
  for (const bet of misgraded) {
    const correctGrade = bet.correctGrade;
    const correctLine = bet.correctLine ?? parseFloat(bet.line);
    console.log(`\n[BET ${bet.id}] ${bet.gameDate} ${bet.awayTeam}@${bet.homeTeam}`);
    console.log(`  Issue: ${bet.issue}`);
    console.log(`  Stored: result=${bet.result}, line=${bet.line}`);
    console.log(`  Correct: result=${correctGrade}, line=${correctLine}`);
    console.log(`  Score: ${bet.awayTeam} ${bet.awayScore} - ${bet.homeScore} ${bet.homeTeam}`);
    console.log(`  SQL: UPDATE tracked_bets SET result='${correctGrade}', line='${correctLine}' WHERE id=${bet.id};`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('COMBINED SQL UPDATE STATEMENT');
  console.log('='.repeat(80));
  for (const bet of misgraded) {
    const correctGrade = bet.correctGrade;
    const correctLine = bet.correctLine ?? parseFloat(bet.line);
    console.log(`UPDATE tracked_bets SET result='${correctGrade}', line='${correctLine}' WHERE id=${bet.id};`);
  }
}

if (ambiguous.length > 0) {
  console.log('\n' + '='.repeat(80));
  console.log('AMBIGUOUS BETS — Sign bug present but grade happens to be correct');
  console.log('These need line correction but result is already correct');
  console.log('='.repeat(80));
  for (const bet of ambiguous) {
    console.log(`[BET ${bet.id}] ${bet.gameDate} ${bet.awayTeam}@${bet.homeTeam} pickSide=${bet.pickSide} line=${bet.line} result=${bet.result}`);
    console.log(`  SQL (line fix only): UPDATE tracked_bets SET line='-1.5' WHERE id=${bet.id};`);
  }
}

await conn.end();
console.log('\n[DONE] Audit complete.');
