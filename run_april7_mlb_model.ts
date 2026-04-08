/**
 * run_april7_mlb_model.ts
 * =======================
 * Full MLB model pipeline for April 7, 2026:
 *   Step 1: Monte Carlo simulation + F5/NRFI model for all 15 games
 *   Step 2: K-Props upsert from AN + Poisson model EV for all pitchers
 *   Step 3: HR Props seed from AN + model EV for all batters
 *
 * [INPUT]  date=2026-04-07, 15 MLB games with full DK NJ odds
 * [OUTPUT] modelAwayWinPct, modelTotal, modelSpread, F5/NRFI EV,
 *          K-Props edge/EV/verdict, HR Props edge/EV/verdict
 */
import "dotenv/config";

const DATE = "2026-04-07";
const AN_DATE = "20260407";

async function main() {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`[INPUT] MLB Full Model Pipeline for ${DATE}`);
  console.log(`[INPUT] 15 games | DK NJ odds loaded | AN date=${AN_DATE}`);
  console.log(`${"=".repeat(70)}\n`);

  // ── Step 1: MLB Monte Carlo + F5/NRFI Model ──────────────────────────────
  console.log(`[STEP 1] Running MLB Monte Carlo simulation + F5/NRFI model...`);
  try {
    const { runMlbModelForDate } = await import('./server/mlbModelRunner');
    const result = await runMlbModelForDate(DATE);
    console.log(`[OUTPUT][MLB Model] modeled=${result.modeled} skipped=${result.skipped} errors=${result.errors}`);
    if (result.errors > 0) {
      console.warn(`[WARN] ${result.errors} games failed to model`);
    }
    console.log(`[VERIFY][MLB Model] ${result.modeled}/15 games modeled`);
    if (result.modeled < 15) {
      console.warn(`[WARN] Only ${result.modeled}/15 games modeled — check pitcher stats and team data`);
    }
  } catch (err) {
    console.error(`[FAIL][MLB Model] Monte Carlo failed:`, err);
    throw err;
  }

  // ── Step 2: K-Props upsert from AN + Poisson model EV ────────────────────
  console.log(`\n[STEP 2] K-Props: upsert from Action Network + Poisson model EV...`);
  try {
    const { upsertKPropsForDate } = await import('./server/kPropsDbHelpers');
    const upsertResult = await upsertKPropsForDate(AN_DATE);
    console.log(`[OUTPUT][K-Props Upsert] inserted=${upsertResult.inserted} updated=${upsertResult.updated} errors=${upsertResult.errors.length}`);
    if (upsertResult.errors.length > 0) {
      console.warn(`[WARN][K-Props] Upsert errors:`, upsertResult.errors.slice(0, 3));
    }
    console.log(`[VERIFY][K-Props Upsert] ${upsertResult.inserted + upsertResult.updated} props seeded`);
  } catch (err) {
    console.error(`[FAIL][K-Props Upsert]`, err);
  }

  try {
    const { modelKPropsForDate } = await import('./server/mlbKPropsModelService');
    const modelResult = await modelKPropsForDate(DATE);
    console.log(`[OUTPUT][K-Props Model] modeled=${modelResult.modeled} edges=${modelResult.edges} errors=${modelResult.errors}`);
    console.log(`[VERIFY][K-Props Model] ${modelResult.modeled} pitchers modeled, ${modelResult.edges} edges detected`);
  } catch (err) {
    console.error(`[FAIL][K-Props Model]`, err);
  }

  // ── Step 3: HR Props seed from AN + model EV ─────────────────────────────
  console.log(`\n[STEP 3] HR Props: seed from Action Network + model EV...`);
  try {
    const { resolveAndModelHrProps } = await import('./server/mlbHrPropsModelService');
    const hrResult = await resolveAndModelHrProps(DATE);
    console.log(`[OUTPUT][HR Props] resolved=${hrResult.resolved} modeled=${hrResult.modeled} edges=${hrResult.edges} errors=${hrResult.errors}`);
    console.log(`[VERIFY][HR Props] ${hrResult.modeled} batters modeled, ${hrResult.edges} edges detected`);
  } catch (err) {
    console.error(`[FAIL][HR Props]`, err);
  }

  // ── Final verification ────────────────────────────────────────────────────
  console.log(`\n[STEP 4] Final DB verification...`);
  const { getDb } = await import('./server/db');
  const db = await getDb();
  const { sql } = await import('drizzle-orm');

  const [mlbGames] = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN model_away_win_pct IS NOT NULL THEN 1 ELSE 0 END) as modeled,
      SUM(CASE WHEN f5_away_ml IS NOT NULL THEN 1 ELSE 0 END) as f5_odds,
      SUM(CASE WHEN nrfi_over_odds IS NOT NULL THEN 1 ELSE 0 END) as nrfi_odds
    FROM games
    WHERE game_date = ${DATE} AND sport = 'MLB'
  `) as any;

  const [kProps] = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN p_over IS NOT NULL THEN 1 ELSE 0 END) as modeled,
      SUM(CASE WHEN verdict = 'OVER' OR verdict = 'UNDER' THEN 1 ELSE 0 END) as edges
    FROM mlb_strikeout_props
    WHERE game_date = ${DATE}
  `) as any;

  const [hrProps] = await db.execute(sql`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN model_p_hr IS NOT NULL THEN 1 ELSE 0 END) as modeled,
      SUM(CASE WHEN verdict = 'OVER' THEN 1 ELSE 0 END) as edges
    FROM mlb_hr_props
    WHERE game_date = ${DATE}
  `) as any;

  const mlbRow = (mlbGames as any[])[0];
  const kRow = (kProps as any[])[0];
  const hrRow = (hrProps as any[])[0];

  console.log(`\n${"=".repeat(70)}`);
  console.log(`[OUTPUT] APRIL 7 MLB MODEL PIPELINE COMPLETE`);
  console.log(`${"=".repeat(70)}`);
  console.log(`[VERIFY] MLB Games:    ${mlbRow?.modeled}/${mlbRow?.total} modeled | F5=${mlbRow?.f5_odds}/15 | NRFI=${mlbRow?.nrfi_odds}/15`);
  console.log(`[VERIFY] K-Props:      ${kRow?.modeled}/${kRow?.total} modeled | ${kRow?.edges} edges`);
  console.log(`[VERIFY] HR Props:     ${hrRow?.modeled}/${hrRow?.total} modeled | ${hrRow?.edges} edges`);

  const allPass = Number(mlbRow?.modeled) >= 13 && Number(kRow?.modeled) >= 20 && Number(hrRow?.modeled) >= 100;
  console.log(`[VERIFY] OVERALL: ${allPass ? "PASS ✅" : "PARTIAL ⚠️"}`);
  console.log(`${"=".repeat(70)}\n`);

  process.exit(0);
}

main().catch((e) => { console.error("[FAIL]", e); process.exit(1); });
