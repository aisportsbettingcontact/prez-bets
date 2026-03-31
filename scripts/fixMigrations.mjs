/**
 * fixMigrations.mjs
 * 
 * Manually marks migration 0043 as applied (uq_game_side already exists in DB)
 * and directly creates the mlb_pitcher_stats table (migration 0044).
 */
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

dotenv.config();

const journal = JSON.parse(readFileSync('./drizzle/meta/_journal.json', 'utf8'));

function getHash(sqlContent) {
  return createHash('sha256').update(sqlContent).digest('hex');
}

const sql0043 = readFileSync('./drizzle/0043_rich_drax.sql', 'utf8');
const sql0044 = readFileSync('./drizzle/0044_wealthy_hex.sql', 'utf8');

const entry0043 = journal.entries.find(e => e.idx === 43);
const entry0044 = journal.entries.find(e => e.idx === 44);

console.log('[INPUT] Migration 0043 tag:', entry0043?.tag);
console.log('[INPUT] Migration 0044 tag:', entry0044?.tag);
console.log('[INPUT] DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'MISSING');

const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  // Step 1: Check current state
  const [applied] = await conn.query('SELECT hash FROM __drizzle_migrations ORDER BY id DESC LIMIT 5');
  console.log('[STATE] Last 5 applied migration hashes:', applied.map(r => r.hash.substring(0, 12)));

  // Step 2: Check if 0043 is already recorded
  const hash0043 = getHash(sql0043);
  const [existing43] = await conn.query('SELECT id FROM __drizzle_migrations WHERE hash = ?', [hash0043]);
  
  if (existing43.length === 0) {
    console.log('[STEP] Inserting 0043 migration record (uq_game_side already exists in DB)...');
    await conn.query(
      'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
      [hash0043, entry0043.when]
    );
    console.log('[OUTPUT] 0043 migration record inserted');
  } else {
    console.log('[STATE] 0043 already recorded, skipping insert');
  }

  // Step 3: Check if mlb_pitcher_stats already exists
  const [tables] = await conn.query("SHOW TABLES LIKE 'mlb_pitcher_stats'");
  
  if (tables.length === 0) {
    console.log('[STEP] Creating mlb_pitcher_stats table...');
    await conn.query(`
      CREATE TABLE \`mlb_pitcher_stats\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`mlbamId\` int NOT NULL,
        \`fullName\` varchar(128) NOT NULL,
        \`teamAbbrev\` varchar(8) NOT NULL,
        \`era\` double,
        \`k9\` double,
        \`bb9\` double,
        \`hr9\` double,
        \`whip\` double,
        \`ip\` double,
        \`gamesStarted\` int,
        \`gamesPlayed\` int,
        \`xera\` double,
        \`lastFetchedAt\` bigint,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`mlb_pitcher_stats_id\` PRIMARY KEY(\`id\`),
        CONSTRAINT \`uq_pitcher_team\` UNIQUE(\`mlbamId\`,\`teamAbbrev\`)
      )
    `);
    console.log('[OUTPUT] mlb_pitcher_stats table created');
    
    await conn.query('CREATE INDEX `idx_pitcher_full_name` ON `mlb_pitcher_stats` (`fullName`)');
    console.log('[OUTPUT] idx_pitcher_full_name index created');
  } else {
    console.log('[STATE] mlb_pitcher_stats already exists, skipping CREATE');
  }

  // Step 4: Record 0044 migration
  const hash0044 = getHash(sql0044);
  const [existing44] = await conn.query('SELECT id FROM __drizzle_migrations WHERE hash = ?', [hash0044]);
  
  if (existing44.length === 0) {
    console.log('[STEP] Inserting 0044 migration record...');
    await conn.query(
      'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
      [hash0044, entry0044.when]
    );
    console.log('[OUTPUT] 0044 migration record inserted');
  } else {
    console.log('[STATE] 0044 already recorded, skipping insert');
  }

  // Step 5: Verify
  const [finalTables] = await conn.query("SHOW TABLES LIKE 'mlb_pitcher_stats'");
  const [finalCols] = await conn.query('DESCRIBE mlb_pitcher_stats');
  console.log('[VERIFY] mlb_pitcher_stats exists:', finalTables.length > 0);
  console.log('[VERIFY] columns:', finalCols.map(c => c.Field).join(', '));

} finally {
  await conn.end();
}
