/**
 * Regenerates shared/ncaamTeams.ts from the authoritative pasted_content_2.txt
 * which has exactly 365 D1 NCAAM teams.
 *
 * Columns: CONFERENCE, NCAA NAME, NCAA NICKNAME, VSIN Name, NCAA SLUG, VSiN Slug, NCAA LOGO URL
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcFile = "/home/ubuntu/upload/pasted_content_2.txt";
const outFile = join(__dirname, "../shared/ncaamTeams.ts");

const lines = readFileSync(srcFile, "utf8").split("\n").filter(Boolean);
// Skip header line
const dataLines = lines.slice(1);

console.log(`Total data lines: ${dataLines.length}`);

const teams = dataLines.map((line, i) => {
  const parts = line.split("\t");
  if (parts.length < 7) {
    console.warn(`Line ${i + 2} has only ${parts.length} parts: ${line}`);
    return null;
  }
  const [conference, ncaaName, ncaaNickname, vsinName, ncaaSlug, vsinSlug, logoUrl] = parts;
  return {
    conference: conference.trim(),
    ncaaName: ncaaName.trim(),
    ncaaNickname: ncaaNickname.trim(),
    vsinName: vsinName.trim(),
    ncaaSlug: ncaaSlug.trim(),
    vsinSlug: vsinSlug.trim(),
    logoUrl: logoUrl.trim(),
  };
}).filter(Boolean);

console.log(`Valid teams: ${teams.length}`);

// Check for duplicate vsinSlugs
const vsinSlugs = teams.map(t => t.vsinSlug);
const dupVsin = vsinSlugs.filter((s, i) => vsinSlugs.indexOf(s) !== i);
if (dupVsin.length) console.warn(`Duplicate vsinSlugs: ${dupVsin.join(", ")}`);

// Check for duplicate ncaaSlugs
const ncaaSlugs = teams.map(t => t.ncaaSlug);
const dupNcaa = ncaaSlugs.filter((s, i) => ncaaSlugs.indexOf(s) !== i);
if (dupNcaa.length) console.warn(`Duplicate ncaaSlugs: ${dupNcaa.join(", ")}`);

// Generate the TypeScript file
const entries = teams.map(t => {
  const dbSlug = t.vsinSlug.replace(/-/g, "_");
  return `  {
    conference: ${JSON.stringify(t.conference)},
    ncaaName: ${JSON.stringify(t.ncaaName)},
    ncaaNickname: ${JSON.stringify(t.ncaaNickname)},
    vsinName: ${JSON.stringify(t.vsinName)},
    ncaaSlug: ${JSON.stringify(t.ncaaSlug)},
    vsinSlug: ${JSON.stringify(t.vsinSlug)},
    dbSlug: ${JSON.stringify(dbSlug)},
    logoUrl: ${JSON.stringify(t.logoUrl)},
  }`;
}).join(",\n");

const ts = `/**
 * NCAAM Team Registry — 365 Division I Men's Basketball teams
 * Auto-generated from the authoritative NCAAM Mapping master sheet.
 * DO NOT edit manually — regenerate with scripts/generate_registry_v2.mjs
 *
 * Key fields:
 *   ncaaSlug  — NCAA.com seoname (hyphen format, used for logos + scoreboard)
 *   vsinSlug  — VSiN href slug (hyphen format, used for betting splits)
 *   dbSlug    — Database storage key (vsinSlug with hyphens → underscores)
 *   logoUrl   — Official NCAA.com SVG logo URL
 */

export interface NcaamTeam {
  conference: string;
  ncaaName: string;
  ncaaNickname: string;
  vsinName: string;
  ncaaSlug: string;
  vsinSlug: string;
  dbSlug: string;
  logoUrl: string;
}

export const NCAAM_TEAMS: NcaamTeam[] = [
${entries}
];

// ─── Lookup maps ──────────────────────────────────────────────────────────────

/** Lookup by DB slug (vsinSlug with hyphens replaced by underscores) */
export const BY_DB_SLUG = new Map<string, NcaamTeam>(
  NCAAM_TEAMS.map(t => [t.dbSlug, t])
);

/** Lookup by NCAA slug (hyphen format from NCAA.com) */
export const BY_NCAA_SLUG = new Map<string, NcaamTeam>(
  NCAAM_TEAMS.map(t => [t.ncaaSlug, t])
);

/** Lookup by VSiN slug (hyphen format from VSiN) */
export const BY_VSIN_SLUG = new Map<string, NcaamTeam>(
  NCAAM_TEAMS.map(t => [t.vsinSlug, t])
);

/** Set of all valid DB slugs — used for server-side filtering */
export const VALID_DB_SLUGS = new Set<string>(NCAAM_TEAMS.map(t => t.dbSlug));

/** Set of all valid NCAA slugs — used for NCAA scoreboard filtering */
export const VALID_NCAA_SLUGS = new Set<string>(NCAAM_TEAMS.map(t => t.ncaaSlug));

// ─── Helper functions ─────────────────────────────────────────────────────────

/** Get team by DB slug (the key stored in the games table) */
export function getTeamByDbSlug(dbSlug: string): NcaamTeam | undefined {
  return BY_DB_SLUG.get(dbSlug);
}

/** Get team by NCAA slug (from NCAA.com scoreboard seoname) */
export function getTeamByNcaaSlug(ncaaSlug: string): NcaamTeam | undefined {
  return BY_NCAA_SLUG.get(ncaaSlug);
}

/** Get team by VSiN slug (from VSiN href) */
export function getTeamByVsinSlug(vsinSlug: string): NcaamTeam | undefined {
  return BY_VSIN_SLUG.get(vsinSlug);
}
`;

writeFileSync(outFile, ts, "utf8");
console.log(`\nWrote ${teams.length} teams to ${outFile}`);

// Verify
const dbSlugs = teams.map(t => t.vsinSlug.replace(/-/g, "_"));
const dupDb = dbSlugs.filter((s, i) => dbSlugs.indexOf(s) !== i);
if (dupDb.length) console.warn(`Duplicate dbSlugs: ${dupDb.join(", ")}`);
else console.log("No duplicate dbSlugs ✓");
console.log("\nSample entries:");
teams.slice(0, 3).forEach(t => console.log(`  ${t.ncaaName} (${t.ncaaNickname}) | dbSlug: ${t.vsinSlug.replace(/-/g, "_")} | ncaaSlug: ${t.ncaaSlug}`));
