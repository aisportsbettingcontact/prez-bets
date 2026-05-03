import "dotenv/config";
import { runMlbModelForDate } from "../server/mlbModelRunner";
import { publishAllStagingGames } from "../server/db";

async function main() {
  const TAG = "[RunMay4]";
  const DATE = "2026-05-04";

  console.log(`${TAG} ► Step 1: Running MLB model for ${DATE} (forceRerun=true)...`);
  const mlbResult = await runMlbModelForDate(DATE, { forceRerun: true });

  console.log(`\n${TAG} MLB result summary:`);
  console.log(`  total=${mlbResult.total} written=${mlbResult.written} skipped=${mlbResult.skipped} errors=${mlbResult.errors}`);

  if (mlbResult.validation?.issues?.length) {
    console.log(`${TAG} ⚠️  Validation issues:`);
    for (const issue of mlbResult.validation.issues) {
      console.log(`    ${issue}`);
    }
  }
  if (mlbResult.validation?.warnings?.length) {
    console.log(`${TAG} Warnings:`);
    for (const w of mlbResult.validation.warnings) {
      console.log(`    ${w}`);
    }
  }

  console.log(`\n${TAG} ► Step 2: Publishing all MLB games for ${DATE}...`);
  await publishAllStagingGames(DATE, "MLB");
  console.log(`${TAG} ✅ MLB published`);

  console.log(`\n${TAG} ✅ ALL DONE — May 4 MLB modeled and published`);
  process.exit(0);
}

main().catch(e => {
  console.error("[RunMay4] FATAL:", e);
  process.exit(1);
});
