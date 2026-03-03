/**
 * uploadLogos.ts
 *
 * One-time script to upload all NCAAM team logos to S3 storage
 * using their original filenames as the storage key.
 *
 * Run from the project root:
 *   pnpm tsx server/uploadLogos.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGOS_DIR = path.join(__dirname, "../../webdev-static-assets/NCAAM");
const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL ?? "";
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY ?? "";

if (!FORGE_API_URL || !FORGE_API_KEY) {
  console.error("Missing BUILT_IN_FORGE_API_URL or BUILT_IN_FORGE_API_KEY");
  process.exit(1);
}

async function uploadFile(filename: string): Promise<string> {
  const filePath = path.join(LOGOS_DIR, filename);
  const data = fs.readFileSync(filePath);
  const key = `NCAAM/${filename}`;

  const baseUrl = FORGE_API_URL.replace(/\/+$/, "");
  const uploadUrl = new URL(`${baseUrl}/v1/storage/upload`);
  uploadUrl.searchParams.set("path", key);

  const blob = new Blob([data], { type: "image/png" });
  const form = new FormData();
  form.append("file", blob, filename);

  const response = await fetch(uploadUrl.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${FORGE_API_KEY}` },
    body: form,
  });

  if (!response.ok) {
    const msg = await response.text().catch(() => response.statusText);
    throw new Error(`Upload failed for ${filename}: ${response.status} ${msg}`);
  }

  const result = await response.json() as { url: string };
  return result.url;
}

async function main() {
  if (!fs.existsSync(LOGOS_DIR)) {
    console.error(`Logos directory not found: ${LOGOS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(LOGOS_DIR).filter(f => f.endsWith(".png") && !f.startsWith("BJ8d9t"));
  console.log(`Found ${files.length} logo files`);

  const results: Record<string, string> = {};
  let success = 0;
  let failed = 0;

  for (const filename of files.sort()) {
    try {
      const url = await uploadFile(filename);
      const key = filename.replace(".png", "");
      results[key] = url;
      console.log(`✓ ${filename} → ${url}`);
      success++;
    } catch (err) {
      console.error(`✗ ${filename}: ${err}`);
      failed++;
    }
  }

  console.log(`\nDone: ${success} uploaded, ${failed} failed`);
  console.log("\n// teamLogos.ts entries:");
  for (const [key, url] of Object.entries(results).sort()) {
    console.log(`  ${key}: "${url}",`);
  }
}

main().catch(console.error);
