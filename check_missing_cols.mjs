import mysql from 'mysql2/promise';

const conn = mysql.createPool(process.env.DATABASE_URL);
const [rows] = await conn.query('DESCRIBE games');
const cols = rows.map(r => r.Field);
const needed = ['modelAwayPLCoverPct','modelHomePLCoverPct','modelAwayPuckLine','modelHomePuckLine','modelAwayPLOdds','modelHomePLOdds','modelOverOdds','modelUnderOdds'];
const missing = needed.filter(c => !cols.includes(c));
console.log('Missing columns:', missing.length === 0 ? 'NONE' : missing.join(', '));
console.log('Total columns in games:', cols.length);
await conn.end();
process.exit(0);
