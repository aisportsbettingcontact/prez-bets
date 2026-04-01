import { runVsinRefresh } from "../server/vsinAutoRefresh.js";

const result = await runVsinRefresh();
console.log("Refresh result:", JSON.stringify(result, null, 2));
process.exit(0);
