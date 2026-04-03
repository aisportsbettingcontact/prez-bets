#!/usr/bin/env python3
"""
parseRotowireApril3.py
======================
Parse the Rotowire HTML snapshot to extract all April 3 lineups and pitchers.
Outputs structured JSON with game matchups, pitchers, and batting orders.
"""
import json
import re
from bs4 import BeautifulSoup

HTML_FILE = "/home/ubuntu/upload/pasted_content_15.txt"

def parse_lineups(html: str) -> list:
    soup = BeautifulSoup(html, "html.parser")
    games = []

    # Find all lineup containers - Rotowire uses 'lineup__card' or similar
    # Try multiple selectors
    containers = (
        soup.find_all("div", class_=re.compile(r"lineup__card")) or
        soup.find_all("div", class_=re.compile(r"lineup-card")) or
        soup.find_all("div", class_=re.compile(r"lineups__game"))
    )

    if not containers:
        # Try finding by the pitcher highlight pattern
        pitcher_divs = soup.find_all("div", class_=re.compile(r"lineup__player-highlight"))
        print(f"[PARSE] Found {len(pitcher_divs)} pitcher highlight divs")
        # Walk up to find game containers
        seen = set()
        for pd in pitcher_divs:
            parent = pd.parent
            for _ in range(10):
                if parent is None:
                    break
                pid = id(parent)
                if pid in seen:
                    break
                classes = " ".join(parent.get("class", []))
                if "lineup" in classes and ("card" in classes or "game" in classes or "matchup" in classes):
                    seen.add(pid)
                    containers.append(parent)
                    break
                parent = parent.parent

    print(f"[PARSE] Found {len(containers)} game containers")

    for container in containers:
        game = {}

        # Extract team abbreviations/names
        team_els = container.find_all(class_=re.compile(r"lineup__team"))
        if len(team_els) >= 2:
            game["away_team"] = team_els[0].get_text(strip=True)
            game["home_team"] = team_els[1].get_text(strip=True)

        # Extract pitchers - look for lineup__player-highlight
        pitcher_highlights = container.find_all("div", class_=re.compile(r"lineup__player-highlight"))
        pitchers = []
        for ph in pitcher_highlights:
            link = ph.find("a")
            throws_el = ph.find("span", class_=re.compile(r"lineup__throws"))
            if link:
                name = link.get_text(strip=True)
                hand = throws_el.get_text(strip=True) if throws_el else "?"
                href = link.get("href", "")
                rw_id = re.search(r"-(\d+)$", href)
                pitchers.append({
                    "name": name,
                    "hand": hand,
                    "rw_id": rw_id.group(1) if rw_id else None
                })
        game["pitchers"] = pitchers

        # Extract batting orders
        batting_orders = []
        player_lists = container.find_all("ol", class_=re.compile(r"lineup__list"))
        for pl in player_lists:
            order = []
            for li in pl.find_all("li"):
                link = li.find("a")
                pos_el = li.find(class_=re.compile(r"lineup__pos"))
                if link:
                    name = link.get_text(strip=True)
                    pos = pos_el.get_text(strip=True) if pos_el else "?"
                    order.append({"name": name, "pos": pos})
            if order:
                batting_orders.append(order)
        game["batting_orders"] = batting_orders

        # Extract confirmed status
        confirmed_els = container.find_all(class_=re.compile(r"lineup__confirm"))
        game["confirmed"] = [el.get_text(strip=True) for el in confirmed_els]

        # Extract game time
        time_el = container.find(class_=re.compile(r"lineup__time|lineup__game-time"))
        game["time"] = time_el.get_text(strip=True) if time_el else None

        if game.get("pitchers") or game.get("away_team"):
            games.append(game)

    return games


def main():
    print("[PARSE] Reading Rotowire HTML...")
    with open(HTML_FILE, "r", encoding="utf-8") as f:
        html = f.read()

    print(f"[PARSE] HTML size: {len(html):,} chars")
    games = parse_lineups(html)

    print(f"\n[PARSE] === RESULTS: {len(games)} games ===\n")
    for i, g in enumerate(games):
        away = g.get("away_team", "???")
        home = g.get("home_team", "???")
        pitchers = g.get("pitchers", [])
        orders = g.get("batting_orders", [])
        confirmed = g.get("confirmed", [])
        time = g.get("time", "")

        away_p = pitchers[0] if len(pitchers) > 0 else {}
        home_p = pitchers[1] if len(pitchers) > 1 else {}

        print(f"Game {i+1}: {away} @ {home} ({time})")
        print(f"  Away P: {away_p.get('name','?')} ({away_p.get('hand','?')}) id={away_p.get('rw_id','?')}")
        print(f"  Home P: {home_p.get('name','?')} ({home_p.get('hand','?')}) id={home_p.get('rw_id','?')}")
        if orders:
            print(f"  Away lineup ({len(orders[0])} batters): {', '.join(p['name'] for p in orders[0][:3])}...")
        if len(orders) > 1:
            print(f"  Home lineup ({len(orders[1])} batters): {', '.join(p['name'] for p in orders[1][:3])}...")
        print(f"  Confirmed: {confirmed}")
        print()

    # Save to JSON
    out_path = "/tmp/rotowire_apr3_lineups.json"
    with open(out_path, "w") as f:
        json.dump(games, f, indent=2)
    print(f"[PARSE] Saved to {out_path}")


if __name__ == "__main__":
    main()
