import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { User, LogOut, BarChart3, Loader2, Crown, Send, Search, X } from "lucide-react";
import { GameCard } from "@/components/GameCard";
import { AgeModal } from "@/components/AgeModal";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useAppAuth } from "@/_core/hooks/useAppAuth";
import { TEAM_NAMES } from "@/lib/teamNicknames";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [showAgeModal, setShowAgeModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [selectedSport] = useState("NCAAM");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const { user } = useAuth();
  const { appUser, isOwner, loading: appAuthLoading, refetch: refetchAppUser } = useAppAuth();

  // Redirect to home (paywall) if not authenticated as app user
  useEffect(() => {
    if (!appAuthLoading && !appUser) {
      setLocation("/");
    }
  }, [appUser, appAuthLoading, setLocation]);

  // Show Age modal if user has not yet accepted terms (DB-backed)
  useEffect(() => {
    if (!appAuthLoading && appUser && !appUser.termsAccepted) {
      setShowAgeModal(true);
    }
  }, [appAuthLoading, appUser]);

  const acceptTermsMutation = trpc.appUsers.acceptTerms.useMutation({
    onSuccess: () => {
      refetchAppUser();
      setShowAgeModal(false);
    },
  });

  const appLogoutMutation = trpc.appUsers.logout.useMutation({
    onSuccess: () => {
      setLocation("/");
      toast.success("Signed out");
    },
  });
  const appLogout = () => appLogoutMutation.mutate();

  // ─── Games query ──────────────────────────────────────────────────────────
  const { data: games, isLoading: gamesLoading } = trpc.games.list.useQuery(
    { sport: selectedSport },
    { refetchOnWindowFocus: false }
  );

  // ─── ESPN teams batch query (one call for all logos) ─────────────────────
  const { data: espnTeams } = trpc.teams.list.useQuery(
    { sport: selectedSport },
    { refetchOnWindowFocus: false, staleTime: 1000 * 60 * 60 }
  );

  // Build slug → logoUrl map
  const logoMap = (espnTeams ?? []).reduce<Record<string, string>>((acc, t) => {
    acc[t.slug] = t.logoUrl;
    return acc;
  }, {});

  const handleAccept = () => {
    acceptTermsMutation.mutate();
  };

  const handleCloseModal = () => {
    appLogout();
  };

  const handleLogout = () => {
    appLogout();
  };

  // ─── Search filtering ─────────────────────────────────────────────────────
  const filteredGames = useMemo(() => {
    if (!games) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return games;

    return games.filter((game) => {
      if (!game) return false;
      const awayNames = TEAM_NAMES[game.awayTeam];
      const homeNames = TEAM_NAMES[game.homeTeam];

      const awaySchool = (awayNames?.school ?? game.awayTeam).toLowerCase();
      const awayNick = (awayNames?.nickname ?? "").toLowerCase();
      const homeSchool = (homeNames?.school ?? game.homeTeam).toLowerCase();
      const homeNick = (homeNames?.nickname ?? "").toLowerCase();
      const awaySlug = game.awayTeam.toLowerCase().replace(/_/g, " ");
      const homeSlug = game.homeTeam.toLowerCase().replace(/_/g, " ");

      return (
        awaySchool.includes(q) ||
        awayNick.includes(q) ||
        awaySlug.includes(q) ||
        homeSchool.includes(q) ||
        homeNick.includes(q) ||
        homeSlug.includes(q)
      );
    });
  }, [games, searchQuery]);

  // Group filtered games by date
  const gamesByDate = filteredGames.reduce<Record<string, typeof filteredGames>>((acc, game) => {
    const date = game!.gameDate;
    if (!acc[date]) acc[date] = [];
    acc[date]!.push(game!);
    return acc;
  }, {});

  const sortedDates = Object.keys(gamesByDate).sort((a, b) => a.localeCompare(b));

  function formatDateHeader(dateStr: string): string {
    try {
      const d = new Date(dateStr + "T00:00:00");
      return d.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {showAgeModal && (
        <AgeModal onAccept={handleAccept} onClose={handleCloseModal} />
      )}

      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        {/* Top row: centered brand group | search + user icon right */}
        <div className="relative flex items-center px-4 py-2 max-w-3xl mx-auto">

          {/* Centered brand group: icon + PREZ BETS + AI MODEL PROJECTIONS */}
          {!searchOpen && (
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 pointer-events-none">
              <BarChart3
                className="flex-shrink-0 text-primary"
                style={{ width: "clamp(14px, 2.5vw, 24px)", height: "clamp(14px, 2.5vw, 24px)" }}
              />
              <span
                className="font-black text-white whitespace-nowrap"
                style={{ fontSize: "clamp(14px, 3.2vw, 26px)", letterSpacing: "0.08em" }}
              >
                PREZ BETS
              </span>
              <span className="text-border" style={{ fontSize: "clamp(10px, 2vw, 14px)" }}>|</span>
              <span
                className="font-medium whitespace-nowrap"
                style={{ fontSize: "clamp(12px, 2.6vw, 21px)", letterSpacing: "0.1em", color: "#9CA3AF" }}
              >
                AI MODEL PROJECTIONS
              </span>
            </div>
          )}

          {/* Search input (expands when open) */}
          {searchOpen && (
            <div className="flex-1 flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Search teams, schools, nicknames…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Invisible spacer to push icons to the right */}
          {!searchOpen && <div className="flex-1" />}

          {/* Right icons: search toggle + user menu */}
          <div className="flex-shrink-0 flex items-center gap-2">
            {/* Search toggle */}
            <button
              onClick={() => {
                if (searchOpen) {
                  setSearchOpen(false);
                  setSearchQuery("");
                } else {
                  setSearchOpen(true);
                }
              }}
              className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center hover:bg-accent transition-colors"
              title="Search games"
            >
              {searchOpen ? (
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              ) : (
                <Search className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </button>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center hover:bg-accent transition-colors"
                title={user ? user.name ?? "Account" : "Sign in"}
              >
                <User className="w-3.5 h-3.5 text-muted-foreground" />
              </button>

              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 top-9 z-50 w-48 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
                    {appUser ? (
                      <>
                        <div className="px-3 py-2.5 border-b border-border">
                          <div className="flex items-center gap-1.5">
                            {appUser.role === "owner" && <Crown className="w-3 h-3 text-yellow-400 flex-shrink-0" />}
                            <p className="text-xs font-semibold text-foreground truncate">@{appUser.username}</p>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">{appUser.email}</p>
                        </div>
                        {isOwner && (
                          <>
                            <button
                              onClick={() => { setShowUserMenu(false); setLocation("/admin/publish"); }}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            >
                              <Send className="w-3.5 h-3.5 text-green-400" />
                              Publish Projections
                            </button>
                            <button
                              onClick={() => { setShowUserMenu(false); setLocation("/admin/users"); }}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            >
                              <Crown className="w-3.5 h-3.5 text-yellow-400" />
                              User Management
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => { setShowUserMenu(false); appLogout(); }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          Sign out
                        </button>
                      </>
                    ) : user ? (
                      <>
                        <div className="px-3 py-2.5 border-b border-border">
                          <p className="text-xs font-semibold text-foreground truncate">{user.name ?? "User"}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{user.email ?? ""}</p>
                        </div>
                        <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          Sign out
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => { setShowUserMenu(false); setLocation("/login"); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        Sign in
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Search results count bar (shown when search is active) */}
        {searchOpen && searchQuery && (
          <div className="px-4 pb-1.5 max-w-3xl mx-auto">
            <p className="text-[11px] text-muted-foreground">
              {filteredGames.length === 0
                ? "No games found"
                : `${filteredGames.length} game${filteredGames.length === 1 ? "" : "s"} found`}
            </p>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto pb-8">
        {gamesLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Loading projections…</p>
          </div>
        ) : searchOpen && searchQuery && filteredGames.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-4">
            <Search className="w-10 h-10 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">No games found</p>
              <p className="text-xs text-muted-foreground">
                Try searching by school name, city, or team nickname.
              </p>
            </div>
          </div>
        ) : sortedDates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-4">
            <BarChart3 className="w-10 h-10 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">No projections available</p>
              <p className="text-xs text-muted-foreground">
                No NCAAM games found for today.
              </p>
            </div>
          </div>
        ) : (
          sortedDates.map((date) => (
            <div key={date}>
              {/* Date section header */}
              <div className="flex items-center px-4 py-2 border-b border-border sticky top-[45px] bg-background/95 backdrop-blur-sm z-10">
                <div className="flex-1" />
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span
                    className="font-bold text-foreground tracking-widest uppercase"
                    style={{ fontSize: 'clamp(11px, 2vw, 13px)' }}
                  >
                    {formatDateHeader(date)}
                  </span>
                  <span className="text-muted-foreground/40" style={{ fontSize: '10px' }}>·</span>
                  <span
                    className="font-semibold hidden sm:inline"
                    style={{ color: '#a3a3a3', letterSpacing: '0.06em', fontSize: 'clamp(10px, 1.8vw, 12px)' }}
                  >
                    Men's College Basketball
                  </span>
                </div>
                <div className="flex-1" />
              </div>

              {/* Game Cards */}
              <div className="bg-card border-x border-border mx-0">
                {gamesByDate[date]!.map((game) => (
                  <GameCard key={game!.id} game={game!} logoMap={logoMap} />
                ))}
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}
