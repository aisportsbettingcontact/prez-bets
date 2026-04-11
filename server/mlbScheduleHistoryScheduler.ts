/**
 * mlbScheduleHistoryScheduler.ts
 *
 * Schedules daily automatic refresh of the mlb_schedule_history table.
 *
 * Schedule:
 *   - Runs once at server startup to backfill the last 7 days (catch up on any missed data)
 *   - Runs every 4 hours from 6:00 AM to 11:59 PM EST to keep today's games current
 *     (captures pre-game odds for today's slate, and final scores + result columns as games complete)
 *   - Each run refreshes:
 *       1. Today's date (always)
 *       2. Yesterday's date (catch any late-finishing games)
 *
 * Data source: Action Network v2 API, DraftKings NJ (book_id=68) exclusively
 *
 * Logging: [MlbScheduleScheduler][STEP] plain-English, fully traceable
 */

import { refreshMlbScheduleForDate, backfillMlbScheduleHistory } from "./mlbScheduleHistoryService";

const TAG = "[MlbScheduleScheduler]";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a Date as YYYYMMDD for the AN API */
function toAnDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** Get today's date in EST as YYYYMMDD */
function todayEstAnDate(): string {
  const now = new Date();
  // EST = UTC-5, EDT = UTC-4. Use a simple UTC-5 offset for consistency.
  const estOffset = -5 * 60 * 60 * 1000;
  const est = new Date(now.getTime() + estOffset);
  return toAnDate(est);
}

/** Get yesterday's date in EST as YYYYMMDD */
function yesterdayEstAnDate(): string {
  const now = new Date();
  const estOffset = -5 * 60 * 60 * 1000;
  const est = new Date(now.getTime() + estOffset - 24 * 60 * 60 * 1000);
  return toAnDate(est);
}

/** Current hour in EST (0–23) */
function currentHourEst(): number {
  const now = new Date();
  const estOffset = -5 * 60 * 60 * 1000;
  const est = new Date(now.getTime() + estOffset);
  return est.getHours();
}

/** Milliseconds until the next occurrence of a given EST hour */
function msUntilNextEstHour(targetHour: number): number {
  const now = new Date();
  const estOffset = -5 * 60 * 60 * 1000;
  const estNow = new Date(now.getTime() + estOffset);

  const next = new Date(estNow);
  next.setHours(targetHour, 0, 0, 0);
  if (next <= estNow) {
    next.setDate(next.getDate() + 1);
  }
  // Convert back to UTC ms
  return next.getTime() - estOffset - now.getTime();
}

// ─── Core Refresh Logic ───────────────────────────────────────────────────────

/**
 * Refresh today's and yesterday's MLB schedule data from AN DK NJ API.
 * Called on every scheduled tick.
 */
async function runDailyRefresh(): Promise<void> {
  const today = todayEstAnDate();
  const yesterday = yesterdayEstAnDate();

  console.log(
    `${TAG}[STEP] Daily refresh starting — today=${today} yesterday=${yesterday}`
  );

  // Refresh today
  try {
    const todayResult = await refreshMlbScheduleForDate(today);
    console.log(
      `${TAG}[OUTPUT] Today (${today}):` +
      ` fetched=${todayResult.fetched}` +
      ` upserted=${todayResult.upserted}` +
      ` errors=${todayResult.errors.length}`
    );
    if (todayResult.errors.length > 0) {
      console.warn(`${TAG}[WARN] Today errors:`, todayResult.errors.slice(0, 3));
    }
  } catch (err) {
    console.error(`${TAG}[ERROR] Failed to refresh today (${today}):`, err);
  }

  // Refresh yesterday (catch late-finishing games and final scores)
  try {
    const yestResult = await refreshMlbScheduleForDate(yesterday);
    console.log(
      `${TAG}[OUTPUT] Yesterday (${yesterday}):` +
      ` fetched=${yestResult.fetched}` +
      ` upserted=${yestResult.upserted}` +
      ` errors=${yestResult.errors.length}`
    );
    if (yestResult.errors.length > 0) {
      console.warn(`${TAG}[WARN] Yesterday errors:`, yestResult.errors.slice(0, 3));
    }
  } catch (err) {
    console.error(`${TAG}[ERROR] Failed to refresh yesterday (${yesterday}):`, err);
  }

  console.log(`${TAG}[VERIFY] Daily refresh complete`);
}

// ─── Startup Backfill ─────────────────────────────────────────────────────────

/**
 * On server startup, backfill the last 7 days to ensure the DB is populated.
 * Runs once immediately, non-blocking.
 */
async function runStartupBackfill(): Promise<void> {
  console.log(`${TAG}[STEP] Startup backfill — last 7 days from AN DK NJ API`);
  try {
    const results = await backfillMlbScheduleHistory(7);
    const totalFetched  = results.reduce((s, r) => s + r.fetched,  0);
    const totalUpserted = results.reduce((s, r) => s + r.upserted, 0);
    const totalErrors   = results.reduce((s, r) => s + r.errors.length, 0);
    console.log(
      `${TAG}[OUTPUT] Startup backfill complete:` +
      ` dates=${results.length}` +
      ` totalFetched=${totalFetched}` +
      ` totalUpserted=${totalUpserted}` +
      ` totalErrors=${totalErrors}`
    );
    if (totalErrors > 0) {
      console.warn(`${TAG}[WARN] Backfill had ${totalErrors} errors — check logs above`);
    }
  } catch (err) {
    console.error(`${TAG}[ERROR] Startup backfill failed (non-fatal):`, err);
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

/**
 * Start the MLB schedule history refresh scheduler.
 *
 * Behavior:
 *   1. Immediately runs a 7-day backfill (non-blocking)
 *   2. Schedules a refresh every 4 hours starting at 6:00 AM EST
 *      (6 AM, 10 AM, 2 PM, 6 PM, 10 PM)
 *   3. Each refresh updates today + yesterday
 */
export function startMlbScheduleHistoryScheduler(): void {
  console.log(`${TAG}[STEP] Initializing MLB schedule history scheduler`);

  // 1. Startup backfill — runs immediately, non-blocking
  setImmediate(async () => {
    await runStartupBackfill();
  });

  // 2. Schedule recurring refresh every 4 hours starting at 6 AM EST
  const INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
  const msToFirst6am = msUntilNextEstHour(6);
  const nextRun = new Date(Date.now() + msToFirst6am);

  console.log(
    `${TAG}[STEP] First scheduled refresh at ${nextRun.toISOString()}` +
    ` (in ${Math.round(msToFirst6am / 1000 / 60)} min)` +
    ` — then every 4 hours`
  );

  setTimeout(async () => {
    // First run at 6 AM EST
    const hourEst = currentHourEst();
    console.log(
      `${TAG}[STEP] Scheduled refresh triggered at EST hour=${hourEst}`
    );
    await runDailyRefresh();

    // Repeat every 4 hours
    setInterval(async () => {
      const h = currentHourEst();
      // Only run between 6 AM and 11:59 PM EST (skip overnight hours 0–5)
      if (h >= 6) {
        console.log(`${TAG}[STEP] Interval refresh triggered at EST hour=${h}`);
        await runDailyRefresh();
      } else {
        console.log(
          `${TAG}[STEP] Interval tick skipped — EST hour=${h} (outside 6AM–midnight window)`
        );
      }
    }, INTERVAL_MS);
  }, msToFirst6am);
}
