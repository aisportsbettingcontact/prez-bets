/**
 * BetTracker.tsx — Bet Tracker page.
 *
 * Access: OWNER, ADMIN, HANDICAPPER only.
 * Unauthorized users are redirected to the main feed.
 *
 * Changes vs v1:
 *   - Game slate sourced from Action Network v2 scoreboard API (via betTracker.getSlate)
 *   - $ / Units stake toggle — persisted in localStorage
 *   - Sportsbook field removed
 *   - Full responsive layout: mobile-first single column, tablet/desktop side-by-side
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import type { TrackedBet } from "../../../drizzle/schema";
import { useAppAuth } from "@/_core/hooks/useAppAuth";
import { toast } from "sonner";
import {
  BarChart2, Plus, Trash2, Pencil, Check, X, ChevronDown,
  TrendingUp, TrendingDown, Minus, Clock, ArrowLeft,
  DollarSign, Coins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─── Constants ────────────────────────────────────────────────────────────────

const SPORTS = ["MLB", "NHL", "NBA", "NCAAM"] as const;
type Sport = typeof SPORTS[number];

const BET_TYPES = [
  { value: "ML",     label: "Moneyline" },
  { value: "RL",     label: "Run Line / Puck Line" },
  { value: "OVER",   label: "Over" },
  { value: "UNDER",  label: "Under" },
  { value: "PROP",   label: "Prop" },
  { value: "PARLAY", label: "Parlay" },
  { value: "TEASER", label: "Teaser" },
  { value: "FUTURE", label: "Future" },
  { value: "CUSTOM", label: "Custom" },
] as const;

const RESULT_CONFIG = {
  PENDING: { label: "PENDING", color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",    icon: <Clock className="w-3 h-3" /> },
  WIN:     { label: "WIN",     color: "bg-green-500/15 text-green-400 border-green-500/30",  icon: <TrendingUp className="w-3 h-3" /> },
  LOSS:    { label: "LOSS",    color: "bg-red-500/15 text-red-400 border-red-500/30",         icon: <TrendingDown className="w-3 h-3" /> },
  PUSH:    { label: "PUSH",    color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30", icon: <Minus className="w-3 h-3" /> },
  VOID:    { label: "VOID",    color: "bg-purple-500/15 text-purple-400 border-purple-500/30", icon: <X className="w-3 h-3" /> },
} as const;

type BetResult = keyof typeof RESULT_CONFIG;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format American odds: +145 or -125 */
function fmtOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : String(odds);
}

/** Compute toWin from American odds + risk (in base unit — dollars or units) */
function calcToWin(odds: number, risk: number): number {
  if (!odds || !risk || isNaN(odds) || isNaN(risk)) return 0;
  if (odds >= 100) return parseFloat((risk * (odds / 100)).toFixed(4));
  return parseFloat((risk * (100 / Math.abs(odds))).toFixed(4));
}

/** Format a dollar value: $12.50 */
function fmtDollar(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Format a units value: 1.23u */
function fmtUnits(n: number): string {
  return `${n.toFixed(2)}u`;
}

/** Today's date in YYYY-MM-DD (local) */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface BetForm {
  gameId:   number | null;
  sport:    Sport;
  gameDate: string;
  awayTeam: string;
  homeTeam: string;
  betType:  string;
  pick:     string;
  odds:     string;
  stake:    string;   // dollar amount OR units (depending on stakeMode)
  notes:    string;
}

const defaultForm = (sport: Sport): BetForm => ({
  gameId:   null,
  sport,
  gameDate: todayStr(),
  awayTeam: "",
  homeTeam: "",
  betType:  "ML",
  pick:     "",
  odds:     "",
  stake:    "",
  notes:    "",
});

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color, hidden,
}: { label: string; value: string | number; sub?: string; color?: string; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <div className="bg-white/4 border border-white/8 rounded-lg px-3 py-2.5 flex flex-col gap-0.5 min-w-0">
      <div className={`text-base sm:text-lg font-bold truncate ${color ?? "text-white"}`}>{value}</div>
      <div className="text-[10px] text-zinc-500 tracking-wider uppercase truncate">{label}</div>
      {sub && <div className="text-[10px] text-zinc-600 truncate">{sub}</div>}
    </div>
  );
}

function ResultBadge({ result }: { result: BetResult }) {
  const cfg = RESULT_CONFIG[result];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold tracking-wider ${cfg.color}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BetTracker() {
  const [, setLocation] = useLocation();
  const { appUser: user, loading: authLoading } = useAppAuth();

  // ── Stake mode: "$" or "units" — persisted ────────────────────────────────
  const [stakeMode, setStakeMode] = useState<"$" | "units">(() => {
    try { return (localStorage.getItem("bt_stakeMode") as "$" | "units") ?? "$"; }
    catch { return "$"; }
  });

  const toggleStakeMode = useCallback(() => {
    setStakeMode(prev => {
      const next = prev === "$" ? "units" : "$";
      try { localStorage.setItem("bt_stakeMode", next); } catch {}
      console.log(`[BetTracker] stakeMode toggled: ${prev} → ${next}`);
      return next;
    });
  }, []);

  // ── Access guard ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && user) {
      const role = user.role as string;
      if (!["owner", "admin", "handicapper"].includes(role)) {
        toast.error("Access denied: Handicapper role required");
        setLocation("/");
      }
    }
    if (!authLoading && !user) setLocation("/");
  }, [authLoading, user, setLocation]);

  // ── State ─────────────────────────────────────────────────────────────────
  const [activeSport, setActiveSport] = useState<Sport>("MLB");
  const [filterDate,   setFilterDate]   = useState<string>(todayStr());
  const [filterResult, setFilterResult] = useState<string>("ALL");
  const [form,         setForm]         = useState<BetForm>(defaultForm("MLB"));
  const [editId,       setEditId]       = useState<number | null>(null);
  const [deleteId,     setDeleteId]     = useState<number | null>(null);
  const [showForm,     setShowForm]     = useState(true);

  // Sync form sport when tab changes
  useEffect(() => {
    setForm(prev => ({ ...prev, sport: activeSport }));
  }, [activeSport]);

  // ── tRPC ──────────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();

  const { data: bets = [], isLoading: betsLoading } = trpc.betTracker.list.useQuery(
    filterResult === "ALL"
      ? { sport: activeSport, gameDate: filterDate || undefined }
      : { sport: activeSport, gameDate: filterDate || undefined, result: filterResult as BetResult },
    { enabled: !!user }
  );

  const { data: stats } = trpc.betTracker.getStats.useQuery(
    { sport: activeSport },
    { enabled: !!user }
  );

  const { data: slate = [], isLoading: slateLoading } = trpc.betTracker.getSlate.useQuery(
    { sport: activeSport as "MLB" | "NBA" | "NHL" | "NCAAM", gameDate: form.gameDate },
    {
      enabled: !!user,
      staleTime: 5 * 60 * 1000, // cache 5 min — AN API is stable within a session
    }
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createBet = trpc.betTracker.create.useMutation({
    onSuccess: () => {
      toast.success("Bet tracked successfully");
      setForm(defaultForm(activeSport));
      utils.betTracker.list.invalidate();
      utils.betTracker.getStats.invalidate();
    },
    onError: (err) => toast.error(`Failed to create bet: ${err.message}`),
  });

  const updateBet = trpc.betTracker.update.useMutation({
    onSuccess: () => {
      toast.success("Bet updated");
      setEditId(null);
      utils.betTracker.list.invalidate();
      utils.betTracker.getStats.invalidate();
    },
    onError: (err) => toast.error(`Failed to update bet: ${err.message}`),
  });

  const deleteBet = trpc.betTracker.delete.useMutation({
    onSuccess: () => {
      toast.success("Bet deleted");
      setDeleteId(null);
      utils.betTracker.list.invalidate();
      utils.betTracker.getStats.invalidate();
    },
    onError: (err) => toast.error(`Failed to delete bet: ${err.message}`),
  });

  // ── Derived values ────────────────────────────────────────────────────────
  const toWin = useMemo(() => {
    const odds  = parseInt(form.odds, 10);
    const stake = parseFloat(form.stake);
    return calcToWin(odds, stake);
  }, [form.odds, form.stake]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleGameSelect(gameId: string) {
    if (gameId === "manual") {
      setForm(prev => ({ ...prev, gameId: null, awayTeam: "", homeTeam: "" }));
      return;
    }
    const game = slate.find(g => String(g.id) === gameId);
    if (game) {
      console.log(`[BetTracker] game selected: id=${game.id} ${game.awayTeam} @ ${game.homeTeam} time=${game.gameTime}`);
      setForm(prev => ({
        ...prev,
        gameId:   game.id,
        awayTeam: game.awayTeam,
        homeTeam: game.homeTeam,
      }));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const odds  = parseInt(form.odds, 10);
    const stake = parseFloat(form.stake);

    if (isNaN(odds) || odds === 0)   { toast.error("Enter valid American odds (e.g. -110, +145)"); return; }
    if (isNaN(stake) || stake <= 0)  { toast.error(`Enter a valid ${stakeMode === "$" ? "risk amount" : "unit size"}`); return; }
    if (!form.pick.trim())            { toast.error("Pick description is required"); return; }

    // Convert units → dollars for storage (store raw stake value, stakeMode stored separately)
    const riskVal  = stake;
    const toWinVal = toWin;

    console.log(`[BetTracker] submit: sport=${form.sport} date=${form.gameDate} betType=${form.betType} pick="${form.pick}" odds=${odds} stake=${stake} stakeMode=${stakeMode} toWin=${toWinVal}`);

    createBet.mutate({
      gameId:   form.gameId ?? undefined,
      sport:    form.sport as "MLB" | "NBA" | "NHL" | "NCAAM" | "NFL" | "CUSTOM",
      gameDate: form.gameDate,
      awayTeam: form.awayTeam || undefined,
      homeTeam: form.homeTeam || undefined,
      betType:  form.betType as "ML" | "RL" | "OVER" | "UNDER" | "PROP" | "PARLAY" | "TEASER" | "FUTURE" | "CUSTOM",
      pick:     form.pick.trim(),
      odds,
      risk:     riskVal,
      toWin:    toWinVal,
      notes:    form.notes || undefined,
    });
  }

  function handleResultUpdate(betId: number, result: BetResult) {
    console.log(`[BetTracker] quick result update: betId=${betId} result=${result}`);
    updateBet.mutate({ id: betId, result });
  }

  // ── Format helpers (stake-mode-aware) ─────────────────────────────────────
  const fmtStake = useCallback((val: string | number) => {
    const n = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(n)) return "—";
    return stakeMode === "$" ? fmtDollar(n) : fmtUnits(n);
  }, [stakeMode]);

  const fmtWin = useCallback((val: string | number) => {
    const n = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(n)) return "—";
    return stakeMode === "$" ? fmtDollar(n) : fmtUnits(n);
  }, [stakeMode]);

  // ── Loading / auth guard ──────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">

      {/* ── Sticky Header ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-[#0a0a0a]/95 backdrop-blur border-b border-white/8">

        {/* Brand bar */}
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 border-b border-white/6">
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-sm flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline text-xs">Feed</span>
          </button>

          <div className="flex items-center gap-2 ml-0.5">
            <BarChart2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 flex-shrink-0" />
            <span className="font-bold text-white tracking-tight text-sm sm:text-base">BET TRACKER</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* $ / Units toggle */}
            <button
              onClick={toggleStakeMode}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/10 bg-white/5 hover:bg-white/8 transition-colors text-xs font-semibold"
              title={`Switch to ${stakeMode === "$" ? "Units" : "Dollars"}`}
            >
              {stakeMode === "$"
                ? <><DollarSign className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">$</span></>
                : <><Coins className="w-3 h-3 text-amber-400" /><span className="text-amber-400">Units</span></>
              }
            </button>

            <span className="hidden sm:inline text-[10px] text-zinc-600 uppercase tracking-wider">
              {user?.username}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded border bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-semibold tracking-wider uppercase">
              {user?.role}
            </span>
          </div>
        </div>

        {/* Sport tabs */}
        <div className="flex items-center gap-0 px-2 overflow-x-auto scrollbar-none">
          {SPORTS.map(sport => (
            <button
              key={sport}
              onClick={() => setActiveSport(sport)}
              className={`px-3 sm:px-4 py-2.5 text-[12px] sm:text-[13px] font-semibold tracking-wide whitespace-nowrap transition-colors border-b-2 ${
                activeSport === sport
                  ? "text-white border-emerald-400"
                  : "text-zinc-500 border-transparent hover:text-zinc-300"
              }`}
            >
              {sport}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stats bar ───────────────────────────────────────────────────── */}
      {stats && (
        <div className="px-3 sm:px-4 py-3 border-b border-white/6">
          <div className="max-w-6xl mx-auto grid grid-cols-4 sm:grid-cols-7 gap-2">
            <StatCard label="Total"   value={stats.totalBets} />
            <StatCard label="Wins"    value={stats.wins}     color="text-green-400" />
            <StatCard label="Losses"  value={stats.losses}   color="text-red-400" />
            <StatCard label="Pushes"  value={stats.pushes}   color="text-yellow-400" />
            <StatCard label="Pending" value={stats.pending}  color="text-zinc-400" />
            <StatCard
              label="Net P/L"
              value={stakeMode === "$" ? fmtDollar(stats.netProfit) : fmtUnits(stats.netProfit)}
              color={stats.netProfit >= 0 ? "text-green-400" : "text-red-400"}
            />
            <StatCard
              label="ROI"
              value={`${stats.roi}%`}
              color={stats.roi >= 0 ? "text-green-400" : "text-red-400"}
              sub={stakeMode === "$" ? `on ${fmtDollar(stats.totalRisk)} risked` : `on ${fmtUnits(stats.totalRisk)} risked`}
            />
          </div>
          {/* Mobile: show P/L and ROI on second row */}
          <div className="max-w-6xl mx-auto grid grid-cols-2 gap-2 mt-2 sm:hidden">
            <StatCard
              label="Net P/L"
              value={stakeMode === "$" ? fmtDollar(stats.netProfit) : fmtUnits(stats.netProfit)}
              color={stats.netProfit >= 0 ? "text-green-400" : "text-red-400"}
            />
            <StatCard
              label="ROI"
              value={`${stats.roi}%`}
              color={stats.roi >= 0 ? "text-green-400" : "text-red-400"}
              sub={stakeMode === "$" ? `on ${fmtDollar(stats.totalRisk)} risked` : `on ${fmtUnits(stats.totalRisk)} risked`}
            />
          </div>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4">
        <div className="flex flex-col lg:flex-row gap-4">

          {/* ── LEFT: Bet Entry Form ─────────────────────────────────────── */}
          <div className="w-full lg:w-[360px] lg:flex-shrink-0">
            <div className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">

              {/* Form header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
                <div className="flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-white">Add Bet</span>
                  <span className="text-[10px] text-zinc-600 ml-1">
                    {stakeMode === "$" ? "(dollars)" : "(units)"}
                  </span>
                </div>
                <button
                  onClick={() => setShowForm(v => !v)}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors lg:hidden"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${showForm ? "" : "rotate-180"}`} />
                </button>
              </div>

              {showForm && (
                <form onSubmit={handleSubmit} className="p-4 space-y-3">

                  {/* Game Date */}
                  <div className="space-y-1">
                    <Label className="text-zinc-400 text-[10px] tracking-widest uppercase">Game Date</Label>
                    <Input
                      type="date"
                      value={form.gameDate}
                      onChange={e => setForm(prev => ({
                        ...prev,
                        gameDate: e.target.value,
                        gameId: null,
                        awayTeam: "",
                        homeTeam: "",
                      }))}
                      className="bg-white/5 border-white/10 text-white text-sm h-9"
                    />
                  </div>

                  {/* Matchup — Action Network slate */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-zinc-400 text-[10px] tracking-widest uppercase">Matchup</Label>
                      {slateLoading && (
                        <span className="text-[10px] text-zinc-600 animate-pulse">Loading slate...</span>
                      )}
                      {!slateLoading && slate.length > 0 && (
                        <span className="text-[10px] text-zinc-600">{slate.length} games</span>
                      )}
                    </div>
                    <Select
                      value={form.gameId ? String(form.gameId) : "manual"}
                      onValueChange={handleGameSelect}
                    >
                      <SelectTrigger className="bg-white/5 border-white/10 text-white text-sm h-9">
                        <SelectValue placeholder="Select game or enter manually" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1a1a] border-white/10 max-h-72">
                        <SelectItem value="manual">
                          <span className="text-zinc-400 text-xs">Manual entry</span>
                        </SelectItem>
                        {slate.map(g => (
                          <SelectItem key={g.id} value={String(g.id)}>
                            <div className="flex flex-col gap-0">
                              <span className="font-mono text-xs font-semibold text-white">
                                {g.awayTeam} @ {g.homeTeam}
                              </span>
                              <span className="text-zinc-500 text-[10px]">
                                {g.gameTime} EST
                                {g.status !== "scheduled" && (
                                  <span className="ml-1.5 text-amber-400 uppercase">{g.status}</span>
                                )}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                        {!slateLoading && slate.length === 0 && (
                          <div className="px-3 py-2 text-zinc-500 text-xs">No games on Action Network for this date</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Away / Home (manual entry only) */}
                  {!form.gameId && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-zinc-400 text-[10px] tracking-widest uppercase">Away</Label>
                        <Input
                          value={form.awayTeam}
                          onChange={e => setForm(prev => ({ ...prev, awayTeam: e.target.value }))}
                          placeholder="e.g. NYY"
                          className="bg-white/5 border-white/10 text-white text-sm h-9"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-zinc-400 text-[10px] tracking-widest uppercase">Home</Label>
                        <Input
                          value={form.homeTeam}
                          onChange={e => setForm(prev => ({ ...prev, homeTeam: e.target.value }))}
                          placeholder="e.g. BOS"
                          className="bg-white/5 border-white/10 text-white text-sm h-9"
                        />
                      </div>
                    </div>
                  )}

                  {/* Bet Type */}
                  <div className="space-y-1">
                    <Label className="text-zinc-400 text-[10px] tracking-widest uppercase">Bet Type</Label>
                    <Select value={form.betType} onValueChange={v => setForm(prev => ({ ...prev, betType: v }))}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white text-sm h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#1a1a1a] border-white/10">
                        {BET_TYPES.map(bt => (
                          <SelectItem key={bt.value} value={bt.value}>{bt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Pick */}
                  <div className="space-y-1">
                    <Label className="text-zinc-400 text-[10px] tracking-widest uppercase">Pick</Label>
                    <Input
                      value={form.pick}
                      onChange={e => setForm(prev => ({ ...prev, pick: e.target.value }))}
                      placeholder={
                        form.betType === "ML"    ? "e.g. NYY ML +145" :
                        form.betType === "RL"    ? "e.g. NYY -1.5 -110" :
                        form.betType === "OVER"  ? "e.g. OVER 8.5 -110" :
                        form.betType === "UNDER" ? "e.g. UNDER 8.5 -110" :
                        "Describe your pick"
                      }
                      className="bg-white/5 border-white/10 text-white text-sm h-9"
                    />
                  </div>

                  {/* Odds + Stake + To Win */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-zinc-400 text-[10px] tracking-widest uppercase">Odds</Label>
                      <Input
                        value={form.odds}
                        onChange={e => setForm(prev => ({ ...prev, odds: e.target.value }))}
                        placeholder="-110"
                        className="bg-white/5 border-white/10 text-white text-sm h-9 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-zinc-400 text-[10px] tracking-widest uppercase">
                        {stakeMode === "$" ? "Risk $" : "Units"}
                      </Label>
                      <Input
                        value={form.stake}
                        onChange={e => setForm(prev => ({ ...prev, stake: e.target.value }))}
                        placeholder={stakeMode === "$" ? "100" : "1.0"}
                        type="number"
                        min="0.01"
                        step={stakeMode === "$" ? "0.01" : "0.1"}
                        className="bg-white/5 border-white/10 text-white text-sm h-9 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-zinc-400 text-[10px] tracking-widest uppercase">
                        {stakeMode === "$" ? "To Win $" : "To Win u"}
                      </Label>
                      <div className="h-9 flex items-center px-3 bg-white/3 border border-white/8 rounded-md text-sm font-mono text-emerald-400">
                        {toWin > 0
                          ? (stakeMode === "$" ? fmtDollar(toWin) : fmtUnits(toWin))
                          : "—"
                        }
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-1">
                    <Label className="text-zinc-400 text-[10px] tracking-widest uppercase">Notes (optional)</Label>
                    <textarea
                      value={form.notes}
                      onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Model edge, reasoning, context..."
                      rows={2}
                      className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500/50 placeholder:text-zinc-600"
                    />
                  </div>

                  {/* Submit */}
                  <Button
                    type="submit"
                    disabled={createBet.isPending}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-10"
                  >
                    {createBet.isPending ? "Tracking..." : "Track Bet"}
                  </Button>
                </form>
              )}
            </div>
          </div>

          {/* ── RIGHT: Bets List ─────────────────────────────────────────── */}
          <div className="flex-1 min-w-0">

            {/* Filter bar */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Input
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="bg-white/5 border-white/10 text-white text-sm h-8 w-auto min-w-[130px]"
              />
              <Select value={filterResult} onValueChange={setFilterResult}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white text-sm h-8 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-white/10">
                  <SelectItem value="ALL">All Results</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="WIN">Win</SelectItem>
                  <SelectItem value="LOSS">Loss</SelectItem>
                  <SelectItem value="PUSH">Push</SelectItem>
                  <SelectItem value="VOID">Void</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-zinc-500 ml-auto">
                {bets.length} bet{bets.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Bets list */}
            {betsLoading ? (
              <div className="text-center py-12 text-zinc-600 text-sm">Loading bets...</div>
            ) : bets.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-white/8 rounded-xl">
                <BarChart2 className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                <div className="text-zinc-500 text-sm">No bets tracked yet</div>
                <div className="text-zinc-700 text-xs mt-1">Use the form to add your first bet</div>
              </div>
            ) : (
              <div className="space-y-2">
                {bets.map((bet: TrackedBet) => (
                  <BetCard
                    key={bet.id}
                    bet={bet}
                    stakeMode={stakeMode}
                    editId={editId}
                    deleteId={deleteId}
                    onResultChange={handleResultUpdate}
                    onEdit={() => setEditId(bet.id)}
                    onDelete={() => setDeleteId(bet.id)}
                    onConfirmDelete={() => deleteBet.mutate({ id: bet.id })}
                    onCancelDelete={() => setDeleteId(null)}
                    onUpdateBet={(id, patch) => updateBet.mutate({ id, ...patch })}
                    onCancelEdit={() => setEditId(null)}
                    isUpdating={updateBet.isPending}
                    isDeleting={deleteBet.isPending}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── BetCard sub-component ────────────────────────────────────────────────────

interface BetCardProps {
  bet: TrackedBet;
  stakeMode: "$" | "units";
  editId: number | null;
  deleteId: number | null;
  onResultChange: (id: number, result: BetResult) => void;
  onEdit: () => void;
  onDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onUpdateBet: (id: number, patch: { result?: BetResult; notes?: string }) => void;
  onCancelEdit: () => void;
  isUpdating: boolean;
  isDeleting: boolean;
}

function BetCard({
  bet, stakeMode, editId, deleteId,
  onResultChange, onEdit, onDelete, onConfirmDelete, onCancelDelete,
  onUpdateBet, onCancelEdit, isUpdating, isDeleting,
}: BetCardProps) {
  const isEditing   = editId === bet.id;
  const isDeleting_ = deleteId === bet.id;
  const [editNotes,  setEditNotes]  = useState(bet.notes ?? "");
  const [editResult, setEditResult] = useState<BetResult>(bet.result as BetResult);

  const risk  = parseFloat(bet.risk);
  const toWin = parseFloat(bet.toWin);

  const fmtStakeVal = (n: number) =>
    stakeMode === "$" ? fmtDollar(n) : fmtUnits(n);

  return (
    <div className={`bg-white/3 border rounded-xl p-3 transition-colors ${
      isDeleting_ ? "border-red-500/40 bg-red-500/5" : "border-white/8 hover:border-white/12"
    }`}>

      {/* Top row: matchup + result badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-semibold text-zinc-500 tracking-wider uppercase">{bet.sport}</span>
            {(bet.awayTeam || bet.homeTeam) && (
              <>
                <span className="text-zinc-700">·</span>
                <span className="text-xs text-zinc-400 font-mono">
                  {bet.awayTeam}{bet.awayTeam && bet.homeTeam ? " @ " : ""}{bet.homeTeam}
                </span>
              </>
            )}
            <span className="text-zinc-700">·</span>
            <span className="text-[10px] text-zinc-600">{bet.gameDate}</span>
          </div>

          {/* Pick */}
          <div className="text-sm font-semibold text-white mt-0.5 break-words">{bet.pick}</div>

          {/* Odds + Risk + To Win */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-[11px] font-mono text-zinc-300">{fmtOdds(bet.odds)}</span>
            <span className="text-zinc-700">·</span>
            <span className="text-[11px] text-zinc-400">
              {stakeMode === "$" ? "Risk:" : "Stake:"}{" "}
              <span className="text-white font-mono">{fmtStakeVal(risk)}</span>
            </span>
            <span className="text-zinc-700">·</span>
            <span className="text-[11px] text-zinc-400">
              To Win: <span className="text-emerald-400 font-mono">{fmtStakeVal(toWin)}</span>
            </span>
          </div>
        </div>

        <div className="flex-shrink-0">
          <ResultBadge result={bet.result as BetResult} />
        </div>
      </div>

      {/* Notes */}
      {bet.notes && !isEditing && (
        <div className="text-[11px] text-zinc-500 italic mb-2 pl-2 border-l border-white/8">
          {bet.notes}
        </div>
      )}

      {/* Edit mode */}
      {isEditing && (
        <div className="mt-2 space-y-2 border-t border-white/8 pt-2">
          <div className="space-y-1">
            <Label className="text-zinc-500 text-[10px] tracking-widest uppercase">Result</Label>
            <div className="flex gap-1.5 flex-wrap">
              {(["WIN", "LOSS", "PUSH", "PENDING", "VOID"] as BetResult[]).map(r => (
                <button
                  key={r}
                  onClick={() => setEditResult(r)}
                  className={`px-2.5 py-1 rounded text-[10px] font-semibold border transition-colors ${
                    editResult === r
                      ? RESULT_CONFIG[r].color
                      : "border-white/10 text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-zinc-500 text-[10px] tracking-widest uppercase">Notes</Label>
            <textarea
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-white text-xs resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => onUpdateBet(bet.id, { result: editResult, notes: editNotes })}
              disabled={isUpdating}
              className="bg-emerald-600 hover:bg-emerald-500 text-white h-7 text-xs px-3"
            >
              <Check className="w-3 h-3 mr-1" />Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancelEdit}
              className="text-zinc-400 hover:text-white h-7 text-xs px-3"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {isDeleting_ && (
        <div className="mt-2 flex items-center gap-2 border-t border-red-500/20 pt-2">
          <span className="text-xs text-red-400 flex-1">Delete this bet?</span>
          <Button
            size="sm"
            onClick={onConfirmDelete}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-500 text-white h-7 text-xs px-3"
          >
            Delete
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancelDelete}
            className="text-zinc-400 hover:text-white h-7 text-xs px-3"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Action row: quick result + edit/delete */}
      {!isEditing && !isDeleting_ && (
        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-white/6">
          <div className="flex gap-1 flex-1 flex-wrap">
            {(["WIN", "LOSS", "PUSH"] as BetResult[]).map(r => (
              <button
                key={r}
                onClick={() => onResultChange(bet.id, r)}
                disabled={bet.result === r}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                  bet.result === r
                    ? RESULT_CONFIG[r].color
                    : "border-white/10 text-zinc-600 hover:text-zinc-300 hover:border-white/20"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            onClick={onEdit}
            className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
