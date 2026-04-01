/**
 * End-to-end test script for Discord OAuth /callback flow.
 * 
 * This script:
 * 1. Inserts a real CSRF state row into discord_oauth_states
 * 2. Hits /callback with that state + a fake code
 * 3. Verifies the state is consumed from the DB
 * 4. Verifies the redirect is to /dashboard?discord_error=token_exchange_failed
 *    (expected — we can't exchange a fake code, but this proves the state lookup works)
 *
 * Run with: npx tsx scripts/test-discord-callback.ts
 */
import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL!;

async function main() {
  console.log("\n=== Discord OAuth /callback Flow Test ===\n");

  const conn = await mysql.createConnection(DATABASE_URL);

  // Step 1: Get the owner user
  const [users] = await conn.execute(
    "SELECT id, username FROM app_users WHERE role='owner' LIMIT 1"
  ) as [Array<{ id: number; username: string }>, unknown];

  const owner = users[0];
  if (!owner) {
    console.error("❌ No owner user found in DB");
    await conn.end();
    return;
  }
  console.log(`✅ Owner user: id=${owner.id} username="${owner.username}"`);

  // Step 2: Insert a test CSRF state directly into the DB
  const testState = "test_state_" + Math.random().toString(36).slice(2, 12);
  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000; // 10 min

  await conn.execute(
    "INSERT INTO discord_oauth_states (state, userId, expiresAt, createdAt) VALUES (?, ?, ?, ?)",
    [testState, owner.id, expiresAt, now]
  );
  console.log(`✅ Inserted test CSRF state into DB: "${testState.slice(0, 12)}…" userId=${owner.id}`);

  // Step 3: Verify the state is in the DB
  const [stateRows] = await conn.execute(
    "SELECT state, userId, expiresAt FROM discord_oauth_states WHERE state = ?",
    [testState]
  ) as [Array<{ state: string; userId: number; expiresAt: number }>, unknown];

  if (stateRows.length === 0) {
    console.error("❌ State row NOT found in DB after insert — DB write failed");
    await conn.end();
    return;
  }
  console.log(`✅ State row found in DB: userId=${stateRows[0].userId} expires_in=${Math.round((stateRows[0].expiresAt - now)/1000)}s`);

  // Step 4: Hit /callback with the test state + fake code
  // Expected: state lookup succeeds → token exchange fails (fake code) → redirect to discord_error=token_exchange_failed
  console.log("\n--- Hitting GET /api/auth/discord/callback?code=FAKECODE&state=... ---");
  const callbackUrl = `http://localhost:3000/api/auth/discord/callback?code=FAKECODE_12345&state=${encodeURIComponent(testState)}`;
  
  const res = await fetch(callbackUrl, { redirect: "manual" });
  console.log(`   HTTP status: ${res.status}`);
  const location = res.headers.get("location") ?? "none";
  console.log(`   Redirect location: "${location}"`);

  // Step 5: Analyze the result
  if (location.includes("discord_error=state_mismatch")) {
    console.error("❌ CRITICAL FAILURE: state_mismatch — the DB state lookup failed!");
    console.error("   The state was inserted but not found by the callback handler.");
    console.error("   This is the root cause of the Discord integration failure.");
  } else if (location.includes("discord_error=token_exchange_failed")) {
    console.log("✅ EXPECTED: token_exchange_failed — state lookup SUCCEEDED, fake code rejected by Discord (expected)");
    console.log("   This confirms the DB-backed state lookup is working correctly.");
  } else if (location.includes("discord_error=db_unavailable")) {
    console.error("❌ DB unavailable — getDb() returned null in the callback handler");
  } else if (location.includes("discord_linked=1")) {
    console.log("✅ UNEXPECTED SUCCESS: discord_linked=1 — the fake code was somehow accepted (should not happen)");
  } else {
    console.log(`⚠️  Unexpected redirect: "${location}"`);
  }

  // Step 6: Verify the state was consumed (deleted) from the DB
  const [remainingRows] = await conn.execute(
    "SELECT COUNT(*) as cnt FROM discord_oauth_states WHERE state = ?",
    [testState]
  ) as [Array<{ cnt: number }>, unknown];

  if (remainingRows[0].cnt === 0) {
    console.log("✅ State row was consumed (deleted) from DB after callback — replay protection works");
  } else {
    console.warn("⚠️  State row still in DB after callback — may not have been consumed");
  }

  // Step 7: Check current discord fields on the owner user
  const [ownerRows] = await conn.execute(
    "SELECT discordId, discordUsername, discordConnectedAt FROM app_users WHERE id = ?",
    [owner.id]
  ) as [Array<{ discordId: string | null; discordUsername: string | null; discordConnectedAt: number | null }>, unknown];

  const ownerData = ownerRows[0];
  console.log(`\n--- Owner Discord fields in DB ---`);
  console.log(`   discordId         : "${ownerData?.discordId ?? "null"}"`);
  console.log(`   discordUsername   : "${ownerData?.discordUsername ?? "null"}"`);
  console.log(`   discordConnectedAt: ${ownerData?.discordConnectedAt ?? "null"}`);

  console.log("\n=== Test Complete ===");
  await conn.end();
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
