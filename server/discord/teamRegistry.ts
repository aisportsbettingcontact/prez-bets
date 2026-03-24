/**
 * Team Registry — maps DB slugs to display names and logo URLs for NCAAM / NBA / NHL.
 * NBA teams are loaded from the live DB at bot startup; NCAAM and NHL are derived
 * from the shared registries already in the project.
 */

import { NCAAM_TEAMS } from "@shared/ncaamTeams";
import { NBA_TEAMS } from "@shared/nbaTeams";
import { NHL_TEAMS } from "@shared/nhlTeams";

interface TeamEntry {
  displayName: string;
  logoUrl: string;
}

// Build lookup maps once at module load time
const ncaamByDbSlug = new Map<string, TeamEntry>();
for (const t of NCAAM_TEAMS) {
  ncaamByDbSlug.set(t.dbSlug, {
    displayName: t.ncaaName,
    logoUrl: t.logoUrl,
  });
}

const nbaByDbSlug = new Map<string, TeamEntry>();
for (const t of NBA_TEAMS) {
  nbaByDbSlug.set(t.dbSlug, {
    displayName: t.name,
    logoUrl: t.logoUrl,
  });
}

const nhlByDbSlug = new Map<string, TeamEntry>();
for (const t of NHL_TEAMS) {
  nhlByDbSlug.set(t.dbSlug, {
    displayName: t.name,
    logoUrl: t.logoUrl,
  });
}

function fallback(dbSlug: string): TeamEntry {
  const displayName = dbSlug
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return { displayName, logoUrl: "" };
}

export function resolveTeam(dbSlug: string, sport: string): TeamEntry {
  switch (sport.toUpperCase()) {
    case "NBA":
      return nbaByDbSlug.get(dbSlug) ?? fallback(dbSlug);
    case "NHL":
      return nhlByDbSlug.get(dbSlug) ?? fallback(dbSlug);
    default:
      return ncaamByDbSlug.get(dbSlug) ?? fallback(dbSlug);
  }
}
