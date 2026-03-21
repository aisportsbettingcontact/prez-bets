import { triggerModelWatcherForDate } from "./server/ncaamModelWatcher";

async function main() {
  console.log("[RunModel] Triggering model watcher for 2026-03-22...");
  const result = await triggerModelWatcherForDate("2026-03-22", { forceRerun: false });
  console.log("[RunModel] Trigger result:", JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error("[RunModel] Error:", err);
  process.exit(1);
});
