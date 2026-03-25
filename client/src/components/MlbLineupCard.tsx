/**
 * MlbLineupCard
 *
 * Displays a single MLB game's confirmed starting lineups, pitchers, and weather.
 *
 * Layout: ALWAYS side-by-side (Away | Home) on ALL screen sizes.
 *
 * Mobile compact row design (pixel-verified for iPhone SE 375px):
 *   Each column = ~167px. Row layout:
 *   [num:12px] [gap:4px] [avatar:28px] [gap:4px] → flex-col:
 *     Line 1: [name: ~119px budget at 11px bold — fits "Giancarlo Stanton" (17 chars)]
 *     Line 2: [pos badge] [bats indicator]
 *
 * Desktop row design (≥640px):
 *   [num] [avatar:36px] [pos] [name] [bats] — single line, larger font
 *
 * Photo crop: objectPosition "center 35%" — pixel-verified on 5 MLB players.
 * MLB /headshot/67/ is 180x270. In a 28px circle (objectFit:cover), image
 * scales to 28x42 (14px overflow). Y=35% → offset=4.9px → shows rows 5-33
 * of 42px displayed, which frames the face correctly.
 */

import { useState, useEffect, useMemo } from "react";
import { MLB_BY_ABBREV } from "@shared/mlbTeams";

// Types matching the DB schema
export interface LineupPlayer {
  battingOrder: number;
  position: string;
  name: string;
  bats: string; // 'R' | 'L' | 'S'
  rotowireId: number | null;
  mlbamId: number | null;
}

export interface MlbLineupRow {
  id: number;
  gameId: number;
  scrapedAt: number;
  awayPitcherName: string | null;
  awayPitcherHand: string | null;
  awayPitcherEra: string | null;
  awayPitcherRotowireId: number | null;
  awayPitcherMlbamId: number | null;
  awayPitcherConfirmed: boolean | null;
  homePitcherName: string | null;
  homePitcherHand: string | null;
  homePitcherEra: string | null;
  homePitcherRotowireId: number | null;
  homePitcherMlbamId: number | null;
  homePitcherConfirmed: boolean | null;
  awayLineup: string | null;
  homeLineup: string | null;
  awayLineupConfirmed: boolean | null;
  homeLineupConfirmed: boolean | null;
  weatherIcon: string | null;
  weatherTemp: string | null;
  weatherWind: string | null;
  weatherPrecip: number | null;
  weatherDome: boolean | null;
  umpire: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── MLB headshot CDN ──────────────────────────────────────────────────────────
const mlbPhoto = (id: number | null | undefined): string | null => {
  if (!id) return null;
  return `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_180,q_auto:best/v1/people/${id}/headshot/67/current`;
};

// ─── Types ─────────────────────────────────────────────────────────────────────
interface MlbLineupCardProps {
  awayTeam: string;   // abbreviation e.g. "NYY"
  homeTeam: string;   // abbreviation e.g. "SF"
  startTime: string;  // e.g. "7:05 PM ET"
  lineup: MlbLineupRow | null | undefined;
}

// ─── useIsMobile hook ──────────────────────────────────────────────────────────
function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

// ─── PlayerAvatar ──────────────────────────────────────────────────────────────
// objectPosition "center 35%" is pixel-verified:
//   0% = cap only, 35% = full face centered, 50% = chin/neck visible
function PlayerAvatar({ mlbamId, size }: { mlbamId: number | null | undefined; size: number }) {
  const url = mlbPhoto(mlbamId);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        border: "1.5px solid #1E3048",
        background: "#101820",
        position: "relative",
      }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center 6%",
          }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div style={{ width: "100%", height: "100%", background: "#101820" }} />
      )}
    </div>
  );
}

// ─── PitcherSection ────────────────────────────────────────────────────────────
// Compact on mobile, full on desktop
function PitcherSection({
  name,
  hand,
  era,
  mlbamId,
  confirmed,
  isMobile,
}: {
  name: string | null | undefined;
  hand: string | null | undefined;
  era: string | null | undefined;
  mlbamId: number | null | undefined;
  confirmed: boolean | null | undefined;
  isMobile: boolean;
}) {
  const displayName = name ?? "TBD";
  const displayEra = era ?? "—";

  if (isMobile) {
    // Compact mobile pitcher: avatar + name stacked
    return (
      <div
        style={{
          padding: "8px 8px 6px",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        <div
          style={{
            fontSize: 7,
            fontWeight: 600,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            color: "#3A5A7A",
            marginBottom: 5,
          }}
        >
          Starting Pitcher
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <PlayerAvatar mlbamId={mlbamId} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 12,
                fontWeight: 800,
                color: "#FFFFFF",
                lineHeight: 1.1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {displayName}
            </div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
              {displayEra}
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 3 }}>
              {hand && (
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 600,
                    letterSpacing: "1px",
                    textTransform: "uppercase",
                    padding: "1px 4px",
                    borderRadius: 2,
                    background: "#101820",
                    color: "#3A5A7A",
                    border: "1px solid #182433",
                  }}
                >
                  {hand}HP
                </span>
              )}
              {confirmed && (
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 600,
                    letterSpacing: "0.5px",
                    color: "#39FF14",
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  <span
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: "#39FF14",
                      display: "inline-block",
                    }}
                  />
                  Conf
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Desktop pitcher
  return (
    <div
      style={{
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "2px",
          textTransform: "uppercase",
          color: "#3A5A7A",
          marginBottom: 5,
        }}
      >
        Starting Pitcher
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <PlayerAvatar mlbamId={mlbamId} size={44} />
        <div style={{ textAlign: "left" }}>
          <div
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 16,
              fontWeight: 800,
              color: "#FFFFFF",
              lineHeight: 1.1,
            }}
          >
            {displayName}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
            {displayEra}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 5 }}>
            {hand && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  padding: "1px 5px",
                  borderRadius: 3,
                  background: "#101820",
                  color: "#3A5A7A",
                  border: "1px solid #182433",
                  display: "inline-block",
                }}
              >
                {hand}HP
              </span>
            )}
            {confirmed && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "1px",
                  textTransform: "uppercase",
                  color: "#39FF14",
                }}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "#39FF14",
                    display: "inline-block",
                  }}
                />
                Confirmed
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── LineupRows ────────────────────────────────────────────────────────────────
// isMobile=true: two-line compact rows (name on top, pos+bats below)
// isMobile=false: single-line full rows
function LineupRows({ players, isMobile }: { players: LineupPlayer[]; isMobile: boolean }) {
  if (players.length === 0) {
    return (
      <div
        style={{
          padding: "10px 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 60,
        }}
      >
        <span
          style={{
            fontSize: 9,
            color: "#3A5A7A",
            fontWeight: 600,
            letterSpacing: "1px",
            textTransform: "uppercase",
          }}
        >
          Lineup Pending
        </span>
      </div>
    );
  }

  if (isMobile) {
    // MOBILE: Two-line compact rows
    // Budget analysis (iPhone SE 375px):
    //   col = 167px, padding = 6px each side = 12px total
    //   usable = 155px
    //   [num:11px][gap:3px][avatar:28px][gap:4px][flex-col: ~109px]
    //   name at 11px bold: ~6.5px/char → 109/6.5 = 16.8 chars → fits "Giancarlo Stanton" (17) ✓
    return (
      <div style={{ padding: "4px 6px" }}>
        {players.map((p, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              padding: "5px 0",
              borderBottom: i < players.length - 1 ? "1px solid rgba(24,36,51,0.5)" : "none",
            }}
          >
            {/* Batting order number */}
            <span
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 10,
                fontWeight: 700,
                color: "#3A5A7A",
                width: 11,
                flexShrink: 0,
                textAlign: "right",
              }}
            >
              {p.battingOrder}
            </span>

            {/* Player headshot — 28px on mobile */}
            <PlayerAvatar mlbamId={p.mlbamId} size={28} />

            {/* Two-line text column */}
            <div style={{ flex: 1, minWidth: 0, marginLeft: 4 }}>
              {/* Line 1: Player name */}
              <div
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#FFFFFF",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "clip",
                  lineHeight: 1.2,
                }}
              >
                {p.name}
              </div>
              {/* Line 2: Position + Bats */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 1,
                }}
              >
                <span
                  style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.3px",
                    textTransform: "uppercase",
                    color: "#3A5A7A",
                  }}
                >
                  {p.position}
                </span>
                <span
                  style={{
                    fontSize: 8,
                    color: "rgba(58,90,122,0.7)",
                    fontWeight: 600,
                  }}
                >
                  {p.bats}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // DESKTOP: Single-line full rows
  return (
    <div style={{ padding: "8px 14px" }}>
      {players.map((p, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "6px 0",
            borderBottom: i < players.length - 1 ? "1px solid rgba(24,36,51,0.6)" : "none",
          }}
        >
          {/* Batting order number */}
          <span
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 11,
              fontWeight: 700,
              color: "#3A5A7A",
              width: 14,
              flexShrink: 0,
              textAlign: "right",
            }}
          >
            {p.battingOrder}
          </span>

          {/* Player headshot */}
          <PlayerAvatar mlbamId={p.mlbamId} size={36} />

          {/* Position badge */}
          <span
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              color: "#3A5A7A",
              width: 24,
              flexShrink: 0,
              textAlign: "left",
            }}
          >
            {p.position}
          </span>

          {/* Player name */}
          <span
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: 14,
              fontWeight: 800,
              color: "#FFFFFF",
              flex: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              textAlign: "left",
              minWidth: 0,
            }}
          >
            {p.name}
          </span>

          {/* Bats indicator */}
          <span
            style={{
              fontSize: 9,
              color: "#3A5A7A",
              fontWeight: 600,
              flexShrink: 0,
              width: 10,
              textAlign: "right",
            }}
          >
            {p.bats}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── WeatherStrip ──────────────────────────────────────────────────────────────
function WeatherStrip({ lineup }: { lineup: MlbLineupRow }) {
  const { weatherIcon, weatherTemp, weatherWind, weatherPrecip, weatherDome } = lineup;

  if (weatherDome) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "10px 18px",
          background: "#0C1219",
        }}
      >
        <span style={{ fontSize: 16 }}>🏟️</span>
        <span
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: 13,
            fontWeight: 700,
            color: "#FFFFFF",
          }}
        >
          Dome
        </span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Indoor stadium</span>
      </div>
    );
  }

  if (!weatherTemp && !weatherWind && weatherPrecip == null) return null;

  const precipColor =
    weatherPrecip == null
      ? "#3A5A7A"
      : weatherPrecip === 0
      ? "#39FF14"
      : weatherPrecip < 30
      ? "#FFCC00"
      : "#FF2D55";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: "10px 18px",
        background: "#0C1219",
      }}
    >
      {(weatherIcon || weatherTemp || weatherWind) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {weatherIcon && <span style={{ fontSize: 20, lineHeight: 1 }}>{weatherIcon}</span>}
          <div>
            {weatherTemp && (
              <div
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#FFFFFF",
                }}
              >
                {weatherTemp}
              </div>
            )}
            {weatherWind && (
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
                {weatherWind}
              </div>
            )}
          </div>
        </div>
      )}
      {weatherPrecip != null && (
        <>
          <div style={{ width: 1, height: 28, background: "#1E3048" }} />
          <div>
            <div
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: 13,
                fontWeight: 700,
                textAlign: "center",
                color: precipColor,
              }}
            >
              {weatherPrecip}%
            </div>
            <div
              style={{
                fontSize: 9,
                color: "rgba(255,255,255,0.3)",
                letterSpacing: "1px",
                textTransform: "uppercase",
                marginTop: 1,
                textAlign: "center",
              }}
            >
              Precip
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function MlbLineupCard({ awayTeam, homeTeam, startTime, lineup }: MlbLineupCardProps) {
  const isMobile = useIsMobile(640);

  const awayInfo = MLB_BY_ABBREV.get(awayTeam);
  const homeInfo = MLB_BY_ABBREV.get(homeTeam);

  const awayColor = awayInfo?.primaryColor ?? "#444";
  const awayDark = awayInfo?.secondaryColor ?? "#222";
  const homeColor = homeInfo?.primaryColor ?? "#444";
  const homeDark = homeInfo?.secondaryColor ?? "#222";

  const awayLineup = useMemo((): LineupPlayer[] => {
    if (!lineup?.awayLineup) return [];
    try { return JSON.parse(lineup.awayLineup) as LineupPlayer[]; } catch { return []; }
  }, [lineup?.awayLineup]);

  const homeLineup = useMemo((): LineupPlayer[] => {
    if (!lineup?.homeLineup) return [];
    try { return JSON.parse(lineup.homeLineup) as LineupPlayer[]; } catch { return []; }
  }, [lineup?.homeLineup]);

  const awayCity = awayInfo?.city ?? awayTeam;
  const awayNickname = awayInfo?.nickname ?? awayTeam;
  const homeCity = homeInfo?.city ?? homeTeam;
  const homeNickname = homeInfo?.nickname ?? homeTeam;

  return (
    <div
      style={{
        background: "#090E14",
        borderRadius: 12,
        border: "1px solid #182433",
        overflow: "hidden",
        marginBottom: 10,
      }}
    >
      {/* Color top bar */}
      <div
        style={{
          height: 3,
          background: `linear-gradient(90deg, ${awayColor} 48%, ${homeColor} 52%)`,
        }}
      />

      {/* ── Matchup header — always side-by-side ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          padding: isMobile ? "8px 10px 6px" : "14px 18px 12px",
          borderBottom: "1px solid #182433",
          gap: isMobile ? 6 : 10,
        }}
      >
        {/* Away team — left-aligned */}
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 7 : 12 }}>
          <div
            style={{
              width: isMobile ? 28 : 42,
              height: isMobile ? 28 : 42,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: `radial-gradient(circle at 35% 35%, ${awayColor}, ${awayDark})`,
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            <img
              src={awayInfo?.logoUrl}
              alt={awayTeam}
              style={{
                width: isMobile ? 18 : 28,
                height: isMobile ? 18 : 28,
                objectFit: "contain",
              }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <div>
            <div
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: isMobile ? 11 : 13,
                fontWeight: 900,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                color: "#FFFFFF",
                lineHeight: 1.1,
              }}
            >
              {awayCity}
            </div>
            <div
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: isMobile ? 9 : 11,
                fontWeight: 400,
                color: "rgba(255,255,255,0.5)",
                letterSpacing: "0.5px",
                marginTop: 1,
              }}
            >
              {awayNickname}
            </div>
            <div
              style={{
                fontSize: isMobile ? 7 : 8,
                fontWeight: 700,
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                padding: isMobile ? "1px 4px" : "1px 6px",
                borderRadius: 3,
                marginTop: isMobile ? 2 : 4,
                display: "inline-block",
                background: `${awayColor}22`,
                color: awayColor,
                border: `1px solid ${awayColor}44`,
              }}
            >
              Away
            </div>
          </div>
        </div>

        {/* Center: time + @ */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: isMobile ? 10 : 12,
              fontWeight: 700,
              color: "#FFFFFF",
              letterSpacing: "1px",
              whiteSpace: "nowrap",
            }}
          >
            {startTime}
          </div>
          <div
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: isMobile ? 9 : 10,
              color: "#3A5A7A",
              letterSpacing: "3px",
              marginTop: 3,
            }}
          >
            @
          </div>
        </div>

        {/* Home team — right-aligned */}
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 7 : 12, flexDirection: "row-reverse" }}>
          <div
            style={{
              width: isMobile ? 28 : 42,
              height: isMobile ? 28 : 42,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: `radial-gradient(circle at 35% 35%, ${homeColor}, ${homeDark})`,
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            <img
              src={homeInfo?.logoUrl}
              alt={homeTeam}
              style={{
                width: isMobile ? 18 : 28,
                height: isMobile ? 18 : 28,
                objectFit: "contain",
              }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: isMobile ? 11 : 13,
                fontWeight: 900,
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                color: "#FFFFFF",
                lineHeight: 1.1,
              }}
            >
              {homeCity}
            </div>
            <div
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: isMobile ? 9 : 11,
                fontWeight: 400,
                color: "rgba(255,255,255,0.5)",
                letterSpacing: "0.5px",
                marginTop: 1,
              }}
            >
              {homeNickname}
            </div>
            <div
              style={{
                fontSize: isMobile ? 7 : 8,
                fontWeight: 700,
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                padding: isMobile ? "1px 4px" : "1px 6px",
                borderRadius: 3,
                marginTop: isMobile ? 2 : 4,
                display: "inline-block",
                background: `${homeColor}22`,
                color: homeColor,
                border: `1px solid ${homeColor}44`,
              }}
            >
              Home
            </div>
          </div>
        </div>
      </div>

      {/* ── Pitchers — always side-by-side ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1px 1fr",
          borderBottom: "1px solid #182433",
        }}
      >
        <PitcherSection
          name={lineup?.awayPitcherName}
          hand={lineup?.awayPitcherHand}
          era={lineup?.awayPitcherEra}
          mlbamId={lineup?.awayPitcherMlbamId}
          confirmed={lineup?.awayPitcherConfirmed}
          isMobile={isMobile}
        />
        <div style={{ background: "#182433" }} />
        <PitcherSection
          name={lineup?.homePitcherName}
          hand={lineup?.homePitcherHand}
          era={lineup?.homePitcherEra}
          mlbamId={lineup?.homePitcherMlbamId}
          confirmed={lineup?.homePitcherConfirmed}
          isMobile={isMobile}
        />
      </div>

      {/* ── Batting lineups — always side-by-side ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1px 1fr",
          borderBottom: "1px solid #182433",
        }}
      >
        <LineupRows players={awayLineup} isMobile={isMobile} />
        <div style={{ background: "#182433" }} />
        <LineupRows players={homeLineup} isMobile={isMobile} />
      </div>

      {/* Weather */}
      {lineup && <WeatherStrip lineup={lineup} />}
    </div>
  );
}
