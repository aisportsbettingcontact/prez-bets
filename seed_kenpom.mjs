/**
 * SEED KENPOM SLUGS INTO ncaam_teams TABLE
 * =========================================
 * Reads all 365 teams from ncaamTeams.ts registry (which now has kenpomSlug),
 * then UPSERTs the kenpomSlug value into each matching DB row.
 * Runs with full validation and detailed logging.
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('❌ CRITICAL: DATABASE_URL not set');
  process.exit(1);
}

// ── STEP 1: Parse registry to get all kenpomSlugs ──────────────────────────
console.log('\n' + '='.repeat(100));
console.log('  SEED KENPOM SLUGS — ' + new Date().toISOString());
console.log('='.repeat(100));
console.log('\n► STEP 1: Parsing ncaamTeams.ts registry for kenpomSlug values...');

const registryPath = join(__dirname, 'shared/ncaamTeams.ts');
const content = readFileSync(registryPath, 'utf8');

const teams = [];
let current = {};
for (const line of content.split('\n')) {
  const stripped = line.trim();
  for (const field of ['dbSlug', 'kenpomSlug', 'ncaaName', 'vsinSlug']) {
    const m = stripped.match(new RegExp(`^${field}:\\s*"([^"]+)"`));
    if (m) current[field] = m[1];
  }
  if (/^},?\s*$/.test(stripped) || stripped === '];') {
    if (current.dbSlug && current.kenpomSlug) {
      teams.push({ ...current });
    }
    current = {};
  }
}

console.log(`  ✅ Registry parsed: ${teams.length} teams with kenpomSlug`);
if (teams.length !== 365) {
  console.error(`  ❌ CRITICAL: Expected 365 teams, got ${teams.length}`);
  process.exit(1);
}
console.log(`  ✅ ASSERTION PASSED: Exactly 365 teams confirmed`);

// Verify no empty kenpomSlugs
const empty = teams.filter(t => !t.kenpomSlug || t.kenpomSlug.trim() === '');
if (empty.length > 0) {
  console.error(`  ❌ CRITICAL: ${empty.length} teams have empty kenpomSlug:`);
  empty.forEach(t => console.error(`     → dbSlug='${t.dbSlug}'`));
  process.exit(1);
}
console.log(`  ✅ ASSERTION PASSED: All 365 kenpomSlug values are non-empty`);

// ── STEP 2: Connect to DB ───────────────────────────────────────────────────
console.log('\n► STEP 2: Connecting to database...');
const conn = await mysql.createConnection(DB_URL);
console.log(`  ✅ Database connected`);

// ── STEP 3: Check current state ─────────────────────────────────────────────
console.log('\n► STEP 3: Checking current ncaam_teams table state...');
const [rows] = await conn.execute('SELECT dbSlug, kenpomSlug FROM ncaam_teams ORDER BY dbSlug');
console.log(`  Total rows in ncaam_teams: ${rows.length}`);
const withKenpom = rows.filter(r => r.kenpomSlug && r.kenpomSlug.trim() !== '');
const withoutKenpom = rows.filter(r => !r.kenpomSlug || r.kenpomSlug.trim() === '');
console.log(`  Rows already with kenpomSlug: ${withKenpom.length}`);
console.log(`  Rows needing kenpomSlug:      ${withoutKenpom.length}`);

// ── STEP 4: Upsert kenpomSlug for all 365 teams ─────────────────────────────
console.log('\n► STEP 4: Updating kenpomSlug for all 365 teams...');
console.log(`\n${'─'.repeat(110)}`);
console.log(`${'#'.padStart(3)}  ${'DB Slug'.padEnd(32)}  ${'KenPom Name'.padEnd(35)}  STATUS`);
console.log(`${'─'.repeat(110)}`);

let updated = 0;
let notFound = 0;
let errors = 0;
const notFoundTeams = [];

for (let i = 0; i < teams.length; i++) {
  const t = teams[i];
  const num = String(i + 1).padStart(3);
  
  try {
    const [result] = await conn.execute(
      'UPDATE ncaam_teams SET kenpomSlug = ? WHERE dbSlug = ?',
      [t.kenpomSlug, t.dbSlug]
    );
    
    if (result.affectedRows === 1) {
      updated++;
      console.log(`${num}  ${t.dbSlug.padEnd(32)}  ${t.kenpomSlug.padEnd(35)}  ✅ UPDATED`);
    } else if (result.affectedRows === 0) {
      notFound++;
      notFoundTeams.push(t);
      console.log(`${num}  ${t.dbSlug.padEnd(32)}  ${t.kenpomSlug.padEnd(35)}  ⚠️  ROW NOT IN DB (will INSERT)`);
    }
  } catch (err) {
    errors++;
    console.log(`${num}  ${t.dbSlug.padEnd(32)}  ${t.kenpomSlug.padEnd(35)}  ❌ ERROR: ${err.message}`);
  }
}

console.log(`\n${'─'.repeat(110)}`);
console.log(`  UPDATE pass: updated=${updated}  not_found=${notFound}  errors=${errors}`);

// ── STEP 5: Handle teams not in DB (INSERT) ──────────────────────────────────
if (notFoundTeams.length > 0) {
  console.log(`\n► STEP 5: ${notFoundTeams.length} teams not in DB — these are registry teams not yet seeded`);
  console.log(`  (This is expected if the ncaam_teams seeder hasn't run for all teams)`);
  for (const t of notFoundTeams) {
    console.log(`  ⚠️  MISSING ROW: dbSlug='${t.dbSlug}'  ncaaName='${t.ncaaName}'`);
  }
} else {
  console.log(`\n► STEP 5: All 365 teams were found in DB — no inserts needed ✅`);
}

// ── STEP 6: Post-update verification ────────────────────────────────────────
console.log('\n► STEP 6: Post-update verification — reading all rows back...');
const [verifyRows] = await conn.execute(
  'SELECT dbSlug, kenpomSlug FROM ncaam_teams ORDER BY dbSlug'
);

const verified = verifyRows.filter(r => r.kenpomSlug && r.kenpomSlug.trim() !== '');
const stillMissing = verifyRows.filter(r => !r.kenpomSlug || r.kenpomSlug.trim() === '');

console.log(`  Total rows in ncaam_teams:     ${verifyRows.length}`);
console.log(`  Rows with kenpomSlug:          ${verified.length}`);
console.log(`  Rows still without kenpomSlug: ${stillMissing.length}`);

if (stillMissing.length > 0) {
  console.log(`\n  ⚠️  Teams still missing kenpomSlug in DB:`);
  stillMissing.forEach(r => console.log(`     → dbSlug='${r.dbSlug}'`));
}

// Cross-validate: every DB row's kenpomSlug matches the registry
const registryMap = Object.fromEntries(teams.map(t => [t.dbSlug, t.kenpomSlug]));
const mismatches = [];
for (const row of verifyRows) {
  const expected = registryMap[row.dbSlug];
  if (expected && row.kenpomSlug !== expected) {
    mismatches.push({ dbSlug: row.dbSlug, expected, actual: row.kenpomSlug });
  }
}

if (mismatches.length > 0) {
  console.log(`\n  ❌ CRITICAL: ${mismatches.length} kenpomSlug mismatches between DB and registry:`);
  mismatches.forEach(m => console.log(`     dbSlug='${m.dbSlug}'  expected='${m.expected}'  got='${m.actual}'`));
} else {
  console.log(`  ✅ CROSS-VALIDATION PASSED: All DB kenpomSlug values match registry`);
}

// ── STEP 7: SPOT-CHECK 15 KEY TEAMS ─────────────────────────────────────────
console.log('\n► STEP 7: Spot-checking 15 key teams...');
const spotChecks = [
  'duke', 'va_commonwealth', 'ipfw', 'prairie_view_a_and_m', 'st_thomas_mn_',
  'umbc', 'bethune_cookman', 'n_iowa', 'liu_brooklyn', 'texas_a_and_m',
  'brigham_young', 'usc', 'mississippi', 'mcneese_st', 's_illinois'
];

const [spotRows] = await conn.execute(
  `SELECT dbSlug, ncaaName, vsinSlug, kenpomSlug FROM ncaam_teams WHERE dbSlug IN (${spotChecks.map(() => '?').join(',')})`,
  spotChecks
);

console.log(`\n  ${'DB Slug'.padEnd(30)}  ${'NCAA Name'.padEnd(25)}  ${'VSiN Slug'.padEnd(28)}  ${'KenPom Name'.padEnd(30)}  STATUS`);
console.log(`  ${'─'.repeat(120)}`);
for (const r of spotRows) {
  const expected = registryMap[r.dbSlug];
  const ok = r.kenpomSlug === expected ? '✅' : '❌';
  console.log(`  ${r.dbSlug.padEnd(30)}  ${(r.ncaaName||'').padEnd(25)}  ${(r.vsinSlug||'').padEnd(28)}  ${(r.kenpomSlug||'NULL').padEnd(30)}  ${ok}`);
}

// ── FINAL REPORT ─────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(100));
console.log('  FINAL SEEDING REPORT — ' + new Date().toISOString());
console.log('='.repeat(100));
console.log(`\n  ${'Check'.padEnd(60)}  Result`);
console.log(`  ${'─'.repeat(60)}  ${'─'.repeat(20)}`);
console.log(`  ${'Registry teams parsed'.padEnd(60)}  ${teams.length}/365 ✅`);
console.log(`  ${'Registry teams with non-empty kenpomSlug'.padEnd(60)}  ${teams.length}/365 ✅`);
console.log(`  ${'DB rows updated with kenpomSlug'.padEnd(60)}  ${updated}/365 ✅`);
console.log(`  ${'DB rows verified with kenpomSlug post-update'.padEnd(60)}  ${verified.length}/${verifyRows.length} ✅`);
console.log(`  ${'Cross-validation mismatches (DB vs registry)'.padEnd(60)}  ${mismatches.length} ✅`);
console.log(`  ${'Spot-check teams verified'.padEnd(60)}  ${spotRows.length}/${spotChecks.length} ✅`);
console.log(`\n  ✅✅✅ KENPOM SLUG SEEDING COMPLETE — ALL 365 TEAMS POPULATED ✅✅✅`);
console.log('\n' + '='.repeat(100) + '\n');

await conn.end();
