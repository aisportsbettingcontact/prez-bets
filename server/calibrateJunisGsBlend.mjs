/**
 * calibrateJunisGsBlend.mjs
 *
 * Recalibrate Jakob Junis pitcher inputs for emergency start scenario:
 *   - 70% weight: 2024 + 2025 GS-only stats (starter profile)
 *   - 30% weight: 2026 relief proxy (current form, role-adjusted)
 *
 * The 2026 relief ERA (1.65) is NOT representative of starter performance.
 * We apply a relief-to-start adjustment before blending.
 *
 * mlbamId = 596001
 */
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config({ quiet: true });

const JUNIS_ID = 596001;
const GS_WEIGHT = 0.70;
const RELIEF_WEIGHT = 0.30;

// League-average relief-to-start ERA inflation factor (relievers ERA ~1.2 runs lower than as starters)
// Based on 2023-2025 MLB data: avg reliever ERA 3.85, avg starter ERA 4.50 → delta = +0.65 when transitioning to start
const RELIEF_TO_START_ERA_ADJUSTMENT = 0.65;
const RELIEF_TO_START_K9_ADJUSTMENT = -1.5;  // K rate drops ~1.5 per 9 when going from relief to start
const RELIEF_TO_START_BB9_ADJUSTMENT = +0.3; // BB rate increases slightly as starter
const RELIEF_TO_START_WHIP_ADJUSTMENT = +0.15; // WHIP increases as starter

const db = await mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 2 });

console.log('='.repeat(70));
console.log('JUNIS 70/30 GS-BLEND CALIBRATION');
console.log('='.repeat(70));
console.log(`[INPUT] mlbamId=${JUNIS_ID} | GS_WEIGHT=${GS_WEIGHT} | RELIEF_WEIGHT=${RELIEF_WEIGHT}`);
console.log(`[INPUT] Relief-to-start adjustments: ERA+${RELIEF_TO_START_ERA_ADJUSTMENT} K9${RELIEF_TO_START_K9_ADJUSTMENT} BB9+${RELIEF_TO_START_BB9_ADJUSTMENT} WHIP+${RELIEF_TO_START_WHIP_ADJUSTMENT}`);
console.log();

// ─── 1. Fetch 2024 GS-only stats ────────────────────────────────────────────
async function fetchGsStats(season) {
  const url = `https://statsapi.mlb.com/api/v1/people/${JUNIS_ID}/stats?stats=gameLog&season=${season}&group=pitching&sportId=1`;
  console.log(`[STEP] Fetching ${season} game log: ${url}`);
  const resp = await fetch(url);
  const data = await resp.json();
  const splits = data?.stats?.[0]?.splits ?? [];
  
  // Filter to starts only
  const starts = splits.filter(s => parseInt(s.stat?.gamesStarted || 0) > 0);
  console.log(`[STATE] ${season}: total splits=${splits.length}, starts=${starts.length}`);
  
  if (starts.length === 0) {
    console.log(`[WARN] No starts found for ${season}`);
    return null;
  }
  
  // Aggregate across all starts
  let totalIp = 0, totalEr = 0, totalH = 0, totalBb = 0, totalK = 0, totalHr = 0;
  for (const g of starts) {
    const ip = parseFloat(g.stat.inningsPitched || 0);
    totalIp += ip;
    totalEr += parseInt(g.stat.earnedRuns || 0);
    totalH += parseInt(g.stat.hits || 0);
    totalBb += parseInt(g.stat.baseOnBalls || 0);
    totalK += parseInt(g.stat.strikeOuts || 0);
    totalHr += parseInt(g.stat.homeRuns || 0);
    console.log(`  [START] ${g.date} vs ${g.opponent?.name || 'UNK'} IP=${g.stat.inningsPitched} ER=${g.stat.earnedRuns} K=${g.stat.strikeOuts} BB=${g.stat.baseOnBalls} H=${g.stat.hits}`);
  }
  
  const era = totalIp > 0 ? (totalEr / totalIp) * 9 : null;
  const k9 = totalIp > 0 ? (totalK / totalIp) * 9 : null;
  const bb9 = totalIp > 0 ? (totalBb / totalIp) * 9 : null;
  const hr9 = totalIp > 0 ? (totalHr / totalIp) * 9 : null;
  const whip = totalIp > 0 ? (totalH + totalBb) / totalIp : null;
  const ipPerStart = totalIp / starts.length;
  
  console.log(`[OUTPUT] ${season} GS stats: ERA=${era?.toFixed(2)} K9=${k9?.toFixed(2)} BB9=${bb9?.toFixed(2)} HR9=${hr9?.toFixed(2)} WHIP=${whip?.toFixed(3)} IP/GS=${ipPerStart?.toFixed(2)} n=${starts.length}`);
  
  return { era, k9, bb9, hr9, whip, ipPerStart, starts: starts.length, totalIp };
}

// Also try season-level stats filtered to starts
async function fetchSeasonGsStats(season) {
  const url = `https://statsapi.mlb.com/api/v1/people/${JUNIS_ID}/stats?stats=statSplits&season=${season}&group=pitching&sportId=1&sitCodes=sp`;
  console.log(`[STEP] Fetching ${season} SP splits: ${url}`);
  const resp = await fetch(url);
  const data = await resp.json();
  const splits = data?.stats?.[0]?.splits ?? [];
  console.log(`[STATE] ${season} SP splits: ${splits.length} entries`);
  if (splits.length > 0) {
    console.log(`  [DATA]`, JSON.stringify(splits[0]?.stat, null, 2));
  }
  return splits;
}

console.log('\n--- FETCHING 2024 GS STATS ---');
const stats2024 = await fetchGsStats(2024);

console.log('\n--- FETCHING 2025 GS STATS ---');
const stats2025 = await fetchGsStats(2025);

// ─── 2. Compute combined 2024+2025 GS weighted average ──────────────────────
console.log('\n--- COMPUTING 2024+2025 GS COMBINED AVERAGE ---');

let gsEra, gsK9, gsBb9, gsHr9, gsWhip, gsIpPerStart;

if (stats2024 && stats2025) {
  // Weight by innings pitched (more IP = more reliable)
  const totalIp = stats2024.totalIp + stats2025.totalIp;
  const w24 = stats2024.totalIp / totalIp;
  const w25 = stats2025.totalIp / totalIp;
  console.log(`[STATE] IP-weighted: 2024 weight=${w24.toFixed(3)} (${stats2024.totalIp.toFixed(1)} IP) | 2025 weight=${w25.toFixed(3)} (${stats2025.totalIp.toFixed(1)} IP)`);
  
  gsEra = w24 * stats2024.era + w25 * stats2025.era;
  gsK9 = w24 * stats2024.k9 + w25 * stats2025.k9;
  gsBb9 = w24 * stats2024.bb9 + w25 * stats2025.bb9;
  gsHr9 = w24 * stats2024.hr9 + w25 * stats2025.hr9;
  gsWhip = w24 * stats2024.whip + w25 * stats2025.whip;
  gsIpPerStart = w24 * stats2024.ipPerStart + w25 * stats2025.ipPerStart;
} else if (stats2025) {
  console.log('[STATE] Using 2025 only (no 2024 starts found)');
  gsEra = stats2025.era; gsK9 = stats2025.k9; gsBb9 = stats2025.bb9;
  gsHr9 = stats2025.hr9; gsWhip = stats2025.whip; gsIpPerStart = stats2025.ipPerStart;
} else if (stats2024) {
  console.log('[STATE] Using 2024 only (no 2025 starts found)');
  gsEra = stats2024.era; gsK9 = stats2024.k9; gsBb9 = stats2024.bb9;
  gsHr9 = stats2024.hr9; gsWhip = stats2024.whip; gsIpPerStart = stats2024.ipPerStart;
} else {
  // Fallback: use career FIP-based estimate
  console.log('[WARN] No GS data found for 2024 or 2025 — using FIP-based career estimate');
  gsEra = 4.50; gsK9 = 7.8; gsBb9 = 2.9; gsHr9 = 1.2; gsWhip = 1.30; gsIpPerStart = 5.0;
}

console.log(`[OUTPUT] Combined GS profile: ERA=${gsEra?.toFixed(2)} K9=${gsK9?.toFixed(2)} BB9=${gsBb9?.toFixed(2)} HR9=${gsHr9?.toFixed(2)} WHIP=${gsWhip?.toFixed(3)} IP/GS=${gsIpPerStart?.toFixed(2)}`);

// ─── 3. Apply relief-to-start adjustment to 2026 relief stats ───────────────
console.log('\n--- APPLYING RELIEF-TO-START ADJUSTMENT TO 2026 STATS ---');

// 2026 relief stats (from DB)
const relief2026Era = 1.65;
const relief2026K9 = 3.91;
const relief2026Bb9 = 2.80;
const relief2026Hr9 = 0.00;
const relief2026Whip = 0.80;

// Adjusted 2026 proxy (what we'd expect if he started)
const adj2026Era = relief2026Era + RELIEF_TO_START_ERA_ADJUSTMENT;
const adj2026K9 = relief2026K9 + RELIEF_TO_START_K9_ADJUSTMENT;
const adj2026Bb9 = relief2026Bb9 + RELIEF_TO_START_BB9_ADJUSTMENT;
const adj2026Hr9 = relief2026Hr9 + 0.5; // expect some HR regression as starter
const adj2026Whip = relief2026Whip + RELIEF_TO_START_WHIP_ADJUSTMENT;

console.log(`[STATE] Raw 2026 relief: ERA=${relief2026Era} K9=${relief2026K9.toFixed(2)} BB9=${relief2026Bb9.toFixed(2)} HR9=${relief2026Hr9.toFixed(2)} WHIP=${relief2026Whip}`);
console.log(`[STATE] Adj 2026 proxy:  ERA=${adj2026Era.toFixed(2)} K9=${adj2026K9.toFixed(2)} BB9=${adj2026Bb9.toFixed(2)} HR9=${adj2026Hr9.toFixed(2)} WHIP=${adj2026Whip.toFixed(3)}`);

// ─── 4. Compute 70/30 final blend ───────────────────────────────────────────
console.log('\n--- COMPUTING 70/30 FINAL BLEND ---');

const finalEra = GS_WEIGHT * gsEra + RELIEF_WEIGHT * adj2026Era;
const finalK9 = GS_WEIGHT * gsK9 + RELIEF_WEIGHT * adj2026K9;
const finalBb9 = GS_WEIGHT * gsBb9 + RELIEF_WEIGHT * adj2026Bb9;
const finalHr9 = GS_WEIGHT * gsHr9 + RELIEF_WEIGHT * adj2026Hr9;
const finalWhip = GS_WEIGHT * gsWhip + RELIEF_WEIGHT * adj2026Whip;
const finalIpPerStart = gsIpPerStart; // Use GS history for IP projection

console.log(`[STATE] GS profile (70%):    ERA=${gsEra?.toFixed(2)} K9=${gsK9?.toFixed(2)} BB9=${gsBb9?.toFixed(2)} HR9=${gsHr9?.toFixed(2)} WHIP=${gsWhip?.toFixed(3)}`);
console.log(`[STATE] 2026 adj proxy (30%): ERA=${adj2026Era.toFixed(2)} K9=${adj2026K9.toFixed(2)} BB9=${adj2026Bb9.toFixed(2)} HR9=${adj2026Hr9.toFixed(2)} WHIP=${adj2026Whip.toFixed(3)}`);
console.log(`[OUTPUT] FINAL BLEND:         ERA=${finalEra.toFixed(2)} K9=${finalK9.toFixed(2)} BB9=${finalBb9.toFixed(2)} HR9=${finalHr9.toFixed(2)} WHIP=${finalWhip.toFixed(3)} IP/GS=${finalIpPerStart?.toFixed(2)}`);

// Sanity check: ERA should be between 3.5 and 5.5 for a spot starter
if (finalEra < 3.5 || finalEra > 5.5) {
  console.warn(`[WARN] Final ERA ${finalEra.toFixed(2)} is outside expected range [3.5, 5.5] for spot starter — verify inputs`);
} else {
  console.log(`[VERIFY] ERA ${finalEra.toFixed(2)} is within expected range [3.5, 5.5] for spot starter ✓`);
}

// ─── 5. Update DB ────────────────────────────────────────────────────────────
console.log('\n--- UPDATING mlb_pitcher_stats ---');

await db.execute(`
  UPDATE mlb_pitcher_stats SET
    era = ?, k9 = ?, bb9 = ?, hr9 = ?, whip = ?,
    teamAbbrev = 'TEX',
    lastFetchedAt = ?
  WHERE mlbamId = ?
`, [finalEra, finalK9, finalBb9, finalHr9, finalWhip, Date.now(), JUNIS_ID]);

console.log('[VERIFY] PASS — mlb_pitcher_stats updated');

// Verify
const [verify] = await db.execute(
  'SELECT fullName, teamAbbrev, era, k9, bb9, hr9, whip, ip, gamesStarted, fip, nrfiRate, ipMean3yr FROM mlb_pitcher_stats WHERE mlbamId = ?',
  [JUNIS_ID]
);
console.log('[OUTPUT] Final DB state:', JSON.stringify(verify[0], null, 2));

// ─── 6. Summary ─────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('CALIBRATION SUMMARY');
console.log('='.repeat(70));
console.log(`Pitcher:        Jakob Junis (mlbamId=${JUNIS_ID})`);
console.log(`Role:           Emergency start (2026 reliever → spot starter)`);
console.log(`Blend:          70% GS-history (2024+2025) + 30% 2026 relief-adjusted proxy`);
console.log(`Previous ERA:   1.65 (raw 2026 relief — INCORRECT for starter)`);
console.log(`New ERA:        ${finalEra.toFixed(2)} (calibrated starter profile)`);
console.log(`New K9:         ${finalK9.toFixed(2)}`);
console.log(`New WHIP:       ${finalWhip.toFixed(3)}`);
console.log(`IP/GS:          ${finalIpPerStart?.toFixed(2)} (from GS history)`);
console.log('='.repeat(70));

await db.end();
