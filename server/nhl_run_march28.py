#!/usr/bin/env python3
"""
March 28, 2026 NHL Model Runner
- Team stats: MoneyPuck 5v5 season summary (computed per-60 from raw counts)
- Goalie stats: MoneyPuck 2025 regular season (all situations)
- Starting goalies: Confirmed from GameDayTweets (March 28, 2026)
- Engine: nhl_model_engine.py
- Output: /tmp/march28_nhl_results.json + deep log to stderr
"""

import json
import subprocess
import sys
import os
import time
import requests
import csv
import io
from datetime import datetime

LOG_FILE = "/tmp/march28_nhl_model_run.log"
RESULTS_FILE = "/tmp/march28_nhl_results.json"

def log(msg):
    ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")

# ─── STEP 1: Fetch MoneyPuck team stats (5v5) ────────────────────────────────
def fetch_team_stats():
    log("STEP 1: Fetching MoneyPuck team stats (5v5 situation)...")
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://moneypuck.com/'}
    url = "https://moneypuck.com/moneypuck/playerData/seasonSummary/2025/regular/teams.csv"
    r = requests.get(url, headers=headers, timeout=20)
    if r.status_code != 200:
        raise RuntimeError(f"MoneyPuck teams fetch failed: HTTP {r.status_code}")
    reader = csv.DictReader(io.StringIO(r.text))
    teams = list(reader)
    
    # Filter to 5v5 situation
    fv5 = {t['team']: t for t in teams if t.get('situation') == '5on5'}
    log(f"  Loaded {len(fv5)} teams in 5v5 situation")
    
    # Map MoneyPuck abbreviations to NST-style abbreviations used in DB
    # MoneyPuck uses: ANA, ARI→UTA, BOS, BUF, CAR, CBJ, CGY, CHI, COL, DAL, DET, EDM, FLA, LAK, MIN, MTL, NJD, NSH, NYI, NYR, OTT, PHI, PIT, SEA, SJS, STL, TBL, TOR, UTA, VAN, VGK, WPG, WSH
    
    team_stats = {}
    for abbrev, row in fv5.items():
        icetime_min = float(row.get('iceTime', 0) or 0) / 60.0  # convert seconds to minutes
        if icetime_min < 1:
            log(f"  WARNING: {abbrev} has near-zero icetime ({icetime_min:.1f} min), skipping")
            continue
        
        # Raw counts
        xGF = float(row.get('xGoalsFor', 0) or 0)
        xGA = float(row.get('xGoalsAgainst', 0) or 0)
        HDCF = float(row.get('highDangerShotsFor', 0) or 0)  # high danger shots for = HDCF proxy
        HDCA = float(row.get('highDangerShotsAgainst', 0) or 0)
        SCF = float(row.get('mediumDangerShotsFor', 0) or 0) + HDCF  # medium+high danger = scoring chances
        SCA = float(row.get('mediumDangerShotsAgainst', 0) or 0) + HDCA
        CF = float(row.get('shotAttemptsFor', 0) or 0)
        CA = float(row.get('shotAttemptsAgainst', 0) or 0)
        
        # Per-60 rates
        xGF_60  = (xGF  / icetime_min) * 60.0
        xGA_60  = (xGA  / icetime_min) * 60.0
        HDCF_60 = (HDCF / icetime_min) * 60.0
        HDCA_60 = (HDCA / icetime_min) * 60.0
        SCF_60  = (SCF  / icetime_min) * 60.0
        SCA_60  = (SCA  / icetime_min) * 60.0
        CF_60   = (CF   / icetime_min) * 60.0
        CA_60   = (CA   / icetime_min) * 60.0
        
        team_stats[abbrev] = {
            "xGF_60":  round(xGF_60, 4),
            "xGA_60":  round(xGA_60, 4),
            "HDCF_60": round(HDCF_60, 4),
            "HDCA_60": round(HDCA_60, 4),
            "SCF_60":  round(SCF_60, 4),
            "SCA_60":  round(SCA_60, 4),
            "CF_60":   round(CF_60, 4),
            "CA_60":   round(CA_60, 4),
        }
    
    # Log all 32 teams
    log(f"  Team stats computed for {len(team_stats)} teams:")
    for abbrev, stats in sorted(team_stats.items()):
        log(f"    {abbrev}: xGF_60={stats['xGF_60']:.3f} xGA_60={stats['xGA_60']:.3f} HDCF_60={stats['HDCF_60']:.3f} HDCA_60={stats['HDCA_60']:.3f} SCF_60={stats['SCF_60']:.3f} SCA_60={stats['SCA_60']:.3f} CF_60={stats['CF_60']:.3f}")
    
    return team_stats

# ─── STEP 2: Load goalie stats ────────────────────────────────────────────────
def fetch_goalie_stats():
    log("STEP 2: Fetching MoneyPuck goalie stats (all situations)...")
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://moneypuck.com/'}
    url = "https://moneypuck.com/moneypuck/playerData/seasonSummary/2025/regular/goalies.csv"
    r = requests.get(url, headers=headers, timeout=20)
    if r.status_code != 200:
        raise RuntimeError(f"MoneyPuck goalies fetch failed: HTTP {r.status_code}")
    reader = csv.DictReader(io.StringIO(r.text))
    goalies = list(reader)
    
    # Filter to 'all' situation
    all_sit = [g for g in goalies if g.get('situation') == 'all']
    
    goalie_stats = {}
    for g in all_sit:
        name = g.get('name', '')
        gp = float(g.get('games_played', 0) or 0)
        xGA = float(g.get('xGoals', 0) or 0)
        GA  = float(g.get('goals', 0) or 0)
        shots = float(g.get('ongoal', 0) or 0)
        gsax = xGA - GA if xGA > 0 else 0
        sv_pct = (shots - GA) / shots if shots > 0 else 0.910
        
        goalie_stats[name] = {
            'name': name,
            'team': g.get('team', ''),
            'gamesPlayed': int(gp),
            'savePct': round(sv_pct, 4),
            'gsax': round(gsax, 2),
            'shotsAgainst': int(shots),
        }
    
    log(f"  Loaded stats for {len(goalie_stats)} goalies")
    return goalie_stats

# ─── STEP 3: March 28 games definition ────────────────────────────────────────
# DB IDs and lines from the database (verified March 28, 2026)
# Starting goalies confirmed from GameDayTweets
GAMES = [
    {
        "db_id": None,  # Will be matched by team abbrevs
        "away_team": "Ottawa Senators",
        "home_team": "Tampa Bay Lightning",
        "away_abbrev": "OTT",
        "home_abbrev": "TBL",
        "away_goalie": "James Reimer",
        "home_goalie": "Andrei Vasilevskiy",
        "start_time": "1:00 PM ET",
        "mkt_away_ml": 195,
        "mkt_home_ml": -240,
        "mkt_total": 5.5,
        "mkt_away_pl_odds": -135,
        "mkt_home_pl_odds": 115,
        "mkt_over_odds": -115,
        "mkt_under_odds": -105,
        "away_rest_days": 2,
        "home_rest_days": 2,
    },
    {
        "db_id": None,
        "away_team": "Florida Panthers",
        "home_team": "New York Islanders",
        "away_abbrev": "FLA",
        "home_abbrev": "NYI",
        "away_goalie": "Daniil Tarasov",
        "home_goalie": "Ilya Sorokin",
        "start_time": "1:00 PM ET",
        "mkt_away_ml": -135,
        "mkt_home_ml": 115,
        "mkt_total": 5.5,
        "mkt_away_pl_odds": 130,
        "mkt_home_pl_odds": -155,
        "mkt_over_odds": -110,
        "mkt_under_odds": -110,
        "away_rest_days": 2,
        "home_rest_days": 2,
    },
    {
        "db_id": None,
        "away_team": "Anaheim Ducks",
        "home_team": "Edmonton Oilers",
        "away_abbrev": "ANA",
        "home_abbrev": "EDM",
        "away_goalie": "Lukas Dostal",
        "home_goalie": "Connor Ingram",
        "start_time": "3:30 PM ET",
        "mkt_away_ml": 220,
        "mkt_home_ml": -270,
        "mkt_total": 6.0,
        "mkt_away_pl_odds": -115,
        "mkt_home_pl_odds": -105,
        "mkt_over_odds": -115,
        "mkt_under_odds": -105,
        "away_rest_days": 2,
        "home_rest_days": 2,
    },
    {
        "db_id": None,
        "away_team": "Minnesota Wild",
        "home_team": "Boston Bruins",
        "away_abbrev": "MIN",
        "home_abbrev": "BOS",
        "away_goalie": "Filip Gustavsson",
        "home_goalie": "Jeremy Swayman",
        "start_time": "5:00 PM ET",
        "mkt_away_ml": 145,
        "mkt_home_ml": -175,
        "mkt_total": 5.5,
        "mkt_away_pl_odds": -120,
        "mkt_home_pl_odds": 100,
        "mkt_over_odds": -110,
        "mkt_under_odds": -110,
        "away_rest_days": 2,
        "home_rest_days": 2,
    },
    {
        "db_id": None,
        "away_team": "New Jersey Devils",
        "home_team": "Carolina Hurricanes",
        "away_abbrev": "NJD",
        "home_abbrev": "CAR",
        "away_goalie": "Jacob Markstrom",
        "home_goalie": "Brandon Bussi",
        "start_time": "5:00 PM ET",
        "mkt_away_ml": 145,
        "mkt_home_ml": -175,
        "mkt_total": 5.5,
        "mkt_away_pl_odds": -120,
        "mkt_home_pl_odds": 100,
        "mkt_over_odds": -110,
        "mkt_under_odds": -110,
        "away_rest_days": 2,
        "home_rest_days": 2,
    },
    {
        "db_id": None,
        "away_team": "San Jose Sharks",
        "home_team": "Columbus Blue Jackets",
        "away_abbrev": "SJS",
        "home_abbrev": "CBJ",
        "away_goalie": "Alex Nedeljkovic",
        "home_goalie": "Elvis Merzlikins",
        "start_time": "5:00 PM ET",
        "mkt_away_ml": 115,
        "mkt_home_ml": -135,
        "mkt_total": 5.5,
        "mkt_away_pl_odds": -145,
        "mkt_home_pl_odds": 125,
        "mkt_over_odds": -110,
        "mkt_under_odds": -110,
        "away_rest_days": 2,
        "home_rest_days": 2,
    },
    {
        "db_id": None,
        "away_team": "Dallas Stars",
        "home_team": "Pittsburgh Penguins",
        "away_abbrev": "DAL",
        "home_abbrev": "PIT",
        "away_goalie": "Jake Oettinger",
        "home_goalie": "Arturs Silovs",
        "start_time": "5:00 PM ET",
        "mkt_away_ml": -200,
        "mkt_home_ml": 165,
        "mkt_total": 5.5,
        "mkt_away_pl_odds": 120,
        "mkt_home_pl_odds": -145,
        "mkt_over_odds": -115,
        "mkt_under_odds": -105,
        "away_rest_days": 2,
        "home_rest_days": 2,
    },
    {
        "db_id": None,
        "away_team": "Seattle Kraken",
        "home_team": "Buffalo Sabres",
        "away_abbrev": "SEA",
        "home_abbrev": "BUF",
        "away_goalie": "Joey Daccord",
        "home_goalie": "Ukko-Pekka Luukkonen",
        "start_time": "5:30 PM ET",
        "mkt_away_ml": 130,
        "mkt_home_ml": -155,
        "mkt_total": 6.0,
        "mkt_away_pl_odds": -130,
        "mkt_home_pl_odds": 110,
        "mkt_over_odds": -115,
        "mkt_under_odds": -105,
        "away_rest_days": 2,
        "home_rest_days": 2,
    },
    {
        "db_id": None,
        "away_team": "Toronto Maple Leafs",
        "home_team": "St. Louis Blues",
        "away_abbrev": "TOR",
        "home_abbrev": "STL",
        "away_goalie": "Joseph Woll",
        "home_goalie": "Jordan Binnington",
        "start_time": "7:00 PM ET",
        "mkt_away_ml": -175,
        "mkt_home_ml": 145,
        "mkt_total": 6.0,
        "mkt_away_pl_odds": 110,
        "mkt_home_pl_odds": -135,
        "mkt_over_odds": -110,
        "mkt_under_odds": -110,
        "away_rest_days": 2,
        "home_rest_days": 2,
    },
    {
        "db_id": None,
        "away_team": "Winnipeg Jets",
        "home_team": "Colorado Avalanche",
        "away_abbrev": "WPG",
        "home_abbrev": "COL",
        "away_goalie": "Connor Hellebuyck",
        "home_goalie": "Scott Wedgewood",
        "start_time": "7:00 PM ET",
        "mkt_away_ml": -145,
        "mkt_home_ml": 120,
        "mkt_total": 6.0,
        "mkt_away_pl_odds": 115,
        "mkt_home_pl_odds": -140,
        "mkt_over_odds": -110,
        "mkt_under_odds": -110,
        "away_rest_days": 2,
        "home_rest_days": 2,
    },
    {
        "db_id": None,
        "away_team": "Montreal Canadiens",
        "home_team": "Nashville Predators",
        "away_abbrev": "MTL",
        "home_abbrev": "NSH",
        "away_goalie": "Jacob Fowler",
        "home_goalie": "Juuse Saros",
        "start_time": "7:00 PM ET",
        "mkt_away_ml": 145,
        "mkt_home_ml": -175,
        "mkt_total": 5.5,
        "mkt_away_pl_odds": -120,
        "mkt_home_pl_odds": 100,
        "mkt_over_odds": -110,
        "mkt_under_odds": -110,
        "away_rest_days": 2,
        "home_rest_days": 2,
    },
    {
        "db_id": None,
        "away_team": "Philadelphia Flyers",
        "home_team": "Detroit Red Wings",
        "away_abbrev": "PHI",
        "home_abbrev": "DET",
        "away_goalie": "Dan Vladar",
        "home_goalie": "Cam Talbot",
        "start_time": "8:00 PM ET",
        "mkt_away_ml": -115,
        "mkt_home_ml": -105,
        "mkt_total": 5.5,
        "mkt_away_pl_odds": -145,
        "mkt_home_pl_odds": 125,
        "mkt_over_odds": -110,
        "mkt_under_odds": -110,
        "away_rest_days": 2,
        "home_rest_days": 2,
    },
    {
        "db_id": None,
        "away_team": "Utah Mammoth",
        "home_team": "Los Angeles Kings",
        "away_abbrev": "UTA",
        "home_abbrev": "LAK",
        "away_goalie": "Karel Vejmelka",
        "home_goalie": "Darcy Kuemper",
        "start_time": "9:00 PM ET",
        "mkt_away_ml": 115,
        "mkt_home_ml": -135,
        "mkt_total": 5.5,
        "mkt_away_pl_odds": -145,
        "mkt_home_pl_odds": 125,
        "mkt_over_odds": -110,
        "mkt_under_odds": -110,
        "away_rest_days": 2,
        "home_rest_days": 2,
    },
    {
        "db_id": None,
        "away_team": "Vancouver Canucks",
        "home_team": "Calgary Flames",
        "away_abbrev": "VAN",
        "home_abbrev": "CGY",
        "away_goalie": "Kevin Lankinen",
        "home_goalie": "Dustin Wolf",
        "start_time": "10:00 PM ET",
        "mkt_away_ml": 110,
        "mkt_home_ml": -130,
        "mkt_total": 6.0,
        "mkt_away_pl_odds": -150,
        "mkt_home_pl_odds": 130,
        "mkt_over_odds": -110,
        "mkt_under_odds": -110,
        "away_rest_days": 2,
        "home_rest_days": 2,
    },
    {
        "db_id": None,
        "away_team": "Washington Capitals",
        "home_team": "Vegas Golden Knights",
        "away_abbrev": "WSH",
        "home_abbrev": "VGK",
        "away_goalie": "Logan Thompson",
        "home_goalie": "Adin Hill",
        "start_time": "10:30 PM ET",
        "mkt_away_ml": -120,
        "mkt_home_ml": 100,
        "mkt_total": 6.0,
        "mkt_away_pl_odds": -155,
        "mkt_home_pl_odds": 135,
        "mkt_over_odds": -110,
        "mkt_under_odds": -110,
        "away_rest_days": 2,
        "home_rest_days": 2,
    },
]

# ─── STEP 4: Run the model ────────────────────────────────────────────────────
def run_game(game, team_stats, goalie_stats):
    away_abbrev = game["away_abbrev"]
    home_abbrev = game["home_abbrev"]
    away_goalie_name = game["away_goalie"]
    home_goalie_name = game["home_goalie"]
    
    # Get goalie stats
    ag = goalie_stats.get(away_goalie_name, {})
    hg = goalie_stats.get(home_goalie_name, {})
    
    log(f"\n  ── {game['away_team']} @ {game['home_team']} ({game['start_time']}) ──")
    log(f"     Away goalie: {away_goalie_name} | SV%={ag.get('savePct', 'N/A')} | GSAx={ag.get('gsax', 'N/A')} | GP={ag.get('gamesPlayed', 'N/A')} | SF={ag.get('shotsAgainst', 'N/A')}")
    log(f"     Home goalie: {home_goalie_name} | SV%={hg.get('savePct', 'N/A')} | GSAx={hg.get('gsax', 'N/A')} | GP={hg.get('gamesPlayed', 'N/A')} | SF={hg.get('shotsAgainst', 'N/A')}")
    
    # Verify team stats exist
    if away_abbrev not in team_stats:
        log(f"  [ERROR] Missing team stats for {away_abbrev}")
        return None
    if home_abbrev not in team_stats:
        log(f"  [ERROR] Missing team stats for {home_abbrev}")
        return None
    
    away_ts = team_stats[away_abbrev]
    home_ts = team_stats[home_abbrev]
    log(f"     Away team ({away_abbrev}): xGF_60={away_ts['xGF_60']} xGA_60={away_ts['xGA_60']} HDCF_60={away_ts['HDCF_60']} HDCA_60={away_ts['HDCA_60']}")
    log(f"     Home team ({home_abbrev}): xGF_60={home_ts['xGF_60']} xGA_60={home_ts['xGA_60']} HDCF_60={home_ts['HDCF_60']} HDCA_60={home_ts['HDCA_60']}")
    
    # Build engine input
    engine_input = {
        "away_team": game["away_team"],
        "home_team": game["home_team"],
        "away_abbrev": away_abbrev,
        "home_abbrev": home_abbrev,
        "away_goalie": away_goalie_name,
        "home_goalie": home_goalie_name,
        "away_goalie_gsax": ag.get("gsax", 0.0),
        "away_goalie_shots_faced": ag.get("shotsAgainst", 0),
        "away_goalie_gp": ag.get("gamesPlayed", 1),
        "home_goalie_gsax": hg.get("gsax", 0.0),
        "home_goalie_shots_faced": hg.get("shotsAgainst", 0),
        "home_goalie_gp": hg.get("gamesPlayed", 1),
        "away_rest_days": game.get("away_rest_days"),
        "home_rest_days": game.get("home_rest_days"),
        "mkt_away_ml": game.get("mkt_away_ml"),
        "mkt_home_ml": game.get("mkt_home_ml"),
        "mkt_total": game.get("mkt_total"),
        "mkt_away_pl_odds": game.get("mkt_away_pl_odds"),
        "mkt_home_pl_odds": game.get("mkt_home_pl_odds"),
        "mkt_over_odds": game.get("mkt_over_odds"),
        "mkt_under_odds": game.get("mkt_under_odds"),
        "team_stats": {
            away_abbrev: away_ts,
            home_abbrev: home_ts,
        },
    }
    
    # Run the engine
    engine_path = os.path.join(os.path.dirname(__file__), "nhl_model_engine.py")
    t0 = time.time()
    proc = subprocess.run(
        [sys.executable, engine_path],
        input=json.dumps(engine_input),
        capture_output=True,
        text=True,
        timeout=120,
    )
    elapsed = time.time() - t0
    
    if proc.returncode != 0:
        log(f"  [ERROR] Engine exited with code {proc.returncode}")
        log(f"  STDERR: {proc.stderr[-2000:]}")
        return None
    
    # Log the full engine stderr (deep debug)
    if proc.stderr:
        for line in proc.stderr.strip().split('\n'):
            log(f"  ENGINE: {line}")
    
    try:
        result = json.loads(proc.stdout.strip())
    except json.JSONDecodeError as e:
        log(f"  [ERROR] JSON parse failed: {e}")
        log(f"  STDOUT: {proc.stdout[:500]}")
        return None
    
    if not result.get("ok"):
        log(f"  [ERROR] Engine returned ok=false: {result.get('error', 'unknown')}")
        return None
    
    log(f"  [OK] {away_abbrev} @ {home_abbrev} completed in {elapsed:.1f}s")
    log(f"       Model: {result.get('proj_away_goals', '?'):.2f}–{result.get('proj_home_goals', '?'):.2f} | Total={result.get('model_total', '?')} | Spread={result.get('model_spread', '?')}")
    log(f"       ML: {result.get('model_away_ml', '?')} / {result.get('model_home_ml', '?')}")
    log(f"       PL: {result.get('model_away_pl_odds', '?')} / {result.get('model_home_pl_odds', '?')}")
    log(f"       O/U: {result.get('model_over_odds', '?')} / {result.get('model_under_odds', '?')}")
    log(f"       Over%={result.get('over_pct', '?'):.1f}% Under%={result.get('under_pct', '?'):.1f}%")
    log(f"       Away win%={result.get('away_win_pct', '?'):.1f}% Home win%={result.get('home_win_pct', '?'):.1f}%")
    
    return {**result, "game": game}

def run_all():
    # Clear log
    with open(LOG_FILE, "w") as f:
        f.write(f"=== March 28, 2026 NHL Model Run ===\n")
        f.write(f"Started: {datetime.now().isoformat()}\n\n")
    
    log("=== March 28, 2026 NHL Model Runner ===")
    log(f"Games to model: {len(GAMES)}")
    
    # Fetch data
    team_stats = fetch_team_stats()
    goalie_stats = fetch_goalie_stats()
    
    log(f"\nSTEP 3: Running model for {len(GAMES)} games...")
    
    results = []
    errors = []
    
    for i, game in enumerate(GAMES):
        log(f"\n[GAME {i+1}/{len(GAMES)}] {game['away_abbrev']} @ {game['home_abbrev']}")
        result = run_game(game, team_stats, goalie_stats)
        if result:
            results.append(result)
        else:
            errors.append(f"{game['away_abbrev']} @ {game['home_abbrev']}")
    
    log(f"\n=== SUMMARY ===")
    log(f"  Completed: {len(results)}/{len(GAMES)} games")
    if errors:
        log(f"  Errors: {errors}")
    
    # Save results
    with open(RESULTS_FILE, "w") as f:
        json.dump(results, f, indent=2)
    log(f"\nResults saved to {RESULTS_FILE}")
    
    return results

if __name__ == "__main__":
    results = run_all()
    print(f"\n✅ Completed {len(results)}/{len(GAMES)} games")
