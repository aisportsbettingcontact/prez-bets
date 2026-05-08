/**
 * Resources.tsx — Private RESOURCES page for @prez and @lucianobets only.
 * Fetches Rotogrinders THE BAT X projection tables via /api/rg-proxy and
 * renders them as native styled sortable tables.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
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
} from "lucide-react";

interface RgTableData {
  title: string;
  pageKey: string;
  type: "pitchers" | "hitters";
  updatedAt: string;
  columns: string[];
  rows: Record<string, string>[];
}

type SortDir = "asc" | "desc" | null;

const TABS = [
  { key: "today-pitchers",    label: "Today Pitchers",    short: "T.P" },
  { key: "today-hitters",     label: "Today Hitters",     short: "T.H" },
  { key: "tomorrow-pitchers", label: "Tomorrow Pitchers", short: "TM.P" },
  { key: "tomorrow-hitters",  label: "Tomorrow Hitters",  short: "TM.H" },
] as const;

type TabKey = typeof TABS[number]["key"];

const RG_URLS: Record<TabKey, string> = {
  "today-pitchers":    "https://rotogrinders.com/grids/standard-projections-the-bat-x-3372510#expand",
  "today-hitters":     "https://rotogrinders.com/grids/standard-projections-the-bat-x-hitters-3372512#expand",
  "tomorrow-pitchers": "https://rotogrinders.com/grids/tomorrow-projections-the-bat-x-3375509#expand",
  "tomorrow-hitters":  "https://rotogrinders.com/grids/tomorrow-projections-the-bat-x-hitters-3375510#expand",
};

const KEY_COLS_PITCHERS = new Set(["NAME", "TEAM", "OPP", "IP", "K", "ERA", "FPTS", "W", "WHIP"]);
const KEY_COLS_HITTERS  = new Set(["NAME", "TEAM", "OPP_TM", "POS", "FPTS", "HR", "RBI", "R", "SB", "BA", "WOBA"]);
const ALLOWED = new Set(["prez", "lucianobets"]);

export default function Resources() {
  const { appUser, loading: authLoading } = useAppAuth();
  const [, setLocation] = useLocation();

  const [activeTab, setActiveTab] = useState<TabKey>("today-pitchers");
  const [tableCache, setTableCache] = useState<Partial<Record<TabKey, RgTableData>>>({});
  const [loadingTab, setLoadingTab] = useState<TabKey | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  useEffect(() => {
    if (!authLoading && appUser && !ALLOWED.has(appUser.username)) {
      setLocation("/");
    }
  }, [authLoading, appUser, setLocation]);

  const fetchTab = useCallback(async (tab: TabKey, force = false) => {
    if (!force && tableCache[tab]) return;
    setLoadingTab(tab);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/rg-proxy?page=${tab}`, {
        credentials: "include",
        headers: { "Accept": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data: RgTableData = await res.json();
      setTableCache(prev => ({ ...prev, [tab]: data }));
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoadingTab(null);
    }
  }, [tableCache]);

  useEffect(() => {
    if (appUser && ALLOWED.has(appUser.username)) {
      fetchTab(activeTab);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, appUser]);

  useEffect(() => {
    setSearch("");
    setSortCol(null);
    setSortDir(null);
  }, [activeTab]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      if (sortDir === "asc") { setSortDir("desc"); }
      else if (sortDir === "desc") { setSortCol(null); setSortDir(null); }
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const tableData = tableCache[activeTab];

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

  const keyCols = activeTab.includes("pitcher") ? KEY_COLS_PITCHERS : KEY_COLS_HITTERS;

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

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">

      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0a0a0f]/95 backdrop-blur border-b border-zinc-800 px-4 py-3">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => setLocation("/")} className="text-zinc-400 hover:text-white transition-colors">
              ← Feed
            </button>
            <span className="text-zinc-600">/</span>
            <span className="text-white font-semibold tracking-wide">RESOURCES</span>
            <span className="text-zinc-600">/</span>
            <span className="text-violet-400 font-medium">THE BAT X</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost" size="sm"
              onClick={() => fetchTab(activeTab, true)}
              disabled={loadingTab === activeTab}
              className="text-zinc-400 hover:text-white gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingTab === activeTab ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => window.open(RG_URLS[activeTab], "_blank")}
              className="text-zinc-400 hover:text-white gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open RG</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="sticky top-[57px] z-20 bg-[#0d0d14] border-b border-zinc-800 px-4">
        <div className="max-w-screen-2xl mx-auto flex items-center gap-1 overflow-x-auto py-1">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.key
                  ? "bg-violet-600 text-white shadow-lg shadow-violet-900/40"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.short}</span>
              {loadingTab === tab.key && <Loader2 className="inline w-3 h-3 ml-1.5 animate-spin" />}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 px-4 py-4 max-w-screen-2xl mx-auto w-full">

        {/* Metadata + Search bar */}
        {tableData && (
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-sm font-semibold text-white">{tableData.title}</h1>
              {tableData.updatedAt && (
                <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
                  Updated: {tableData.updatedAt}
                </Badge>
              )}
              <Badge variant="outline" className="border-zinc-700 text-zinc-400 text-xs">
                {filteredRows.length} / {tableData.rows.length} rows
              </Badge>
            </div>
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
        )}

        {/* Error */}
        {errorMsg && (
          <div className="flex items-center gap-3 bg-red-950/40 border border-red-800/50 rounded-lg px-4 py-3 mb-4">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-red-300 text-sm">{errorMsg}</p>
            <Button variant="ghost" size="sm" onClick={() => fetchTab(activeTab, true)} className="ml-auto text-red-400 hover:text-red-200">
              Retry
            </Button>
          </div>
        )}

        {/* Loading skeleton */}
        {loadingTab === activeTab && !tableData && (
          <div className="space-y-2">
            <div className="h-10 bg-zinc-800/60 rounded animate-pulse" />
            {Array.from({ length: 25 }).map((_, i) => (
              <div key={i} className="h-8 bg-zinc-800/40 rounded animate-pulse" style={{ opacity: Math.max(0.1, 1 - i * 0.035) }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loadingTab && tableData && tableData.rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-500">
            <AlertTriangle className="w-8 h-8" />
            <p className="text-sm">No projection data found for this page.</p>
            <p className="text-xs text-center max-w-xs">
              The table may not have loaded from Rotogrinders. Try refreshing or opening directly in RG.
            </p>
            <Button variant="outline" size="sm" onClick={() => fetchTab(activeTab, true)} className="mt-2 border-zinc-700 text-white">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
            </Button>
          </div>
        )}

        {/* Data Table */}
        {tableData && tableData.rows.length > 0 && (
          <div className="overflow-auto rounded-lg border border-zinc-800 shadow-2xl">
            <table className="w-full text-xs border-collapse min-w-max">
              <thead>
                <tr className="bg-zinc-900 border-b border-zinc-700">
                  {tableData.columns.map((col, i) => {
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
                          {!isSorted && <ChevronsUpDown className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />}
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
                    className={`border-b border-zinc-800/60 transition-colors hover:bg-zinc-800/40 ${ri % 2 === 0 ? "bg-[#0d0d14]" : "bg-[#0a0a0f]"}`}
                  >
                    {tableData.columns.map((col, ci) => {
                      const val = row[col] ?? "";
                      const isKey  = keyCols.has(col);
                      const isName = col === "NAME";
                      const isTeam = col === "TEAM" || col === "OPP_TM" || col === "OPP";
                      const isFpts = col === "FPTS";
                      const isBool = val === "true" || val === "false";

                      return (
                        <td
                          key={`d-${col}-${ci}`}
                          className={`
                            px-3 py-2 whitespace-nowrap
                            ${isName ? "font-semibold text-white sticky left-0 bg-inherit z-10 min-w-[130px] shadow-[2px_0_8px_rgba(0,0,0,0.4)]" : ""}
                            ${isTeam ? "text-zinc-300 font-medium" : ""}
                            ${isFpts ? "text-emerald-400 font-bold" : ""}
                            ${isKey && !isName && !isFpts ? "text-violet-200" : ""}
                            ${!isKey && !isName && !isFpts ? "text-zinc-400" : ""}
                          `}
                        >
                          {isBool
                            ? (val === "true" ? <span className="text-emerald-400">✔</span> : <span className="text-zinc-700">—</span>)
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
      </main>
    </div>
  );
}
