import mysql from 'mysql2/promise';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

async function audit() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.execute(`
    SELECT id, awayTeam, homeTeam,
      awayBookSpread, homeBookSpread, bookTotal, awayML, homeML,
      awaySpreadOdds, homeSpreadOdds, overOdds, underOdds,
      awayRunLine, homeRunLine, awayRunLineOdds, homeRunLineOdds,
      awayModelSpread, homeModelSpread, modelTotal,
      modelAwayML, modelHomeML, modelOverOdds, modelUnderOdds,
      modelOverRate, modelUnderRate,
      awayStartingPitcher, homeStartingPitcher,
      publishedToFeed, publishedModel
    FROM games
    WHERE gameDate='2026-03-27' AND sport='MLB'
    ORDER BY startTimeEst
  `);

  console.log('\n' + '='.repeat(80));
  console.log('  MARCH 27 MLB: BOOK vs MODEL DEEP AUDIT');
  console.log('  ' + new Date().toISOString());
  console.log('='.repeat(80) + '\n');

  const issues = [];

  for (const r of rows) {
    console.log(`${'─'.repeat(80)}`);
    console.log(`  [${r.id}] ${r.awayTeam} @ ${r.homeTeam}`);
    console.log(`  Pitchers: ${r.awayStartingPitcher} vs ${r.homeStartingPitcher}`);
    console.log(`  Published: feed=${r.publishedToFeed} model=${r.publishedModel}`);
    console.log('');

    // Book lines
    console.log(`  BOOK LINES (DK NJ via Action Network):`);
    console.log(`    ML:    ${r.awayTeam} ${r.awayML}  /  ${r.homeTeam} ${r.homeML}`);
    console.log(`    RL:    ${r.awayTeam} ${r.awayBookSpread} (${r.awaySpreadOdds})  /  ${r.homeTeam} ${r.homeBookSpread} (${r.homeSpreadOdds})`);
    console.log(`    RL2:   awayRunLine=${r.awayRunLine} (${r.awayRunLineOdds})  /  homeRunLine=${r.homeRunLine} (${r.homeRunLineOdds})`);
    console.log(`    Total: ${r.bookTotal}  over=${r.overOdds}  under=${r.underOdds}`);

    // Model output
    console.log('');
    console.log(`  MODEL OUTPUT:`);
    console.log(`    ML:    ${r.awayTeam} ${r.modelAwayML}  /  ${r.homeTeam} ${r.modelHomeML}`);
    console.log(`    RL:    ${r.awayTeam} ${r.awayModelSpread}  /  ${r.homeTeam} ${r.homeModelSpread}`);
    console.log(`    Total: ${r.modelTotal}  over=${r.modelOverOdds}  under=${r.modelUnderOdds}`);
    console.log(`    Rates: over=${r.modelOverRate}%  under=${r.modelUnderRate}%`);

    // Mismatch analysis
    console.log('');
    console.log(`  MISMATCH ANALYSIS:`);

    const bookTotal = parseFloat(r.bookTotal);
    const modelTotal = parseFloat(r.modelTotal);
    const totalDiff = modelTotal - bookTotal;

    if (Math.abs(totalDiff) > 0.05) {
      const msg = `  *** TOTAL MISMATCH: book=${bookTotal} model=${modelTotal} diff=${totalDiff > 0 ? '+' : ''}${totalDiff.toFixed(2)} — model total should equal book total`;
      console.log(msg);
      issues.push({ game: `${r.awayTeam}@${r.homeTeam}`, issue: msg.trim() });
    } else {
      console.log(`    Total: OK (book=${bookTotal} model=${modelTotal})`);
    }

    // RL direction check
    const bookAwayRL = parseFloat(r.awayBookSpread);
    const modelAwayRL = parseFloat(r.awayModelSpread);
    const bookHomeRL = parseFloat(r.homeBookSpread);
    const modelHomeRL = parseFloat(r.homeModelSpread);

    if (r.awayRunLine !== null && r.awayRunLine !== 'NULL') {
      // awayRunLine column exists — check it matches awayBookSpread
      const rlAway = parseFloat(r.awayRunLine);
      if (Math.abs(rlAway - bookAwayRL) > 0.05) {
        const msg = `  *** RL COLUMN MISMATCH: awayRunLine=${r.awayRunLine} but awayBookSpread=${r.awayBookSpread}`;
        console.log(msg);
        issues.push({ game: `${r.awayTeam}@${r.homeTeam}`, issue: msg.trim() });
      } else {
        console.log(`    RL column: OK (awayRunLine=${r.awayRunLine} matches awayBookSpread=${r.awayBookSpread})`);
      }
    } else {
      console.log(`    RL column: awayRunLine=NULL (not populated — should be ${r.awayBookSpread})`);
      issues.push({ game: `${r.awayTeam}@${r.homeTeam}`, issue: `awayRunLine/homeRunLine columns are NULL — need to be set from book RL` });
    }

    // RL odds check
    if (r.awayRunLineOdds === null || r.awayRunLineOdds === 'NULL') {
      console.log(`    RL odds: awayRunLineOdds=NULL (should be ${r.awaySpreadOdds})`);
      issues.push({ game: `${r.awayTeam}@${r.homeTeam}`, issue: `awayRunLineOdds/homeRunLineOdds are NULL — need to be set from awaySpreadOdds/homeSpreadOdds` });
    } else {
      console.log(`    RL odds: awayRunLineOdds=${r.awayRunLineOdds} homeRunLineOdds=${r.homeRunLineOdds}`);
    }

    // Model RL spread check — should match book RL
    if (Math.abs(Math.abs(modelAwayRL) - 1.5) > 0.05) {
      const msg = `  *** MODEL RL SPREAD WRONG: awayModelSpread=${r.awayModelSpread} (should be ±1.5)`;
      console.log(msg);
      issues.push({ game: `${r.awayTeam}@${r.homeTeam}`, issue: msg.trim() });
    } else {
      // Check direction matches book
      if (Math.sign(modelAwayRL) !== Math.sign(bookAwayRL)) {
        const msg = `  *** MODEL RL DIRECTION MISMATCH: model away=${modelAwayRL} but book away=${bookAwayRL}`;
        console.log(msg);
        issues.push({ game: `${r.awayTeam}@${r.homeTeam}`, issue: msg.trim() });
      } else {
        console.log(`    Model RL spread: OK (away=${modelAwayRL} matches book away=${bookAwayRL})`);
      }
    }

    // Model over/under odds check — should be computed at book total
    if (r.modelOverOdds === null || r.modelOverOdds === 'NULL') {
      const msg = `  *** MODEL OVER ODDS NULL — must be computed at book total ${bookTotal}`;
      console.log(msg);
      issues.push({ game: `${r.awayTeam}@${r.homeTeam}`, issue: msg.trim() });
    } else {
      console.log(`    Model O/U odds: over=${r.modelOverOdds} under=${r.modelUnderOdds} (at total=${r.modelTotal})`);
      if (Math.abs(totalDiff) > 0.05) {
        console.log(`    *** These odds are at model total ${r.modelTotal}, NOT book total ${bookTotal} — must recompute at book total`);
      }
    }

    console.log('');
  }

  console.log('='.repeat(80));
  console.log(`  SUMMARY: ${issues.length} issues found across ${rows.length} games`);
  console.log('='.repeat(80));
  if (issues.length > 0) {
    console.log('\n  ISSUES:');
    for (const iss of issues) {
      console.log(`  [${iss.game}] ${iss.issue}`);
    }
  }
  console.log('');

  await conn.end();
  return issues;
}

audit().catch(console.error);
