/**
 * BetTracker.tsx — Handicapper Bet Tracker
 *
 * Form structure (v3 — fully structured, no free-text):
 *   1. DATE        — date picker (defaults to today)
 *   2. GAME        — dropdown populated from Action Network slate (cached server-side)
 *   3. TIMEFRAME   — Full Game | First 5 Innings | First Inning
 *   4. MARKET      — Moneyline | Run Line | Total
 *   5. PICK        — Away team | Home team | Over | Under (context-aware per market)
 *   6. ODDS        — numeric input (American odds)
 *   7. RISK / TO WIN — numeric inputs (auto-calc toWin)
 *   8. NOTES       — optional textarea
 *
 * Stake mode toggle: $ (dollars) ↔ Units — persisted in localStorage.
 *
 * Access: OWNER | ADMIN | HANDICAPPER only.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAppAuth } from "@/_core/hooks/useAppAuth";
import {
  Clock, TrendingUp, TrendingDown, Minus, AlertCircle,
  ChevronLeft, Plus, Pencil, Trash2, CheckCircle2,
  DollarSign, Hash,
} from "lucide-react";
import type { TrackedBet } from "@shared/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const SPORTS = ["MLB", "NHL", "NBA", "NCAAM"] as const;
type Sport = typeof SPORTS[number];

const TIMEFRAMES = [
  { value: "FULL_GAME",    label: "Full Game" },
  { value: "FIRST_5",      label: "First 5 Innings" },
  { value: "FIRST_INNING", label: "First Inning" },
] as const;
type Timeframe = typeof TIMEFRAMES[number]["value"];

const MARKETS = [
  { value: "ML",    label: "Moneyline" },
  { value: "RL",    label: "Run Line" },
  { value: "TOTAL", label: "Total" },
] as const;
type Market = typeof MARKETS[number]["value"];

const RESULTS = ["PENDING", "WIN", "LOSS", "PUSH", "VOID"] as const;
type Result = typeof RESULTS[number];

type StakeMode = "$" | "U";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayEst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function calcToWin(odds: number, risk: number): number {
  if (!odds || !risk) return 0;
  if (odds >= 100) return parseFloat((risk * (odds / 100)).toFixed(2));
  return parseFloat((risk * (100 / Math.abs(odds))).toFixed(2));
}

function fmtOdds(o: number): string {
  return o >= 0 ? `+${o}` : `${o}`;
}

function fmtDollar(n: number): string {
  const abs = Math.abs(n);
  const str = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${str}` : `$${str}`;
}

function fmtUnits(n: number, unitSize: number): string {
  const u = unitSize > 0 ? n / unitSize : n;
  const abs = Math.abs(u);
  const str = abs.toFixed(2);
  return u < 0 ? `-${str}u` : `${str}u`;
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

function resultColor(r: Result): string {
  switch (r) {
    case "WIN":     return "text-green-400";
    case "LOSS":    return "text-red-400";
    case "PUSH":    return "text-yellow-400";
    case "PENDING": return "text-zinc-400";
    case "VOID":    return "text-zinc-500";
  }
}

function resultBg(r: Result): string {
  switch (r) {
    case "WIN":     return "bg-green-500/10 border-green-500/30 text-green-400";
    case "LOSS":    return "bg-red-500/10 border-red-500/30 text-red-400";
    case "PUSH":    return "bg-yellow-500/10 border-yellow-500/30 text-yellow-400";
    case "PENDING": return "bg-zinc-800 border-zinc-700 text-zinc-400";
    case "VOID":    return "bg-zinc-900 border-zinc-800 text-zinc-500";
  }
}

function pickSidesForMarket(market: Market): { value: string; label: string }[] {
  if (market === "TOTAL") {
    return [
      { value: "OVER",  label: "Over" },
      { value: "UNDER", label: "Under" },
    ];
  }
  return [
    { value: "AWAY", label: "Away" },
    { value: "HOME", label: "Home" },
  ];
}

function derivePickLabel(
  pickSide: string,
  market: Market,
  awayTeam: string,
  homeTeam: string,
): string {
  if (market === "TOTAL") return pickSide === "OVER" ? "Over" : "Under";
  const team = pickSide === "AWAY" ? awayTeam : homeTeam;
  return `${team} ${market === "ML" ? "ML" : "RL"}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color,
}: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white/4 border border-white/8 rounded-lg px-3 py-2.5 flex flex-col gap-0.5 min-w-0">
      <div className={`text-base sm:text-lg font-bold truncate ${color ?? "text-white"}`}>{value}</div>
      <div className="text-[10px] text-zinc-500 tracking-wider uppercase truncate">{label}</div>
      {sub && <div className="text-[10px] text-zinc-600 truncate">{sub}</div>}
    </div>
  );
}

// ─── Dropdown ─────────────────────────────────────────────────────────────────

function Select({
  label, value, onChange, options, placeholder, disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] tracking-widest text-zinc-500 uppercase font-medium">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={`
          w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5
          text-sm text-white appearance-none cursor-pointer
          focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500
          disabled:opacity-40 disabled:cursor-not-allowed
          transition-colors
        `}
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function NumInput({
  label, value, onChange, placeholder, prefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  prefix?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] tracking-widest text-zinc-500 uppercase font-medium">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm select-none">{prefix}</span>
        )}
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`
            w-full bg-zinc-900 border border-zinc-700 rounded-lg py-2.5 text-sm text-white
            focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500
            transition-colors
            ${prefix ? "pl-7 pr-3" : "px-3"}
          `}
        />
      </div>
    </div>
  );
}

// ─── BetCard ──────────────────────────────────────────────────────────────────

function BetCard({
  bet,
  stakeMode,
  unitSize,
  onResult,
  onDelete,
  onEdit,
}: {
  bet: TrackedBet;
  stakeMode: StakeMode;
  unitSize: number;
  onResult: (id: number, result: Result) => void;
  onDelete: (id: number) => void;
  onEdit: (bet: TrackedBet) => void;
}) {
  const risk  = parseFloat(bet.risk);
  const toWin = parseFloat(bet.toWin);

  const fmtStake = (n: number) =>
    stakeMode === "$" ? fmtDollar(n) : fmtUnits(n, unitSize);

  const timeframeLabel = bet.timeframe === "FIRST_5" ? "F5"
    : bet.timeframe === "FIRST_INNING" ? "F1"
    : "";

  const marketLabel = bet.market === "ML" ? "ML"
    : bet.market === "RL" ? "RL"
    : "TOT";

  return (
    <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] tracking-widest text-zinc-500 font-medium uppercase">{bet.sport}</span>
            {bet.awayTeam && bet.homeTeam && (
              <span className="text-[10px] text-zinc-600">{bet.awayTeam} @ {bet.homeTeam}</span>
            )}
            {bet.gameDate && (
              <span className="text-[10px] text-zinc-700">{fmtDate(bet.gameDate)}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-white font-bold text-sm">{bet.pick}</span>
            {timeframeLabel && (
              <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-medium">{timeframeLabel}</span>
            )}
            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-medium">{marketLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className={`text-[10px] border rounded-full px-2 py-0.5 font-medium uppercase tracking-wide ${resultBg(bet.result as Result)}`}>
            {bet.result}
          </span>
        </div>
      </div>

      {/* Odds / Stake row */}
      <div className="flex items-center gap-4 text-sm flex-wrap">
        <span className="text-zinc-400 font-mono font-bold">{fmtOdds(bet.odds)}</span>
        <span className="text-zinc-500">Risk: <span className="text-white font-medium">{fmtStake(risk)}</span></span>
        <span className="text-zinc-500">To Win: <span className="text-emerald-400 font-medium">{fmtStake(toWin)}</span></span>
      </div>

      {/* Notes */}
      {bet.notes && (
        <p className="text-xs text-zinc-500 italic border-l-2 border-zinc-700 pl-2">{bet.notes}</p>
      )}

      {/* Action row */}
      <div className="flex items-center justify-between gap-2 pt-1">
        {/* Quick result buttons */}
        <div className="flex gap-1.5 flex-wrap">
          {(["WIN", "LOSS", "PUSH"] as Result[]).map(r => (
            <button
              key={r}
              onClick={() => onResult(bet.id, r)}
              className={`
                text-[10px] font-bold tracking-wider px-2.5 py-1 rounded-md border transition-all
                ${bet.result === r
                  ? resultBg(r)
                  : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 bg-transparent"
                }
              `}
            >
              {r}
            </button>
          ))}
        </div>
        {/* Edit / Delete */}
        <div className="flex gap-1.5">
          <button
            onClick={() => onEdit(bet)}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            title="Edit notes"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(bet.id)}
            className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Delete bet"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BetTracker() {
  const [, navigate] = useLocation();
  const { appUser, loading: authLoading } = useAppAuth();

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !appUser) navigate("/");
  }, [authLoading, appUser, navigate]);

  const role = appUser?.role ?? "user";
  const canAccess = ["owner", "admin", "handicapper"].includes(role);

  // ── State ─────────────────────────────────────────────────────────────────
  const [activeSport, setActiveSport] = useState<Sport>("MLB");
  const [filterDate, setFilterDate]   = useState(todayEst);
  const [filterResult, setFilterResult] = useState<Result | "">("");

  // Stake mode
  const [stakeMode, setStakeMode] = useState<StakeMode>(() => {
    try { return (localStorage.getItem("bt_stakeMode") as StakeMode) || "$"; } catch { return "$"; }
  });
  const [unitSize, setUnitSize] = useState<number>(() => {
    try { return parseFloat(localStorage.getItem("bt_unitSize") || "100"); } catch { return 100; }
  });

  useEffect(() => {
    try { localStorage.setItem("bt_stakeMode", stakeMode); } catch {}
  }, [stakeMode]);
  useEffect(() => {
    try { localStorage.setItem("bt_unitSize", String(unitSize)); } catch {}
  }, [unitSize]);

  // ── Form state ────────────────────────────────────────────────────────────
  const [formDate, setFormDate]           = useState(todayEst);
  const [formAnGameId, setFormAnGameId]   = useState<number | null>(null);
  const [formAwayTeam, setFormAwayTeam]   = useState("");
  const [formHomeTeam, setFormHomeTeam]   = useState("");
  const [formTimeframe, setFormTimeframe] = useState<Timeframe>("FULL_GAME");
  const [formMarket, setFormMarket]       = useState<Market>("ML");
  const [formPickSide, setFormPickSide]   = useState("AWAY");
  const [formOdds, setFormOdds]           = useState("-110");
  const [formRisk, setFormRisk]           = useState("100");
  const [formNotes, setFormNotes]         = useState("");
  const [formError, setFormError]         = useState("");

  // Edit mode
  const [editBet, setEditBet]     = useState<TrackedBet | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editResult, setEditResult] = useState<Result>("PENDING");

  // Delete confirm
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // ── Derived ───────────────────────────────────────────────────────────────
  const oddsNum = parseInt(formOdds, 10);
  const riskNum = parseFloat(formRisk);
  const toWinCalc = useMemo(() => {
    if (!isNaN(oddsNum) && !isNaN(riskNum) && riskNum > 0) {
      return calcToWin(oddsNum, riskNum);
    }
    return null;
  }, [oddsNum, riskNum]);

  const pickSideOptions = useMemo(() => {
    const base = pickSidesForMarket(formMarket);
    if (formAnGameId && formAwayTeam && formHomeTeam && formMarket !== "TOTAL") {
      return [
        { value: "AWAY", label: `${formAwayTeam} (Away)` },
        { value: "HOME", label: `${formHomeTeam} (Home)` },
      ];
    }
    return base;
  }, [formMarket, formAnGameId, formAwayTeam, formHomeTeam]);

  // Reset pickSide when market changes
  useEffect(() => {
    setFormPickSide(formMarket === "TOTAL" ? "OVER" : "AWAY");
  }, [formMarket]);

  const derivedPickLabel = useMemo(() => {
    if (!formAnGameId || !formAwayTeam || !formHomeTeam) return "";
    return derivePickLabel(formPickSide, formMarket, formAwayTeam, formHomeTeam);
  }, [formAnGameId, formAwayTeam, formHomeTeam, formPickSide, formMarket]);

  // ── tRPC queries ──────────────────────────────────────────────────────────
  const slateQuery = trpc.betTracker.getSlate.useQuery(
    { sport: activeSport, gameDate: formDate },
    { enabled: canAccess, staleTime: 4 * 60 * 1000, retry: 1 }
  );

  const listQuery = trpc.betTracker.list.useQuery(
    {
      sport:    activeSport,
      gameDate: filterDate || undefined,
      result:   filterResult || undefined,
    },
    { enabled: canAccess }
  );

  const statsQuery = trpc.betTracker.getStats.useQuery(
    { sport: activeSport, gameDate: filterDate || undefined },
    { enabled: canAccess }
  );

  const utils = trpc.useUtils();
  const invalidate = useCallback(() => {
    utils.betTracker.list.invalidate();
    utils.betTracker.getStats.invalidate();
  }, [utils]);

  const createMut  = trpc.betTracker.create.useMutation({ onSuccess: invalidate });
  const updateMut  = trpc.betTracker.update.useMutation({ onSuccess: invalidate });
  const deleteMut  = trpc.betTracker.delete.useMutation({ onSuccess: invalidate });

  // ── Slate game options ────────────────────────────────────────────────────
  const slateOptions = useMemo(() => {
    const games = slateQuery.data ?? [];
    return games.map(g => ({
      value: String(g.id),
      label: `${g.awayTeam} @ ${g.homeTeam}  ·  ${g.gameTime} ET`,
    }));
  }, [slateQuery.data]);

  // When user picks a game, populate away/home team
  const handleGameSelect = useCallback((idStr: string) => {
    const id = parseInt(idStr, 10);
    setFormAnGameId(id);
    const game = slateQuery.data?.find(g => g.id === id);
    if (game) {
      setFormAwayTeam(game.awayTeam);
      setFormHomeTeam(game.homeTeam);
    }
  }, [slateQuery.data]);

  // When form date changes, reset game selection
  useEffect(() => {
    setFormAnGameId(null);
    setFormAwayTeam("");
    setFormHomeTeam("");
  }, [formDate, activeSport]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setFormError("");

    if (!formAnGameId) { setFormError("Select a game from the slate."); return; }
    if (!formAwayTeam || !formHomeTeam) { setFormError("Game teams not loaded."); return; }
    if (isNaN(oddsNum) || oddsNum === 0) { setFormError("Enter valid American odds."); return; }
    if (isNaN(riskNum) || riskNum <= 0) { setFormError("Enter a valid risk amount."); return; }

    console.log(`[BetTracker][SUBMIT] anGameId=${formAnGameId} sport=${activeSport} date=${formDate} timeframe=${formTimeframe} market=${formMarket} pickSide=${formPickSide} odds=${oddsNum} risk=${riskNum}`);

    await createMut.mutateAsync({
      anGameId:  formAnGameId,
      sport:     activeSport,
      gameDate:  formDate,
      awayTeam:  formAwayTeam,
      homeTeam:  formHomeTeam,
      timeframe: formTimeframe,
      market:    formMarket,
      pickSide:  formPickSide as "AWAY" | "HOME" | "OVER" | "UNDER",
      odds:      oddsNum,
      risk:      riskNum,
      toWin:     toWinCalc ?? undefined,
      notes:     formNotes || undefined,
    });

    // Reset form (keep date + sport)
    setFormAnGameId(null);
    setFormAwayTeam("");
    setFormHomeTeam("");
    setFormTimeframe("FULL_GAME");
    setFormMarket("ML");
    setFormPickSide("AWAY");
    setFormOdds("-110");
    setFormRisk("100");
    setFormNotes("");
  };

  // ── Quick result ──────────────────────────────────────────────────────────
  const handleResult = async (id: number, result: Result) => {
    await updateMut.mutateAsync({ id, result });
  };

  // ── Edit save ─────────────────────────────────────────────────────────────
  const handleEditSave = async () => {
    if (!editBet) return;
    await updateMut.mutateAsync({ id: editBet.id, notes: editNotes, result: editResult });
    setEditBet(null);
  };

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = statsQuery.data ?? {
    totalBets: 0, wins: 0, losses: 0, pushes: 0, pending: 0,
    totalRisk: 0, netProfit: 0, roi: 0,
  };

  const fmtStake = (n: number) =>
    stakeMode === "$" ? fmtDollar(n) : fmtUnits(n, unitSize);

  // ── Access guard ──────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <AlertCircle className="mx-auto text-red-400" size={32} />
          <p className="text-white font-bold">Access Restricted</p>
          <p className="text-zinc-500 text-sm">Bet Tracker is available to Handicappers, Admins, and Owners only.</p>
          <button onClick={() => navigate("/")} className="text-emerald-400 text-sm underline">Go back</button>
        </div>
      </div>
    );
  }

  const bets = listQuery.data ?? [];

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 text-white">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-zinc-950/95 backdrop-blur border-b border-zinc-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/")}
              className="text-zinc-500 hover:text-white transition-colors p-1"
            >
              <ChevronLeft size={18} />
            </button>
            <TrendingUp size={18} className="text-emerald-400" />
            <span className="font-bold tracking-wider text-sm sm:text-base">BET TRACKER</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Stake mode toggle */}
            <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-lg p-0.5">
              <button
                onClick={() => setStakeMode("$")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${stakeMode === "$" ? "bg-emerald-500 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                <DollarSign size={11} />$
              </button>
              <button
                onClick={() => setStakeMode("U")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${stakeMode === "U" ? "bg-emerald-500 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                <Hash size={11} />U
              </button>
            </div>
            {/* Unit size input (only when Units mode) */}
            {stakeMode === "U" && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-zinc-500">1u=</span>
                <input
                  type="number"
                  value={unitSize}
                  onChange={e => setUnitSize(parseFloat(e.target.value) || 100)}
                  className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  min={1}
                />
              </div>
            )}
            {/* User badge */}
            <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full border uppercase ${
              role === "owner" ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
              : role === "admin" ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            }`}>
              {appUser?.username ?? role}
            </span>
          </div>
        </div>

        {/* Sport tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-1 pb-0">
          {SPORTS.map(s => (
            <button
              key={s}
              onClick={() => setActiveSport(s)}
              className={`px-4 py-2.5 text-xs font-bold tracking-wider transition-all border-b-2 ${
                activeSport === s
                  ? "border-emerald-400 text-emerald-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </header>

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <div className="bg-zinc-900/50 border-b border-zinc-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            <StatCard label="Total"   value={stats.totalBets} />
            <StatCard label="Wins"    value={stats.wins}    color="text-green-400" />
            <StatCard label="Losses"  value={stats.losses}  color="text-red-400" />
            <StatCard label="Pushes"  value={stats.pushes}  color="text-yellow-400" />
            {/* Hidden on mobile, shown sm+ */}
            <div className="hidden sm:block">
              <StatCard label="Pending" value={stats.pending} color="text-zinc-400" />
            </div>
            <div className="hidden sm:block">
              <StatCard
                label="Net P/L"
                value={fmtStake(stats.netProfit)}
                color={stats.netProfit >= 0 ? "text-green-400" : "text-red-400"}
              />
            </div>
            <div className="hidden sm:block">
              <StatCard
                label="ROI"
                value={`${stats.roi}%`}
                color={stats.roi >= 0 ? "text-green-400" : "text-red-400"}
                sub={`on ${fmtStake(stats.totalRisk)} risked`}
              />
            </div>
          </div>
          {/* Mobile: P/L + ROI on second row */}
          <div className="grid grid-cols-2 gap-2 mt-2 sm:hidden">
            <StatCard
              label="Net P/L"
              value={fmtStake(stats.netProfit)}
              color={stats.netProfit >= 0 ? "text-green-400" : "text-red-400"}
            />
            <StatCard
              label="ROI"
              value={`${stats.roi}%`}
              color={stats.roi >= 0 ? "text-green-400" : "text-red-400"}
              sub={`on ${fmtStake(stats.totalRisk)} risked`}
            />
          </div>
        </div>
      </div>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">

          {/* ── Add Bet Form ──────────────────────────────────────────────── */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 space-y-4 h-fit">
            <div className="flex items-center gap-2 pb-1 border-b border-zinc-800">
              <Plus size={15} className="text-emerald-400" />
              <h2 className="font-bold text-sm tracking-wider">ADD BET</h2>
            </div>

            {/* DATE */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] tracking-widest text-zinc-500 uppercase font-medium">Date</label>
              <input
                type="date"
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
              />
            </div>

            {/* GAME */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] tracking-widest text-zinc-500 uppercase font-medium">Game</label>
              {slateQuery.isLoading ? (
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5">
                  <div className="w-3 h-3 border border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-zinc-500 text-sm">Loading slate…</span>
                </div>
              ) : slateOptions.length === 0 ? (
                <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-500 text-sm">
                  No {activeSport} games on {fmtDate(formDate)}
                </div>
              ) : (
                <select
                  value={formAnGameId ? String(formAnGameId) : ""}
                  onChange={e => handleGameSelect(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
                >
                  <option value="" disabled>Select game…</option>
                  {slateOptions.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              )}
            </div>

            {/* TIMEFRAME */}
            <Select
              label="Timeframe"
              value={formTimeframe}
              onChange={v => setFormTimeframe(v as Timeframe)}
              options={TIMEFRAMES.map(t => ({ value: t.value, label: t.label }))}
            />

            {/* MARKET */}
            <Select
              label="Market"
              value={formMarket}
              onChange={v => setFormMarket(v as Market)}
              options={MARKETS.map(m => ({ value: m.value, label: m.label }))}
            />

            {/* PICK */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] tracking-widest text-zinc-500 uppercase font-medium">Pick</label>
              <select
                value={formPickSide}
                onChange={e => setFormPickSide(e.target.value)}
                disabled={!formAnGameId}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}
              >
                {pickSideOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {derivedPickLabel && (
                <div className="flex items-center gap-1.5 mt-1">
                  <CheckCircle2 size={11} className="text-emerald-400" />
                  <span className="text-xs text-emerald-400 font-medium">{derivedPickLabel}</span>
                </div>
              )}
            </div>

            {/* ODDS + RISK + TO WIN */}
            <div className="grid grid-cols-3 gap-3">
              <NumInput
                label="Odds"
                value={formOdds}
                onChange={setFormOdds}
                placeholder="-110"
              />
              <NumInput
                label={stakeMode === "$" ? "Risk $" : "Risk (u)"}
                value={formRisk}
                onChange={setFormRisk}
                placeholder="100"
              />
              <div className="flex flex-col gap-1">
                <label className="text-[10px] tracking-widest text-zinc-500 uppercase font-medium">
                  {stakeMode === "$" ? "To Win $" : "To Win (u)"}
                </label>
                <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm font-mono text-emerald-400 min-h-[42px] flex items-center">
                  {toWinCalc !== null
                    ? (stakeMode === "$" ? fmtDollar(toWinCalc) : fmtUnits(toWinCalc, unitSize))
                    : <span className="text-zinc-600">—</span>
                  }
                </div>
              </div>
            </div>

            {/* NOTES */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] tracking-widest text-zinc-500 uppercase font-medium">Notes (optional)</label>
              <textarea
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="Model edge, reasoning, context…"
                rows={2}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors placeholder:text-zinc-600"
              />
            </div>

            {/* Error */}
            {formError && (
              <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <AlertCircle size={13} />
                {formError}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={createMut.isPending || !formAnGameId}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-sm tracking-wider transition-all"
            >
              {createMut.isPending ? "Saving…" : "TRACK BET"}
            </button>
          </div>

          {/* ── Bets List ─────────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Filter bar */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] tracking-widest text-zinc-500 uppercase font-medium">Filter Date</label>
                <input
                  type="date"
                  value={filterDate}
                  onChange={e => setFilterDate(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] tracking-widest text-zinc-500 uppercase font-medium">Result</label>
                <select
                  value={filterResult}
                  onChange={e => setFilterResult(e.target.value as Result | "")}
                  className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: "28px" }}
                >
                  <option value="">All Results</option>
                  {RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="ml-auto text-xs text-zinc-500 self-end pb-2">
                {bets.length} bet{bets.length !== 1 ? "s" : ""}
              </div>
            </div>

            {/* Bet cards */}
            {listQuery.isLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : bets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
                <Clock size={28} className="text-zinc-700" />
                <p className="text-zinc-500 text-sm">No bets tracked yet for {activeSport} on {fmtDate(filterDate)}.</p>
                <p className="text-zinc-600 text-xs">Use the form to add your first bet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {bets.map((bet: TrackedBet) => (
                  <BetCard
                    key={bet.id}
                    bet={bet}
                    stakeMode={stakeMode}
                    unitSize={unitSize}
                    onResult={handleResult}
                    onDelete={id => setDeleteId(id)}
                    onEdit={b => { setEditBet(b); setEditNotes(b.notes ?? ""); setEditResult(b.result as Result); }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Edit modal ──────────────────────────────────────────────────────── */}
      {editBet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-sm tracking-wider">EDIT BET</h3>
            <div className="text-xs text-zinc-400">{editBet.pick} · {fmtOdds(editBet.odds)}</div>

            <Select
              label="Result"
              value={editResult}
              onChange={v => setEditResult(v as Result)}
              options={RESULTS.map(r => ({ value: r, label: r }))}
            />

            <div className="flex flex-col gap-1">
              <label className="text-[10px] tracking-widest text-zinc-500 uppercase font-medium">Notes</label>
              <textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                rows={3}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setEditBet(null)}
                className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 text-sm font-medium hover:border-zinc-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={updateMut.isPending}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold transition-colors disabled:opacity-40"
              >
                {updateMut.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ────────────────────────────────────────────── */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-xs space-y-4 text-center">
            <Trash2 size={24} className="mx-auto text-red-400" />
            <p className="font-bold text-sm">Delete this bet?</p>
            <p className="text-zinc-500 text-xs">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 text-sm font-medium hover:border-zinc-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await deleteMut.mutateAsync({ id: deleteId });
                  setDeleteId(null);
                }}
                disabled={deleteMut.isPending}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-sm font-bold transition-colors disabled:opacity-40"
              >
                {deleteMut.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mutation error toast ────────────────────────────────────────────── */}
      {(createMut.isError || updateMut.isError || deleteMut.isError) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 text-white text-xs font-medium px-4 py-2.5 rounded-full flex items-center gap-2 shadow-lg">
          <AlertCircle size={13} />
          {(createMut.error ?? updateMut.error ?? deleteMut.error)?.message ?? "An error occurred"}
        </div>
      )}
    </div>
  );
}
