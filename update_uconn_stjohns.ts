import dotenv from 'dotenv';
dotenv.config();
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Check current state
const [rows] = await conn.execute(
  "SELECT id, awayTeam, homeTeam, awayBookSpread, homeBookSpread, bookTotal, awaySpreadOdds, homeSpreadOdds, overOdds, underOdds, awayML, homeML, openAwaySpread, openHomeSpread, openTotal, openAwayML, openHomeML FROM games WHERE awayTeam='connecticut' AND homeTeam='st_johns' AND gameDate='2026-03-14'"
) as any[];

console.log('Current state:', JSON.stringify(rows[0], null, 2));

// Update with correct values from AN HTML
// DK NJ: spread UConn -2.5 (-102) / StJ +2.5 (-118), total o139.5 (-105) / u139.5 (-115), ML -148 / +124
// Open:  spread UConn -2.5 (-110) / StJ +2.5 (-110), total o140.5 (-110) / u140.5 (-107), ML -155 / +133
const [result] = await conn.execute(`
  UPDATE games SET
    awayBookSpread = -2.5,
    homeBookSpread = 2.5,
    awaySpreadOdds = -102,
    homeSpreadOdds = -118,
    bookTotal = 139.5,
    overOdds = -105,
    underOdds = -115,
    awayML = -148,
    homeML = 124,
    openAwaySpread = -2.5,
    openHomeSpread = 2.5,
    openAwaySpreadOdds = -110,
    openHomeSpreadOdds = -110,
    openTotal = 140.5,
    openOverOdds = -110,
    openUnderOdds = -107,
    openAwayML = -155,
    openHomeML = 133
  WHERE awayTeam='connecticut' AND homeTeam='st_johns' AND gameDate='2026-03-14'
`) as any[];

console.log('Updated rows:', (result as any).affectedRows);

// Verify
const [updated] = await conn.execute(
  "SELECT id, awayTeam, homeTeam, awayBookSpread, homeBookSpread, awaySpreadOdds, homeSpreadOdds, bookTotal, overOdds, underOdds, awayML, homeML, openAwaySpread, openHomeSpread, openTotal, openAwayML, openHomeML FROM games WHERE awayTeam='connecticut' AND homeTeam='st_johns' AND gameDate='2026-03-14'"
) as any[];

console.log('Updated state:', JSON.stringify((updated as any[])[0], null, 2));

await conn.end();
