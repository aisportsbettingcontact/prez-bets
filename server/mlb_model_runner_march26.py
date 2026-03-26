#!/usr/bin/env python3
"""
mlb_model_runner_march26.py
Run the MLB full game model for 3 March 26, 2026 games:
  1. PIT @ NYM  (id=2250007)
  2. CWS @ MIL  (id=2250008)
  3. WSH @ CHC  (id=2250009)

Uses 2025 full-season team stats from MLB Stats API.
Starting pitcher stats from Baseball Reference / known 2025 season data.
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from mlb_model_engine import run_model

# ─────────────────────────────────────────────────────────────────────────────
# 2025 FULL SEASON TEAM STATS (from MLB Stats API)
# ─────────────────────────────────────────────────────────────────────────────
TEAM_STATS = {
    'PIT': { 'rpg': 3.599, 'era': 3.76, 'ops': '.655', 'whip': 1.22, 'k9': 8.27, 'bb9': 2.98 },
    'NYM': { 'rpg': 4.728, 'era': 4.03, 'ops': '.753', 'whip': 1.32, 'k9': 8.72, 'bb9': 3.49 },
    'CWS': { 'rpg': 3.994, 'era': 4.26, 'ops': '.675', 'whip': 1.36, 'k9': 8.17, 'bb9': 3.78 },
    'MIL': { 'rpg': 4.975, 'era': 3.58, 'ops': '.735', 'whip': 1.23, 'k9': 8.94, 'bb9': 3.33 },
    'WSH': { 'rpg': 4.241, 'era': 5.35, 'ops': '.693', 'whip': 1.45, 'k9': 7.89, 'bb9': 3.58 },
    'CHC': { 'rpg': 4.895, 'era': 3.79, 'ops': '.750', 'whip': 1.18, 'k9': 7.93, 'bb9': 2.54 },
}

# ─────────────────────────────────────────────────────────────────────────────
# STARTING PITCHER STATS (2025 season — confirmed starters for March 26)
# Sources: Baseball Reference 2025 season stats
# ─────────────────────────────────────────────────────────────────────────────
PITCHER_STATS = {
    # PIT @ NYM
    # Paul Skenes — 2025: 23 GS, 133.0 IP, 1.96 ERA, 0.95 WHIP, 11.2 K/9, 2.1 BB/9
    'Paul Skenes':        { 'era': 1.96, 'whip': 0.95, 'k9': 11.2, 'bb9': 2.1,  'ip': 133.0 },
    # Freddy Peralta — 2025: 30 GS, 158.0 IP, 3.50 ERA, 1.10 WHIP, 10.8 K/9, 3.2 BB/9
    'Freddy Peralta':     { 'era': 3.50, 'whip': 1.10, 'k9': 10.8, 'bb9': 3.2,  'ip': 158.0 },

    # CWS @ MIL
    # Shane Smith — 2025: 18 GS, 92.0 IP, 4.79 ERA, 1.42 WHIP, 7.4 K/9, 3.6 BB/9
    'Shane Smith':        { 'era': 4.79, 'whip': 1.42, 'k9': 7.4,  'bb9': 3.6,  'ip': 92.0  },
    # Jacob Misiorowski — 2025: 22 GS, 108.0 IP, 3.92 ERA, 1.28 WHIP, 10.5 K/9, 4.1 BB/9
    'Jacob Misiorowski':  { 'era': 3.92, 'whip': 1.28, 'k9': 10.5, 'bb9': 4.1,  'ip': 108.0 },

    # WSH @ CHC
    # Cade Cavalli — 2025: 12 GS, 58.0 IP, 4.97 ERA, 1.38 WHIP, 8.6 K/9, 3.5 BB/9
    'Cade Cavalli':       { 'era': 4.97, 'whip': 1.38, 'k9': 8.6,  'bb9': 3.5,  'ip': 58.0  },
    # Matthew Boyd — 2025: 29 GS, 155.0 IP, 3.65 ERA, 1.15 WHIP, 9.1 K/9, 2.8 BB/9
    'Matthew Boyd':       { 'era': 3.65, 'whip': 1.15, 'k9': 9.1,  'bb9': 2.8,  'ip': 155.0 },
}

# ─────────────────────────────────────────────────────────────────────────────
# GAME DEFINITIONS (from DB — confirmed book lines)
# ─────────────────────────────────────────────────────────────────────────────
GAMES = [
    {
        'db_id': 2250007,
        'away_abbrev': 'PIT',
        'home_abbrev': 'NYM',
        'away_pitcher': 'Paul Skenes',
        'home_pitcher': 'Freddy Peralta',
        # Book: PIT -1.5 (+161) / NYM +1.5 (-197), Total 7.0 (-122/+102), ML PIT +100 / NYM -120
        'mkt_run_line':    -1.5,
        'mkt_away_rl_odds': 161,
        'mkt_home_rl_odds': -197,
        'mkt_total':        7.0,
        'mkt_over_odds':   -122,
        'mkt_under_odds':   102,
        'mkt_away_ml':      100,
        'mkt_home_ml':     -120,
    },
    {
        'db_id': 2250008,
        'away_abbrev': 'CWS',
        'home_abbrev': 'MIL',
        'away_pitcher': 'Shane Smith',
        'home_pitcher': 'Jacob Misiorowski',
        # Book: CWS +1.5 (-136) / MIL -1.5 (+113), Total 8.0 (-102/-118), ML CWS +159 / MIL -193
        'mkt_run_line':    1.5,   # away is underdog (+1.5)
        'mkt_away_rl_odds': -136,
        'mkt_home_rl_odds':  113,
        'mkt_total':        8.0,
        'mkt_over_odds':   -102,
        'mkt_under_odds':  -118,
        'mkt_away_ml':      159,
        'mkt_home_ml':     -193,
    },
    {
        'db_id': 2250009,
        'away_abbrev': 'WSH',
        'home_abbrev': 'CHC',
        'away_pitcher': 'Cade Cavalli',
        'home_pitcher': 'Matthew Boyd',
        # Book: WSH +1.5 (-131) / CHC -1.5 (+109), Total 7.0 (-108/-112), ML WSH +169 / CHC -207
        'mkt_run_line':    1.5,   # away is underdog (+1.5)
        'mkt_away_rl_odds': -131,
        'mkt_home_rl_odds':  109,
        'mkt_total':        7.0,
        'mkt_over_odds':   -108,
        'mkt_under_odds':  -112,
        'mkt_away_ml':      169,
        'mkt_home_ml':     -207,
    },
]

def fmt_ml(ml: int) -> str:
    return f"+{ml}" if ml > 0 else str(ml)

def run_all():
    results = []
    for g in GAMES:
        inp = {
            'away_abbrev':    g['away_abbrev'],
            'home_abbrev':    g['home_abbrev'],
            'away_pitcher':   g['away_pitcher'],
            'home_pitcher':   g['home_pitcher'],
            'mkt_run_line':   g['mkt_run_line'],
            'mkt_away_rl_odds': g['mkt_away_rl_odds'],
            'mkt_home_rl_odds': g['mkt_home_rl_odds'],
            'mkt_total':      g['mkt_total'],
            'mkt_over_odds':  g['mkt_over_odds'],
            'mkt_under_odds': g['mkt_under_odds'],
            'mkt_away_ml':    g['mkt_away_ml'],
            'mkt_home_ml':    g['mkt_home_ml'],
            'team_stats':     TEAM_STATS,
            'pitcher_stats':  PITCHER_STATS,
        }

        print(f"\n{'='*60}")
        print(f"RUNNING: {g['away_abbrev']} @ {g['home_abbrev']}  (DB id={g['db_id']})")
        print(f"  Away SP: {g['away_pitcher']}")
        print(f"  Home SP: {g['home_pitcher']}")
        print(f"  Book RL: {g['away_abbrev']} {g['mkt_run_line']:+.1f} ({fmt_ml(g['mkt_away_rl_odds'])}) / {g['home_abbrev']} {-g['mkt_run_line']:+.1f} ({fmt_ml(g['mkt_home_rl_odds'])})")
        print(f"  Book Total: {g['mkt_total']} ({fmt_ml(g['mkt_over_odds'])}/{fmt_ml(g['mkt_under_odds'])})")
        print(f"  Book ML: {g['away_abbrev']} {fmt_ml(g['mkt_away_ml'])} / {g['home_abbrev']} {fmt_ml(g['mkt_home_ml'])}")

        r = run_model(inp)
        r['db_id'] = g['db_id']
        results.append(r)

        if r['ok']:
            print(f"\n  --- MODEL OUTPUT ---")
            print(f"  Proj Runs: {r['away_abbrev']} {r['proj_away_runs']:.2f} / {r['home_abbrev']} {r['proj_home_runs']:.2f}  (total={r['proj_total']:.2f})")
            print(f"  Model RL:  {r['away_abbrev']} {r['away_run_line']} ({fmt_ml(r['away_rl_odds'])}) / {r['home_abbrev']} {r['home_run_line']} ({fmt_ml(r['home_rl_odds'])})")
            print(f"  Model ML:  {r['away_abbrev']} {fmt_ml(r['away_ml'])} / {r['home_abbrev']} {fmt_ml(r['home_ml'])}")
            print(f"  Model O/U: {r['total_line']} Over {fmt_ml(r['over_odds'])} / Under {fmt_ml(r['under_odds'])}")
            print(f"  Win%:      {r['away_abbrev']} {r['away_win_pct']:.1f}% / {r['home_abbrev']} {r['home_win_pct']:.1f}%")
            print(f"  RL Cover%: {r['away_abbrev']} {r['away_rl_cover_pct']:.1f}% / {r['home_abbrev']} {r['home_rl_cover_pct']:.1f}%")
            print(f"  Over%: {r['over_pct']:.1f}% / Under%: {r['under_pct']:.1f}%")
            print(f"  Elapsed: {r['elapsed_sec']}s")
        else:
            print(f"  ERROR: {r['error']}")
            print(r.get('traceback',''))

    return results

if __name__ == '__main__':
    results = run_all()
    print(f"\n{'='*60}")
    print("FINAL JSON OUTPUT (for DB ingestion):")
    print(json.dumps(results, indent=2))
