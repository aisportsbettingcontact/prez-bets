/**
 * Resources.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Private RESOURCES page — accessible ONLY to @prez and @lucianobets.
 *
 * Renders 4 Rotogrinders THE BAT X projection tabs via server-side proxy:
 *   1. Today — Pitchers
 *   2. Today — Hitters
 *   3. Tomorrow — Pitchers
 *   4. Tomorrow — Hitters
 *
 * Access control is enforced at two layers:
 *   - Frontend: redirects to /feed if user is not in the allowlist
 *   - Backend: /api/rg-proxy returns 403 for any non-allowlisted user
 */

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAppAuth } from "@/_core/hooks/useAppAuth";
import { Loader2, ExternalLink, RefreshCw, ChevronDown } from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_USERNAMES = new Set(["prez", "lucianobets"]);

type PageKey = "today-pitchers" | "today-hitters" | "tomorrow-pitchers" | "tomorrow-hitters";

interface Tab {
  key: PageKey;
  label: string;
  sublabel: string;
  rgUrl: string;
}

const TABS: Tab[] = [
  {
    key: "today-pitchers",
    label: "Today",
    sublabel: "Pitchers",
    rgUrl: "https://rotogrinders.com/grids/standard-projections-the-bat-x-3372510",
  },
  {
    key: "today-hitters",
    label: "Today",
    sublabel: "Hitters",
    rgUrl: "https://rotogrinders.com/grids/standard-projections-the-bat-x-hitters-3372512",
  },
  {
    key: "tomorrow-pitchers",
    label: "Tomorrow",
    sublabel: "Pitchers",
    rgUrl: "https://rotogrinders.com/grids/tomorrow-projections-the-bat-x-3375509",
  },
  {
    key: "tomorrow-hitters",
    label: "Tomorrow",
    sublabel: "Hitters",
    rgUrl: "https://rotogrinders.com/grids/tomorrow-projections-the-bat-x-hitters-3375510",
  },
];

// ─── Proxy URL builder ────────────────────────────────────────────────────────

function proxyUrl(pageKey: PageKey): string {
  return `/api/rg-proxy?page=${pageKey}&_t=${Date.now()}`;
}

// ─── ProxyFrame component ─────────────────────────────────────────────────────

interface ProxyFrameProps {
  pageKey: PageKey;
  refreshKey: number;
}

function ProxyFrame({ pageKey, refreshKey }: ProxyFrameProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const url = `${proxyUrl(pageKey)}&_r=${refreshKey}`;

  useEffect(() => {
    setStatus("loading");
    setErrorMsg("");
  }, [pageKey, refreshKey]);

  return (
    <div className="relative w-full h-full min-h-[calc(100vh-160px)]">
      {/* Loading overlay */}
      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-10 gap-3">
          <Loader2 className="w-7 h-7 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Loading Rotogrinders projections...</p>
        </div>
      )}

      {/* Error state */}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-10 gap-4">
          <div className="flex flex-col items-center gap-2 max-w-sm text-center">
            <p className="text-sm font-semibold text-destructive">Failed to load projections</p>
            <p className="text-xs text-muted-foreground">{errorMsg || "The Rotogrinders proxy returned an error."}</p>
          </div>
        </div>
      )}

      {/* Proxy iframe */}
      <iframe
        ref={iframeRef}
        src={url}
        className="w-full border-0 bg-white"
        style={{
          height: "calc(100vh - 160px)",
          minHeight: 600,
          display: status === "error" ? "none" : "block",
        }}
        title={`Rotogrinders — ${pageKey}`}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        onLoad={() => setStatus("loaded")}
        onError={() => {
          setStatus("error");
          setErrorMsg("Network error or proxy unavailable.");
        }}
      />
    </div>
  );
}

// ─── Main Resources page ──────────────────────────────────────────────────────

export default function Resources() {
  const [, setLocation] = useLocation();
  const { appUser, loading } = useAppAuth();
  const [activeTab, setActiveTab] = useState<PageKey>("today-pitchers");
  const [refreshKey, setRefreshKey] = useState(0);
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(false);

  // ── Access control: redirect non-allowlisted users ────────────────────────
  useEffect(() => {
    if (!loading && appUser && !ALLOWED_USERNAMES.has(appUser.username)) {
      console.warn(`[Resources] Access denied for @${appUser.username} — redirecting to /feed`);
      setLocation("/feed");
    }
    if (!loading && !appUser) {
      setLocation("/feed");
    }
  }, [loading, appUser, setLocation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-7 h-7 text-primary animate-spin" />
      </div>
    );
  }

  if (!appUser || !ALLOWED_USERNAMES.has(appUser.username)) {
    return null; // redirect in progress
  }

  const activeTabMeta = TABS.find(t => t.key === activeTab)!;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur"
        style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04)" }}
      >
        <div className="flex items-center justify-between px-3 sm:px-4 h-12">
          {/* Left: back + title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setLocation("/feed")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 flex items-center gap-1"
            >
              ← Feed
            </button>
            <span className="text-muted-foreground/40 text-xs shrink-0">|</span>
            <span className="text-xs font-bold tracking-widest uppercase text-foreground truncate">
              RESOURCES
            </span>
            <span className="text-[10px] text-muted-foreground/50 font-mono shrink-0">
              THE BAT X
            </span>
          </div>

          {/* Right: refresh + open in RG */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setRefreshKey(k => k + 1)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Refresh projections"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <a
              href={activeTabMeta.rgUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Open on Rotogrinders"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open RG</span>
            </a>
          </div>
        </div>

        {/* ── Tab bar (desktop) ──────────────────────────────────────────────── */}
        <div className="hidden sm:flex items-center gap-0 px-3 sm:px-4 border-t border-border/50">
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`
                  relative flex flex-col items-start px-4 py-2.5 text-xs transition-colors
                  ${isActive
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground font-normal"
                  }
                `}
              >
                <span className="text-[10px] uppercase tracking-widest opacity-60">{tab.label}</span>
                <span className="text-sm font-bold leading-tight">{tab.sublabel}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* ── Tab selector (mobile dropdown) ────────────────────────────────── */}
        <div className="sm:hidden px-3 py-2 border-t border-border/50">
          <button
            type="button"
            onClick={() => setMobileDropdownOpen(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-secondary text-sm font-semibold text-foreground"
          >
            <span>
              <span className="text-muted-foreground text-xs mr-1.5">{activeTabMeta.label}</span>
              {activeTabMeta.sublabel}
            </span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${mobileDropdownOpen ? "rotate-180" : ""}`} />
          </button>
          {mobileDropdownOpen && (
            <div className="mt-1 rounded-lg border border-border bg-popover overflow-hidden shadow-lg">
              {TABS.map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => { setActiveTab(tab.key); setMobileDropdownOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors
                    ${activeTab === tab.key
                      ? "bg-primary/10 text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                >
                  <span className="text-xs text-muted-foreground w-14 shrink-0">{tab.label}</span>
                  <span className="font-semibold">{tab.sublabel}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Proxy iframe content ─────────────────────────────────────────────── */}
      <div className="flex-1">
        <ProxyFrame pageKey={activeTab} refreshKey={refreshKey} />
      </div>
    </div>
  );
}
