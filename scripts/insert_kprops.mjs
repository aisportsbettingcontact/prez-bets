#!/usr/bin/env node
/**
 * Insert K-Props results into mlb_strikeout_props table.
 * Usage: node --import tsx/esm scripts/insert_kprops.mjs /tmp/kprops_db_records.json
 */
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { eq, and } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { mlbStrikeoutProps, games } from '../drizzle/schema.ts';

const recordsFile = process.argv[2] || '/tmp/kprops_db_records.json';
const records = JSON.parse(readFileSync(recordsFile, 'utf8'));

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(conn);

console.log(`[INPUT] ${records.length} records to insert`);

// Build a map of (awayTeam, homeTeam, gameDate) → gameId
const gameDate = records[0]?.game_date;
const dbGames = await db.select().from(games).where(
  and(
    eq(games.gameDate, gameDate),
    eq(games.sport, 'MLB')
  )
);

console.log(`[STEP] Found ${dbGames.length} MLB games in DB for ${gameDate}`);

// Build lookup: awayTeam_homeTeam → gameId
const gameIdMap = {};
for (const g of dbGames) {
  const key = `${g.awayTeam}_${g.homeTeam}`;
  gameIdMap[key] = g.id;
}

// Also try with team abbreviation normalization
// AN uses 3-letter codes, DB may use full names
// Print what we have
for (const g of dbGames) {
  console.log(`  DB game: ${g.awayTeam}@${g.homeTeam} id=${g.id}`);
}

// Delete existing K-prop records for this date's games
const gameIds = dbGames.map(g => g.id);
if (gameIds.length > 0) {
  for (const gid of gameIds) {
    await db.delete(mlbStrikeoutProps).where(eq(mlbStrikeoutProps.gameId, gid));
  }
  console.log(`[STEP] Cleared existing K-prop records for ${gameIds.length} games`);
}

// Insert records
let inserted = 0;
let skipped = 0;
const now = Date.now();

for (const rec of records) {
  // Find gameId
  const key = `${rec.away_team}_${rec.home_team}`;
  let gameId = gameIdMap[key];
  
  if (!gameId) {
    // Try reversed key (DB may have home/away swapped)
    const reversedKey = `${rec.home_team}_${rec.away_team}`;
    gameId = gameIdMap[reversedKey];
  }
  
  if (!gameId) {
    // Try to find by partial match (team abbreviation differences)
    for (const [k, v] of Object.entries(gameIdMap)) {
      const [dbAway, dbHome] = k.split('_');
      const teams = [dbAway, dbHome];
      const recTeams = [rec.away_team, rec.home_team];
      // Check if both teams match in any order
      if (teams.includes(rec.away_team) && teams.includes(rec.home_team)) {
        gameId = v;
        break;
      }
      // Check for partial matches (e.g. 'ATH' vs 'OAK')
      const awayMatch = teams.some(t => t.includes(rec.away_team) || rec.away_team.includes(t));
      const homeMatch = teams.some(t => t.includes(rec.home_team) || rec.home_team.includes(t));
      if (awayMatch && homeMatch) {
        gameId = v;
        break;
      }
    }
  }
  
  if (!gameId) {
    console.log(`  [SKIP] No gameId for ${rec.away_team}@${rec.home_team} (key=${key})`);
    skipped++;
    continue;
  }
  
  // Get full result data
  let fullResult = {};
  try {
    fullResult = JSON.parse(rec.full_result);
  } catch(e) {}
  
  await db.insert(mlbStrikeoutProps).values({
    gameId: gameId,
    side: rec.side,
    pitcherName: rec.pitcher_name,
    pitcherHand: fullResult.pitcherHand || null,
    retrosheetId: fullResult.retrosheetId || null,
    kProj: rec.k_proj !== null ? rec.k_proj.toString() : null,
    kLine: fullResult.kLine || null,
    kPer9: fullResult.kPer9 || null,
    kMedian: fullResult.kMedian || null,
    kP5: fullResult.kP5 || null,
    kP95: fullResult.kP95 || null,
    bookLine: fullResult.bookLine || (rec.market_line !== null ? rec.market_line.toString() : null),
    bookOverOdds: fullResult.bookOverOdds || (rec.market_over_ml !== null ? rec.market_over_ml.toString() : null),
    bookUnderOdds: fullResult.bookUnderOdds || (rec.market_under_ml !== null ? rec.market_under_ml.toString() : null),
    pOver: fullResult.pOver || null,
    pUnder: fullResult.pUnder || null,
    modelOverOdds: fullResult.modelOverOdds || null,
    modelUnderOdds: fullResult.modelUnderOdds || null,
    edgeOver: fullResult.edgeOver || null,
    edgeUnder: fullResult.edgeUnder || null,
    verdict: rec.verdict,
    bestEdge: fullResult.bestEdge || null,
    bestSide: fullResult.bestSide || null,
    bestMlStr: fullResult.bestMlStr || null,
    signalBreakdown: fullResult.signalBreakdown ? JSON.stringify(fullResult.signalBreakdown) : null,
    matchupRows: fullResult.matchupRows ? JSON.stringify(fullResult.matchupRows) : null,
    distribution: fullResult.distribution ? JSON.stringify(fullResult.distribution) : null,
    inningBreakdown: fullResult.inningBreakdown ? JSON.stringify(fullResult.inningBreakdown) : null,
    modelRunAt: now,
  });
  inserted++;
}

console.log(`[OUTPUT] Inserted ${inserted}, Skipped ${skipped}`);
console.log(`[VERIFY] ${inserted > 0 ? 'PASS' : 'FAIL'}`);

await conn.end();
