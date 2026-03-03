// Dashboard — MODEL PROJECTIONS main page
// Fetches live game data from the database via tRPC

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { User, LogOut, BarChart3, Upload, Loader2, RefreshCw } from "lucide-react";
import { GameCard } from "@/components/GameCard";
import { AgeModal } from "@/components/AgeModal";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [showAgeModal, setShowAgeModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [selectedSport, setSelectedSport] = useState("NCAAM");
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    const accepted = sessionStorage.getItem("age-accepted");
    if (!accepted) setShowAgeModal(true);
  }, []);

  const { data: games, isLoading, refetch } = trpc.games.list.useQuery(
    { sport: selectedSport },
    { refetchOnWindowFocus: false }
  );

  const handleAccept = () => {
    sessionStorage.setItem("age-accepted", "true");
    setShowAgeModal(false);
  };

  const handleCloseModal = () => {
    setShowAgeModal(false);
    setLocation("/");
  };

  const handleLogout = () => {
    sessionStorage.removeItem("age-accepted");
    setLocation("/");
    toast.success("Logged out successfully");
  };

  // Group games by date
  const gamesByDate = (games ?? []).reduce<Record<string, typeof games>>((acc, game) => {
    const date = game!.gameDate;
    if (!acc[date]) acc[date] = [];
    acc[date]!.push(game!);
    return acc;
  }, {});

  const sortedDates = Object.keys(gamesByDate).sort();

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

  const sports = ["NCAAM", "NBA", "NFL", "NCAAF", "MLB", "NHL"];

  return (
    <div className="min-h-screen bg-background">
      {showAgeModal && (
        <AgeModal onAccept={handleAccept} onClose={handleCloseModal} />
      )}

      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 py-3 max-w-3xl mx-auto">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <span
              className="text-xs font-semibold text-muted-foreground tracking-widest uppercase"
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              AI Models
            </span>
          </div>

          {/* Title */}
          <h1
            className="text-sm font-bold tracking-[0.18em] uppercase text-foreground"
            style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
          >
            Model Projections
          </h1>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <button
                onClick={() => setLocation("/files")}
                className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-accent transition-colors"
                title="Upload model files"
              >
                <Upload className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center hover:bg-accent transition-colors"
              >
                <User className="w-4 h-4 text-muted-foreground" />
              </button>

              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 top-10 z-50 w-48 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
                    {user ? (
                      <>
                        <div className="px-3 py-2.5 border-b border-border">
                          <p className="text-xs font-medium text-foreground truncate">{user.name ?? "User"}</p>
                          <p className="text-xs text-muted-foreground truncate">{user.email ?? ""}</p>
                        </div>
                        <button
                          onClick={() => { setShowUserMenu(false); setLocation("/files"); }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          Manage Files
                        </button>
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

        {/* Sport tabs */}
        <div className="flex items-center gap-1 px-4 pb-2 max-w-3xl mx-auto overflow-x-auto">
          {sports.map((sport) => (
            <button
              key={sport}
              onClick={() => setSelectedSport(sport)}
              className={`px-3 py-1 rounded-full text-xs font-semibold tracking-wide transition-colors whitespace-nowrap ${
                selectedSport === sport
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {sport}
            </button>
          ))}
          <button
            onClick={() => refetch()}
            className="ml-auto w-7 h-7 rounded-full bg-secondary flex items-center justify-center hover:bg-accent transition-colors flex-shrink-0"
            title="Refresh"
          >
            <RefreshCw className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto pb-12">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Loading projections...</p>
          </div>
        ) : sortedDates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-6">
            <BarChart3 className="w-10 h-10 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">No projections available</p>
              <p className="text-xs text-muted-foreground">
                {isAuthenticated
                  ? "Upload a model file to see projections."
                  : "Sign in and upload a model file to see projections."}
              </p>
            </div>
            {isAuthenticated ? (
              <button
                onClick={() => setLocation("/files")}
                className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                Upload Model File
              </button>
            ) : (
              <button
                onClick={() => setLocation("/login")}
                className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
              >
                Sign In
              </button>
            )}
          </div>
        ) : (
          sortedDates.map((date) => (
            <div key={date}>
              {/* Date section header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-[97px] bg-background/95 backdrop-blur-sm z-10">
                <span
                  className="text-xs font-bold text-foreground tracking-widest uppercase"
                  style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                >
                  {formatDateHeader(date)}
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/20">
                  {selectedSport}
                </span>
              </div>

              {/* Game Cards */}
              <div className="bg-card border-x border-border mx-0">
                {gamesByDate[date]!.map((game) => (
                  <GameCard key={game!.id} game={game!} />
                ))}
              </div>
            </div>
          ))
        )}

        {/* Footer */}
        <div className="px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">
            AI Sports Betting Models · For informational purposes only · Gamble responsibly
          </p>
        </div>
      </main>
    </div>
  );
}
