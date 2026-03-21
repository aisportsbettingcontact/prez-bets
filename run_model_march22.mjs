// Trigger the NCAAM model watcher for March 22 games
// Run from project root: node run_model_march22.mjs

import { triggerModelWatcherForDate } from "./server/ncaamModelWatcher.ts";

const result = await triggerModelWatcherForDate("2026-03-22", { forceRerun: false });
console.log("Model trigger result:", JSON.stringify(result, null, 2));
