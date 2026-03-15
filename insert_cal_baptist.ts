import dotenv from 'dotenv';
dotenv.config();
import mysql from 'mysql2/promise';

// Cal Baptist @ Utah Valley
// NCAA API: contestId=6593948, PST date=2026-03-14, time=20:59 PST, state=P (upcoming)
// Both teams are in the 365-team registry:
//   california_baptist (Cal Baptist Lancers)
//   utah_valley (Utah Valley Wolverines)

const conn = await mysql.createConnection({ uri: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Check if already exists
const [existing] = await conn.execute(
  "SELECT id FROM games WHERE ncaaContestId='6593948' OR (awayTeam='california_baptist' AND homeTeam='utah_valley' AND gameDate='2026-03-14')"
) as any[];

if (existing.length > 0) {
  console.log('Game already exists:', existing[0]);
  await conn.end();
  process.exit(0);
}

// Insert the game
// AN odds for cal-baptist @ utah-valley from the downloaded HTML:
// Need to check the AN HTML for this game's odds
const [result] = await conn.execute(
  `INSERT INTO games (
    fileId, gameDate, startTimeEst, awayTeam, homeTeam,
    awayBookSpread, homeBookSpread, bookTotal,
    awayModelSpread, homeModelSpread, modelTotal,
    spreadEdge, spreadDiff, totalEdge, totalDiff,
    sport, gameType, conference, publishedToFeed,
    rotNums, sortOrder, ncaaContestId, gameStatus,
    awayScore, homeScore, gameClock
  ) VALUES (
    0, '2026-03-14', '20:59', 'california_baptist', 'utah_valley',
    NULL, NULL, NULL,
    NULL, NULL, NULL,
    NULL, NULL, NULL, NULL,
    'NCAAM', 'regular_season', NULL, 0,
    NULL, 9999, '6593948', 'upcoming',
    NULL, NULL, NULL
  )`
) as any[];

console.log('Inserted Cal Baptist @ Utah Valley, id:', result.insertId);

// Verify count
const [count] = await conn.execute(
  "SELECT COUNT(*) as cnt FROM games WHERE gameDate='2026-03-14' AND sport='NCAAM'"
) as any[];
console.log('NCAAM games on March 14 after insert:', count[0].cnt);

await conn.end();
