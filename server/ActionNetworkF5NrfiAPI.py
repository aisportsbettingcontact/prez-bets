#!/usr/bin/env python3.11
"""
ActionNetworkF5NrfiAPI.py
=========================
Scrapes First Five Innings (F5) and First Inning (NRFI/YRFI) odds from
Action Network using FanDuel NJ (book_id=69) as the authoritative source.

Single API call: periods=event,firstfiveinnings,firstinning
Returns structured JSON for all games on the target date.

OUTPUT SCHEMA per game:
{
  "anEventId": int,
  "awayTeam": str,    # AN abbreviation
  "homeTeam": str,    # AN abbreviation
  "gameTime": str,    # ISO datetime
  "f5": {
    "awayMlOdds": int | null,
    "homeMlOdds": int | null,
    "awayRlValue": float | null,
    "awayRlOdds": int | null,
    "homeRlValue": float | null,
    "homeRlOdds": int | null,
    "totalValue": float | null,
    "overOdds": int | null,
    "underOdds": int | null
  },
  "nrfi": {
    "totalValue": float | null,   # typically 0.5
    "overOdds": int | null,       # YRFI odds (over 0.5 runs in 1st)
    "underOdds": int | null       # NRFI odds (under 0.5 runs in 1st)
  }
}
"""

import sys
import json
import requests
import logging

# ─── CONSTANTS ────────────────────────────────────────────────────────────────
FD_NJ_BOOK_ID = "69"
AN_SCOREBOARD_URL = "https://api.actionnetwork.com/web/v2/scoreboard/mlb"
PERIODS = "event,firstfiveinnings,firstinning"
REQUEST_TIMEOUT = 20

# AN team abbreviation → our system abbreviation mapping
AN_TEAM_MAP: dict[str, str] = {
    "ARI": "ARI", "ATL": "ATL", "BAL": "BAL", "BOS": "BOS",
    "CHC": "CHC", "CWS": "CWS", "CIN": "CIN", "CLE": "CLE",
    "COL": "COL", "DET": "DET", "HOU": "HOU", "KC":  "KC",
    "LAA": "LAA", "LAD": "LAD", "MIA": "MIA", "MIL": "MIL",
    "MIN": "MIN", "NYM": "NYM", "NYY": "NYY", "OAK": "OAK",
    "PHI": "PHI", "PIT": "PIT", "SD":  "SD",  "SEA": "SEA",
    "SF":  "SF",  "STL": "STL", "TB":  "TB",  "TEX": "TEX",
    "TOR": "TOR", "WSH": "WSH",
}

# ─── LOGGING ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("AN_F5_NRFI")


def _extract_ml(book_data: dict, period: str) -> tuple[int | None, int | None]:
    """Extract away and home ML odds from a book's period data."""
    period_data = book_data.get(period, {})
    ml_items = period_data.get("moneyline", [])
    away_odds = None
    home_odds = None
    for item in ml_items:
        side = item.get("side", "")
        odds = item.get("odds")
        if side == "away":
            away_odds = odds
        elif side == "home":
            home_odds = odds
    return away_odds, home_odds


def _extract_rl(book_data: dict, period: str) -> tuple[float | None, int | None, float | None, int | None]:
    """Extract away and home run line (value + odds) from a book's period data."""
    period_data = book_data.get(period, {})
    rl_items = period_data.get("spread", [])
    away_val = away_odds = home_val = home_odds = None
    for item in rl_items:
        side = item.get("side", "")
        val = item.get("value")
        odds = item.get("odds")
        if side == "away":
            away_val, away_odds = val, odds
        elif side == "home":
            home_val, home_odds = val, odds
    return away_val, away_odds, home_val, home_odds


def _extract_total(book_data: dict, period: str) -> tuple[float | None, int | None, int | None]:
    """Extract total value, over odds, under odds from a book's period data."""
    period_data = book_data.get(period, {})
    total_items = period_data.get("total", [])
    total_val = over_odds = under_odds = None
    for item in total_items:
        side = item.get("side", "")
        val = item.get("value")
        odds = item.get("odds")
        if total_val is None:
            total_val = val
        if side == "over":
            over_odds = odds
        elif side == "under":
            under_odds = odds
    return total_val, over_odds, under_odds


def fetch_f5_nrfi_odds(date_str: str) -> list[dict]:
    """
    Fetch F5 and NRFI odds for all games on the given date.
    
    Args:
        date_str: Date in YYYYMMDD format (e.g., '20260405')
    
    Returns:
        List of game dicts with F5 and NRFI odds from FD NJ.
    """
    # Normalize date format: accept both YYYY-MM-DD and YYYYMMDD, always pass YYYYMMDD to API
    if len(date_str) == 10 and date_str[4] == '-':
        date_api = date_str.replace('-', '')  # "2026-04-05" → "20260405"
        log.info(f"[STEP] Normalized date format: {date_str} → {date_api}")
    else:
        date_api = date_str  # already YYYYMMDD
    log.info(f"[INPUT] Fetching F5/NRFI odds for date={date_api}, book=FanDuel NJ (id={FD_NJ_BOOK_ID})")

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": "https://www.actionnetwork.com/mlb/odds",
        "Accept": "application/json",
    }

    params = {
        "bookIds": f"15,30,358,69,68,2787,356,357,1863,2161,79,2988",
        "date": date_api,
        "periods": PERIODS,
    }

    log.info(f"[STEP] GET {AN_SCOREBOARD_URL}?date={date_api}&periods={PERIODS}")
    resp = requests.get(AN_SCOREBOARD_URL, headers=headers, params=params, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()

    data = resp.json()
    games_raw = data.get("games", [])
    log.info(f"[STATE] API returned {len(games_raw)} games")

    results: list[dict] = []
    missing_f5 = 0
    missing_nrfi = 0

    for g in games_raw:
        event_id = g.get("id")
        # Teams are in the 'teams' array, matched by away_team_id / home_team_id
        away_team_id = g.get("away_team_id")
        home_team_id = g.get("home_team_id")
        teams_list = g.get("teams", [])
        team_map_local: dict[int, str] = {t["id"]: t.get("abbr", "") for t in teams_list if "id" in t}
        away_abbr_raw = team_map_local.get(away_team_id, "") if away_team_id else ""
        home_abbr_raw = team_map_local.get(home_team_id, "") if home_team_id else ""
        game_time = g.get("start_time", "")

        away_abbr = AN_TEAM_MAP.get(away_abbr_raw, away_abbr_raw)
        home_abbr = AN_TEAM_MAP.get(home_abbr_raw, home_abbr_raw)

        markets = g.get("markets", {})
        fd_data = markets.get(FD_NJ_BOOK_ID, {})

        # ── F5 data ──────────────────────────────────────────────────────────
        has_f5 = "firstfiveinnings" in fd_data
        if not has_f5:
            missing_f5 += 1
            log.info(f"  [WARN] {away_abbr}@{home_abbr}: No F5 data from FD NJ")

        f5_away_ml, f5_home_ml = _extract_ml(fd_data, "firstfiveinnings")
        f5_away_rl_val, f5_away_rl_odds, f5_home_rl_val, f5_home_rl_odds = _extract_rl(fd_data, "firstfiveinnings")
        f5_total_val, f5_over_odds, f5_under_odds = _extract_total(fd_data, "firstfiveinnings")

        # ── NRFI/YRFI data ───────────────────────────────────────────────────
        has_nrfi = "firstinning" in fd_data
        if not has_nrfi:
            missing_nrfi += 1
            log.info(f"  [WARN] {away_abbr}@{home_abbr}: No 1st inning data from FD NJ")

        nrfi_total_val, nrfi_over_odds, nrfi_under_odds = _extract_total(fd_data, "firstinning")

        game_record = {
            "anEventId": event_id,
            "awayTeam": away_abbr,
            "homeTeam": home_abbr,
            "gameTime": game_time,
            "f5": {
                "awayMlOdds": f5_away_ml,
                "homeMlOdds": f5_home_ml,
                "awayRlValue": f5_away_rl_val,
                "awayRlOdds": f5_away_rl_odds,
                "homeRlValue": f5_home_rl_val,
                "homeRlOdds": f5_home_rl_odds,
                "totalValue": f5_total_val,
                "overOdds": f5_over_odds,
                "underOdds": f5_under_odds,
            },
            "nrfi": {
                "totalValue": nrfi_total_val,
                "overOdds": nrfi_over_odds,   # YRFI
                "underOdds": nrfi_under_odds,  # NRFI
            },
        }
        results.append(game_record)

        log.info(
            f"  [STATE] {away_abbr}@{home_abbr}: "
            f"F5 ML={f5_away_ml}/{f5_home_ml} "
            f"RL={f5_away_rl_val}({f5_away_rl_odds}) "
            f"Tot={f5_total_val}(o{f5_over_odds}/u{f5_under_odds}) | "
            f"NRFI={nrfi_under_odds} YRFI={nrfi_over_odds}"
        )

    log.info(
        f"[OUTPUT] Processed {len(results)} games | "
        f"F5 missing: {missing_f5} | NRFI missing: {missing_nrfi}"
    )
    log.info(
        f"[VERIFY] "
        f"{'PASS' if missing_f5 == 0 else 'PARTIAL'} F5 coverage | "
        f"{'PASS' if missing_nrfi == 0 else 'PARTIAL'} NRFI coverage"
    )

    return results


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: ActionNetworkF5NrfiAPI.py <YYYYMMDD>"}))
        sys.exit(1)

    date_str = sys.argv[1]
    log.info(f"[INPUT] ActionNetworkF5NrfiAPI.py invoked for date={date_str}")

    try:
        results = fetch_f5_nrfi_odds(date_str)
        # Output JSON to stdout (last line, parseable by TS orchestrator)
        print(json.dumps(results))
    except requests.HTTPError as e:
        log.error(f"[FATAL] HTTP error: {e}")
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
    except Exception as e:
        log.error(f"[FATAL] Unexpected error: {e}", exc_info=True)
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
