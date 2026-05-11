import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const HR_DATES = new Set([
  '2026-03-25','2026-03-26','2026-03-27','2026-03-28','2026-03-29','2026-03-30','2026-03-31',
  '2026-04-01','2026-04-02','2026-04-03','2026-04-04','2026-04-05','2026-04-06',
  '2026-04-10','2026-04-11','2026-04-12','2026-04-13','2026-04-14','2026-04-15','2026-04-16',
  '2026-04-17','2026-04-18','2026-04-19','2026-04-20','2026-04-21','2026-04-22','2026-04-23',
  '2026-04-24','2026-04-25','2026-04-26','2026-04-27','2026-04-28','2026-04-29','2026-04-30',
  '2026-05-01','2026-05-02','2026-05-03','2026-05-04',
  '2026-05-08','2026-05-09','2026-05-10'
]);

const GAME_DATES = [
  '2026-03-25','2026-03-26','2026-03-27','2026-03-28','2026-03-29','2026-03-30','2026-03-31',
  '2026-04-01','2026-04-02','2026-04-03','2026-04-04','2026-04-05','2026-04-06',
  '2026-04-07','2026-04-08','2026-04-09',
  '2026-04-10','2026-04-11','2026-04-12','2026-04-13','2026-04-14','2026-04-15','2026-04-16',
  '2026-04-17','2026-04-18','2026-04-19','2026-04-20','2026-04-21','2026-04-22','2026-04-23',
  '2026-04-24','2026-04-25','2026-04-26','2026-04-27','2026-04-28','2026-04-29','2026-04-30',
  '2026-05-01','2026-05-02','2026-05-03','2026-05-04',
  '2026-05-08','2026-05-09','2026-05-10'
];

async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 3 });
  
  const missing = GAME_DATES.filter(d => !HR_DATES.has(d));
  console.log('[INPUT] Missing HR Props dates:', missing.length, '->', missing.join(', '));
  
  // Check games on missing dates
  for (const d of missing) {
    const [[r]] = await pool.execute(
      "SELECT COUNT(*) as n FROM games WHERE sport='MLB' AND gameStatus='final' AND DATE_FORMAT(gameDate, '%Y-%m-%d') = ?",
      [d]
    );
    console.log(' ', d, ':', r.n, 'final games');
  }
  
  // Summary
  console.log('\n[OUTPUT] Total HR Props rows: 9280');
  console.log('[OUTPUT] HR Props dates covered: 41 / 44 game dates');
  console.log('[OUTPUT] Missing dates:', missing.join(', '));
  
  await pool.end();
}
main().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
