/**
 * End-to-end test script for Discord OAuth /connect flow.
 * Simulates the full flow: create JWT → hit /connect → verify DB state row inserted.
 *
 * Run with: npx tsx scripts/test-discord-connect.ts
 */
// We'll create the JWT manually using jose (same as signAppUserToken in appUsers.ts)
import { SignJWT } from "jose";
import mysql from "mysql2/promise";
import { ENV } from "../server/_core/env";

const DATABASE_URL = process.env.DATABASE_URL!;

async function main() {
  console.log("\n=== Discord OAuth /connect Flow Test ===\n");

  const conn = await mysql.createConnection(DATABASE_URL);

  // Step 1: Get the owner user
  const [users] = await conn.execute(
    "SELECT id, username, discordId, discordUsername FROM app_users WHERE role='owner' LIMIT 1"
  ) as [Array<{ id: number; username: string; discordId: string | null; discordUsername: string | null }>, unknown];

  const owner = users[0];
  if (!owner) {
    console.error("❌ No owner user found in DB");
    await conn.end();
    return;
  }
  console.log(`✅ Owner user found: id=${owner.id} username="${owner.username}"`);
  console.log(`   Current Discord: id="${owner.discordId ?? "null"}" username="${owner.discordUsername ?? "null"}"`);

  // Step 2: Create a valid JWT for the owner (mirrors signAppUserToken in appUsers.ts)
  const secret = new TextEncoder().encode(ENV.cookieSecret);
  const token = await new SignJWT({ sub: String(owner.id), role: "owner", type: "app_user", tv: 1 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(secret);
  console.log(`✅ JWT created (length=${token.length})`);

  // Step 3: Clear any existing state rows for a clean test
  await conn.execute("DELETE FROM discord_oauth_states WHERE userId = ?", [owner.id]);
  console.log("✅ Cleared existing discord_oauth_states rows for owner");

  // Step 4: Hit /connect with the JWT cookie
  console.log("\n--- Hitting GET /api/auth/discord/connect ---");
  const res = await fetch("http://localhost:3000/api/auth/discord/connect", {
    headers: { Cookie: `app_session=${token}` },
    redirect: "manual",
  });

  console.log(`   HTTP status: ${res.status}`);
  const location = res.headers.get("location") ?? "none";
  console.log(`   Redirect location: "${location}"`);

  if (res.status !== 302) {
    console.error(`❌ Expected 302 redirect, got ${res.status}`);
    await conn.end();
    return;
  }

  if (location.includes("error=")) {
    console.error(`❌ Redirect contains error: "${location}"`);
    await conn.end();
    return;
  }

  if (!location.includes("discord.com/oauth2/authorize")) {
    console.error(`❌ Expected redirect to discord.com/oauth2/authorize, got: "${location}"`);
    await conn.end();
    return;
  }

  console.log("✅ Correctly redirected to Discord OAuth consent screen");

  // Step 5: Parse the redirect_uri from the authorize URL
  const url = new URL(location);
  const redirectUri = url.searchParams.get("redirect_uri");
  const state       = url.searchParams.get("state");
  const clientId    = url.searchParams.get("client_id");
  const scope       = url.searchParams.get("scope");

  console.log(`\n--- Discord OAuth URL parameters ---`);
  console.log(`   client_id   : "${clientId}"`);
  console.log(`   redirect_uri: "${redirectUri}"`);
  console.log(`   state       : "${state?.slice(0, 8)}…" (${state?.length} chars)`);
  console.log(`   scope       : "${scope}"`);

  // Step 6: Verify redirect_uri uses PUBLIC_ORIGIN (not internal Cloud Run hostname)
  const expectedOrigin = ENV.publicOrigin || "http://localhost:3000";
  const expectedRedirectUri = `${expectedOrigin}/api/auth/discord/callback`;

  if (redirectUri === expectedRedirectUri) {
    console.log(`✅ redirect_uri is correct: "${redirectUri}"`);
  } else {
    console.error(`❌ redirect_uri MISMATCH:`);
    console.error(`   Expected: "${expectedRedirectUri}"`);
    console.error(`   Actual  : "${redirectUri}"`);
    console.error(`   This will cause Discord to reject the OAuth flow.`);
  }

  // Step 7: Verify the CSRF state was inserted into the DB
  const [stateRows] = await conn.execute(
    "SELECT state, userId, expiresAt, createdAt FROM discord_oauth_states WHERE userId = ? ORDER BY createdAt DESC LIMIT 3",
    [owner.id]
  ) as [Array<{ state: string; userId: number; expiresAt: number; createdAt: number }>, unknown];

  console.log(`\n--- discord_oauth_states DB rows for userId=${owner.id} ---`);
  if (stateRows.length === 0) {
    console.error("❌ NO STATE ROWS FOUND IN DB — this is the root cause of state_mismatch errors!");
    console.error("   The /connect handler failed to insert the state into discord_oauth_states.");
  } else {
    for (const row of stateRows) {
      const expiresIn = Math.round((row.expiresAt - Date.now()) / 1000);
      console.log(`   ✅ state="${row.state.slice(0, 8)}…" userId=${row.userId} expires_in=${expiresIn}s`);
    }

    // Verify the state in the URL matches the DB row
    const dbState = stateRows[0].state;
    if (state === dbState) {
      console.log(`✅ State in URL matches DB row: "${state?.slice(0, 8)}…"`);
    } else {
      console.error(`❌ State MISMATCH: URL="${state?.slice(0, 8)}…" DB="${dbState.slice(0, 8)}…"`);
    }
  }

  console.log("\n=== Test Complete ===");
  await conn.end();
}

main().catch(err => {
  console.error("FATAL:", err);
  process.exit(1);
});
