#!/usr/bin/env python3.11
"""
ActionNetworkKPropsAPI.py
=========================
Fetches MLB pitcher strikeout K prop CONSENSUS lines from the Action Network API.

Uses book_id=15 which is the Action Network Consensus aggregator.
No browser required — pure HTTP API call.

Usage:
    python3.11 ActionNetworkKPropsAPI.py [--date YYYY-MM-DD] [--output /path/to/output.json]

Output JSON format:
    {
      "scraped_at": "2026-03-25T19:30:00Z",
      "date": "20260325",
      "consensus_book_id": 15,
      "props": [
        {
          "player_id": 53380,
          "player_name": "Max Fried",
          "team": "NYY",
          "position": "SP",
          "game_id": 285604,
          "consensus_over_line": 5.5,
          "consensus_over_odds": 114,
          "consensus_under_line": 5.5,
          "consensus_under_odds": -150
        },
        ...
      ]
    }

Exit codes:
    0 = success, props found
    1 = no props found for date
    2 = HTTP or parse error
"""

import argparse
import json
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone, date

# ── Logging helpers ────────────────────────────────────────────────────────────

def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"[ANKPropsAPI] [{ts}] {msg}", flush=True)

def log_err(msg: str):
    ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"[ANKPropsAPI] [ERROR] [{ts}] {msg}", file=sys.stderr, flush=True)

# ── Constants ──────────────────────────────────────────────────────────────────

AN_API_BASE = "https://api.actionnetwork.com/web/v2/scoreboard/mlb/markets"
CONSENSUS_BOOK_ID = 15          # Action Network internal consensus aggregator
K_PROP_TYPE = "core_bet_type_37_strikeouts"

HEADERS = {
    "Accept": "application/json",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.actionnetwork.com/mlb/props/pitching",
    "Origin": "https://www.actionnetwork.com",
}

# ── Fetch helpers ──────────────────────────────────────────────────────────────

def fetch_json(url: str) -> dict:
    """Fetch a URL and return parsed JSON. Raises on HTTP or parse errors."""
    log(f"GET {url}")
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            status = resp.status
            body = resp.read().decode("utf-8")
            log(f"  HTTP {status} — {len(body)} bytes")
            return json.loads(body)
    except urllib.error.HTTPError as e:
        log_err(f"HTTP {e.code} from {url}: {e.reason}")
        raise
    except urllib.error.URLError as e:
        log_err(f"URL error from {url}: {e.reason}")
        raise
    except json.JSONDecodeError as e:
        log_err(f"JSON parse error from {url}: {e}")
        raise

# ── Team abbreviation mapping ──────────────────────────────────────────────────
# Action Network uses full team names in game objects; map to our abbreviations.
# We derive team abbrev from the game's away_team/home_team abbr field.

def get_team_abbrev(team_obj: dict) -> str:
    """Extract team abbreviation from Action Network team object."""
    # AN uses abbr field like 'NYY', 'SF', 'LAD', etc.
    return team_obj.get("abbr", team_obj.get("short_name", "???"))

# ── Main scrape function ───────────────────────────────────────────────────────

def fetch_consensus_k_props(date_str: str) -> list[dict]:
    """
    Fetch Consensus K prop lines for all MLB games on the given date.

    Args:
        date_str: Date in YYYYMMDD format (e.g., "20260325")

    Returns:
        List of prop dicts with consensus over/under line and odds.
    """
    url = f"{AN_API_BASE}?customPickTypes={K_PROP_TYPE}&date={date_str}"

    log(f"=== Fetching Consensus K Props for {date_str} ===")
    log(f"Consensus book_id: {CONSENSUS_BOOK_ID}")

    data = fetch_json(url)

    # ── Parse response structure ───────────────────────────────────────────────
    games_raw = data.get("games", [])
    players_raw = data.get("players", [])
    markets_raw = data.get("markets", {})

    log(f"Games: {len(games_raw)} | Players: {len(players_raw)} | Market books: {len(markets_raw)}")

    if not games_raw:
        log("No games found for this date.")
        return []

    # Build player map: player_id -> {full_name, position, ...}
    players: dict[int, dict] = {}
    for p in players_raw:
        pid = p.get("id")
        if pid:
            players[pid] = p
            log(f"  Player: {pid} = {p.get('full_name')} ({p.get('primary_position', '?')})")

    # Build game map: game_id -> {away_abbrev, home_abbrev}
    games: dict[int, dict] = {}
    for g in games_raw:
        gid = g.get("id")
        if gid:
            away_abbrev = get_team_abbrev(g.get("away_team", {}))
            home_abbrev = get_team_abbrev(g.get("home_team", {}))
            games[gid] = {"away": away_abbrev, "home": home_abbrev, "raw": g}
            log(f"  Game: {gid} = {away_abbrev} @ {home_abbrev}")

    # Extract consensus lines from book_id=15
    consensus_book_str = str(CONSENSUS_BOOK_ID)
    consensus_data = markets_raw.get(consensus_book_str, {})

    if not consensus_data:
        log_err(f"No data for consensus book_id={CONSENSUS_BOOK_ID} in response.")
        log(f"Available book_ids: {list(markets_raw.keys())[:20]}")
        return []

    event_data = consensus_data.get("event", {})
    k_lines_raw = event_data.get(K_PROP_TYPE, [])

    log(f"Consensus K prop lines found: {len(k_lines_raw)}")

    # Group by player_id: {player_id: {over: {...}, under: {...}}}
    by_player: dict[int, dict] = {}
    for line in k_lines_raw:
        pid = line.get("player_id")
        if not pid:
            continue
        side = line.get("side")  # 'over' or 'under'
        value = line.get("value")
        odds = line.get("odds")
        game_id = line.get("event_id")

        log(f"  Line: player={pid} side={side} value={value} odds={odds} game={game_id}")

        if pid not in by_player:
            by_player[pid] = {"game_id": game_id}
        by_player[pid][side] = {"line": value, "odds": odds}

    # Build output props
    props: list[dict] = []
    for pid, sides in by_player.items():
        player_info = players.get(pid, {})
        full_name = player_info.get("full_name", f"Player#{pid}")
        position = player_info.get("primary_position", "?")
        game_id = sides.get("game_id")

        # Determine team abbreviation from game
        team_abbrev = "???"
        if game_id and game_id in games:
            game_info = games[game_id]
            # We need to know if this pitcher is away or home
            # Action Network doesn't directly tell us — infer from player's team
            # Use player's team_id if available, else leave as unknown
            player_team_id = player_info.get("team_id")
            game_raw = game_info.get("raw", {})
            away_team_id = game_raw.get("away_team", {}).get("id")
            home_team_id = game_raw.get("home_team", {}).get("id")
            if player_team_id and player_team_id == away_team_id:
                team_abbrev = game_info["away"]
            elif player_team_id and player_team_id == home_team_id:
                team_abbrev = game_info["home"]
            else:
                # Fallback: use player's team abbreviation from player object
                team_abbrev = player_info.get("team", {}).get("abbr", "???") if isinstance(player_info.get("team"), dict) else "???"

        over_data  = sides.get("over",  {})
        under_data = sides.get("under", {})

        prop = {
            "player_id": pid,
            "player_name": full_name,
            "team": team_abbrev,
            "position": position,
            "game_id": game_id,
            "consensus_over_line":  over_data.get("line"),
            "consensus_over_odds":  over_data.get("odds"),
            "consensus_under_line": under_data.get("line"),
            "consensus_under_odds": under_data.get("odds"),
        }

        log(f"  PROP: {full_name} ({team_abbrev}) — "
            f"o{prop['consensus_over_line']} {prop['consensus_over_odds']} / "
            f"u{prop['consensus_under_line']} {prop['consensus_under_odds']}")

        props.append(prop)

    log(f"Total props extracted: {len(props)}")
    return props

# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Fetch Action Network Consensus MLB K prop lines")
    parser.add_argument("--date", default=None,
                        help="Date in YYYY-MM-DD or YYYYMMDD format (default: today)")
    parser.add_argument("--output", default=None,
                        help="Output JSON file path (default: stdout)")
    args = parser.parse_args()

    # Resolve date
    if args.date:
        date_clean = args.date.replace("-", "")
    else:
        date_clean = date.today().strftime("%Y%m%d")

    log(f"=== ActionNetworkKPropsAPI START ===")
    log(f"Date: {date_clean}")

    try:
        props = fetch_consensus_k_props(date_clean)
    except Exception as e:
        log_err(f"Fatal error: {e}")
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(2)

    if not props:
        log_err("No props found. Exiting with code 1.")
        sys.exit(1)

    output = {
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "date": date_clean,
        "consensus_book_id": CONSENSUS_BOOK_ID,
        "props": props,
    }

    output_json = json.dumps(output, indent=2)

    if args.output:
        with open(args.output, "w") as f:
            f.write(output_json)
        log(f"Output written to: {args.output}")
    else:
        print(output_json)

    log(f"=== ActionNetworkKPropsAPI DONE — {len(props)} props ===")
    sys.exit(0)


if __name__ == "__main__":
    main()
