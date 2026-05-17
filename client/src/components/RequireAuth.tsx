/**
 * RequireAuth — Authentication gate component
 *
 * Wraps any route that requires a valid app_session cookie.
 * Unauthenticated users are redirected to /login BEFORE any child content renders.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  RequireAuth renders a full-screen loading state while appUsers.me      │
 * │  is in flight. Once resolved:                                           │
 * │    • appUser present  → render children                                 │
 * │    • appUser null     → hard redirect to /login?returnPath=<current>    │
 * │                                                                         │
 * │  Hard redirect (window.location.href) is used instead of wouter        │
 * │  setLocation to ensure React Query cache is fully cleared on the        │
 * │  login page load. This prevents stale auth state from persisting.       │
 * │                                                                         │
 * │  A 10-second timeout prevents infinite loading if the auth check stalls.│
 * │                                                                         │
 * │  An 800ms minimum wait prevents a redirect race condition after OAuth   │
 * │  callback — the browser navigates to /feed before appUsers.me resolves. │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Usage:
 *   <Route path="/feed">
 *     {() => <RequireAuth><ModelProjections /></RequireAuth>}
 *   </Route>
 */

import { useEffect, useState } from "react";
import { useAppAuth } from "@/_core/hooks/useAppAuth";

interface RequireAuthProps {
  children: React.ReactNode;
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

  // Minimum wait (800ms) before redirecting — prevents race condition on OAuth callback.
  // After Discord OAuth callback, browser does full page nav to /feed.
  // React Query fires appUsers.me immediately but response takes ~100-300ms.
  // Without this guard, RequireAuth could redirect to /login before auth check completes.
  const [minWaitDone, setMinWaitDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinWaitDone(true), 800);
    return () => clearTimeout(t);
  }, []);

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

  // Loading state — full screen, matches app theme
  if ((loading || !minWaitDone) && !timedOut) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100dvh",
          background: "#000",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Prez Bets logo mark */}
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="2" y="14" width="4" height="8" rx="1" fill="#3b82f6" />
          <rect x="8" y="9" width="4" height="13" rx="1" fill="#3b82f6" />
          <rect x="14" y="4" width="4" height="18" rx="1" fill="#3b82f6" />
          <rect x="20" y="1" width="2" height="21" rx="1" fill="#1d4ed8" />
        </svg>
        {/* Spinner */}
        <div
          style={{
            width: 28,
            height: 28,
            border: "3px solid rgba(59,130,246,0.2)",
            borderTopColor: "#3b82f6",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Authenticated — render the protected page
  if (appUser) {
    return <>{children}</>;
  }

  // Redirect is in progress — render nothing
  return null;
}
