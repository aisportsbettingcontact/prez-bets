import mysql from 'mysql2/promise';

const dbUrl = process.env.DATABASE_URL;
console.log('[DB] Connecting...');

const conn = await mysql.createConnection(dbUrl);

// Pull ALL teams' kenpomSlug to verify the full mapping
const [allRows] = await conn.execute(
  `SELECT db_slug, vsin_slug, ncaa_slug, kenpom_slug, ncaa_name, conference
   FROM ncaam_teams 
   ORDER BY db_slug`
);

console.log(`\n[DB] Total ncaam_teams rows: ${allRows.length}`);
console.log(`[DB] Teams with kenpom_slug populated: ${allRows.filter(r => r.kenpom_slug).length}`);
console.log(`[DB] Teams with NULL kenpom_slug: ${allRows.filter(r => !r.kenpom_slug).length}`);

// Show the specific test teams
const testTeams = allRows.filter(r => ['massachusetts', 'miami_oh'].includes(r.db_slug));
console.log('\n[DB] Test teams (Massachusetts & Miami OH):');
for (const r of testTeams) {
  console.log(`  db_slug:      ${r.db_slug}`);
  console.log(`  vsin_slug:    ${r.vsin_slug}`);
  console.log(`  ncaa_slug:    ${r.ncaa_slug}`);
  console.log(`  kenpom_slug:  ${r.kenpom_slug}`);
  console.log(`  ncaa_name:    ${r.ncaa_name}`);
  console.log(`  conference:   ${r.conference}`);
  console.log('');
}

// Also show any teams where kenpom_slug contains parentheses (potential KenPom API mismatch)
const withParens = allRows.filter(r => r.kenpom_slug && r.kenpom_slug.includes('('));
console.log(`[DB] Teams with parentheses in kenpom_slug (${withParens.length} total):`);
for (const r of withParens) {
  console.log(`  ${r.db_slug.padEnd(30)} kenpom_slug="${r.kenpom_slug}"`);
}

// Show teams with & in kenpom_slug
const withAmpersand = allRows.filter(r => r.kenpom_slug && r.kenpom_slug.includes('&'));
console.log(`\n[DB] Teams with & in kenpom_slug (${withAmpersand.length} total):`);
for (const r of withAmpersand) {
  console.log(`  ${r.db_slug.padEnd(30)} kenpom_slug="${r.kenpom_slug}"`);
}

await conn.end();
console.log('\n[DB] Done.');
