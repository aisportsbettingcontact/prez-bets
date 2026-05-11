/**
 * rerunAriTex.ts
 * Force-rerun the ARI @ TEX May 11 game (id=2252886) with Jakob Junis as TEX starter.
 * Replaces Nathan Eovaldi (scratched) with the confirmed replacement.
 */
import { runMlbModelForDate } from './mlbModelRunner';

const GAME_DATE = '2026-05-11';
const GAME_ID = 2252886; // ARI @ TEX

console.log('[RerunAriTex] [INPUT] date=2026-05-11 gameId=2252886 awayTeam=ARI homeTeam=TEX');
console.log('[RerunAriTex] [INPUT] TEX starter: Jakob Junis (mlbamId=596001) — replaces Nathan Eovaldi (scratched)');
console.log('[RerunAriTex] [INPUT] Junis 2026: ERA=1.65 (reliever, 15 app, 0 GS) | FIP=3.56 (2024 sabermetrics) | NRFI=83.3% (6 starts, 2024)');
console.log('[RerunAriTex] [STEP] Initiating full model pipeline for ARI @ TEX...');

const startMs = Date.now();

(async () => {
try {
  const result = await runMlbModelForDate(GAME_DATE, { forceRerun: true, targetGameIds: [GAME_ID] });
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

  console.log(`[RerunAriTex] [OUTPUT] Model run complete in ${elapsed}s`);
  console.log(`[RerunAriTex] [RESULT] written=${result.written} skipped=${result.skipped} errors=${result.errors}`);

  if (result.errors > 0) {
    console.error('[RerunAriTex] [VERIFY] FAIL — errors detected during model run');
    process.exit(1);
  }

  console.log('[RerunAriTex] [VERIFY] PASS');
} catch (err) {
  console.error('[RerunAriTex] [FAIL]', err);
  process.exit(1);
}
})();
