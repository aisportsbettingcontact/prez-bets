import "dotenv/config";
import { runMlbModelForDate } from "../server/mlbModelRunner";
import { syncNhlModelForToday } from "../server/nhlModelSync";
import { publishAllStagingGames } from "../server/db";

async function main() {
  const TAG = "[RunAllMay3]";
  const DATE = "2026-05-03";

  // ── Step 1: Run all remaining MLB games (forceRerun=true skips already-modeled) ──
  console.log(`${TAG} ► Step 1: Running MLB model for ${DATE} (all 15 games, forceRerun=true)...`);
  const mlbResult = await runMlbModelForDate(DATE, { forceRerun: true });
  console.log(`${TAG} MLB result: total=${mlbResult.total} written=${mlbResult.written} skipped=${mlbResult.skipped} errors=${mlbResult.errors}`);
  if (mlbResult.validation?.issues?.length) {
    console.log(`${TAG} MLB validation issues:`);
    for (const issue of mlbResult.validation.issues) {
      console.log(`  ⚠️  ${issue}`);
    }
  }

  // ── Step 2: Run NHL model (forceRerun=true) ──
  console.log(`\n${TAG} ► Step 2: Running NHL model for ${DATE} (forceRerun=true)...`);
  const nhlResult = await syncNhlModelForToday("manual", true, false);
  console.log(`${TAG} NHL result:`, JSON.stringify(nhlResult));

  // ── Step 3: Publish all MLB games ──
  console.log(`\n${TAG} ► Step 3: Publishing all MLB games for ${DATE}...`);
  await publishAllStagingGames(DATE, "MLB");
  console.log(`${TAG} ✅ MLB published`);

  // ── Step 4: Publish all NHL games ──
  console.log(`\n${TAG} ► Step 4: Publishing all NHL games for ${DATE}...`);
  await publishAllStagingGames(DATE, "NHL");
  console.log(`${TAG} ✅ NHL published`);

  console.log(`\n${TAG} ✅ ALL DONE — May 3 MLB + NHL modeled and published`);
  process.exit(0);
}

main().catch(e => {
  console.error("[RunAllMay3] FATAL:", e);
  process.exit(1);
});
