import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import { lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { RequireAuth } from "./components/RequireAuth";
import { ThemeProvider } from "./contexts/ThemeContext";
// ── Critical path: ModelProjections is the main feed — loaded eagerly ────────
import ModelProjections from "./pages/ModelProjections";
// ── Non-critical pages: lazy-loaded on first navigation ──────────────────────
// This eliminates ~60% of the initial JS bundle, reducing TTI from ~2.5s → ~0.8s
const Home = lazy(() => import("./pages/Home"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const PublishProjections = lazy(() => import("./pages/PublishProjections"));
const IngestAnOdds = lazy(() => import("./pages/IngestAnOdds"));
const TheModelResults = lazy(() => import("./pages/TheModelResults"));
const SecurityEvents = lazy(() => import("./pages/SecurityEvents"));
const MlbTeamSchedule = lazy(() => import("./pages/MlbTeamSchedule"));
const NbaTeamSchedule = lazy(() => import("./pages/NbaTeamSchedule"));
const NhlTeamSchedule = lazy(() => import("./pages/NhlTeamSchedule"));
const BetTracker = lazy(() => import("@/pages/BetTracker"));
const AdminModelStatus = lazy(() => import("@/pages/AdminModelStatus"));
const PostponedGames = lazy(() => import("@/pages/PostponedGames"));
const Resources = lazy(() => import("@/pages/Resources"));
const MlbBacktest = lazy(() => import("@/pages/MlbBacktest"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));

function Router() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen bg-background text-muted-foreground text-sm">Loading…</div>}>
    <Switch>
      {/* ── Public routes (no auth required) ───────────────────────────────── */}
      {/* / and /home → redirect to /feed (RequireAuth on /feed handles the gate) */}
      <Route path="/">{() => <Redirect to="/feed" />}</Route>
      <Route path="/home">{() => <Redirect to="/feed" />}</Route>
      {/* Legacy redirects */}
      <Route path="/dashboard">{() => <Redirect to="/feed" />}</Route>
      <Route path="/projections">{() => <Redirect to="/feed" />}</Route>
      <Route path="/splits">{() => <Redirect to="/feed" />}</Route>
      {/* Login page — public, no auth required */}
      <Route path="/login" component={Home} />
      {/* Password reset — public, accessed via reset link */}
      <Route path="/reset-password" component={ResetPassword} />
      {/* ── Protected routes (RequireAuth redirects to /login if not authed) ── */}
      {/* Main feed */}
      <Route path="/feed">{() => <RequireAuth><ModelProjections /></RequireAuth>}</Route>
      {/* Admin pages */}
      <Route path="/admin/users">{() => <RequireAuth><UserManagement /></RequireAuth>}</Route>
      <Route path="/admin/publish">{() => <RequireAuth><PublishProjections /></RequireAuth>}</Route>
      <Route path="/admin/ingest-an">{() => <RequireAuth><IngestAnOdds /></RequireAuth>}</Route>
      <Route path="/admin/model-results">{() => <RequireAuth><TheModelResults /></RequireAuth>}</Route>
      <Route path="/admin/f5-edge">{() => <Redirect to="/admin/model-results" />}</Route>
      <Route path="/admin/security">{() => <RequireAuth><SecurityEvents /></RequireAuth>}</Route>
      <Route path="/admin/model-status">{() => <RequireAuth><AdminModelStatus /></RequireAuth>}</Route>
      <Route path="/admin/postponed-games">{() => <RequireAuth><PostponedGames /></RequireAuth>}</Route>
      <Route path="/admin/backtest">{() => <RequireAuth><MlbBacktest /></RequireAuth>}</Route>
      {/* Team schedules — params are read via useParams() inside each component */}
      <Route path="/mlb/team/:slug">{() => <RequireAuth><MlbTeamSchedule /></RequireAuth>}</Route>
      <Route path="/nba/team/:slug">{() => <RequireAuth><NbaTeamSchedule /></RequireAuth>}</Route>
      <Route path="/nhl/team/:slug">{() => <RequireAuth><NhlTeamSchedule /></RequireAuth>}</Route>
      {/* User pages */}
      <Route path="/bet-tracker">{() => <RequireAuth><BetTracker /></RequireAuth>}</Route>
      <Route path="/resources">{() => <RequireAuth><Resources /></RequireAuth>}</Route>
      {/* 404 */}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
