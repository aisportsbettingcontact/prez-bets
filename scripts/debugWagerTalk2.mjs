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
  // Find game rows — they have id like "g689", "g691" etc.
  const gameRows = Array.from(document.querySelectorAll("tr[id^='g']"));
  
  // Get the first March 4 game row (id g689)
  const g689 = document.getElementById("g689");
  const g689html = g689 ? g689.outerHTML.slice(0, 2000) : "NOT FOUND";
  
  // Get all section headers to understand the date groupings
  const headers = Array.from(document.querySelectorAll("tr[id^='header']"))
    .map(h => ({ id: h.id, text: h.textContent?.trim().slice(0, 100) }));
  
  // Sample first 3 game rows with full HTML
  const sampleRows = gameRows.slice(0, 3).map(r => ({
    id: r.id,
    html: r.outerHTML.slice(0, 1500),
  }));
  
  return { gameRowCount: gameRows.length, g689html, headers, sampleRows };
});

console.log("Total game rows:", info.gameRowCount);
console.log("\nSection headers:");
info.headers.forEach(h => console.log(" ", h.id, ":", h.text));
console.log("\ng689 row HTML:");
console.log(info.g689html);
console.log("\nFirst 3 game rows:");
info.sampleRows.forEach(r => {
  console.log(`\n--- ${r.id} ---`);
  console.log(r.html);
});

await browser.close();
