/**
 * Generates shared/ncaamTeams.ts from shared/ncaamMapping.csv
 * Run: node scripts/generate_team_registry.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, '..', 'shared', 'ncaamMapping.csv');
const outPath = path.join(__dirname, '..', 'shared', 'ncaamTeams.ts');

const lines = fs.readFileSync(csvPath, 'utf8').trim().split('\n');
const teams = lines.slice(1).map(l => {
  const parts = l.split(',');
  return {
    conference: parts[0].trim(),
    ncaaName: parts[1].trim(),
    ncaaNickname: parts[2].trim(),
    vsinName: parts[3].trim(),
    ncaaSlug: parts[4].trim(),
    vsinSlug: parts[5].trim(),
    logoUrl: parts[6] ? parts[6].trim().replace(/\r/g, '') : '',
  };
});

// Build the TypeScript file
const teamObjects = teams.map(t => `  {
    conference: ${JSON.stringify(t.conference)},
    ncaaName: ${JSON.stringify(t.ncaaName)},
    ncaaNickname: ${JSON.stringify(t.ncaaNickname)},
    vsinName: ${JSON.stringify(t.vsinName)},
    ncaaSlug: ${JSON.stringify(t.ncaaSlug)},
    vsinSlug: ${JSON.stringify(t.vsinSlug)},
    logoUrl: ${JSON.stringify(t.logoUrl)},
  }`).join(',\n');

// Build vsinSlug -> ncaaSlug map (only for differing slugs)
const vsinToNcaaEntries = teams
  .filter(t => t.vsinSlug !== t.ncaaSlug)
  .map(t => `  ${JSON.stringify(t.vsinSlug)}: ${JSON.stringify(t.ncaaSlug)},`)
  .join('\n');

const ts = `/**
 * NCAAM Team Registry — auto-generated from shared/ncaamMapping.csv
 * DO NOT EDIT MANUALLY. Run: node scripts/generate_team_registry.mjs
 *
 * Single source of truth for all 365 Division I NCAAM teams.
 * NCAA slug is the canonical identifier throughout the system.
 */

export interface NcaamTeam {
  conference: string;
  ncaaName: string;
  ncaaNickname: string;
  vsinName: string;
  ncaaSlug: string;
  vsinSlug: string;
  logoUrl: string;
}

/** All 365 Division I NCAAM teams */
export const NCAAM_TEAMS: NcaamTeam[] = [
${teamObjects}
];

/** NCAA slug → team object (canonical lookup) */
export const BY_NCAA_SLUG: Record<string, NcaamTeam> = Object.fromEntries(
  NCAAM_TEAMS.map(t => [t.ncaaSlug, t])
);

/** VSiN slug → team object */
export const BY_VSIN_SLUG: Record<string, NcaamTeam> = Object.fromEntries(
  NCAAM_TEAMS.map(t => [t.vsinSlug, t])
);

/** Set of all valid NCAA slugs (for fast whitelist checks) */
export const VALID_NCAA_SLUGS: ReadonlySet<string> = new Set(
  NCAAM_TEAMS.map(t => t.ncaaSlug)
);

/** Set of all valid VSiN slugs (for fast whitelist checks) */
export const VALID_VSIN_SLUGS: ReadonlySet<string> = new Set(
  NCAAM_TEAMS.map(t => t.vsinSlug)
);

/**
 * Convert a VSiN slug to the canonical NCAA slug.
 * Returns null if the team is not in the registry.
 */
export function vsinSlugToNcaaSlug(vsinSlug: string): string | null {
  const team = BY_VSIN_SLUG[vsinSlug];
  return team ? team.ncaaSlug : null;
}

/**
 * Get team info by NCAA slug.
 * Returns null if not found.
 */
export function getTeamByNcaaSlug(ncaaSlug: string): NcaamTeam | null {
  return BY_NCAA_SLUG[ncaaSlug] ?? null;
}

/**
 * Get team info by VSiN slug.
 * Returns null if not found.
 */
export function getTeamByVsinSlug(vsinSlug: string): NcaamTeam | null {
  return BY_VSIN_SLUG[vsinSlug] ?? null;
}

/**
 * Check if both teams in a game are valid D1 NCAAM teams.
 * @param awayNcaaSlug - NCAA slug for away team
 * @param homeNcaaSlug - NCAA slug for home team
 */
export function isValidNcaamGame(awayNcaaSlug: string, homeNcaaSlug: string): boolean {
  return VALID_NCAA_SLUGS.has(awayNcaaSlug) && VALID_NCAA_SLUGS.has(homeNcaaSlug);
}
`;

fs.writeFileSync(outPath, ts, 'utf8');
console.log(`✅ Generated ${outPath}`);
console.log(`   Total teams: ${teams.length}`);
console.log(`   VSiN→NCAA mappings (different slugs): ${teams.filter(t => t.vsinSlug !== t.ncaaSlug).length}`);
