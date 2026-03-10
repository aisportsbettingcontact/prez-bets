/**
 * COMPUTE OPTIMAL MOBILE PANEL SIZING
 * ─────────────────────────────────────
 * Uses Canvas measureText to find the exact font size and panel width
 * needed to fit every team name in the database without truncation.
 *
 * Layout budget (per row):
 *   frozen panel width
 *   - 6px left padding
 *   - 6px right padding
 *   - 22px logo width
 *   - 8px gap between logo and name column
 *   - 28px score width (minWidth for scores)
 *   - 4px gap between name and score
 *   = available name width
 *
 * We test panel widths from 140px to 200px and font sizes from 8px to 16px.
 * We find the combination that:
 *   1. Fits ALL team names (school + nickname)
 *   2. Uses the largest possible font size
 *   3. Uses the smallest possible panel width
 */

import { createCanvas } from "canvas";
import fs from "fs";

// Install canvas if needed
let canvas, ctx;
try {
  const { createCanvas: cc } = await import("canvas");
  canvas = cc(1, 1);
  ctx = canvas.getContext("2d");
} catch {
  // Fallback: use a simple character-width estimator
  console.log("Note: 'canvas' npm package not available, using character-width estimator");
  canvas = null;
  ctx = null;
}

// Character width estimator (average px per char at given font size, semi-bold)
// Based on Inter/system-ui font metrics
function estimateTextWidth(text, fontSize, fontWeight = 600) {
  // Average char width ratios for common weights
  // These are calibrated for Inter/system-ui uppercase text
  const ratio = fontWeight >= 600 ? 0.62 : 0.58;
  // Uppercase letters are wider than lowercase
  const upperCount = (text.match(/[A-Z]/g) || []).length;
  const otherCount = text.length - upperCount;
  const upperWidth = fontSize * 0.72; // uppercase chars are ~72% of font size wide
  const otherWidth = fontSize * 0.52; // other chars (spaces, hyphens, apostrophes) are ~52%
  return upperCount * upperWidth + otherCount * otherWidth;
}

function measureText(text, fontSize, fontWeight = 600) {
  if (ctx) {
    ctx.font = `${fontWeight} ${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
    return ctx.measureText(text).width;
  }
  return estimateTextWidth(text, fontSize, fontWeight);
}

// All NCAAM team names (school names) from the database
// These are the display names as they appear on the feed (after .replace(/\bSt\.?\b/g, 'State'))
const NCAAM_NAMES = [
  "Abilene Christian", "Air Force", "Akron", "Alabama", "Alabama A&M",
  "Alabama State", "Albany", "Alcorn State", "American", "Appalachian State",
  "Arizona", "Arizona State", "Arkansas", "Arkansas-Pine Bluff", "Arkansas State",
  "Army", "Auburn", "Austin Peay", "Ball State", "Baylor",
  "Bellarmine", "Belmont", "Bethune-Cookman", "Binghamton", "Boise State",
  "Boston College", "Boston University", "Bowling Green", "Bradley", "Brown",
  "Bryant", "Bucknell", "Buffalo", "Butler", "BYU",
  "Cal Baptist", "Cal Poly", "Cal State Bakersfield", "Cal State Fullerton", "Cal State Northridge",
  "California", "Campbell", "Canisius", "Central Arkansas", "Central Connecticut",
  "Central Michigan", "Charleston", "Charlotte", "Chicago State", "Cincinnati",
  "Clemson", "Cleveland State", "Coastal Carolina", "Colgate", "Colorado",
  "Colorado State", "Columbia", "Connecticut", "Coppin State", "Cornell",
  "Creighton", "Dartmouth", "Davidson", "Dayton", "Delaware",
  "Delaware State", "Denver", "DePaul", "Detroit Mercy", "Drake",
  "Drexel", "Duke", "Duquesne", "East Carolina", "East Tennessee State",
  "Eastern Illinois", "Eastern Kentucky", "Eastern Michigan", "Eastern Washington", "Elon",
  "Evansville", "Fairfield", "Fairleigh Dickinson", "Florida", "Florida A&M",
  "Florida Atlantic", "Florida Gulf Coast", "Florida International", "Florida State", "Fordham",
  "Fresno State", "Furman", "Gardner-Webb", "George Mason", "George Washington",
  "Georgetown", "Georgia", "Georgia Southern", "Georgia State", "Georgia Tech",
  "Gonzaga", "Grambling State", "Grand Canyon", "Green Bay", "Hampton",
  "Hartford", "Harvard", "Hawaii", "High Point", "Hofstra",
  "Holy Cross", "Houston", "Houston Baptist", "Howard", "Idaho",
  "Idaho State", "Illinois", "Illinois State", "Incarnate Word", "Indiana",
  "Indiana State", "Iona", "Iowa", "Iowa State", "IPFW",
  "IUPUI", "Jackson State", "Jacksonville", "Jacksonville State", "James Madison",
  "Kansas", "Kansas City", "Kansas State", "Kennesaw State", "Kent State",
  "Kentucky", "La Salle", "Lafayette", "Lamar", "Lehigh",
  "Liberty", "Lindenwood", "Lipscomb", "Little Rock", "Long Beach State",
  "Long Island University", "Longwood", "Louisiana", "Louisiana Monroe", "Louisiana Tech",
  "Louisville", "Loyola Chicago", "Loyola Maryland", "Loyola Marymount", "LSU",
  "Maine", "Manhattan", "Marist", "Marquette", "Marshall",
  "Maryland", "Massachusetts", "McNeese State", "Memphis", "Mercer",
  "Miami", "Miami (OH)", "Michigan", "Michigan State", "Middle Tennessee",
  "Milwaukee", "Minnesota", "Mississippi", "Mississippi State", "Mississippi Valley State",
  "Missouri", "Missouri State", "Monmouth", "Montana", "Montana State",
  "Morehead State", "Morgan State", "Mount St. Mary's", "Murray State", "Navy",
  "Nebraska", "Nevada", "New Hampshire", "New Mexico", "New Mexico State",
  "New Orleans", "Niagara", "Nicholls State", "NJIT", "Norfolk State",
  "North Alabama", "North Carolina", "North Carolina A&T", "North Carolina Central", "North Carolina State",
  "North Dakota", "North Dakota State", "North Florida", "North Texas", "Northeastern",
  "Northern Arizona", "Northern Colorado", "Northern Illinois", "Northern Iowa", "Northern Kentucky",
  "Northwestern", "Northwestern State", "Notre Dame", "Oakland", "Ohio",
  "Ohio State", "Oklahoma", "Oklahoma State", "Old Dominion", "Ole Miss",
  "Oral Roberts", "Oregon", "Oregon State", "Pacific", "Penn",
  "Penn State", "Pepperdine", "Pittsburgh", "Portland", "Portland State",
  "Prairie View A&M", "Presbyterian", "Princeton", "Providence", "Purdue",
  "Purdue Fort Wayne", "Queens", "Quinnipiac", "Radford", "Rhode Island",
  "Rice", "Richmond", "Rider", "Robert Morris", "Rutgers",
  "Sacramento State", "Saint Francis", "Saint Joseph's", "Saint Louis", "Saint Mary's",
  "Saint Peter's", "Sam Houston State", "Samford", "San Diego", "San Diego State",
  "San Francisco", "San Jose State", "Santa Clara", "Seattle", "Seton Hall",
  "Siena", "SMU", "South Alabama", "South Carolina", "South Carolina State",
  "South Dakota", "South Dakota State", "South Florida", "Southeast Missouri State", "Southeastern Louisiana",
  "Southern", "Southern Illinois", "Southern Miss", "Southern Utah", "UTSA",
  "Stanford", "Stephen F. Austin", "Stetson", "Stony Brook", "Syracuse",
  "TCU", "Temple", "Tennessee", "Tennessee State", "Tennessee Tech",
  "Texas", "Texas A&M", "Texas A&M-Corpus Christi", "Texas Southern", "Texas State",
  "Texas Tech", "The Citadel", "Toledo", "Towson", "Troy",
  "Tulane", "Tulsa", "UAB", "UC Davis", "UC Irvine",
  "UC Riverside", "UC San Diego", "UC Santa Barbara", "UCLA", "UIC",
  "UMass Lowell", "UNC Asheville", "UNC Greensboro", "UNC Wilmington", "UNLV",
  "USC", "UT Arlington", "Utah", "Utah State", "Utah Tech",
  "Utah Valley", "UTEP", "Valparaiso", "Vanderbilt", "Vermont",
  "Villanova", "Virginia", "Virginia Commonwealth", "Virginia Military Institute", "Virginia Tech",
  "Wagner", "Wake Forest", "Washington", "Washington State", "Weber State",
  "West Virginia", "Western Carolina", "Western Illinois", "Western Kentucky", "Western Michigan",
  "Wichita State", "William & Mary", "Winthrop", "Wisconsin", "Wofford",
  "Wright State", "Wyoming", "Xavier", "Yale", "Youngstown State",
  // NBA cities
  "Atlanta", "Boston", "Brooklyn", "Charlotte", "Chicago",
  "Cleveland", "Dallas", "Denver", "Detroit", "Golden State",
  "Houston", "Indiana", "Los Angeles", "Memphis", "Miami",
  "Milwaukee", "Minnesota", "New Orleans", "New York", "Oklahoma City",
  "Orlando", "Philadelphia", "Phoenix", "Portland", "Sacramento",
  "San Antonio", "Toronto", "Utah", "Washington",
];

// Apply the same transformation as the code: replace St. with State
const ALL_NAMES = NCAAM_NAMES.map(n => n.replace(/\bSt\.?\b/g, 'State'));

// Layout constants
const LOGO_WIDTH = 22;
const LOGO_GAP = 8;
const PANEL_PADDING = 6 + 6; // left + right
const SCORE_WIDTH = 28; // minWidth for score
const SCORE_GAP = 4;
const CONSUMED_FIXED = PANEL_PADDING + LOGO_WIDTH + LOGO_GAP + SCORE_WIDTH + SCORE_GAP;
// = 6+6+22+8+28+4 = 74px consumed

console.log("\n╔══════════════════════════════════════════════════════════════╗");
console.log("║         MOBILE PANEL SIZING COMPUTATION                      ║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");
console.log(`  Fixed consumed per row: ${CONSUMED_FIXED}px`);
console.log(`  (padding:${PANEL_PADDING} + logo:${LOGO_WIDTH} + gap:${LOGO_GAP} + score:${SCORE_WIDTH} + score-gap:${SCORE_GAP})\n`);

// Find the longest name at each font size
const FONT_SIZES = [8, 9, 10, 10.5, 11, 11.5, 12, 13, 14, 15, 16];
const PANEL_WIDTHS = [140, 145, 150, 155, 160, 165, 170, 175, 180];

console.log("  Longest names by pixel width at each font size (weight=600):");
console.log("  " + "─".repeat(70));

const longestByFont = {};
for (const fs of FONT_SIZES) {
  const widths = ALL_NAMES.map(n => ({ name: n, w: measureText(n, fs, 600) }));
  widths.sort((a,b) => b.w - a.w);
  const top5 = widths.slice(0, 5);
  longestByFont[fs] = top5;
  console.log(`\n  Font ${fs}px:`);
  top5.forEach((item, i) => {
    console.log(`    ${i+1}. "${item.name}" — ${Math.round(item.w)}px`);
  });
}

console.log("\n\n  PANEL WIDTH vs FONT SIZE COMPATIBILITY MATRIX:");
console.log("  (✅ = all names fit | ❌ = some names truncated)\n");

const header = "  Panel\\Font |" + FONT_SIZES.map(f => `  ${f}px`).join(" |");
console.log(header);
console.log("  " + "─".repeat(header.length - 2));

const recommendations = [];

for (const panelW of PANEL_WIDTHS) {
  const availableNameW = panelW - CONSUMED_FIXED;
  let row = `  ${panelW}px (${availableNameW}px avail) |`;
  for (const fs of FONT_SIZES) {
    const longestName = longestByFont[fs][0];
    const fits = longestName.w <= availableNameW;
    row += fits ? "  ✅   |" : "  ❌   |";
    if (fits) {
      recommendations.push({ panelW, fs, availableNameW, longestName: longestName.name, longestW: Math.round(longestName.w) });
    }
  }
  console.log(row);
}

console.log("\n\n  RECOMMENDATIONS (fits all names, largest font, smallest panel):");
console.log("  " + "─".repeat(70));

if (recommendations.length === 0) {
  console.log("  ❌ No combination fits all names! Need to increase panel width or reduce font.");
} else {
  // Group by font size, find smallest panel for each font
  const byFont = {};
  recommendations.forEach(r => {
    if (!byFont[r.fs] || r.panelW < byFont[r.fs].panelW) byFont[r.fs] = r;
  });
  
  const sorted = Object.values(byFont).sort((a,b) => b.fs - a.fs);
  sorted.forEach(r => {
    console.log(`\n  Font ${r.fs}px → min panel width: ${r.panelW}px (${r.availableNameW}px for name)`);
    console.log(`    Longest name: "${r.longestName}" = ${r.longestW}px`);
    console.log(`    Clamp suggestion: clamp(${r.fs}px, ${(r.fs/375*100).toFixed(2)}vw, ${r.fs}px)`);
  });
  
  // Best recommendation: largest font that fits in smallest panel
  const best = sorted[0];
  console.log(`\n  ★ BEST: Font ${best.fs}px in ${best.panelW}px panel`);
  console.log(`    → Available for name: ${best.availableNameW}px`);
  console.log(`    → Longest name "${best.longestName}" = ${best.longestW}px ✅`);
}

// Also check nicknames
console.log("\n\n  NICKNAME ANALYSIS (weight=400):");
const NICKNAMES = [
  "Privateers", "Islanders", "Broncos", "Gaels", "Hornets",
  "Thunderbirds", "Mountaineers", "Roadrunners", "Lumberjacks", "Chanticleers",
  "Anteaters", "Highlanders", "Gauchos", "Tritons", "Matadors",
  "49ers", "Aggies", "Bulldogs", "Cardinals", "Commodores",
];
const NICK_FONT_SIZES = [8, 9, 10, 11, 12, 13];
for (const fs of NICK_FONT_SIZES) {
  const widths = NICKNAMES.map(n => ({ name: n, w: measureText(n, fs, 400) }));
  widths.sort((a,b) => b.w - a.w);
  const longest = widths[0];
  console.log(`  Nickname ${fs}px: longest="${longest.name}" = ${Math.round(longest.w)}px`);
}

console.log("\n");
