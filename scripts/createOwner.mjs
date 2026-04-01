import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await mysql.createConnection(DATABASE_URL);

const email = "aisportbettingcontact@gmail.com";
const username = "prez";
const password = "Tailered101$";
const role = "owner";

// Check if already exists
const [existing] = await conn.execute(
  "SELECT id FROM app_users WHERE email = ? OR username = ?",
  [email, username]
);

if (existing.length > 0) {
  console.log("✓ @prez account already exists. Updating...");
  const passwordHash = await bcrypt.hash(password, 12);
  await conn.execute(
    "UPDATE app_users SET email = ?, username = ?, passwordHash = ?, role = ?, hasAccess = 1, expiryDate = NULL, updatedAt = NOW() WHERE email = ? OR username = ?",
    [email, username, passwordHash, role, email, username]
  );
  console.log("✓ @prez account updated successfully.");
} else {
  const passwordHash = await bcrypt.hash(password, 12);
  await conn.execute(
    "INSERT INTO app_users (email, username, passwordHash, role, hasAccess, expiryDate, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, NULL, NOW(), NOW())",
    [email, username, passwordHash, role]
  );
  console.log("✓ @prez owner account created successfully.");
}

await conn.end();
console.log("Done.");
