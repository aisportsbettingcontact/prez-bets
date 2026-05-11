/**
 * populateStatcastISO.mjs
 * ========================
 * Fetches 2026 Statcast batting metrics from Baseball Savant (two endpoints)
 * and populates mlb_players.iso, barrelPct, hardHitPct, xSlg for all active players.
 *
 * ENDPOINT 1: barrel_batted_rate, hard_hit_percent, xslg
 * ENDPOINT 2: slg_percent, batting_avg → ISO = SLG - AVG
 *
 * EXECUTION FLOW:
 *   [INPUT]  Baseball Savant 2026 Statcast leaderboard CSVs (min=1 PA)
 *   [STEP 1] Fetch both CSVs from Savant API via Python
 *   [STEP 2] Parse CSV — extract mlbamId, barrelPct, hardHitPct, xSlg
 *   [STEP 3] Compute ISO = SLG - AVG from second endpoint
 *   [STEP 4] Validate all values are in expected ranges
 *   [STEP 5] Batch UPDATE mlb_players by mlbamId
 *   [STEP 6] Verify coverage and log per-field statistics
 *   [OUTPUT] Updated row count, coverage %, per-field stats
 *   [VERIFY] All values in valid ranges, coverage ≥ 300 players
 */
import mysql from 'mysql2/promise';
import { config } from 'dotenv';
import { spawnSync } from 'child_process';
import { writeFileSync, existsSync, unlinkSync } from 'fs';

config({ quiet: true });

const TAG = '[StatcastISO]';
function log(msg)    { console.log(`${TAG} ${new Date().toISOString().slice(11,23)} ${msg}`); }
function logErr(msg) { console.error(`${TAG} [ERROR] ${new Date().toISOString().slice(11,23)} ${msg}`); }

// ── Validation ranges ──────────────────────────────────────────────────────────
const VALID = {
  barrelPct:  { min: 0,     max: 100, desc: 'barrel %'   },
  hardHitPct: { min: 0,     max: 100, desc: 'hard hit %' },
  xSlg:       { min: 0,     max: 1.5, desc: 'xSLG'       },
  iso:        { min: -0.05, max: 1.2, desc: 'ISO'        },
};

function clamp(val, field) {
  if (val == null || val === undefined || isNaN(val)) return null;
  const r = VALID[field];
  if (val < r.min || val > r.max) {
    logErr(`[VERIFY] ${field}=${val} out of range [${r.min}, ${r.max}] — setting null`);
    return null;
  }
  return val;
}

// ── Python script that fetches both endpoints and returns JSON ─────────────────
function buildPythonScript(year) {
  return `
import urllib.request, csv, io, json, sys

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    'Accept': 'text/csv,text/plain,*/*',
    'Referer': 'https://baseballsavant.mlb.com/',
}

def fetch_csv(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode('utf-8-sig')

def fix_dup_player_id(raw):
    lines = raw.strip().split('\\n')
    if not lines:
        return raw
    parts = lines[0].split(',')
    seen = False
    new_parts = []
    for p in parts:
        stripped = p.strip().strip('"')
        if stripped == 'player_id':
            if seen:
                new_parts.append('player_id_dup')
            else:
                new_parts.append(p)
                seen = True
        else:
            new_parts.append(p)
    lines[0] = ','.join(new_parts)
    return '\\n'.join(lines)

def parse_decimal(s):
    if not s or not s.strip():
        return None
    s = s.strip()
    if s.startswith('.'):
        s = '0' + s
    try:
        return float(s)
    except:
        return None

# ── Endpoint 1: Statcast metrics ──────────────────────────────────────────────
url1 = (
    'https://baseballsavant.mlb.com/leaderboard/custom'
    '?year=${year}&type=batter&filter=&min=1'
    '&selections=player_id,player_name,team_id,team_abbrev,b_ab,b_total_hits,'
    'b_home_run,b_single,b_double,b_triple,b_bb,b_so,barrel_batted_rate,'
    'hard_hit_percent,xslg,iso'
    '&chart=false&x=xslg&y=xslg&r=no&chartType=beeswarm&csv=true'
)

raw1 = fetch_csv(url1)
sys.stderr.write(f'Endpoint 1: {len(raw1)} bytes\\n')

statcast = {}  # mlbamId -> {barrelPct, hardHitPct, xSlg}
reader1 = csv.DictReader(io.StringIO(fix_dup_player_id(raw1)))
for row in reader1:
    try:
        pid = int(row.get('player_id', 0) or 0)
        if not pid:
            continue
        barrel  = parse_decimal(row.get('barrel_batted_rate'))
        hardhit = parse_decimal(row.get('hard_hit_percent'))
        xslg    = parse_decimal(row.get('xslg'))
        statcast[pid] = {'barrelPct': barrel, 'hardHitPct': hardhit, 'xSlg': xslg}
    except Exception as e:
        sys.stderr.write(f'Row1 error: {e}\\n')

sys.stderr.write(f'Endpoint 1 parsed: {len(statcast)} players\\n')

# ── Endpoint 2: SLG + AVG for ISO ─────────────────────────────────────────────
url2 = (
    'https://baseballsavant.mlb.com/leaderboard/custom'
    '?year=${year}&type=batter&filter=&min=1'
    '&selections=player_id,player_name,b_ab,b_home_run,b_double,b_triple,slg_percent,batting_avg'
    '&chart=false&x=slg_percent&y=slg_percent&r=no&chartType=beeswarm&csv=true'
)

raw2 = fetch_csv(url2)
sys.stderr.write(f'Endpoint 2: {len(raw2)} bytes\\n')

iso_map = {}  # mlbamId -> iso
reader2 = csv.DictReader(io.StringIO(fix_dup_player_id(raw2)))
for row in reader2:
    try:
        pid = int(row.get('player_id', 0) or 0)
        if not pid:
            continue
        slg = parse_decimal(row.get('slg_percent'))
        avg = parse_decimal(row.get('batting_avg'))
        if slg is not None and avg is not None:
            iso_map[pid] = round(slg - avg, 4)
    except Exception as e:
        sys.stderr.write(f'Row2 error: {e}\\n')

sys.stderr.write(f'Endpoint 2 ISO map: {len(iso_map)} players\\n')

# ── Merge and output ───────────────────────────────────────────────────────────
all_pids = set(statcast.keys()) | set(iso_map.keys())
records = []
for pid in all_pids:
    sc = statcast.get(pid, {})
    iso = iso_map.get(pid)
    barrel  = sc.get('barrelPct')
    hardhit = sc.get('hardHitPct')
    xslg    = sc.get('xSlg')
    if barrel is None and hardhit is None and xslg is None and iso is None:
        continue
    records.append({
        'mlbamId':    pid,
        'barrelPct':  barrel,
        'hardHitPct': hardhit,
        'xSlg':       xslg,
        'iso':        iso,
    })

sys.stderr.write(f'Total merged records: {len(records)}\\n')
print(json.dumps(records))
`;
}

// ── Run Python script ──────────────────────────────────────────────────────────
function fetchAndParseViaPython(year) {
  const scriptPath = `/tmp/savant_fetch_${Date.now()}.py`;
  writeFileSync(scriptPath, buildPythonScript(year));
  const result = spawnSync('python3.11', [scriptPath], {
    timeout: 90000,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (existsSync(scriptPath)) unlinkSync(scriptPath);

  const stderr = result.stderr?.toString() || '';
  if (stderr) {
    stderr.split('\n').filter(Boolean).forEach(line => log(`[STATE] py: ${line}`));
  }
  if (result.status !== 0) {
    throw new Error(`Python fetch failed (exit ${result.status}): ${stderr.slice(0, 500)}`);
  }
  return JSON.parse(result.stdout.toString());
}

// ── DB batch update ────────────────────────────────────────────────────────────
async function batchUpdatePlayers(pool, records) {
  let updated = 0;
  let notFound = 0;
  let errors = 0;
  const now = Date.now();
  const BATCH = 100;

  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    for (const rec of batch) {
      try {
        const [res] = await pool.execute(
          `UPDATE mlb_players
           SET barrelPct=?, hardHitPct=?, xSlg=?, iso=?, statcastFetchedAt=?
           WHERE mlbamId=?`,
          [rec.barrelPct, rec.hardHitPct, rec.xSlg, rec.iso, now, rec.mlbamId]
        );
        if (res.affectedRows > 0) updated++;
        else notFound++;
      } catch (e) {
        logErr(`  mlbamId=${rec.mlbamId}: ${e.message}`);
        errors++;
      }
    }
    if (i > 0 && i % 300 === 0) {
      log(`[STATE] Progress: ${i}/${records.length} (updated=${updated} notFound=${notFound} errors=${errors})`);
    }
  }
  return { updated, notFound, errors };
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 5 });
  log('=== Statcast ISO/Barrel/HardHit/xSlg Population ===');
  log('[INPUT] Year: 2026 | Source: Baseball Savant (2 endpoints)');

  // Pre-check
  const [[pre]] = await pool.execute(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN iso IS NOT NULL THEN 1 ELSE 0 END) as has_iso,
      SUM(CASE WHEN barrelPct IS NOT NULL THEN 1 ELSE 0 END) as has_barrel,
      SUM(CASE WHEN hardHitPct IS NOT NULL THEN 1 ELSE 0 END) as has_hardhit,
      SUM(CASE WHEN xSlg IS NOT NULL THEN 1 ELSE 0 END) as has_xslg
    FROM mlb_players
  `);
  log(`[INPUT] Pre-update: total=${pre.total} | iso=${pre.has_iso} | barrel=${pre.has_barrel} | hardhit=${pre.has_hardhit} | xslg=${pre.has_xslg}`);

  // Fetch + parse
  log('[STEP 1] Fetching 2026 Statcast data from Baseball Savant (2 endpoints)...');
  let rawRecords;
  try {
    rawRecords = fetchAndParseViaPython(2026);
  } catch (e) {
    logErr(`Fetch/parse failed: ${e.message}`);
    await pool.end();
    process.exit(1);
  }
  log(`[STATE] Raw records from Savant: ${rawRecords.length}`);

  // Validate + clean
  const records = rawRecords.map(r => ({
    mlbamId:    r.mlbamId,
    barrelPct:  clamp(r.barrelPct,  'barrelPct'),
    hardHitPct: clamp(r.hardHitPct, 'hardHitPct'),
    xSlg:       clamp(r.xSlg,       'xSlg'),
    iso:        clamp(r.iso,        'iso'),
  })).filter(r => r.barrelPct != null || r.hardHitPct != null || r.xSlg != null || r.iso != null);

  const withBarrel  = records.filter(r => r.barrelPct  != null).length;
  const withHardHit = records.filter(r => r.hardHitPct != null).length;
  const withXslg    = records.filter(r => r.xSlg       != null).length;
  const withIso     = records.filter(r => r.iso        != null).length;
  log(`[STATE] Valid records: ${records.length} | barrel=${withBarrel} hardhit=${withHardHit} xslg=${withXslg} iso=${withIso}`);

  // Sample 5
  log('[STATE] Sample records (first 5):');
  records.slice(0, 5).forEach(r => {
    log(`  mlbamId=${r.mlbamId} barrel=${r.barrelPct?.toFixed(1)}% hardhit=${r.hardHitPct?.toFixed(1)}% xslg=${r.xSlg?.toFixed(3)} iso=${r.iso?.toFixed(3)}`);
  });

  if (records.length < 100) {
    logErr(`[VERIFY] FAIL — Only ${records.length} valid records. Aborting.`);
    await pool.end();
    process.exit(1);
  }

  // Batch update
  log(`[STEP 5] Updating ${records.length} players in DB...`);
  const { updated, notFound, errors } = await batchUpdatePlayers(pool, records);

  // Post-check
  const [[post]] = await pool.execute(`
    SELECT COUNT(*) as total,
      SUM(CASE WHEN iso IS NOT NULL THEN 1 ELSE 0 END) as has_iso,
      SUM(CASE WHEN barrelPct IS NOT NULL THEN 1 ELSE 0 END) as has_barrel,
      SUM(CASE WHEN hardHitPct IS NOT NULL THEN 1 ELSE 0 END) as has_hardhit,
      SUM(CASE WHEN xSlg IS NOT NULL THEN 1 ELSE 0 END) as has_xslg,
      AVG(CASE WHEN barrelPct IS NOT NULL THEN barrelPct END) as avg_barrel,
      AVG(CASE WHEN hardHitPct IS NOT NULL THEN hardHitPct END) as avg_hardhit,
      AVG(CASE WHEN iso IS NOT NULL THEN iso END) as avg_iso,
      MIN(CASE WHEN iso IS NOT NULL THEN iso END) as min_iso,
      MAX(CASE WHEN iso IS NOT NULL THEN iso END) as max_iso,
      AVG(CASE WHEN xSlg IS NOT NULL THEN xSlg END) as avg_xslg
    FROM mlb_players
  `);

  log('');
  log('[OUTPUT] === Statcast Population Complete ===');
  log(`[OUTPUT] Savant records fetched: ${rawRecords.length}`);
  log(`[OUTPUT] Valid records after validation: ${records.length}`);
  log(`[OUTPUT] DB rows updated: ${updated}`);
  log(`[OUTPUT] Players not in DB (no update): ${notFound}`);
  log(`[OUTPUT] Errors: ${errors}`);
  log('');
  log('[VERIFY] Post-update DB state:');
  log(`  total players:  ${post.total}`);
  log(`  iso:        ${post.has_iso}/${post.total} (${(post.has_iso/post.total*100).toFixed(1)}%) | avg=${Number(post.avg_iso).toFixed(3)} | range=[${Number(post.min_iso).toFixed(3)}, ${Number(post.max_iso).toFixed(3)}]`);
  log(`  barrelPct:  ${post.has_barrel}/${post.total} (${(post.has_barrel/post.total*100).toFixed(1)}%) | avg=${Number(post.avg_barrel).toFixed(1)}%`);
  log(`  hardHitPct: ${post.has_hardhit}/${post.total} (${(post.has_hardhit/post.total*100).toFixed(1)}%) | avg=${Number(post.avg_hardhit).toFixed(1)}%`);
  log(`  xSlg:       ${post.has_xslg}/${post.total} (${(post.has_xslg/post.total*100).toFixed(1)}%) | avg=${Number(post.avg_xslg).toFixed(3)}`);

  // Final validation
  let pass = true;
  if (post.has_iso < 300)    { logErr(`[VERIFY] FAIL — iso coverage ${post.has_iso} < 300`); pass = false; }
  if (post.has_barrel < 300) { logErr(`[VERIFY] FAIL — barrel coverage ${post.has_barrel} < 300`); pass = false; }
  if (Number(post.avg_barrel) < 5 || Number(post.avg_barrel) > 20) {
    logErr(`[VERIFY] FAIL — avg barrel ${post.avg_barrel} outside [5,20]`); pass = false;
  }
  if (Number(post.avg_iso) < 0.05 || Number(post.avg_iso) > 0.35) {
    logErr(`[VERIFY] FAIL — avg iso ${post.avg_iso} outside [0.05,0.35]`); pass = false;
  }
  if (pass) log('[VERIFY] PASS — All validation checks passed');

  await pool.end();
}

main().catch(e => { logErr(`Fatal: ${e.message}`); process.exit(1); });
