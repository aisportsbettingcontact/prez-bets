import puppeteer from "puppeteer";

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});

const page = await browser.newPage();
await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

console.log("Navigating to WagerTalk...");
await page.goto("https://www.wagertalk.com/odds?sport=L4", { waitUntil: "networkidle2", timeout: 30000 });
await new Promise(r => setTimeout(r, 5000));

const info = await page.evaluate(() => {
  const rows = document.querySelectorAll("tr");
  const firstFewRows = Array.from(rows).slice(0, 6).map(r => r.outerHTML.slice(0, 400));
  
  // Look for any element containing rotation-like numbers
  const allText = document.body.innerText.slice(0, 2000);
  
  // Check for specific WagerTalk data structures
  const oddsRows = document.querySelectorAll(".odds-row, .event-row, [data-rot], [data-game]");
  const tableCount = document.querySelectorAll("table").length;
  
  return {
    rowCount: rows.length,
    tableCount,
    oddsRowCount: oddsRows.length,
    firstFewRows,
    bodyTextSnippet: allText,
  };
});

console.log("Row count:", info.rowCount);
console.log("Table count:", info.tableCount);
console.log("Odds row count:", info.oddsRowCount);
console.log("\nBody text snippet:");
console.log(info.bodyTextSnippet.slice(0, 1000));
console.log("\nFirst few TR rows:");
info.firstFewRows.forEach((r, i) => console.log(`Row ${i}:`, r.slice(0, 300)));

await browser.close();
