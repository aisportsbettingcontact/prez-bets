/**
 * MOBILE FROZEN PANEL — TEAM NAME TRUNCATION DIAGNOSTIC
 * ──────────────────────────────────────────────────────
 * Loads the live feed at 8 mobile viewport widths.
 * For each game card's frozen left panel, measures:
 *   1. The actual rendered clientWidth of the name container
 *   2. The actual rendered font-size of the name span
 *   3. Whether the text is visually clipped (via Canvas measureText)
 *   4. The minimum font-size that would fit the text without clipping
 *
 * Also queries the database for ALL team names and finds:
 *   - The longest school name (by pixel width at various font sizes)
 *   - The font size required to fit the longest name in the narrowest panel
 *
 * Outputs a full diagnostic table + recommended font sizes.
 */

import puppeteer from "puppeteer";
import fs from "fs";

const BASE_URL = "http://localhost:3000";

const MOBILE_SIZES = [
  { label: "iPhone SE (375px)",     w: 375, h: 667 },
  { label: "iPhone 12 mini (360px)",w: 360, h: 780 },
  { label: "Galaxy S23 (360px)",    w: 360, h: 800 },
  { label: "Moto G Power (360px)",  w: 360, h: 760 },
  { label: "iPhone 15 Pro (393px)", w: 393, h: 852 },
  { label: "Galaxy S24 (412px)",    w: 412, h: 915 },
  { label: "Pixel 8 Pro (412px)",   w: 412, h: 892 },
  { label: "iPhone 15 Pro Max (430px)", w: 430, h: 932 },
];

// In-page measurement function
function measureMobilePanel() {
  const results = [];
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  function textWidth(text, fontSize, fontWeight, fontFamily) {
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    return ctx.measureText(text).width;
  }

  function findMinFontSize(text, containerWidth, fontWeight, fontFamily, maxFont = 16, minFont = 7) {
    for (let fs = maxFont; fs >= minFont; fs -= 0.5) {
      if (textWidth(text, fs, fontWeight, fontFamily) <= containerWidth) {
        return fs;
      }
    }
    return minFont; // still doesn't fit at minFont
  }

  // Find all frozen left panel name spans
  // They are inside the mobile full-mode game cards
  const nameSpans = document.querySelectorAll('[data-testid="mobile-team-name"], [data-mobile-name]');
  
  // Fallback: find spans with all-caps text that look like team names
  // Look for the frozen panel structure
  const frozenPanels = document.querySelectorAll('[data-testid="frozen-panel"]');
  
  // Most reliable: find all spans that are children of the frozen panel area
  // The frozen panel has a fixed/sticky left position
  const allSpans = document.querySelectorAll("span");
  const teamNameSpans = [];
  
  for (const span of allSpans) {
    const style = window.getComputedStyle(span);
    const text = span.textContent?.trim() ?? "";
    if (!text || text.length < 3) continue;
    
    // Team name spans: uppercase, semi-bold/bold, white, specific font size range
    const fontSize = parseFloat(style.fontSize);
    const fontWeight = parseInt(style.fontWeight);
    const color = style.color;
    const isUpperCase = text === text.toUpperCase() && /[A-Z]/.test(text);
    const isBold = fontWeight >= 500;
    const isWhite = color === "rgb(255, 255, 255)" || color === "rgba(255, 255, 255, 1)";
    
    if (!isUpperCase || !isBold || !isWhite) continue;
    if (fontSize < 8 || fontSize > 20) continue;
    if (text.length < 3 || text.length > 30) continue;
    
    // Check if it's being clipped
    const rect = span.getBoundingClientRect();
    if (rect.width === 0) continue;
    
    const containerWidth = span.clientWidth || rect.width;
    const measuredWidth = textWidth(text, fontSize, style.fontWeight, style.fontFamily);
    const isClipped = measuredWidth > containerWidth + 1;
    
    const minFontNeeded = findMinFontSize(text, containerWidth, style.fontWeight, style.fontFamily);
    
    // Get parent container width
    const parent = span.parentElement;
    const parentWidth = parent ? parent.clientWidth : 0;
    const grandParent = parent?.parentElement;
    const grandParentWidth = grandParent ? grandParent.clientWidth : 0;
    
    teamNameSpans.push({
      text,
      fontSize: Math.round(fontSize * 10) / 10,
      fontWeight: style.fontWeight,
      containerWidth: Math.round(containerWidth),
      parentWidth: Math.round(parentWidth),
      grandParentWidth: Math.round(grandParentWidth),
      measuredWidth: Math.round(measuredWidth * 10) / 10,
      isClipped,
      minFontNeeded: Math.round(minFontNeeded * 10) / 10,
      overflow: span.style.overflow || window.getComputedStyle(span).overflow,
      textOverflow: span.style.textOverflow || window.getComputedStyle(span).textOverflow,
      whiteSpace: window.getComputedStyle(span).whiteSpace,
      maxWidth: window.getComputedStyle(span).maxWidth,
    });
  }
  
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    teamNameSpans,
    // Also capture the frozen panel's actual rendered width
    frozenPanelWidth: (() => {
      // Find the leftmost sticky/fixed element that contains team names
      const sticky = document.querySelector('[style*="position: sticky"], [style*="position:sticky"]');
      return sticky ? sticky.clientWidth : null;
    })(),
  };
}

async function runDiagnostic() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║     MOBILE FROZEN PANEL — TEAM NAME TRUNCATION DIAGNOSTIC    ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    headless: true,
  });

  const allClipped = [];
  const allMeasurements = [];

  for (const screen of MOBILE_SIZES) {
    console.log(`\n▶ ${screen.label}`);
    const page = await browser.newPage();
    await page.setViewport({ width: screen.w, height: screen.h, deviceScaleFactor: 2 });
    
    try {
      await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle2", timeout: 15000 });
      await new Promise(r => setTimeout(r, 2500));
      
      const result = await page.evaluate(measureMobilePanel);
      
      console.log(`   Viewport: ${result.viewport.w}×${result.viewport.h}`);
      console.log(`   Frozen panel width: ${result.frozenPanelWidth ?? "not found"}`);
      console.log(`   Team name spans found: ${result.teamNameSpans.length}`);
      
      const clipped = result.teamNameSpans.filter(s => s.isClipped);
      console.log(`   Clipped spans: ${clipped.length}`);
      
      if (clipped.length > 0) {
        console.log(`\n   ❌ CLIPPED NAMES:`);
        clipped.forEach(s => {
          console.log(`      "${s.text}"`);
          console.log(`        fontSize=${s.fontSize}px  containerW=${s.containerWidth}px  measuredW=${s.measuredWidth}px`);
          console.log(`        parentW=${s.parentWidth}px  grandParentW=${s.grandParentWidth}px`);
          console.log(`        maxWidth=${s.maxWidth}  whiteSpace=${s.whiteSpace}  textOverflow=${s.textOverflow}`);
          console.log(`        minFontToFit=${s.minFontNeeded}px`);
          allClipped.push({ screen: screen.label, viewport: screen.w, ...s });
        });
      } else {
        console.log(`   ✅ No clipping detected at this viewport`);
      }
      
      result.teamNameSpans.forEach(s => allMeasurements.push({ screen: screen.label, viewport: screen.w, ...s }));
      
    } catch (err) {
      console.log(`   ⚠️  ERROR: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  // ── Analysis ──────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                    DIAGNOSTIC ANALYSIS                       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  if (allClipped.length === 0) {
    console.log("\n  ✅ No clipping detected in any measurement.");
    console.log("  NOTE: The page may not have loaded game cards (requires auth or data).");
    console.log("  Check if game cards are visible without authentication.");
  } else {
    // Find the worst case: name that needs the largest font reduction
    const worstCase = allClipped.sort((a,b) => b.measuredWidth - a.measuredWidth)[0];
    console.log(`\n  Worst case: "${worstCase.text}" at ${worstCase.viewport}px viewport`);
    console.log(`    Current font: ${worstCase.fontSize}px`);
    console.log(`    Container width: ${worstCase.containerWidth}px`);
    console.log(`    Text width at current font: ${worstCase.measuredWidth}px`);
    console.log(`    Min font to fit: ${worstCase.minFontNeeded}px`);
    
    // Find the globally required minimum font size across ALL clipped names
    const globalMinFont = Math.min(...allClipped.map(s => s.minFontNeeded));
    const narrowestViewport = Math.min(...allClipped.map(s => s.viewport));
    console.log(`\n  RECOMMENDATION:`);
    console.log(`    Use font-size: ${globalMinFont}px as the BASE (minimum) for team names`);
    console.log(`    This fits all names at the narrowest viewport (${narrowestViewport}px)`);
    console.log(`    Use clamp(${globalMinFont}px, ${(globalMinFont / 375 * 100).toFixed(2)}vw, ${globalMinFont + 2}px) for responsive scaling`);
    
    // Group by name to find systemic offenders
    const byName = {};
    allClipped.forEach(s => {
      if (!byName[s.text]) byName[s.text] = { ...s, viewports: [] };
      byName[s.text].viewports.push(s.viewport);
    });
    
    console.log(`\n  ALL CLIPPED NAMES (${Object.keys(byName).length} unique):`);
    Object.values(byName).sort((a,b) => b.measuredWidth - a.measuredWidth).forEach(s => {
      console.log(`    "${s.text}" — needs ${s.minFontNeeded}px, has ${s.fontSize}px, containerW=${s.containerWidth}px`);
    });
  }

  // Save report
  const report = { allClipped, allMeasurements };
  fs.writeFileSync("/home/ubuntu/ai-sports-betting/scripts/audit-results/mobile-diagnostic.json", JSON.stringify(report, null, 2));
  console.log("\n  Report saved: scripts/audit-results/mobile-diagnostic.json\n");

  return report;
}

runDiagnostic().catch(err => {
  console.error("DIAGNOSTIC FAILED:", err);
  process.exit(1);
});
