/**
 * TeamLogo — resolves team logos from the shared registry (ncaamTeams / nbaTeams).
 * Falls back to a colored circle badge with initials if no logo is found.
 */

import { getTeamByDbSlug } from "@shared/ncaamTeams";

const PALETTE = [
  "#e63946", "#2a9d8f", "#e9c46a", "#f4a261", "#264653",
  "#6c63ff", "#48cae4", "#f77f00", "#06d6a0", "#ef476f",
  "#118ab2", "#ffd166", "#7209b7", "#3a86ff", "#fb5607",
  "#8338ec", "#ff006e", "#06a77d", "#d62828", "#023e8a",
];

function colorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

function abbrev(name: string): string {
  const parts = name.replace(/_/g, " ").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 4).toUpperCase();
  if (parts.length === 2) return (parts[0].slice(0, 2) + parts[1].slice(0, 2)).toUpperCase();
  return parts.map((p) => p[0]).join("").slice(0, 4).toUpperCase();
}

interface TeamLogoProps {
  /** Team DB slug, e.g. "duke", "nc_state" */
  name: string;
  size?: number;
}

export default function TeamLogo({ name, size = 36 }: TeamLogoProps) {
  const team = getTeamByDbSlug(name);
  const logoUrl = team?.logoUrl;

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={team?.ncaaName ?? name}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          minWidth: size,
          objectFit: "contain",
          borderRadius: "4px",
          mixBlendMode: "multiply",
        }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  // Fallback: colored badge with initials
  const bg = colorFromName(name);
  const text = abbrev(name);
  const fontSize = size <= 28 ? 9 : size <= 36 ? 11 : 13;

  return (
    <div
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: "50%",
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize,
        color: "#fff",
        letterSpacing: "0.04em",
        userSelect: "none",
      }}
    >
      {text}
    </div>
  );
}
