/**
 * Resources.tsx — Private RESOURCES page for @prez and @lucianobets only.
 *
 * Features:
 *  1. CSV Export — per-tab download + "Refresh All" global button
 *  2. Column Visibility Groups — toggle named column groups per tab type
 *  3. Staleness Auto-Refresh — re-fetch if cached data is >15 minutes old
 *
 * Diagnostic logging: all state transitions logged to console with structured labels.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useAppAuth } from "@/_core/hooks/useAppAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  ExternalLink,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  AlertTriangle,
  Lock,
  Loader2,
  Download,
  Columns,
  CheckSquare,
  Square,
  RotateCcw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RgTableData {
  title: string;
  pageKey: string;
  type: "pitchers" | "hitters";
  updatedAt: string;
  columns: string[];
  rows: Record<string, string>[];
}

interface CacheEntry {
  data: RgTableData;
  fetchedAt: number; // Unix ms
}

type SortDir = "asc" | "desc" | null;

// ─── Constants ────────────────────────────────────────────────────────────────

const STALE_MS = 15 * 60 * 1000; // 15 minutes

const TABS = [
  { key: "today-pitchers",    label: "Today Pitchers",    short: "T.P",  type: "pitchers" as const },
  { key: "today-hitters",     label: "Today Hitters",     short: "T.H",  type: "hitters"  as const },
  { key: "tomorrow-pitchers", label: "Tomorrow Pitchers", short: "TM.P", type: "pitchers" as const },
  { key: "tomorrow-hitters",  label: "Tomorrow Hitters",  short: "TM.H", type: "hitters"  as const },
] as const;

type TabKey = typeof TABS[number]["key"];

const RG_URLS: Record<TabKey, string> = {
  "today-pitchers":    "https://rotogrinders.com/grids/standard-projections-the-bat-x-3372510#expand",
  "today-hitters":     "https://rotogrinders.com/grids/standard-projections-the-bat-x-hitters-3372512#expand",
  "tomorrow-pitchers": "https://rotogrinders.com/grids/tomorrow-projections-the-bat-x-3375509#expand",
  "tomorrow-hitters":  "https://rotogrinders.com/grids/tomorrow-projections-the-bat-x-hitters-3375510#expand",
};

const ALLOWED = new Set(["prez", "lucianobets"]);

// ─── Column Groups ─────────────────────────────────────────────────────────────

interface ColGroup {
  label: string;
  cols: string[];
  defaultVisible: boolean;
}

const PITCHER_GROUPS: ColGroup[] = [
  {
    label: "Identity",
    defaultVisible: true,
    cols: ["NAME", "TEAM", "OPP", "HAND"],
  },
  {
    label: "Core Stats",
    defaultVisible: true,
    cols: ["IP", "W", "K", "ERA", "WHIP", "FPTS", "QS", "L"],
  },
  {
    label: "DFS Lines",
    defaultVisible: true,
    cols: ["TOMORROW_DK", "TOMORROW_FD", "TOMORROW_YAHOO", "TOMORROW_5X5", "TOMORROW_ESPN", "TOMORROW_YAHOO_SL"],
  },
  {
    label: "Ownership",
    defaultVisible: true,
    cols: ["12TEAM_OWN", "15TEAM_OWN"],
  },
  {
    label: "Context",
    defaultVisible: true,
    cols: ["PARK", "ROOF", "UMPIRE", "PLATOON", "GVF", "HFA", "DH", "TILT_BIAS"],
  },
  {
    label: "Advanced",
    defaultVisible: false,
    cols: ["ER", "H", "HR", "BB", "TBF", "IBB", "HBP", "TB", "SH", "SF", "GIDP", "SB", "CS", "CG", "CGSH"],
  },
  {
    label: "Flags",
    defaultVisible: false,
    cols: ["OPENER", "CATCHER", "BPC", "PPC", "MPC", "2H", "ERROR"],
  },
];

const HITTER_GROUPS: ColGroup[] = [
  {
    label: "Identity",
    defaultVisible: true,
    cols: ["NAME", "TEAM", "OPP_TM", "POS", "HAND"],
  },
  {
    label: "Core Stats",
    defaultVisible: true,
    cols: ["FPTS", "FPTS/$", "HR", "RBI", "R", "SB", "BA", "OBP", "SLG", "WOBA"],
  },
  {
    label: "DFS Salary",
    defaultVisible: true,
    cols: ["SALARY", "LP", "OL", "OD", "IPL", "POWN", "FLOOR", "CEILING", "SLATE"],
  },
  {
    label: "Advanced",
    defaultVisible: false,
    cols: ["CNWOBA", "XWOBA_CS", "XWOBA_LS", "ISO", "PA", "PAVSSP", "PAVSSP%", "OBFPTS", "0%_PH%_FPTS"],
  },
  {
    label: "Context",
    defaultVisible: false,
    cols: ["PITCHER", "CATCHER", "UMPIRE", "PARK", "ROOF", "GVF", "HFA", "PLATOON", "PH%", "COLD", "TILT_BIAS"],
  },
  {
    label: "Raw Counting",
    defaultVisible: false,
    cols: ["AB", "K", "BB", "IBB", "HBP", "H", "1B", "2B", "3B", "HR_DEPENDENCE", "TB", "CS", "SH", "SF", "GIDP"],
  },
  {
    label: "Flags",
    defaultVisible: false,
    cols: ["2H", "ERROR"],
  },
];

function getGroups(type: "pitchers" | "hitters"): ColGroup[] {
  return type === "pitchers" ? PITCHER_GROUPS : HITTER_GROUPS;
}

function buildDefaultVisibility(type: "pitchers" | "hitters"): Record<string, boolean> {
  const groups = getGroups(type);
  const result: Record<string, boolean> = {};
  for (const g of groups) {
    result[g.label] = g.defaultVisible;
  }
  return result;
}

// ─── CSV Utility ──────────────────────────────────────────────────────────────

function exportCsv(tabKey: TabKey, columns: string[], rows: Record<string, string>[]) {
  console.log(`[CSV][STEP] Exporting ${rows.length} rows × ${columns.length} cols for tab="${tabKey}"`);
  const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const header = columns.map(escape).join(",");
  const body = rows.map(r => columns.map(c => escape(r[c] ?? "")).join(",")).join("\n");
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const ts = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "");
  a.href = url;
  a.download = `rg-${tabKey}-${ts}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  console.log(`[CSV][OUTPUT] Downloaded: rg-${tabKey}-${ts}.csv (${(csv.length / 1024).toFixed(1)} KB)`);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Resources() {
  const { appUser, loading: authLoading } = useAppAuth();
  const [, setLocation] = useLocation();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>("today-pitchers");

  // Cache: tab → { data, fetchedAt }
  const [cache, setCache] = useState<Partial<Record<TabKey, CacheEntry>>>({});

  // Loading/error per tab
  const [loadingTabs, setLoadingTabs] = useState<Set<TabKey>>(new Set());
  const [errors, setErrors] = useState<Partial<Record<TabKey, string>>>({});

  // Search + sort
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  // Column visibility: tab → groupLabel → boolean
  const [colVis, setColVis] = useState<Partial<Record<TabKey, Record<string, boolean>>>>({});

  // Column panel open state
  const [colPanelOpen, setColPanelOpen] = useState(false);
  const colPanelRef = useRef<HTMLDivElement>(null);

  // ── Auth guard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && appUser && !ALLOWED.has(appUser.username)) {
      console.warn(`[ACCESS] Denied for user="${appUser.username}" — redirecting to /`);
      setLocation("/");
    }
  }, [authLoading, appUser, setLocation]);

  // ── Fetch function ──────────────────────────────────────────────────────────
  const fetchTab = useCallback(async (tab: TabKey, force = false) => {
    const existing = cache[tab];
    const ageMs = existing ? Date.now() - existing.fetchedAt : Infinity;
    const isStale = ageMs > STALE_MS;

    if (!force && existing && !isStale) {
      console.log(`[CACHE][HIT] tab="${tab}" age=${Math.round(ageMs / 1000)}s — using cached data`);
      return;
    }

    if (force) {
      console.log(`[FETCH][STEP] tab="${tab}" — force refresh requested`);
    } else if (isStale && existing) {
      console.log(`[STALE] tab="${tab}" fetched ${Math.round(ageMs / 60000)}m ago — auto-refreshing`);
    } else {
      console.log(`[FETCH][STEP] tab="${tab}" — initial fetch`);
    }

    setLoadingTabs(prev => new Set([...Array.from(prev), tab]));
    setErrors(prev => ({ ...prev, [tab]: undefined }));

    try {
      const t0 = performance.now();
      const res = await fetch(`/api/rg-proxy?page=${tab}`, {
        credentials: "include",
        headers: { "Accept": "application/json" },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        const msg = (body as { error?: string }).error ?? `HTTP ${res.status}`;
        console.error(`[FETCH][ERROR] tab="${tab}" status=${res.status} error="${msg}"`);
        throw new Error(msg);
      }

      const data: RgTableData = await res.json();
      const elapsed = Math.round(performance.now() - t0);
      console.log(`[FETCH][OUTPUT] tab="${tab}" rows=${data.rows.length} cols=${data.columns.length} elapsed=${elapsed}ms updatedAt="${data.updatedAt}"`);

      setCache(prev => ({
        ...prev,
        [tab]: { data, fetchedAt: Date.now() },
      }));

      // Initialize column visibility for this tab type if not set
      setColVis(prev => {
        if (prev[tab]) return prev;
        const defaults = buildDefaultVisibility(data.type);
        console.log(`[COLVIS][INIT] tab="${tab}" type="${data.type}" groups=${Object.keys(defaults).join(", ")}`);
        return { ...prev, [tab]: defaults };
      });

    } catch (err) {
      const msg = (err as Error).message;
      console.error(`[FETCH][FATAL] tab="${tab}" error="${msg}"`);
      setErrors(prev => ({ ...prev, [tab]: msg }));
    } finally {
      setLoadingTabs(prev => {
        const next = new Set(prev);
        next.delete(tab);
        return next;
      });
    }
  }, [cache]);

  // ── Auto-fetch on tab switch (with staleness check) ─────────────────────────
  useEffect(() => {
    if (appUser && ALLOWED.has(appUser.username)) {
      fetchTab(activeTab);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, appUser]);

  // ── Reset search/sort on tab switch ─────────────────────────────────────────
  useEffect(() => {
    setSearch("");
    setSortCol(null);
    setSortDir(null);
    setColPanelOpen(false);
  }, [activeTab]);

  // ── Refresh All ─────────────────────────────────────────────────────────────
  const refreshAll = useCallback(async () => {
    console.log("[REFRESH_ALL][STEP] Force-refreshing all 4 tabs in parallel");
    await Promise.all(TABS.map(t => fetchTab(t.key, true)));
    console.log("[REFRESH_ALL][OUTPUT] All 4 tabs refreshed");
  }, [fetchTab]);

  // ── Sort handler ─────────────────────────────────────────────────────────────
  const handleSort = (col: string) => {
    if (sortCol === col) {
      if (sortDir === "asc") {
        setSortDir("desc");
        console.log(`[SORT][STATE] col="${col}" dir=desc`);
      } else {
        setSortCol(null); setSortDir(null);
        console.log(`[SORT][STATE] cleared`);
      }
    } else {
      setSortCol(col); setSortDir("asc");
      console.log(`[SORT][STATE] col="${col}" dir=asc`);
    }
  };

  // ── Column visibility helpers ────────────────────────────────────────────────
  const activeTabType = TABS.find(t => t.key === activeTab)!.type;
  const activeGroups = getGroups(activeTabType);
  const activeColVis = colVis[activeTab] ?? buildDefaultVisibility(activeTabType);

  const visibleCols = useMemo(() => {
    const entry = cache[activeTab];
    if (!entry) return [];
    const allCols = entry.data.columns;
    const visibleSet = new Set<string>();
    for (const g of activeGroups) {
      if (activeColVis[g.label]) {
        for (const c of g.cols) visibleSet.add(c);
      }
    }
    // Preserve original column order
    return allCols.filter(c => visibleSet.has(c));
  }, [cache, activeTab, activeGroups, activeColVis]);

  const toggleGroup = (label: string) => {
    const next = !activeColVis[label];
    console.log(`[COLVIS][STEP] tab="${activeTab}" group="${label}" → ${next ? "visible" : "hidden"}`);
    setColVis(prev => ({
      ...prev,
      [activeTab]: { ...(prev[activeTab] ?? buildDefaultVisibility(activeTabType)), [label]: next },
    }));
  };

  const showAllCols = () => {
    console.log(`[COLVIS][STEP] tab="${activeTab}" — show all groups`);
    const all: Record<string, boolean> = {};
    for (const g of activeGroups) all[g.label] = true;
    setColVis(prev => ({ ...prev, [activeTab]: all }));
  };

  const resetColVis = () => {
    console.log(`[COLVIS][STEP] tab="${activeTab}" — reset to defaults`);
    setColVis(prev => ({ ...prev, [activeTab]: buildDefaultVisibility(activeTabType) }));
  };

  // ── Filtered + sorted rows ───────────────────────────────────────────────────
  const tableData = cache[activeTab]?.data;

  const filteredRows = useMemo(() => {
    if (!tableData) return [];
    let rows = tableData.rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(r =>
        (r["NAME"] ?? "").toLowerCase().includes(q) ||
        (r["TEAM"] ?? "").toLowerCase().includes(q) ||
        (r["OPP_TM"] ?? r["OPP"] ?? "").toLowerCase().includes(q)
      );
    }
    if (sortCol && sortDir) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortCol] ?? "";
        const bv = b[sortCol] ?? "";
        const an = parseFloat(av);
        const bn = parseFloat(bv);
        const cmp = (!isNaN(an) && !isNaN(bn)) ? an - bn : av.localeCompare(bv);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [tableData, search, sortCol, sortDir]);

  // Key columns for highlighting
  const KEY_COLS_PITCHERS = new Set(["NAME", "TEAM", "OPP", "IP", "K", "ERA", "FPTS", "W", "WHIP"]);
  const KEY_COLS_HITTERS  = new Set(["NAME", "TEAM", "OPP_TM", "POS", "FPTS", "HR", "RBI", "R", "SB", "BA", "WOBA"]);
  const keyCols = activeTabType === "pitchers" ? KEY_COLS_PITCHERS : KEY_COLS_HITTERS;

  // Staleness display
  const cacheEntry = cache[activeTab];
  const ageMs = cacheEntry ? Date.now() - cacheEntry.fetchedAt : null;
  const ageLabel = ageMs !== null
    ? ageMs < 60_000
      ? `${Math.round(ageMs / 1000)}s ago`
      : `${Math.round(ageMs / 60_000)}m ago`
    : null;
  const isStaleDisplay = ageMs !== null && ageMs > STALE_MS;

  // ── Close col panel on outside click ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colPanelRef.current && !colPanelRef.current.contains(e.target as Node)) {
        setColPanelOpen(false);
      }
    };
    if (colPanelOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [colPanelOpen]);

  // ── Render guards ────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    );
  }

  if (!appUser || !ALLOWED.has(appUser.username)) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center gap-4">
        <Lock className="w-12 h-12 text-red-400" />
        <p className="text-white text-lg font-semibold">Access Denied</p>
        <p className="text-zinc-400 text-sm">This page is restricted to authorized users only.</p>
        <Button variant="outline" onClick={() => setLocation("/")} className="mt-2 border-zinc-700 text-white">
          Return to Feed
        </Button>
      </div>
    );
  }

  const isLoadingActive = loadingTabs.has(activeTab);
  const activeError = errors[activeTab];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-[#0a0a0f]/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4 flex-wrap">

          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => setLocation("/")} className="text-zinc-400 hover:text-white transition-colors">
              ← Feed
            </button>
            <span className="text-zinc-600">/</span>
            <span className="text-white font-semibold tracking-wide">RESOURCES</span>
            <span className="text-zinc-600">/</span>
            <span className="text-violet-400 font-medium">THE BAT X</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">

            {/* Refresh All */}
            <Button
              variant="outline"
              size="sm"
              onClick={refreshAll}
              disabled={loadingTabs.size > 0}
              className="border-zinc-700 text-zinc-300 hover:text-white hover:border-violet-500 gap-1.5 bg-transparent"
              title="Force-refresh all 4 tabs"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loadingTabs.size > 0 ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh All</span>
            </Button>

            {/* Refresh active tab */}
            <Button
              variant="ghost" size="sm"
              onClick={() => fetchTab(activeTab, true)}
              disabled={isLoadingActive}
              className="text-zinc-400 hover:text-white gap-1.5"
              title="Refresh current tab"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingActive ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            {/* Download CSV */}
            <Button
              variant="ghost" size="sm"
              onClick={() => {
                if (tableData && visibleCols.length > 0) {
                  exportCsv(activeTab, visibleCols, filteredRows);
                }
              }}
              disabled={!tableData || filteredRows.length === 0}
              className="text-zinc-400 hover:text-emerald-400 gap-1.5"
              title="Download visible columns as CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CSV</span>
            </Button>

            {/* Open in RG */}
            <Button
              variant="ghost" size="sm"
              onClick={() => window.open(RG_URLS[activeTab], "_blank")}
              className="text-zinc-400 hover:text-white gap-1.5"
              title="Open in Rotogrinders"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open RG</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Tab Bar ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-[57px] z-20 bg-[#0d0d14] border-b border-zinc-800 px-4">
        <div className="max-w-screen-2xl mx-auto flex items-center gap-1 overflow-x-auto py-1">
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            const isLoading = loadingTabs.has(tab.key);
            const hasError = !!errors[tab.key];
            const tabEntry = cache[tab.key];
            const tabAge = tabEntry ? Date.now() - tabEntry.fetchedAt : null;
            const tabStale = tabAge !== null && tabAge > STALE_MS;

            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`
                  relative px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all
                  ${isActive
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-900/40"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                  }
                `}
              >
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.short}</span>
                {isLoading && <Loader2 className="inline w-3 h-3 ml-1.5 animate-spin" />}
                {!isLoading && hasError && <span className="ml-1.5 text-red-400 text-xs">!</span>}
                {!isLoading && !hasError && tabStale && !isActive && (
                  <span className="ml-1.5 text-amber-400 text-xs" title="Data may be stale">↻</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 px-4 py-4 max-w-screen-2xl mx-auto w-full">

        {/* Toolbar: metadata + search + column toggle */}
        {tableData && (
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">

            {/* Left: metadata badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm font-semibold text-white">{tableData.title}</h1>
              {tableData.updatedAt && (
                <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
                  RG: {tableData.updatedAt}
                </Badge>
              )}
              {ageLabel && (
                <Badge
                  variant="outline"
                  className={`text-xs border-zinc-700 ${isStaleDisplay ? "text-amber-400 border-amber-700/50" : "text-zinc-400"}`}
                  title={isStaleDisplay ? "Data is stale — will auto-refresh on next tab switch" : "Data is fresh"}
                >
                  {isStaleDisplay ? "⚠ " : ""}Fetched {ageLabel}
                </Badge>
              )}
              <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
                {filteredRows.length} / {tableData.rows.length} rows
              </Badge>
              <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
                {visibleCols.length} / {tableData.columns.length} cols
              </Badge>
            </div>

            {/* Right: search + columns button */}
            <div className="flex items-center gap-2">

              {/* Column visibility dropdown */}
              <div className="relative" ref={colPanelRef}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setColPanelOpen(p => !p)}
                  className="border-zinc-700 text-zinc-300 hover:text-white hover:border-violet-500 gap-1.5 bg-transparent"
                >
                  <Columns className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Columns</span>
                </Button>

                {colPanelOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-[#13131f] border border-zinc-700 rounded-lg shadow-2xl shadow-black/60 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Column Groups</span>
                      <div className="flex gap-1">
                        <button
                          onClick={showAllCols}
                          className="text-xs text-violet-400 hover:text-violet-300 transition-colors px-1"
                          title="Show all columns"
                        >
                          All
                        </button>
                        <span className="text-zinc-600">|</span>
                        <button
                          onClick={resetColVis}
                          className="text-xs text-zinc-400 hover:text-white transition-colors px-1"
                          title="Reset to defaults"
                        >
                          Reset
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {activeGroups.map(g => {
                        const isVis = activeColVis[g.label] ?? g.defaultVisible;
                        const colsInData = g.cols.filter(c => tableData.columns.includes(c));
                        return (
                          <button
                            key={g.label}
                            onClick={() => toggleGroup(g.label)}
                            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-zinc-800 transition-colors group"
                          >
                            <div className="flex items-center gap-2">
                              {isVis
                                ? <CheckSquare className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                                : <Square className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                              }
                              <span className={`text-sm ${isVis ? "text-white" : "text-zinc-500"}`}>{g.label}</span>
                            </div>
                            <span className="text-xs text-zinc-600 group-hover:text-zinc-400">{colsInData.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search name / team..."
                  className="pl-8 h-8 text-sm bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500 focus:border-violet-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Error banner */}
        {activeError && (
          <div className="flex items-center gap-3 bg-red-950/40 border border-red-800/50 rounded-lg px-4 py-3 mb-4">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-red-300 text-sm">{activeError}</p>
            <Button
              variant="ghost" size="sm"
              onClick={() => fetchTab(activeTab, true)}
              className="ml-auto text-red-400 hover:text-red-200"
            >
              Retry
            </Button>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoadingActive && !tableData && (
          <div className="space-y-2">
            <div className="h-10 bg-zinc-800/60 rounded animate-pulse" />
            {Array.from({ length: 25 }).map((_, i) => (
              <div
                key={i}
                className="h-8 bg-zinc-800/40 rounded animate-pulse"
                style={{ opacity: Math.max(0.1, 1 - i * 0.035) }}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoadingActive && tableData && tableData.rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-500">
            <AlertTriangle className="w-8 h-8" />
            <p className="text-sm">No projection data found for this page.</p>
            <p className="text-xs text-center max-w-xs">
              The table may not have loaded from Rotogrinders. Try refreshing or opening directly in RG.
            </p>
            <Button
              variant="outline" size="sm"
              onClick={() => fetchTab(activeTab, true)}
              className="mt-2 border-zinc-700 text-white"
            >
              Retry
            </Button>
          </div>
        )}

        {/* No visible columns state */}
        {!isLoadingActive && tableData && tableData.rows.length > 0 && visibleCols.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-500">
            <Columns className="w-8 h-8" />
            <p className="text-sm">All column groups are hidden.</p>
            <Button
              variant="outline" size="sm"
              onClick={showAllCols}
              className="mt-2 border-zinc-700 text-white"
            >
              Show All Columns
            </Button>
          </div>
        )}

        {/* Data Table */}
        {tableData && tableData.rows.length > 0 && visibleCols.length > 0 && (
          <div className="overflow-auto rounded-lg border border-zinc-800 shadow-2xl">
            <table className="w-full text-xs border-collapse min-w-max">
              <thead>
                <tr className="bg-zinc-900 border-b border-zinc-700">
                  {visibleCols.map((col, i) => {
                    const isKey = keyCols.has(col);
                    const isSorted = sortCol === col;
                    return (
                      <th
                        key={`h-${col}-${i}`}
                        onClick={() => handleSort(col)}
                        className={`
                          px-3 py-2.5 text-left font-semibold cursor-pointer select-none whitespace-nowrap
                          transition-colors group
                          ${isKey ? "text-violet-300 bg-violet-950/30 hover:bg-violet-950/50" : "text-zinc-300 hover:bg-zinc-800"}
                          ${isSorted ? "bg-zinc-800" : ""}
                        `}
                      >
                        <span className="flex items-center gap-1">
                          {col}
                          {isSorted && sortDir === "asc"  && <ChevronUp   className="w-3 h-3 text-violet-400" />}
                          {isSorted && sortDir === "desc" && <ChevronDown  className="w-3 h-3 text-violet-400" />}
                          {!isSorted && (
                            <ChevronsUpDown className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, ri) => (
                  <tr
                    key={ri}
                    className={`
                      border-b border-zinc-800/60 transition-colors hover:bg-zinc-800/40
                      ${ri % 2 === 0 ? "bg-[#0d0d14]" : "bg-[#0a0a0f]"}
                    `}
                  >
                    {visibleCols.map((col, ci) => {
                      const val = row[col] ?? "";
                      const isKey  = keyCols.has(col);
                      const isName = col === "NAME";
                      const isTeam = col === "TEAM" || col === "OPP_TM" || col === "OPP";
                      const isFpts = col === "FPTS";
                      const isBool = val === "true" || val === "false";
                      const isSalary = col === "SALARY";

                      return (
                        <td
                          key={`d-${col}-${ci}`}
                          className={`
                            px-3 py-2 whitespace-nowrap
                            ${isName ? "font-semibold text-white sticky left-0 bg-inherit z-10 min-w-[130px] shadow-[2px_0_8px_rgba(0,0,0,0.4)]" : ""}
                            ${isTeam ? "text-zinc-200 font-medium" : ""}
                            ${isFpts ? "text-emerald-400 font-bold" : ""}
                            ${isSalary ? "text-sky-300 font-medium" : ""}
                            ${isKey && !isName && !isFpts && !isSalary ? "text-violet-200" : ""}
                            ${!isKey && !isName && !isFpts && !isSalary ? "text-zinc-300" : ""}
                          `}
                        >
                          {isBool
                            ? (val === "true"
                              ? <span className="text-emerald-400 font-bold">✔</span>
                              : <span className="text-zinc-700">—</span>)
                            : (val || <span className="text-zinc-700">—</span>)
                          }
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Bottom padding */}
        <div className="h-8" />
      </main>
    </div>
  );
}
