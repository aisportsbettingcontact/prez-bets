/**
 * Tests for the VSiN scraper (fetch + cheerio, no Puppeteer).
 *
 * These tests verify:
 *   1. matchTeam correctly matches team names to DB slugs (exact + case-insensitive)
 *   2. Registry-based slug resolution works for canonical teams
 *
 * Note: normalizeTeamName is no longer exported (internal implementation detail).
 * Slug resolution now uses the canonical 365-team registry (shared/ncaamTeams.ts).
 */

import { describe, it, expect } from "vitest";
import { matchTeam } from "./vsinScraper";

describe("matchTeam", () => {
  it("matches exact names (exact slug)", () => {
    expect(matchTeam("Creighton", "creighton")).toBe(true);
    expect(matchTeam("Penn State", "penn_state")).toBe(true);
  });

  it("matches normalized names", () => {
    expect(matchTeam("North Texas", "north_texas")).toBe(true);
    expect(matchTeam("Florida State", "florida_state")).toBe(true);
  });

  it("does not match unrelated teams", () => {
    expect(matchTeam("Duke", "kentucky")).toBe(false);
    expect(matchTeam("Kansas", "kansas_state")).toBe(false);
  });

  it("handles case insensitivity", () => {
    expect(matchTeam("DUKE", "duke")).toBe(true);
    expect(matchTeam("butler", "Butler")).toBe(true);
  });
});
