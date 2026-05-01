import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await conn.execute(`
  SELECT 
    awayTeam, homeTeam, gameDate, sport,
    spreadAwayBetsPct, spreadAwayMoneyPct,
    totalLine, totalOverBetsPct, totalOverMoneyPct,
    awayML, homeML,
    mlAwayBetsPct, mlAwayMoneyPct
  FROM game
  WHERE sport = 'MLB' AND gameDate = '2026-05-01'
  ORDER BY awayTeam
`);

console.log(JSON.stringify(rows, null, 2));
await conn.end();
