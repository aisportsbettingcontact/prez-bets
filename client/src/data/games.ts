// NCAAM Model Projections - 03/02/2026
// Source: NCAAMModel-03-02-2026.csv
// Design: EdgeGuide - AI Sports Betting Models

export interface Game {
  id: string;
  date: string;
  startTimeEst: string;
  awayTeam: string;
  awayTeamDisplay: string;
  awayBookSpread: number;
  awayModelSpread: number;
  homeTeam: string;
  homeTeamDisplay: string;
  homeBookSpread: number;
  homeModelSpread: number;
  bookTotal: number;
  modelTotal: number;
  spreadEdge: string;
  spreadDiff: number;
  totalEdge: string;
  totalDiff: number;
}

function formatTeamName(raw: string): string {
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatTime(raw: string): string {
  const h = parseInt(raw.slice(0, 2), 10);
  const m = raw.slice(2);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h > 12 ? h - 12 : h;
  return `${hour}:${m} ${ampm} EST`;
}

function formatDate(raw: string): string {
  // raw = "03022026"
  const month = parseInt(raw.slice(0, 2), 10);
  const day = parseInt(raw.slice(2, 4), 10);
  const year = parseInt(raw.slice(4, 8), 10);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const d = new Date(year, month - 1, day);
  return `${days[d.getDay()]} ${months[month - 1]} ${day}`;
}

const rawGames = [
  { date: "03022026", startTimeEst: "1900", awayTeam: "duke", awayBookSpread: -9.5, awayModelSpread: -10.5, homeTeam: "nc_state", homeBookSpread: 9.5, homeModelSpread: 10.5, bookTotal: 150.5, modelTotal: 149.5, spreadEdge: "duke (-9.5)", spreadDiff: 1, totalEdge: "UNDER 150.5", totalDiff: 1 },
  { date: "03022026", startTimeEst: "1900", awayTeam: "iupui", awayBookSpread: 1.5, awayModelSpread: 3, homeTeam: "cleveland_state", homeBookSpread: -1.5, homeModelSpread: -3, bookTotal: 168.5, modelTotal: 169.5, spreadEdge: "cleveland_state (-1.5)", spreadDiff: 1.5, totalEdge: "OVER 168.5", totalDiff: 1 },
  { date: "03022026", startTimeEst: "2000", awayTeam: "montana_state", awayBookSpread: -6.5, awayModelSpread: -4, homeTeam: "northern_arizona", homeBookSpread: 6.5, homeModelSpread: 4, bookTotal: 143.5, modelTotal: 143.5, spreadEdge: "northern_arizona (+6.5)", spreadDiff: 2.5, totalEdge: "PASS", totalDiff: 0 },
  { date: "03022026", startTimeEst: "2000", awayTeam: "montana", awayBookSpread: 5.5, awayModelSpread: 6.5, homeTeam: "northern_colorado", homeBookSpread: -5.5, homeModelSpread: -6.5, bookTotal: 154.5, modelTotal: 154, spreadEdge: "northern_colorado (-5.5)", spreadDiff: 1, totalEdge: "UNDER 154.5", totalDiff: 0.5 },
  { date: "03022026", startTimeEst: "2100", awayTeam: "iowa_state", awayBookSpread: 7.5, awayModelSpread: 8.5, homeTeam: "arizona", homeBookSpread: -7.5, homeModelSpread: -8.5, bookTotal: 149.5, modelTotal: 147, spreadEdge: "arizona (-7.5)", spreadDiff: 1, totalEdge: "UNDER 149.5", totalDiff: 2.5 },
  { date: "03022026", startTimeEst: "2100", awayTeam: "idaho", awayBookSpread: 3.5, awayModelSpread: 8, homeTeam: "eastern_washington", homeBookSpread: -3.5, homeModelSpread: -8, bookTotal: 150.5, modelTotal: 150, spreadEdge: "eastern_washington (-3.5)", spreadDiff: 4.5, totalEdge: "UNDER 150.5", totalDiff: 0.5 },
  { date: "03022026", startTimeEst: "2200", awayTeam: "weber_state", awayBookSpread: 4.5, awayModelSpread: 7, homeTeam: "portland_state", homeBookSpread: -4.5, homeModelSpread: -7, bookTotal: 144.5, modelTotal: 147, spreadEdge: "portland_state (-4.5)", spreadDiff: 2.5, totalEdge: "OVER 144.5", totalDiff: 2.5 },
  { date: "03022026", startTimeEst: "2200", awayTeam: "idaho_state", awayBookSpread: 1.5, awayModelSpread: 5, homeTeam: "sacramento_state", homeBookSpread: -1.5, homeModelSpread: -5, bookTotal: 160.5, modelTotal: 158, spreadEdge: "sacramento_state (-1.5)", spreadDiff: 3.5, totalEdge: "UNDER 160.5", totalDiff: 2.5 },
];

export const games: Game[] = rawGames.map((g, i) => ({
  id: `game-${i}`,
  date: formatDate(g.date),
  startTimeEst: formatTime(g.startTimeEst),
  awayTeam: g.awayTeam,
  awayTeamDisplay: formatTeamName(g.awayTeam),
  awayBookSpread: g.awayBookSpread,
  awayModelSpread: g.awayModelSpread,
  homeTeam: g.homeTeam,
  homeTeamDisplay: formatTeamName(g.homeTeam),
  homeBookSpread: g.homeBookSpread,
  homeModelSpread: g.homeModelSpread,
  bookTotal: g.bookTotal,
  modelTotal: g.modelTotal,
  spreadEdge: g.spreadEdge,
  spreadDiff: g.spreadDiff,
  totalEdge: g.totalEdge,
  totalDiff: g.totalDiff,
}));

// Team abbreviations for logo display
export const teamAbbrevMap: Record<string, string> = {
  duke: "DUKE",
  nc_state: "NCST",
  iupui: "IUPUI",
  cleveland_state: "CSU",
  montana_state: "MTST",
  northern_arizona: "NAU",
  montana: "MONT",
  northern_colorado: "UNCO",
  iowa_state: "ISU",
  arizona: "ARIZ",
  idaho: "IDHO",
  eastern_washington: "EWU",
  weber_state: "WEBR",
  portland_state: "PSU",
  idaho_state: "IDST",
  sacramento_state: "SACST",
};

// Team colors for logo backgrounds
export const teamColorMap: Record<string, string> = {
  duke: "#003087",
  nc_state: "#CC0000",
  iupui: "#AE0000",
  cleveland_state: "#006747",
  montana_state: "#003875",
  northern_arizona: "#003466",
  montana: "#7A0019",
  northern_colorado: "#003087",
  iowa_state: "#C8102E",
  arizona: "#CC0033",
  idaho: "#B3A369",
  eastern_washington: "#AE0000",
  weber_state: "#492F91",
  portland_state: "#154734",
  idaho_state: "#FF6600",
  sacramento_state: "#043927",
};
