import mysql from 'mysql2/promise';

const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 1 });

const allR64 = [201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232];

const [existing] = await pool.query('SELECT bracketGameId FROM games WHERE bracketGameId BETWEEN 201 AND 232');
const existingIds = new Set(existing.map(r => r.bracketGameId));
const missing = allR64.filter(id => !existingIds.has(id));
console.log('Missing R64 bracketGameIds:', missing);
console.log('Existing R64 bracketGameIds:', [...existingIds].sort((a,b)=>a-b));

// Also check First Four
const [ff] = await pool.query('SELECT bracketGameId, awayTeam, homeTeam, awayScore, homeScore, gameStatus FROM games WHERE bracketGameId BETWEEN 101 AND 104 ORDER BY bracketGameId');
console.log('\nFirst Four games:', ff.length);
ff.forEach(r => console.log(`  bgId=${r.bracketGameId} ${r.awayTeam}@${r.homeTeam} status=${r.gameStatus} score=${r.awayScore}-${r.homeScore}`));

// Check the R32 game 309 - it shows arizona@utah_st which is wrong (those are R64 teams)
// The R32 game should show the WINNERS of R64 games 217 and 218
const [r309] = await pool.query('SELECT * FROM games WHERE bracketGameId=309 LIMIT 1');
if (r309[0]) {
  console.log('\nR32 game 309 (should be winner of 217 vs winner of 218):');
  console.log(`  awayTeam: ${r309[0].awayTeam} (winner of bgId=217 is arizona)`);
  console.log(`  homeTeam: ${r309[0].homeTeam} (winner of bgId=218 is utah_st)`);
  console.log(`  This is CORRECT - arizona won 217, utah_st won 218`);
}

// The key insight: the R32 games already have the correct teams (winners of R64)
// The problem is that the R64 games that played on March 19 are MISSING from the DB
// They were deleted by the daily purge!

// Let's check what games were deleted
const [march19] = await pool.query(`
  SELECT id, bracketGameId, awayTeam, homeTeam, awayScore, homeScore, gameStatus, gameDate
  FROM games WHERE gameDate='2026-03-19' AND sport='NCAAM'
  ORDER BY bracketGameId ASC
`);
console.log('\nMarch 19 NCAAM games still in DB:', march19.length);
march19.forEach(r => console.log(`  bgId=${r.bracketGameId} ${r.awayTeam}@${r.homeTeam} status=${r.gameStatus} score=${r.awayScore}-${r.homeScore}`));

await pool.end();
