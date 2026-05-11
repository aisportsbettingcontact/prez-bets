import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 3 });
  
  // Total rows
  const [[total]] = await pool.execute('SELECT COUNT(*) as n FROM mlb_hr_props');
  console.log('[INPUT] Total HR Props rows:', total.n);
  
  // By date - use DATE_FORMAT to avoid column name issues
  const [byDate] = await pool.execute(`
    SELECT DATE_FORMAT(gameDate, '%Y-%m-%d') as d, COUNT(*) as n, 
           SUM(CASE WHEN result IS NOT NULL THEN 1 ELSE 0 END) as graded
    FROM mlb_hr_props 
    WHERE gameDate >= '2026-03-25'
    GROUP BY DATE_FORMAT(gameDate, '%Y-%m-%d')
    ORDER BY d
  `);
  console.log('[STATE] Date coverage (' + byDate.length + ' dates):');
  byDate.forEach(r => console.log('  ', r.d, ':', r.n, 'rows,', r.graded, 'graded'));
  
  // Game dates in range
  const [games] = await pool.execute(`
    SELECT DISTINCT DATE_FORMAT(gameDate, '%Y-%m-%d') as d 
    FROM games 
    WHERE sport='MLB' AND gameStatus='final' AND gameDate >= '2026-03-25' AND gameDate <= '2026-05-10'
    ORDER BY d
  `);
  
  const gameDateSet = new Set(games.map(r => r.d));
  const hrDateSet = new Set(byDate.map(r => r.d));
  const missing = [...gameDateSet].filter(d => !hrDateSet.has(d));
  
  console.log('\n[VERIFY] Game dates with final games:', gameDateSet.size);
  console.log('[VERIFY] HR Props dates covered:', hrDateSet.size);
  console.log('[VERIFY] Missing HR Props dates (' + missing.length + '):', missing.join(', ') || 'NONE');
  
  // Graded vs total
  const totalRows = byDate.reduce((s, r) => s + Number(r.n), 0);
  const totalGraded = byDate.reduce((s, r) => s + Number(r.graded), 0);
  console.log('\n[OUTPUT] Total rows:', totalRows, '| Graded:', totalGraded, '| Ungraded:', totalRows - totalGraded);
  
  await pool.end();
}
main().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
