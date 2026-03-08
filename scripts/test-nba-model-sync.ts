import { syncNbaModelFromSheet } from "../server/nbaModelSync";

async function main() {
  console.log("Testing NBA model sync...");
  const result = await syncNbaModelFromSheet();
  console.log("Result:", JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
