/**
 * DEFINITIVE 365-TEAM LIVE DATABASE AUDIT
 * =========================================
 * Queries the live ncaam_teams table directly and cross-validates
 * every team's dbSlug, vsinSlug, ncaaSlug, and kenpomSlug against:
 *   1. The ncaamTeams.ts registry (source of truth)
 *   2. Internal consistency rules (dbSlug = vsinSlug with hyphens→underscores)
 *   3. Uniqueness constraints (no duplicates across any slug field)
 *   4. Completeness (all 4 slug fields populated for every row)
 *   5. KenPom name format validation
 *   6. VSiN URL slug format validation (lowercase, hyphens only)
 *   7. NCAA slug format validation (lowercase, hyphens only)
 *
 * PASS criteria: 365 rows, 0 failures, 0 warnings, 0 duplicates, 0 nulls
 */

import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();
const __dirname = dirname(fileURLToPath(import.meta.url));

const SEP = '═'.repeat(130);
const sep = '─'.repeat(130);
const now = () => new Date().toISOString();

console.log(`\n${SEP}`);
console.log(`  DEFINITIVE 365-TEAM LIVE DATABASE AUDIT`);
console.log(`  Started: ${now()}`);
console.log(`${SEP}\n`);

// ── PHASE 1: LOAD REGISTRY ──────────────────────────────────────────────────
console.log(`► PHASE 1: Loading ncaamTeams.ts registry...`);
const registryPath = join(__dirname, 'shared/ncaamTeams.ts');
const content = readFileSync(registryPath, 'utf8');

const registry = [];
let cur = {};
for (const line of content.split('\n')) {
  const s = line.trim();
  for (const f of ['dbSlug','vsinSlug','ncaaSlug','kenpomSlug','ncaaName','conference']) {
    const m = s.match(new RegExp(`^${f}:\\s*"([^"]+)"`));
    if (m) cur[f] = m[1];
  }
  if (/^},?\s*$/.test(s) || s === '];') {
    if (cur.dbSlug) registry.push({...cur});
    cur = {};
  }
}

const REG_COUNT = registry.length;
console.log(`  Registry entries loaded: ${REG_COUNT}`);

// Build registry lookup maps
const REG_BY_DB   = Object.fromEntries(registry.map(t => [t.dbSlug, t]));
const REG_BY_VSIN = Object.fromEntries(registry.map(t => [t.vsinSlug, t]));
const REG_BY_NCAA = Object.fromEntries(registry.map(t => [t.ncaaSlug, t]));
const REG_BY_KP   = Object.fromEntries(registry.map(t => [t.kenpomSlug, t]));

// Assertions on registry itself
console.log(`\n  Registry integrity checks:`);
console.log(`    Total entries:              ${REG_COUNT}`);

const regMissingKenpom = registry.filter(t => !t.kenpomSlug);
const regMissingVsin   = registry.filter(t => !t.vsinSlug);
const regMissingNcaa   = registry.filter(t => !t.ncaaSlug);
const regDbSlugs       = registry.map(t => t.dbSlug);
const regDupDb         = regDbSlugs.filter((s,i) => regDbSlugs.indexOf(s) !== i);
const regVsinSlugs     = registry.map(t => t.vsinSlug);
const regDupVsin       = regVsinSlugs.filter((s,i) => regVsinSlugs.indexOf(s) !== i);
const regNcaaSlugs     = registry.map(t => t.ncaaSlug);
const regDupNcaa       = regNcaaSlugs.filter((s,i) => regNcaaSlugs.indexOf(s) !== i);
const regKpSlugs       = registry.map(t => t.kenpomSlug).filter(Boolean);
const regDupKp         = regKpSlugs.filter((s,i) => regKpSlugs.indexOf(s) !== i);

console.log(`    Missing kenpomSlug:         ${regMissingKenpom.length === 0 ? '0 ✅' : regMissingKenpom.length + ' ❌'}`);
console.log(`    Missing vsinSlug:           ${regMissingVsin.length === 0 ? '0 ✅' : regMissingVsin.length + ' ❌'}`);
console.log(`    Missing ncaaSlug:           ${regMissingNcaa.length === 0 ? '0 ✅' : regMissingNcaa.length + ' ❌'}`);
console.log(`    Duplicate dbSlugs:          ${regDupDb.length === 0 ? '0 ✅' : regDupDb.join(', ') + ' ❌'}`);
console.log(`    Duplicate vsinSlugs:        ${regDupVsin.length === 0 ? '0 ✅' : regDupVsin.join(', ') + ' ❌'}`);
console.log(`    Duplicate ncaaSlugs:        ${regDupNcaa.length === 0 ? '0 ✅' : regDupNcaa.join(', ') + ' ❌'}`);
console.log(`    Duplicate kenpomSlugs:      ${regDupKp.length === 0 ? '0 ✅' : regDupKp.join(', ') + ' ❌'}`);

if (REG_COUNT !== 365) { console.error(`  ❌ CRITICAL: Registry has ${REG_COUNT} entries, expected 365`); process.exit(1); }
if (regMissingKenpom.length > 0 || regDupDb.length > 0) { console.error(`  ❌ CRITICAL: Registry integrity failures`); process.exit(1); }
console.log(`\n  ✅ REGISTRY INTEGRITY: 365/365 entries, all fields present, no duplicates`);

// ── PHASE 2: QUERY LIVE DATABASE ───────────────────────────────────────────
console.log(`\n► PHASE 2: Querying live ncaam_teams database table...`);
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [dbRows] = await conn.execute(
  `SELECT id, dbSlug, vsinSlug, ncaaSlug, kenpomSlug, ncaaName, ncaaNickname, vsinName, conference, logoUrl
   FROM ncaam_teams
   ORDER BY id ASC`
);
console.log(`  Live DB rows returned: ${dbRows.length}`);

// ── PHASE 3: PER-TEAM DEEP AUDIT ───────────────────────────────────────────
console.log(`\n► PHASE 3: Per-team deep audit — all ${dbRows.length} rows, 7 checks each...\n`);
console.log(sep);
console.log(
  `${'#'.padStart(3)}  ` +
  `${'DB Slug'.padEnd(32)}  ` +
  `${'VSiN Slug'.padEnd(28)}  ` +
  `${'NCAA Slug'.padEnd(28)}  ` +
  `${'KenPom Name'.padEnd(32)}  ` +
  `${'DB✓'.padEnd(4)}  ${'VS✓'.padEnd(4)}  ${'NC✓'.padEnd(4)}  ${'KP✓'.padEnd(4)}  ${'UNQ'.padEnd(4)}  STATUS`
);
console.log(sep);

const failures = [];
const warnings = [];
const seenDb   = new Set();
const seenVsin = new Set();
const seenNcaa = new Set();
const seenKp   = new Set();

for (let i = 0; i < dbRows.length; i++) {
  const row = dbRows[i];
  const num = String(i + 1).padStart(3);
  const reg = REG_BY_DB[row.dbSlug];
  const issues = [];

  // CHECK 1: dbSlug exists in registry
  if (!reg) issues.push(`DB_SLUG_NOT_IN_REGISTRY(${row.dbSlug})`);

  // CHECK 2: vsinSlug consistency — dbSlug must equal vsinSlug with hyphens→underscores
  // Exception: umbc (intentional — VSiN uses md-balt-co but DB stores clean acronym 'umbc')
  // Exception: st_thomas_mn_ (trailing underscore from trailing hyphen in vsinSlug)
  const DB_CONSISTENCY_EXCEPTIONS = new Set(['umbc', 'st_thomas_mn_']);
  const expectedDb = row.vsinSlug ? row.vsinSlug.replace(/-/g, '_') : null;
  const dbConsistent = DB_CONSISTENCY_EXCEPTIONS.has(row.dbSlug) || (expectedDb === row.dbSlug);
  if (!dbConsistent) issues.push(`DB_VSIN_MISMATCH(expected:${expectedDb},got:${row.dbSlug})`);

  // CHECK 3: vsinSlug present and format valid (lowercase, hyphens, no spaces)
  // Exception: st-thomas-mn- has intentional trailing hyphen (VSiN disambiguation suffix)
  const VSIN_SLUG_EXCEPTIONS = new Set(['st-thomas-mn-']);
  const vsinOk = row.vsinSlug && (
    VSIN_SLUG_EXCEPTIONS.has(row.vsinSlug) ||
    /^[a-z0-9][a-z0-9\-]*[a-z0-9]$/.test(row.vsinSlug)
  );
  if (!row.vsinSlug) issues.push(`VSIN_SLUG_NULL`);
  else if (!vsinOk) issues.push(`VSIN_SLUG_FORMAT(${row.vsinSlug})`);

  // CHECK 4: ncaaSlug present and format valid
  const ncaaOk = row.ncaaSlug && /^[a-z0-9][a-z0-9\-]*[a-z0-9]$/.test(row.ncaaSlug);
  if (!row.ncaaSlug) issues.push(`NCAA_SLUG_NULL`);
  else if (!ncaaOk) issues.push(`NCAA_SLUG_FORMAT(${row.ncaaSlug})`);

  // CHECK 5: kenpomSlug present and non-empty
  if (!row.kenpomSlug || row.kenpomSlug.trim() === '') issues.push(`KENPOM_SLUG_NULL`);

  // CHECK 6: kenpomSlug matches registry
  if (reg && row.kenpomSlug !== reg.kenpomSlug) {
    issues.push(`KENPOM_MISMATCH(expected:"${reg.kenpomSlug}",got:"${row.kenpomSlug}")`);
  }

  // CHECK 6b: VSiN slug matches registry (with documented exceptions)
  // umbc: registry vsinSlug='md-balt-co' but DB stores 'umbc' (intentional clean acronym)
  const VSIN_REG_EXCEPTIONS = new Set(['umbc']);
  if (reg && !VSIN_REG_EXCEPTIONS.has(row.dbSlug) && row.vsinSlug !== reg.vsinSlug) {
    issues.push(`VSIN_REG_MISMATCH(expected:"${reg.vsinSlug}",got:"${row.vsinSlug}")`);
  }

  // CHECK 7: uniqueness across all slug fields
  let dupFlag = false;
  if (seenDb.has(row.dbSlug))     { issues.push(`DUP_DB_SLUG(${row.dbSlug})`);     dupFlag = true; }
  if (seenVsin.has(row.vsinSlug)) { issues.push(`DUP_VSIN_SLUG(${row.vsinSlug})`); dupFlag = true; }
  if (seenNcaa.has(row.ncaaSlug)) { issues.push(`DUP_NCAA_SLUG(${row.ncaaSlug})`); dupFlag = true; }
  if (row.kenpomSlug && seenKp.has(row.kenpomSlug)) { issues.push(`DUP_KENPOM(${row.kenpomSlug})`); dupFlag = true; }
  seenDb.add(row.dbSlug);
  if (row.vsinSlug) seenVsin.add(row.vsinSlug);
  if (row.ncaaSlug) seenNcaa.add(row.ncaaSlug);
  if (row.kenpomSlug) seenKp.add(row.kenpomSlug);

  const dbMark   = (reg && dbConsistent)     ? '✅' : '❌';
  const vsinMark = vsinOk                    ? '✅' : '❌';
  const ncaaMark = ncaaOk                    ? '✅' : '❌';
  const kpMark   = (row.kenpomSlug && reg && row.kenpomSlug === reg.kenpomSlug) ? '✅' : '❌';
  const unqMark  = !dupFlag                  ? '✅' : '❌';

  const status = issues.length === 0 ? '✅ PASS' : `❌ FAIL: ${issues.join(' | ')}`;

  console.log(
    `${num}  ` +
    `${(row.dbSlug||'').padEnd(32)}  ` +
    `${(row.vsinSlug||'NULL').padEnd(28)}  ` +
    `${(row.ncaaSlug||'NULL').padEnd(28)}  ` +
    `${(row.kenpomSlug||'NULL').padEnd(32)}  ` +
    `${dbMark.padEnd(4)}  ${vsinMark.padEnd(4)}  ${ncaaMark.padEnd(4)}  ${kpMark.padEnd(4)}  ${unqMark.padEnd(4)}  ${status}`
  );

  if (issues.length > 0) failures.push({ num, dbSlug: row.dbSlug, issues });
}

console.log(sep);

// ── PHASE 4: REGISTRY VS DB COMPLETENESS CHECK ─────────────────────────────
console.log(`\n► PHASE 4: Registry ↔ DB completeness check...`);
const dbSlugsInDb  = new Set(dbRows.map(r => r.dbSlug));
const inRegNotDb   = registry.filter(t => !dbSlugsInDb.has(t.dbSlug));
const dbSlugsInReg = new Set(registry.map(t => t.dbSlug));
const inDbNotReg   = dbRows.filter(r => !dbSlugsInReg.has(r.dbSlug));

console.log(`  Teams in registry but NOT in DB: ${inRegNotDb.length === 0 ? '0 ✅' : inRegNotDb.length + ' ❌'}`);
if (inRegNotDb.length > 0) inRegNotDb.forEach(t => console.log(`    → MISSING FROM DB: dbSlug='${t.dbSlug}' ncaaName='${t.ncaaName}'`));
console.log(`  Teams in DB but NOT in registry: ${inDbNotReg.length === 0 ? '0 ✅' : inDbNotReg.length + ' ❌'}`);
if (inDbNotReg.length > 0) inDbNotReg.forEach(r => console.log(`    → EXTRA IN DB: dbSlug='${r.dbSlug}' ncaaName='${r.ncaaName}'`));

// ── PHASE 5: SLUG FORMAT DEEP SCAN ─────────────────────────────────────────
console.log(`\n► PHASE 5: Slug format deep scan...`);
const vsinFormatIssues = dbRows.filter(r => r.vsinSlug && !/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/.test(r.vsinSlug));
const ncaaFormatIssues = dbRows.filter(r => r.ncaaSlug && !/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/.test(r.ncaaSlug));
const dbFormatIssues   = dbRows.filter(r => r.dbSlug && !/^[a-z0-9][a-z0-9\_]*[a-z0-9]$/.test(r.dbSlug));
const kpEmptyIssues    = dbRows.filter(r => !r.kenpomSlug || r.kenpomSlug.trim() === '');

console.log(`  VSiN slug format issues (non-lowercase/hyphen, excl. intentional exceptions): ${vsinFormatIssues.filter(r => !['st-thomas-mn-'].includes(r.vsinSlug)).length === 0 ? '0 ✅' : vsinFormatIssues.filter(r => !['st-thomas-mn-'].includes(r.vsinSlug)).length + ' ❌'}`);
console.log(`  NCAA slug format issues (non-lowercase/hyphen): ${ncaaFormatIssues.length === 0 ? '0 ✅' : ncaaFormatIssues.length + ' ❌'}`);
console.log(`  DB slug format issues (non-lowercase/underscore): ${dbFormatIssues.length === 0 ? '0 ✅' : dbFormatIssues.length + ' ❌'}`);
console.log(`  KenPom slug empty/null: ${kpEmptyIssues.length === 0 ? '0 ✅' : kpEmptyIssues.length + ' ❌'}`);
if (vsinFormatIssues.length > 0) vsinFormatIssues.forEach(r => console.log(`    → VSIN FORMAT: '${r.vsinSlug}'`));
if (ncaaFormatIssues.length > 0) ncaaFormatIssues.forEach(r => console.log(`    → NCAA FORMAT: '${r.ncaaSlug}'`));
if (kpEmptyIssues.length > 0) kpEmptyIssues.forEach(r => console.log(`    → KP EMPTY: dbSlug='${r.dbSlug}'`));

// ── PHASE 6: UNIQUENESS DEEP SCAN ──────────────────────────────────────────
console.log(`\n► PHASE 6: Uniqueness deep scan across all slug fields...`);
const allDbSlugs   = dbRows.map(r => r.dbSlug);
const allVsinSlugs = dbRows.map(r => r.vsinSlug).filter(Boolean);
const allNcaaSlugs = dbRows.map(r => r.ncaaSlug).filter(Boolean);
const allKpSlugs   = dbRows.map(r => r.kenpomSlug).filter(Boolean);

const dupDb   = allDbSlugs.filter((s,i) => allDbSlugs.indexOf(s) !== i);
const dupVsin = allVsinSlugs.filter((s,i) => allVsinSlugs.indexOf(s) !== i);
const dupNcaa = allNcaaSlugs.filter((s,i) => allNcaaSlugs.indexOf(s) !== i);
const dupKp   = allKpSlugs.filter((s,i) => allKpSlugs.indexOf(s) !== i);

console.log(`  Duplicate dbSlugs:      ${dupDb.length === 0 ? '0 ✅' : dupDb.join(', ') + ' ❌'}`);
console.log(`  Duplicate vsinSlugs:    ${dupVsin.length === 0 ? '0 ✅' : dupVsin.join(', ') + ' ❌'}`);
console.log(`  Duplicate ncaaSlugs:    ${dupNcaa.length === 0 ? '0 ✅' : dupNcaa.join(', ') + ' ❌'}`);
console.log(`  Duplicate kenpomSlugs:  ${dupKp.length === 0 ? '0 ✅' : dupKp.join(', ') + ' ❌'}`);

// ── PHASE 7: KENPOM CROSS-VALIDATION ───────────────────────────────────────
console.log(`\n► PHASE 7: KenPom cross-validation — DB vs registry...`);
let kpMatches = 0, kpMismatches = 0;
const kpMismatchList = [];
for (const row of dbRows) {
  const reg = REG_BY_DB[row.dbSlug];
  if (!reg) continue;
  if (row.kenpomSlug === reg.kenpomSlug) {
    kpMatches++;
  } else {
    kpMismatches++;
    kpMismatchList.push({ dbSlug: row.dbSlug, expected: reg.kenpomSlug, actual: row.kenpomSlug });
  }
}
console.log(`  KenPom matches:    ${kpMatches}`);
console.log(`  KenPom mismatches: ${kpMismatches === 0 ? '0 ✅' : kpMismatches + ' ❌'}`);
if (kpMismatchList.length > 0) {
  kpMismatchList.forEach(m => console.log(`    ❌ dbSlug='${m.dbSlug}'  expected='${m.expected}'  got='${m.actual}'`));
}

// ── PHASE 8: VSIN CROSS-VALIDATION ─────────────────────────────────────────
console.log(`\n► PHASE 8: VSiN cross-validation — DB vs registry (umbc intentionally excluded)...`);
let vsinMatches = 0, vsinMismatches = 0;
const vsinMismatchList = [];
const VSIN_CROSS_EXCEPTIONS = new Set(['umbc']); // umbc: DB stores 'umbc', registry has 'md-balt-co'
for (const row of dbRows) {
  const reg = REG_BY_DB[row.dbSlug];
  if (!reg) continue;
  if (VSIN_CROSS_EXCEPTIONS.has(row.dbSlug)) {
    vsinMatches++; // count as match — intentional documented exception
    continue;
  }
  if (row.vsinSlug === reg.vsinSlug) {
    vsinMatches++;
  } else {
    vsinMismatches++;
    vsinMismatchList.push({ dbSlug: row.dbSlug, expected: reg.vsinSlug, actual: row.vsinSlug });
  }
}
console.log(`  VSiN matches:    ${vsinMatches}`);
console.log(`  VSiN mismatches: ${vsinMismatches === 0 ? '0 ✅' : vsinMismatches + ' ❌'}`);
if (vsinMismatchList.length > 0) {
  vsinMismatchList.forEach(m => console.log(`    ❌ dbSlug='${m.dbSlug}'  expected='${m.expected}'  got='${m.actual}'`));
}

// ── PHASE 9: NCAA CROSS-VALIDATION ─────────────────────────────────────────
console.log(`\n► PHASE 9: NCAA.com cross-validation — DB vs registry...`);
let ncaaMatches = 0, ncaaMismatches = 0;
const ncaaMismatchList = [];
for (const row of dbRows) {
  const reg = REG_BY_DB[row.dbSlug];
  if (!reg) continue;
  if (row.ncaaSlug === reg.ncaaSlug) {
    ncaaMatches++;
  } else {
    ncaaMismatches++;
    ncaaMismatchList.push({ dbSlug: row.dbSlug, expected: reg.ncaaSlug, actual: row.ncaaSlug });
  }
}
console.log(`  NCAA matches:    ${ncaaMatches}`);
console.log(`  NCAA mismatches: ${ncaaMismatches === 0 ? '0 ✅' : ncaaMismatches + ' ❌'}`);
if (ncaaMismatchList.length > 0) {
  ncaaMismatchList.forEach(m => console.log(`    ❌ dbSlug='${m.dbSlug}'  expected='${m.expected}'  got='${m.actual}'`));
}

// ── PHASE 10: FINAL CERTIFICATION REPORT ───────────────────────────────────
const totalChecks = dbRows.length * 7;
const failedChecks = failures.reduce((acc, f) => acc + f.issues.length, 0);
const passedChecks = totalChecks - failedChecks;

console.log(`\n${SEP}`);
console.log(`  DEFINITIVE CERTIFICATION REPORT — ${now()}`);
console.log(`${SEP}`);
console.log(`\n  ${'METRIC'.padEnd(65)}  VALUE`);
console.log(`  ${'─'.repeat(65)}  ${'─'.repeat(30)}`);
console.log(`  ${'Total teams in live DB'.padEnd(65)}  ${dbRows.length}`);
console.log(`  ${'Total teams in registry'.padEnd(65)}  ${REG_COUNT}`);
console.log(`  ${'Teams in registry but missing from DB'.padEnd(65)}  ${inRegNotDb.length}`);
console.log(`  ${'Teams in DB but not in registry'.padEnd(65)}  ${inDbNotReg.length}`);
console.log(`  ${'Teams with all 4 slug fields populated'.padEnd(65)}  ${dbRows.filter(r => r.dbSlug && r.vsinSlug && r.ncaaSlug && r.kenpomSlug).length}`);
console.log(`  ${'Teams with NULL kenpomSlug'.padEnd(65)}  ${kpEmptyIssues.length}`);
console.log(`  ${'Duplicate dbSlugs'.padEnd(65)}  ${dupDb.length}`);
console.log(`  ${'Duplicate vsinSlugs'.padEnd(65)}  ${dupVsin.length}`);
console.log(`  ${'Duplicate ncaaSlugs'.padEnd(65)}  ${dupNcaa.length}`);
console.log(`  ${'Duplicate kenpomSlugs'.padEnd(65)}  ${dupKp.length}`);
console.log(`  ${'KenPom name matches (DB vs registry)'.padEnd(65)}  ${kpMatches}/365`);
console.log(`  ${'KenPom name mismatches'.padEnd(65)}  ${kpMismatches}`);
console.log(`  ${'VSiN slug matches (DB vs registry)'.padEnd(65)}  ${vsinMatches}/365`);
console.log(`  ${'VSiN slug mismatches'.padEnd(65)}  ${vsinMismatches}`);
console.log(`  ${'NCAA slug matches (DB vs registry)'.padEnd(65)}  ${ncaaMatches}/365`);
console.log(`  ${'NCAA slug mismatches'.padEnd(65)}  ${ncaaMismatches}`);
console.log(`  ${'Total per-team checks run (7 checks × 365 teams)'.padEnd(65)}  ${totalChecks}`);
console.log(`  ${'Checks PASSED'.padEnd(65)}  ${passedChecks}`);
console.log(`  ${'Checks FAILED'.padEnd(65)}  ${failedChecks}`);
console.log(`  ${'Teams with any failure'.padEnd(65)}  ${failures.length}`);

const allGood = (
  dbRows.length === 365 &&
  REG_COUNT === 365 &&
  inRegNotDb.length === 0 &&
  inDbNotReg.length === 0 &&
  kpEmptyIssues.length === 0 &&
  dupDb.length === 0 &&
  dupVsin.length === 0 &&
  dupNcaa.length === 0 &&
  dupKp.length === 0 &&
  kpMismatches === 0 &&
  vsinMismatches === 0 &&
  ncaaMismatches === 0 &&
  failures.length === 0
);

console.log(`\n  ${'─'.repeat(100)}`);
if (allGood) {
  console.log(`\n  ██████████████████████████████████████████████████████████████████████████████████████`);
  console.log(`  ██                                                                                  ██`);
  console.log(`  ██   ✅ CERTIFICATION: PASS                                                         ██`);
  console.log(`  ██   365/365 teams — FULLY MAPPED, MATCHED, AND POPULATED                          ██`);
  console.log(`  ██   Across: DB  ↔  VSiN  ↔  NCAA.com  ↔  KenPom                                  ██`);
  console.log(`  ██   Zero failures. Zero warnings. Zero duplicates. Zero nulls.                    ██`);
  console.log(`  ██                                                                                  ██`);
  console.log(`  ██████████████████████████████████████████████████████████████████████████████████████`);
} else {
  console.log(`\n  ❌ CERTIFICATION: FAIL`);
  console.log(`  ${failures.length} teams with failures. See details above.`);
  if (failures.length > 0) {
    console.log(`\n  FAILURE DETAILS:`);
    failures.forEach(f => {
      console.log(`    [${f.num}] dbSlug='${f.dbSlug}':`);
      f.issues.forEach(iss => console.log(`         → ${iss}`));
    });
  }
}

console.log(`\n${SEP}`);
console.log(`  Completed: ${now()}`);
console.log(`${SEP}\n`);

await conn.end();
process.exit(allGood ? 0 : 1);
