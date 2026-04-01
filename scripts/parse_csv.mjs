import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, '..', 'shared', 'ncaamMapping.csv');

const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
const data = lines.slice(1).map(l => {
  const parts = l.split(',');
  return {
    conference: parts[0].trim(),
    ncaaName: parts[1].trim(),
    ncaaNickname: parts[2].trim(),
    vsinName: parts[3].trim(),
    ncaaSlug: parts[4].trim(),
    vsinSlug: parts[5].trim(),
    logoUrl: parts[6] ? parts[6].trim().replace(/\r/g,'') : ''
  };
});

const missing = data.filter(r => !r.ncaaSlug || !r.vsinSlug || !r.ncaaName);
console.log('Missing data rows:', missing.length);
if (missing.length > 0) console.log(missing);

const ncaaSlugs = data.map(r => r.ncaaSlug);
const dupNcaa = ncaaSlugs.filter((s,i) => ncaaSlugs.indexOf(s) !== i);
console.log('Duplicate NCAA slugs:', dupNcaa);

const vsinSlugs = data.map(r => r.vsinSlug);
const dupVsin = vsinSlugs.filter((s,i) => vsinSlugs.indexOf(s) !== i);
console.log('Duplicate VSiN slugs:', dupVsin);

console.log('Total teams:', data.length);

// Show all VSiN->NCAA slug differences
const diffs = data.filter(r => r.vsinSlug !== r.ncaaSlug);
console.log('\nVSiN slug != NCAA slug count:', diffs.length);
diffs.forEach(r => console.log(`  ${r.vsinName}: vsin="${r.vsinSlug}" -> ncaa="${r.ncaaSlug}"`));
