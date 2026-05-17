import { z } from "zod";

console.log("=== [INPUT] Testing Zod validation for BetTracker create schema ===");

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Test 1: Valid date
try { dateSchema.parse("2026-05-16"); console.log("[VERIFY] PASS: '2026-05-16' is valid"); }
catch(e) { console.log("[VERIFY] FAIL: '2026-05-16':", JSON.stringify(e.issues)); }

// Test 2: Date with time (HTML date input sometimes returns this on iOS Safari)
try { dateSchema.parse("2026-05-16T12:00:00"); console.log("[VERIFY] PASS: '2026-05-16T12:00:00' is valid"); }
catch(e) { console.log("[VERIFY] FAIL: '2026-05-16T12:00:00':", JSON.stringify(e.issues)); }

// Test 3: Empty string (date input cleared on iOS)
try { dateSchema.parse(""); console.log("[VERIFY] PASS: '' is valid"); }
catch(e) { console.log("[VERIFY] FAIL: '':", e.issues?.[0]?.message); }

// Test 4: undefined (date input not filled)
try { dateSchema.parse(undefined); console.log("[VERIFY] PASS: undefined is valid"); }
catch(e) { console.log("[VERIFY] FAIL: undefined:", e.issues?.[0]?.message); }

// Test 5: iOS Safari date format MM/DD/YYYY
try { dateSchema.parse("05/16/2026"); console.log("[VERIFY] PASS: '05/16/2026' is valid"); }
catch(e) { console.log("[VERIFY] FAIL: '05/16/2026':", e.issues?.[0]?.message); }

// Test 6: odds=100 (even money — user typed "100" in the odds field)
const oddsSchema = z.number().int().min(-10000).max(10000);
try { oddsSchema.parse(100); console.log("[VERIFY] PASS: odds=100 is valid"); }
catch(e) { console.log("[VERIFY] FAIL: odds=100:", e.issues?.[0]?.message); }

// Test 7: odds=0 (would fail the oddsNum !== 0 frontend check but let's verify server)
try { oddsSchema.parse(0); console.log("[VERIFY] PASS: odds=0 is valid"); }
catch(e) { console.log("[VERIFY] FAIL: odds=0:", e.issues?.[0]?.message); }

// Test 8: The full create schema with odds=100 and a past date
const createSchema = z.object({
  anGameId:   z.number().int().positive(),
  gameNumber: z.number().int().min(1).max(2).default(1),
  sport:      z.enum(["MLB", "NBA", "NHL", "NCAAM", "NFL", "CUSTOM"]).default("MLB"),
  gameDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  awayTeam:   z.string().min(1).max(128),
  homeTeam:   z.string().min(1).max(128),
  timeframe:  z.enum(["FULL_GAME","FIRST_5","FIRST_INNING","NRFI","YRFI","REGULATION","FIRST_PERIOD","FIRST_HALF","FIRST_QUARTER"]).default("FULL_GAME"),
  market:     z.enum(["ML", "RL", "TOTAL"]).default("ML"),
  pickSide:   z.enum(["AWAY", "HOME", "OVER", "UNDER"]),
  odds:       z.number().int().min(-10000).max(10000),
  risk:       z.number().positive().max(1_000_000),
  toWin:      z.number().positive().optional(),
  line:       z.number().optional(),
  customLine: z.number().optional(),
  wagerType:  z.enum(["PREGAME", "LIVE"]).default("PREGAME"),
  notes:      z.string().max(2000).optional(),
  riskUnits:  z.number().positive().optional(),
  toWinUnits: z.number().positive().optional(),
});

// Simulate the exact payload from the screenshot: CHC vs CWS, odds=100, risk=5, toWin=5
const testPayload = {
  anGameId:   12345678,
  gameNumber: 1,
  sport:      "MLB",
  gameDate:   "2026-05-16",
  awayTeam:   "CHC",
  homeTeam:   "CWS",
  timeframe:  "FULL_GAME",
  market:     "ML",
  pickSide:   "HOME",
  odds:       100,
  risk:       500,
  toWin:      500,
  riskUnits:  5,
  toWinUnits: 5,
  wagerType:  "PREGAME",
};

try {
  const parsed = createSchema.parse(testPayload);
  console.log("[VERIFY] PASS: Full payload with odds=100 is valid");
  console.log("[STATE] Parsed:", JSON.stringify(parsed, null, 2));
} catch(e) {
  console.log("[VERIFY] FAIL: Full payload:", JSON.stringify(e.issues, null, 2));
}

// Test 9: What if the odds field is the string "100" instead of number 100?
const testPayloadStringOdds = { ...testPayload, odds: "100" };
try {
  createSchema.parse(testPayloadStringOdds);
  console.log("[VERIFY] PASS: odds='100' (string) is valid");
} catch(e) {
  console.log("[VERIFY] FAIL: odds='100' (string):", e.issues?.[0]?.message);
}

// Test 10: What if gameDate is empty string (user cleared the date picker)?
const testPayloadEmptyDate = { ...testPayload, gameDate: "" };
try {
  createSchema.parse(testPayloadEmptyDate);
  console.log("[VERIFY] PASS: gameDate='' is valid");
} catch(e) {
  console.log("[VERIFY] FAIL: gameDate='':", e.issues?.[0]?.message);
}

// Test 11: What if gameDate has a trailing space?
const testPayloadSpaceDate = { ...testPayload, gameDate: "2026-05-16 " };
try {
  createSchema.parse(testPayloadSpaceDate);
  console.log("[VERIFY] PASS: gameDate='2026-05-16 ' is valid");
} catch(e) {
  console.log("[VERIFY] FAIL: gameDate='2026-05-16 ':", e.issues?.[0]?.message);
}

console.log("\n=== [OUTPUT] Zod validation test complete ===");
