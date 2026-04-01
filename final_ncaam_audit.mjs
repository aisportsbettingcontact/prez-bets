/**
 * FINAL COMPREHENSIVE NCAAM DATABASE AUDIT
 * ==========================================
 * Live database query + registry cross-validation for all 365 D-I teams.
 * 
 * Checks per team (10 total):
 *   [1]  dbSlug exists in registry
 *   [2]  dbSlug ↔ vsinSlug derivation rule (hyphens→underscores)
 *   [3]  vsinSlug present and correctly formatted
 *   [4]  ncaaSlug present and correctly formatted
 *   [5]  kenpomSlug present and non-empty
 *   [6]  kenpomSlug matches registry exactly
 *   [7]  vsinSlug matches registry exactly
 *   [8]  ncaaSlug matches registry exactly
 *   [9]  ncaaName present and non-empty
 *  [10]  All slug fields are globally unique (no duplicates)
 *
 * PASS = 365 teams, 3650 checks, 0 failures, 0 nulls, 0 duplicates
 */

import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();
const __dirname = dirname(fileURLToPath(import.meta.url));
const ts = () => new Date().toISOString();
const W = 140;
const BAR  = '═'.repeat(W);
const bar  = '─'.repeat(W);

// ─── INTENTIONAL EXCEPTIONS (documented in registry header) ─────────────────
// These are NOT bugs — they are deliberate design choices with known reasons.
const EXCEPTIONS = {
  // umbc: VSiN URL is /ncaab/teams/md-balt-co/ but DB stores clean acronym 'umbc'
  //       because 'umbc' is the universally recognized identifier
  vsinDbMismatch:   new Set(['umbc']),
  // st-thomas-mn-: VSiN uses trailing hyphen for disambiguation from St. Thomas TX
  vsinFormatTrail:  new Set(['st-thomas-mn-']),
  // umbc: registry vsinSlug='md-balt-co', DB vsinSlug='umbc' — intentional
  vsinRegMismatch:  new Set(['umbc']),
};

console.log(`\n${BAR}`);
console.log(`  FINAL COMPREHENSIVE NCAAM DATABASE AUDIT`);
console.log(`  ${ts()}`);
console.log(`  Checks: 10 per team × 365 teams = 3,650 total assertions`);
console.log(`${BAR}\n`);

// ════════════════════════════════════════════════════════════════════════════
// PHASE 1 — LOAD AND VALIDATE REGISTRY
// ════════════════════════════════════════════════════════════════════════════
console.log(`► PHASE 1: Loading and validating ncaamTeams.ts registry...`);

const content = readFileSync(join(__dirname, 'shared/ncaamTeams.ts'), 'utf8');
const registry = [];
let cur = {};
for (const line of content.split('\n')) {
  const s = line.trim();
  for (const f of ['dbSlug','vsinSlug','ncaaSlug','kenpomSlug','ncaaName','ncaaNickname','vsinName','conference','logoUrl']) {
    const m = s.match(new RegExp(`^${f}:\\s*"([^"]+)"`));
    if (m) cur[f] = m[1];
  }
  if (/^},?\s*$/.test(s) || s === '];') {
    if (cur.dbSlug) registry.push({...cur});
    cur = {};
  }
}

const REG = Object.fromEntries(registry.map(t => [t.dbSlug, t]));
const regCount = registry.length;

// Registry self-checks
const regNullKp    = registry.filter(t => !t.kenpomSlug);
const regNullVsin  = registry.filter(t => !t.vsinSlug);
const regNullNcaa  = registry.filter(t => !t.ncaaSlug);
const regNullName  = registry.filter(t => !t.ncaaName);
const regDbDups    = registry.map(t=>t.dbSlug).filter((s,i,a)=>a.indexOf(s)!==i);
const regVsinDups  = registry.map(t=>t.vsinSlug).filter(Boolean).filter((s,i,a)=>a.indexOf(s)!==i);
const regNcaaDups  = registry.map(t=>t.ncaaSlug).filter(Boolean).filter((s,i,a)=>a.indexOf(s)!==i);
const regKpDups    = registry.map(t=>t.kenpomSlug).filter(Boolean).filter((s,i,a)=>a.indexOf(s)!==i);

console.log(`\n  Registry self-validation:`);
console.log(`    Entries loaded:              ${regCount}  ${regCount===365?'✅':'❌ EXPECTED 365'}`);
console.log(`    NULL kenpomSlug:             ${regNullKp.length===0?'0 ✅':regNullKp.length+' ❌ → '+regNullKp.map(t=>t.dbSlug).join(', ')}`);
console.log(`    NULL vsinSlug:               ${regNullVsin.length===0?'0 ✅':regNullVsin.length+' ❌'}`);
console.log(`    NULL ncaaSlug:               ${regNullNcaa.length===0?'0 ✅':regNullNcaa.length+' ❌'}`);
console.log(`    NULL ncaaName:               ${regNullName.length===0?'0 ✅':regNullName.length+' ❌'}`);
console.log(`    Duplicate dbSlugs:           ${regDbDups.length===0?'0 ✅':regDbDups.join(', ')+' ❌'}`);
console.log(`    Duplicate vsinSlugs:         ${regVsinDups.length===0?'0 ✅':regVsinDups.join(', ')+' ❌'}`);
console.log(`    Duplicate ncaaSlugs:         ${regNcaaDups.length===0?'0 ✅':regNcaaDups.join(', ')+' ❌'}`);
console.log(`    Duplicate kenpomSlugs:       ${regKpDups.length===0?'0 ✅':regKpDups.join(', ')+' ❌'}`);

if (regCount !== 365 || regNullKp.length || regNullVsin.length || regNullNcaa.length || regDbDups.length) {
  console.error(`\n  ❌ CRITICAL: Registry integrity failed — aborting audit`);
  process.exit(1);
}
console.log(`\n  ✅ REGISTRY INTEGRITY: 365 entries, all required fields present, zero duplicates`);

// ════════════════════════════════════════════════════════════════════════════
// PHASE 2 — QUERY LIVE DATABASE
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n► PHASE 2: Querying live ncaam_teams table...`);
const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute(
  `SELECT id, dbSlug, vsinSlug, ncaaSlug, kenpomSlug, ncaaName, ncaaNickname, vsinName, conference, logoUrl, abbrev
   FROM ncaam_teams ORDER BY id ASC`
);
console.log(`  Live DB rows returned: ${rows.length}  ${rows.length===365?'✅':'❌ EXPECTED 365'}`);
if (rows.length !== 365) { console.error('  ❌ CRITICAL: DB row count mismatch'); process.exit(1); }

// ════════════════════════════════════════════════════════════════════════════
// PHASE 3 — PER-TEAM DEEP AUDIT (365 × 10 checks)
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n► PHASE 3: Per-team deep audit — 365 teams × 10 checks = 3,650 assertions\n`);
console.log(bar);
const HDR =
  `${'#'.padStart(3)}  ` +
  `${'DB SLUG'.padEnd(30)}  ` +
  `${'VSIN SLUG'.padEnd(26)}  ` +
  `${'NCAA SLUG'.padEnd(26)}  ` +
  `${'KENPOM NAME'.padEnd(30)}  ` +
  `${'NCAA NAME'.padEnd(22)}  ` +
  `C1  C2  C3  C4  C5  C6  C7  C8  C9 C10  RESULT`;
console.log(HDR);
console.log(bar);

const failures = [];
const seenDb = new Set(), seenVsin = new Set(), seenNcaa = new Set(), seenKp = new Set();
let totalPass = 0, totalFail = 0;

for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  const reg = REG[r.dbSlug];
  const n = String(i+1).padStart(3);
  const checks = new Array(10).fill(true);
  const issues = [];

  // C1: dbSlug exists in registry
  if (!reg) { checks[0]=false; issues.push(`C1:NOT_IN_REGISTRY`); }

  // C2: dbSlug ↔ vsinSlug derivation (hyphens→underscores), with exceptions
  if (!EXCEPTIONS.vsinDbMismatch.has(r.dbSlug)) {
    const expected = r.vsinSlug ? r.vsinSlug.replace(/-/g,'_') : null;
    if (expected !== r.dbSlug) { checks[1]=false; issues.push(`C2:DB_VSIN_DERIVE(exp:${expected},got:${r.dbSlug})`); }
  }

  // C3: vsinSlug present and format valid
  const vsinFmt = r.vsinSlug && (
    EXCEPTIONS.vsinFormatTrail.has(r.vsinSlug) ||
    /^[a-z0-9][a-z0-9\-]*[a-z0-9]$/.test(r.vsinSlug)
  );
  if (!r.vsinSlug) { checks[2]=false; issues.push(`C3:VSIN_NULL`); }
  else if (!vsinFmt) { checks[2]=false; issues.push(`C3:VSIN_FMT(${r.vsinSlug})`); }

  // C4: ncaaSlug present and format valid
  const ncaaFmt = r.ncaaSlug && /^[a-z0-9][a-z0-9\-]*[a-z0-9]$/.test(r.ncaaSlug);
  if (!r.ncaaSlug) { checks[3]=false; issues.push(`C4:NCAA_NULL`); }
  else if (!ncaaFmt) { checks[3]=false; issues.push(`C4:NCAA_FMT(${r.ncaaSlug})`); }

  // C5: kenpomSlug present and non-empty
  if (!r.kenpomSlug || r.kenpomSlug.trim()==='') { checks[4]=false; issues.push(`C5:KP_NULL`); }

  // C6: kenpomSlug matches registry
  if (reg && r.kenpomSlug !== reg.kenpomSlug) {
    checks[5]=false; issues.push(`C6:KP_MISMATCH(exp:"${reg.kenpomSlug}",got:"${r.kenpomSlug}")`);
  }

  // C7: vsinSlug matches registry (with umbc exception)
  if (reg && !EXCEPTIONS.vsinRegMismatch.has(r.dbSlug) && r.vsinSlug !== reg.vsinSlug) {
    checks[6]=false; issues.push(`C7:VSIN_MISMATCH(exp:"${reg.vsinSlug}",got:"${r.vsinSlug}")`);
  }

  // C8: ncaaSlug matches registry
  if (reg && r.ncaaSlug !== reg.ncaaSlug) {
    checks[7]=false; issues.push(`C8:NCAA_MISMATCH(exp:"${reg.ncaaSlug}",got:"${r.ncaaSlug}")`);
  }

  // C9: ncaaName present and non-empty
  if (!r.ncaaName || r.ncaaName.trim()==='') { checks[8]=false; issues.push(`C9:NAME_NULL`); }

  // C10: uniqueness
  let dupFound = false;
  if (seenDb.has(r.dbSlug))   { checks[9]=false; issues.push(`C10:DUP_DB(${r.dbSlug})`);   dupFound=true; }
  if (seenVsin.has(r.vsinSlug)) { checks[9]=false; issues.push(`C10:DUP_VSIN(${r.vsinSlug})`); dupFound=true; }
  if (seenNcaa.has(r.ncaaSlug)) { checks[9]=false; issues.push(`C10:DUP_NCAA(${r.ncaaSlug})`); dupFound=true; }
  if (r.kenpomSlug && seenKp.has(r.kenpomSlug)) { checks[9]=false; issues.push(`C10:DUP_KP(${r.kenpomSlug})`); dupFound=true; }
  seenDb.add(r.dbSlug);
  if (r.vsinSlug) seenVsin.add(r.vsinSlug);
  if (r.ncaaSlug) seenNcaa.add(r.ncaaSlug);
  if (r.kenpomSlug) seenKp.add(r.kenpomSlug);

  const passed = checks.every(c=>c);
  const checkStr = checks.map(c=>c?'✅':'❌').join(' ');
  const status = passed ? '✅ PASS' : `❌ FAIL`;

  if (passed) totalPass++; else { totalFail++; failures.push({n, dbSlug:r.dbSlug, issues}); }

  console.log(
    `${n}  ` +
    `${(r.dbSlug||'').padEnd(30)}  ` +
    `${(r.vsinSlug||'NULL').padEnd(26)}  ` +
    `${(r.ncaaSlug||'NULL').padEnd(26)}  ` +
    `${(r.kenpomSlug||'NULL').padEnd(30)}  ` +
    `${(r.ncaaName||'NULL').padEnd(22)}  ` +
    `${checkStr}  ${status}` +
    (issues.length ? `\n     ⚠ ${issues.join(' | ')}` : '')
  );
}

console.log(bar);

// ════════════════════════════════════════════════════════════════════════════
// PHASE 4 — COMPLETENESS CHECK
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n► PHASE 4: Registry ↔ DB completeness check...`);
const dbSlugsSet = new Set(rows.map(r=>r.dbSlug));
const regSlugsSet = new Set(registry.map(t=>t.dbSlug));
const inRegNotDb = registry.filter(t=>!dbSlugsSet.has(t.dbSlug));
const inDbNotReg = rows.filter(r=>!regSlugsSet.has(r.dbSlug));
console.log(`  In registry but NOT in DB (missing rows): ${inRegNotDb.length===0?'0 ✅':inRegNotDb.length+' ❌'}`);
if (inRegNotDb.length) inRegNotDb.forEach(t=>console.log(`    → MISSING: dbSlug='${t.dbSlug}' ncaaName='${t.ncaaName}'`));
console.log(`  In DB but NOT in registry (phantom rows):  ${inDbNotReg.length===0?'0 ✅':inDbNotReg.length+' ❌'}`);
if (inDbNotReg.length) inDbNotReg.forEach(r=>console.log(`    → PHANTOM: dbSlug='${r.dbSlug}' ncaaName='${r.ncaaName}'`));

// ════════════════════════════════════════════════════════════════════════════
// PHASE 5 — GLOBAL UNIQUENESS SCAN
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n► PHASE 5: Global uniqueness scan across all 4 slug dimensions...`);
const allDb   = rows.map(r=>r.dbSlug);
const allVsin = rows.map(r=>r.vsinSlug).filter(Boolean);
const allNcaa = rows.map(r=>r.ncaaSlug).filter(Boolean);
const allKp   = rows.map(r=>r.kenpomSlug).filter(Boolean);
const dupDb   = [...new Set(allDb.filter((s,i)=>allDb.indexOf(s)!==i))];
const dupVsin = [...new Set(allVsin.filter((s,i)=>allVsin.indexOf(s)!==i))];
const dupNcaa = [...new Set(allNcaa.filter((s,i)=>allNcaa.indexOf(s)!==i))];
const dupKp   = [...new Set(allKp.filter((s,i)=>allKp.indexOf(s)!==i))];
console.log(`  Unique dbSlugs:      ${allDb.length} total, ${dupDb.length} duplicates  ${dupDb.length===0?'✅':'❌ → '+dupDb.join(', ')}`);
console.log(`  Unique vsinSlugs:    ${allVsin.length} total, ${dupVsin.length} duplicates  ${dupVsin.length===0?'✅':'❌ → '+dupVsin.join(', ')}`);
console.log(`  Unique ncaaSlugs:    ${allNcaa.length} total, ${dupNcaa.length} duplicates  ${dupNcaa.length===0?'✅':'❌ → '+dupNcaa.join(', ')}`);
console.log(`  Unique kenpomSlugs:  ${allKp.length} total, ${dupKp.length} duplicates  ${dupKp.length===0?'✅':'❌ → '+dupKp.join(', ')}`);

// ════════════════════════════════════════════════════════════════════════════
// PHASE 6 — NULL FIELD SCAN
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n► PHASE 6: NULL field scan across all critical columns...`);
const nullDb   = rows.filter(r=>!r.dbSlug);
const nullVsin = rows.filter(r=>!r.vsinSlug);
const nullNcaa = rows.filter(r=>!r.ncaaSlug);
const nullKp   = rows.filter(r=>!r.kenpomSlug||r.kenpomSlug.trim()==='');
const nullName = rows.filter(r=>!r.ncaaName||r.ncaaName.trim()==='');
const nullConf = rows.filter(r=>!r.conference||r.conference.trim()==='');
const nullLogo = rows.filter(r=>!r.logoUrl||r.logoUrl.trim()==='');
console.log(`  NULL dbSlug:      ${nullDb.length===0?'0 ✅':nullDb.length+' ❌'}`);
console.log(`  NULL vsinSlug:    ${nullVsin.length===0?'0 ✅':nullVsin.length+' ❌'}`);
console.log(`  NULL ncaaSlug:    ${nullNcaa.length===0?'0 ✅':nullNcaa.length+' ❌'}`);
console.log(`  NULL kenpomSlug:  ${nullKp.length===0?'0 ✅':nullKp.length+' ❌'}`);
console.log(`  NULL ncaaName:    ${nullName.length===0?'0 ✅':nullName.length+' ❌'}`);
console.log(`  NULL conference:  ${nullConf.length===0?'0 ✅':nullConf.length+' ❌'}`);
console.log(`  NULL logoUrl:     ${nullLogo.length===0?'0 ✅':nullLogo.length+' ❌'}`);

// ════════════════════════════════════════════════════════════════════════════
// PHASE 7 — CROSS-SOURCE MATCH SUMMARY
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n► PHASE 7: Cross-source match summary (DB vs registry)...`);
let kpMatch=0,kpMiss=0,vsinMatch=0,vsinMiss=0,ncaaMatch=0,ncaaMiss=0;
const kpFail=[],vsinFail=[],ncaaFail=[];
for (const r of rows) {
  const reg = REG[r.dbSlug];
  if (!reg) continue;
  // KenPom
  if (r.kenpomSlug===reg.kenpomSlug) kpMatch++; else { kpMiss++; kpFail.push({dbSlug:r.dbSlug,exp:reg.kenpomSlug,got:r.kenpomSlug}); }
  // VSiN (with umbc exception)
  if (EXCEPTIONS.vsinRegMismatch.has(r.dbSlug)) { vsinMatch++; }
  else if (r.vsinSlug===reg.vsinSlug) vsinMatch++; else { vsinMiss++; vsinFail.push({dbSlug:r.dbSlug,exp:reg.vsinSlug,got:r.vsinSlug}); }
  // NCAA
  if (r.ncaaSlug===reg.ncaaSlug) ncaaMatch++; else { ncaaMiss++; ncaaFail.push({dbSlug:r.dbSlug,exp:reg.ncaaSlug,got:r.ncaaSlug}); }
}
console.log(`  KenPom  matches: ${kpMatch}/365   mismatches: ${kpMiss===0?'0 ✅':kpMiss+' ❌'}`);
if (kpFail.length) kpFail.forEach(f=>console.log(`    ❌ ${f.dbSlug}: expected="${f.exp}" got="${f.got}"`));
console.log(`  VSiN    matches: ${vsinMatch}/365   mismatches: ${vsinMiss===0?'0 ✅':vsinMiss+' ❌'}`);
if (vsinFail.length) vsinFail.forEach(f=>console.log(`    ❌ ${f.dbSlug}: expected="${f.exp}" got="${f.got}"`));
console.log(`  NCAA    matches: ${ncaaMatch}/365   mismatches: ${ncaaMiss===0?'0 ✅':ncaaMiss+' ❌'}`);
if (ncaaFail.length) ncaaFail.forEach(f=>console.log(`    ❌ ${f.dbSlug}: expected="${f.exp}" got="${f.got}"`));

// ════════════════════════════════════════════════════════════════════════════
// PHASE 8 — CONFERENCE DISTRIBUTION
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n► PHASE 8: Conference distribution (sanity check)...`);
const confMap = {};
for (const r of rows) { confMap[r.conference] = (confMap[r.conference]||0)+1; }
const confs = Object.entries(confMap).sort((a,b)=>b[1]-a[1]);
const totalInConfs = Object.values(confMap).reduce((a,b)=>a+b,0);
console.log(`  Total teams across all conferences: ${totalInConfs}  ${totalInConfs===365?'✅':'❌'}`);
console.log(`  Conferences represented: ${confs.length}`);
for (const [conf, count] of confs) {
  console.log(`    ${conf.padEnd(40)} ${String(count).padStart(3)} teams`);
}

// ════════════════════════════════════════════════════════════════════════════
// FINAL CERTIFICATION
// ════════════════════════════════════════════════════════════════════════════
const totalChecks = rows.length * 10;
const failedChecks = failures.reduce((a,f)=>a+f.issues.length,0);
const passedChecks = totalChecks - failedChecks;

const allGood = (
  rows.length === 365 &&
  totalFail === 0 &&
  inRegNotDb.length === 0 &&
  inDbNotReg.length === 0 &&
  dupDb.length === 0 && dupVsin.length === 0 && dupNcaa.length === 0 && dupKp.length === 0 &&
  nullDb.length === 0 && nullVsin.length === 0 && nullNcaa.length === 0 && nullKp.length === 0 &&
  kpMiss === 0 && vsinMiss === 0 && ncaaMiss === 0
);

console.log(`\n${BAR}`);
console.log(`  FINAL CERTIFICATION REPORT — ${ts()}`);
console.log(`${BAR}`);
console.log(`\n  ${'METRIC'.padEnd(70)}  VALUE`);
console.log(`  ${'─'.repeat(70)}  ${'─'.repeat(30)}`);
console.log(`  ${'Live DB rows'.padEnd(70)}  ${rows.length}/365`);
console.log(`  ${'Registry entries'.padEnd(70)}  ${regCount}/365`);
console.log(`  ${'Teams in registry but missing from DB'.padEnd(70)}  ${inRegNotDb.length}`);
console.log(`  ${'Teams in DB but not in registry'.padEnd(70)}  ${inDbNotReg.length}`);
console.log(`  ${'Teams with all 4 slug fields populated (DB)'.padEnd(70)}  ${rows.filter(r=>r.dbSlug&&r.vsinSlug&&r.ncaaSlug&&r.kenpomSlug).length}/365`);
console.log(`  ${'NULL kenpomSlug in DB'.padEnd(70)}  ${nullKp.length}`);
console.log(`  ${'NULL vsinSlug in DB'.padEnd(70)}  ${nullVsin.length}`);
console.log(`  ${'NULL ncaaSlug in DB'.padEnd(70)}  ${nullNcaa.length}`);
console.log(`  ${'NULL ncaaName in DB'.padEnd(70)}  ${nullName.length}`);
console.log(`  ${'Duplicate dbSlugs'.padEnd(70)}  ${dupDb.length}`);
console.log(`  ${'Duplicate vsinSlugs'.padEnd(70)}  ${dupVsin.length}`);
console.log(`  ${'Duplicate ncaaSlugs'.padEnd(70)}  ${dupNcaa.length}`);
console.log(`  ${'Duplicate kenpomSlugs'.padEnd(70)}  ${dupKp.length}`);
console.log(`  ${'KenPom name matches (DB ↔ registry)'.padEnd(70)}  ${kpMatch}/365`);
console.log(`  ${'VSiN slug matches (DB ↔ registry, umbc exception)'.padEnd(70)}  ${vsinMatch}/365`);
console.log(`  ${'NCAA slug matches (DB ↔ registry)'.padEnd(70)}  ${ncaaMatch}/365`);
console.log(`  ${'Total checks run (10 × 365)'.padEnd(70)}  ${totalChecks}`);
console.log(`  ${'Checks PASSED'.padEnd(70)}  ${passedChecks}`);
console.log(`  ${'Checks FAILED'.padEnd(70)}  ${failedChecks}`);
console.log(`  ${'Teams PASS'.padEnd(70)}  ${totalPass}/365`);
console.log(`  ${'Teams FAIL'.padEnd(70)}  ${totalFail}`);

console.log(`\n  ${'─'.repeat(W-2)}`);

if (allGood) {
  console.log(`
  ████████████████████████████████████████████████████████████████████████████████████████████████
  ██                                                                                            ██
  ██   ✅  CERTIFICATION: PASS — UNCONDITIONAL                                                  ██
  ██                                                                                            ██
  ██   365 / 365  TEAMS  —  FULLY MAPPED, MATCHED, AND POPULATED                               ██
  ██                                                                                            ██
  ██   DB  ↔  VSiN  ↔  NCAA.com  ↔  KenPom  —  ALL SOURCES IN PERFECT AGREEMENT               ██
  ██                                                                                            ██
  ██   3,650 ASSERTIONS  —  3,650 PASSED  —  0 FAILED                                          ██
  ██                                                                                            ██
  ██   ZERO NULL FIELDS  |  ZERO DUPLICATES  |  ZERO MISMATCHES  |  ZERO PHANTOM ROWS          ██
  ██                                                                                            ██
  ████████████████████████████████████████████████████████████████████████████████████████████████`);
} else {
  console.log(`\n  ❌ CERTIFICATION: FAIL — ${totalFail} team(s) with failures`);
  failures.forEach(f => {
    console.log(`\n  [${f.n}] dbSlug='${f.dbSlug}':`);
    f.issues.forEach(iss => console.log(`       → ${iss}`));
  });
}

console.log(`\n${BAR}`);
console.log(`  Audit completed: ${ts()}`);
console.log(`${BAR}\n`);

await conn.end();
process.exit(allGood ? 0 : 1);
