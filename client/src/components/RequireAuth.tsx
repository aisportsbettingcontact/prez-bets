/**
 * RequireAuth — Authentication gate component
 *
 * Wraps any route that requires a valid app_session cookie.
 * Unauthenticated users are redirected to /login BEFORE any child content renders.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  RequireAuth returns null while appUsers.me is in flight.               │
 * │  The HTML loading shell in index.html covers this gap — it stays        │
 * │  visible until React renders real content into #root.                   │
 * │                                                                         │
 * │  Once resolved:                                                         │
 * │    • appUser present  → render children (protected page)                │
 * │    • appUser null     → hard redirect to /login?returnPath=<current>    │
 * │                                                                         │
 * │  Hard redirect (window.location.href) is used instead of wouter        │
 * │  setLocation to ensure React Query cache is fully cleared on the        │
 * │  login page load. This prevents stale auth state from persisting.       │
 * │                                                                         │
 * │  A 10-second timeout prevents infinite loading if the auth check stalls.│
 * │                                                                         │
 * │  A 300ms minimum wait prevents a redirect race condition after OAuth    │
 * │  callback — the browser navigates to /feed before appUsers.me resolves. │
 * │  300ms is sufficient: auth API resolves in ~100-200ms on good networks. │
 * │                                                                         │
 * │  [PERF] No inline loading state — the HTML shell covers auth wait.      │
 * │  This eliminates the double loading screen (HTML shell → React spinner).│
 * │                                                                         │
 * │  [PERF] Feed data prefetch — the moment auth resolves, fire             │
 * │  games.list, games.getCurrentDate, and games.activeSports in parallel.  │
 * │  By the time ModelProjections lazy-chunk loads (~50-150ms), the data    │
 * │  is already in the React Query cache. gamesLoading=false on first       │
 * │  render → the in-page Loader2 spinner never appears.                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Usage:
 *   <Route path="/feed">
 *     {() => <RequireAuth><ModelProjections /></RequireAuth>}
 *   </Route>
 */

import { useEffect, useRef, useState } from "react";
import { useAppAuth } from "@/_core/hooks/useAppAuth";
import { trpc } from "@/lib/trpc";
import { todayUTC } from "@/components/CalendarPicker";

interface RequireAuthProps {
  children: React.ReactNode;
}

// Feed data prefetch — fires once when auth resolves on /feed routes.
// Populates React Query cache so ModelProjections renders with data immediately.
function useFeedPrefetch(authenticated: boolean) {
  const utils = trpc.useUtils();
  const prefetchedRef = useRef(false);

  useEffect(() => {
    if (!authenticated || prefetchedRef.current) return;
    // Only prefetch on /feed route — other routes don't need games.list
    if (!window.location.pathname.startsWith("/feed")) return;

    prefetchedRef.current = true;
    const today = todayUTC();

    // Fire all three in parallel — they share the same server-side cache TTL (60s)
    void utils.games.list.prefetch(
      { sport: "MLB", gameDate: today },
      { staleTime: 60 * 1000 }
    );
    void utils.games.getCurrentDate.prefetch(undefined, { staleTime: 5 * 60 * 1000 });
    void utils.games.activeSports.prefetch(undefined, { staleTime: 5 * 60 * 1000 });
  }, [authenticated, utils]);
}

export function RequireAuth({ children }: RequireAuthProps) {
  const { appUser, loading } = useAppAuth();

  // Safety timeout: if auth check takes > 10s, treat as unauthenticated
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => {
      console.warn("[RequireAuth] Auth check timed out after 10s — redirecting to login");
      setTimedOut(true);
    }, 10000);
    return () => clearTimeout(t);
  }, [loading]);

  // Minimum wait (300ms) before redirecting — prevents race condition on OAuth callback.
  // After Discord OAuth callback, browser does full page nav to /feed.
  // React Query fires appUsers.me immediately but response takes ~100-200ms.
  // Without this guard, RequireAuth could redirect to /login before auth check completes.
  // [PERF] Reduced from 800ms → 300ms: auth resolves in ~100-200ms on good networks.
  // The HTML loading shell covers this 300ms gap seamlessly.
  const [minWaitDone, setMinWaitDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinWaitDone(true), 300);
    return () => clearTimeout(t);
  }, []);

  // [PERF] Prefetch feed data the moment auth resolves — eliminates in-page spinner
  useFeedPrefetch(Boolean(appUser));

  // Redirect unauthenticated users to /login with returnPath preserved
  useEffect(() => {
    if (loading && !timedOut) return; // still loading — wait
    if (!minWaitDone && !timedOut) return; // minimum wait not done — hold
    if (appUser) return; // authenticated — render children

    // [ACTION] Not authenticated — redirect to login
    const returnPath = window.location.pathname + window.location.search;
    const loginUrl = returnPath === "/login" || returnPath === "/"
      ? "/login"
      : `/login?returnPath=${encodeURIComponent(returnPath)}`;

    console.log(`[RequireAuth] Unauthenticated — redirecting to ${loginUrl} (timedOut=${timedOut} minWaitDone=${minWaitDone})`);
    window.location.href = loginUrl;
  }, [appUser, loading, timedOut, minWaitDone]);

  // [PERF] No inline loading state — return null so the HTML shell covers the auth wait.
  // The HTML shell (index.html) is visible until React renders real content into #root.
  // Returning null here means the HTML shell stays up during the auth check, then
  // disappears the moment the authenticated page renders. Zero double loading screen.
  if ((loading || !minWaitDone) && !timedOut) {
    return null;
  }

  // Authenticated — render the protected page
  if (appUser) {
    return <>{children}</>;
  }

  // Redirect is in progress — render nothing
  return null;
}
