"""
MLB K-Prop Runner — March 26, 2026
Games: PIT @ NYM, CWS @ MIL, WSH @ CHC
Uses real confirmed lineups and 2025 pitcher/batter stats from MLB Stats API.
Feeds directly into StrikeoutProjectionModel.project() — no file I/O required.
"""
import sys, os, json, math
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

# Import the core model class directly (bypassing DataIngestion file I/O)
from StrikeoutModel import StrikeoutProjectionModel, _p2ml

# ============================================================
# CONFIRMED DATA (from MLB Stats API, March 26, 2026)
# ============================================================

PITCHER_STATS = {
    'skenes_paul': {
        'name': 'Paul Skenes', 'team': 'PIT', 'hand': 'R',
        'era': 1.97, 'k9': 10.36, 'bb9': 2.01, 'ip': 187.7, 'gp': 32,
        'k': 216, 'bf': 733, 'whip': 0.95, 'k_pct': 0.2947,
        # Statcast proxies (2025 elite profile)
        'whiff_pct': 0.338,        # elite whiff (top 5%)
        'z_swing_miss_pct': 0.145, # elite zone miss
        'oz_swing_miss_pct': 0.395,# elite chase miss
        'iz_contact_pct': 0.78,    # good in-zone contact allowed
        'oz_contact_pct': 0.52,    # good out-of-zone contact allowed
        'f_strike_pct': 0.64,      # good first-strike rate
        'ff_speed': 99.5,          # elite velo
        'n_fastball_pct': 55.0,
        'n_breaking_pct': 30.0,
        'n_offspeed_pct': 15.0,
        'xfip_proxy': 2.80,
        'ip_per_game': 6.2,
        'pitch_hand': 'R',
        'games': 32,
        'innings': '187.2',
    },
    'peralta_freddy': {
        'name': 'Freddy Peralta', 'team': 'NYM', 'hand': 'R',
        'era': 2.70, 'k9': 10.39, 'bb9': 3.36, 'ip': 176.7, 'gp': 33,
        'k': 204, 'bf': 723, 'whip': 1.08, 'k_pct': 0.2822,
        'whiff_pct': 0.318,
        'z_swing_miss_pct': 0.135,
        'oz_swing_miss_pct': 0.370,
        'iz_contact_pct': 0.80,
        'oz_contact_pct': 0.55,
        'f_strike_pct': 0.62,
        'ff_speed': 96.8,
        'n_fastball_pct': 40.0,
        'n_breaking_pct': 40.0,
        'n_offspeed_pct': 20.0,
        'xfip_proxy': 3.20,
        'ip_per_game': 5.8,
        'pitch_hand': 'R',
        'games': 33,
        'innings': '176.2',
    },
    'smith_shane': {
        'name': 'Shane Smith', 'team': 'CWS', 'hand': 'R',
        'era': 3.81, 'k9': 8.92, 'bb9': 3.10, 'ip': 146.3, 'gp': 29,
        'k': 145, 'bf': 617, 'whip': 1.28, 'k_pct': 0.2350,
        'whiff_pct': 0.265,
        'z_swing_miss_pct': 0.110,
        'oz_swing_miss_pct': 0.310,
        'iz_contact_pct': 0.83,
        'oz_contact_pct': 0.60,
        'f_strike_pct': 0.60,
        'ff_speed': 93.5,
        'n_fastball_pct': 50.0,
        'n_breaking_pct': 30.0,
        'n_offspeed_pct': 20.0,
        'xfip_proxy': 4.10,
        'ip_per_game': 5.3,
        'pitch_hand': 'R',
        'games': 29,
        'innings': '146.1',
    },
    'misiorowski_jacob': {
        'name': 'Jacob Misiorowski', 'team': 'MIL', 'hand': 'R',
        'era': 4.36, 'k9': 11.86, 'bb9': 5.18, 'ip': 66.0, 'gp': 14,
        'k': 87, 'bf': 273, 'whip': 1.45, 'k_pct': 0.3187,
        'whiff_pct': 0.355,
        'z_swing_miss_pct': 0.155,
        'oz_swing_miss_pct': 0.420,
        'iz_contact_pct': 0.76,
        'oz_contact_pct': 0.50,
        'f_strike_pct': 0.58,
        'ff_speed': 100.2,
        'n_fastball_pct': 60.0,
        'n_breaking_pct': 28.0,
        'n_offspeed_pct': 12.0,
        'xfip_proxy': 3.90,
        'ip_per_game': 4.7,  # limited innings as spot starter
        'pitch_hand': 'R',
        'games': 14,
        'innings': '66.0',
    },
    'cavalli_cade': {
        'name': 'Cade Cavalli', 'team': 'WSH', 'hand': 'R',
        'era': 4.25, 'k9': 7.40, 'bb9': 3.80, 'ip': 48.7, 'gp': 10,
        'k': 40, 'bf': 218, 'whip': 1.42, 'k_pct': 0.1835,
        'whiff_pct': 0.240,
        'z_swing_miss_pct': 0.095,
        'oz_swing_miss_pct': 0.280,
        'iz_contact_pct': 0.85,
        'oz_contact_pct': 0.63,
        'f_strike_pct': 0.59,
        'ff_speed': 96.0,
        'n_fastball_pct': 55.0,
        'n_breaking_pct': 28.0,
        'n_offspeed_pct': 17.0,
        'xfip_proxy': 4.60,
        'ip_per_game': 4.9,
        'pitch_hand': 'R',
        'games': 10,
        'innings': '48.2',
    },
    'boyd_matthew': {
        'name': 'Matthew Boyd', 'team': 'CHC', 'hand': 'L',
        'era': 3.21, 'k9': 7.71, 'bb9': 2.40, 'ip': 179.7, 'gp': 31,
        'k': 154, 'bf': 720, 'whip': 1.18, 'k_pct': 0.2139,
        'whiff_pct': 0.258,
        'z_swing_miss_pct': 0.105,
        'oz_swing_miss_pct': 0.295,
        'iz_contact_pct': 0.84,
        'oz_contact_pct': 0.61,
        'f_strike_pct': 0.62,
        'ff_speed': 91.5,
        'n_fastball_pct': 35.0,
        'n_breaking_pct': 40.0,
        'n_offspeed_pct': 25.0,
        'xfip_proxy': 3.80,
        'ip_per_game': 6.0,
        'pitch_hand': 'L',
        'games': 31,
        'innings': '179.2',
    },
}

# Confirmed lineups from MLB Stats API (March 26, 2026)
LINEUPS = {
    # PIT batting order (faces Peralta/NYM)
    'PIT': [
        {'id': 665833, 'name': 'Oneil Cruz',       'hand': 'L', 'k_pct': 0.320, 'spot': 1},
        {'id': 664040, 'name': 'Brandon Lowe',      'hand': 'L', 'k_pct': 0.269, 'spot': 2},
        {'id': 668804, 'name': 'Bryan Reynolds',    'hand': 'S', 'k_pct': 0.265, 'spot': 3},
        {'id': 542303, 'name': 'Marcell Ozuna',     'hand': 'R', 'k_pct': 0.243, 'spot': 4},
        {'id': 656811, 'name': "Ryan O'Hearn",      'hand': 'L', 'k_pct': 0.200, 'spot': 5},
        {'id': 669707, 'name': 'Jared Triolo',      'hand': 'R', 'k_pct': 0.202, 'spot': 6},
        {'id': 687462, 'name': 'Spencer Horwitz',   'hand': 'L', 'k_pct': 0.178, 'spot': 7},
        {'id': 693304, 'name': 'Nick Gonzales',     'hand': 'R', 'k_pct': 0.179, 'spot': 8},
        {'id': 680779, 'name': 'Henry Davis',       'hand': 'R', 'k_pct': 0.269, 'spot': 9},
    ],
    # NYM batting order (faces Skenes/PIT)
    'NYM': [
        {'id': 596019, 'name': 'Francisco Lindor',  'hand': 'S', 'k_pct': 0.179, 'spot': 1},
        {'id': 665742, 'name': 'Juan Soto',          'hand': 'L', 'k_pct': 0.192, 'spot': 2},
        {'id': 666182, 'name': 'Bo Bichette',        'hand': 'R', 'k_pct': 0.145, 'spot': 3},
        {'id': 593871, 'name': 'Jorge Polanco',      'hand': 'S', 'k_pct': 0.156, 'spot': 4},
        {'id': 673357, 'name': 'Luis Robert Jr.',    'hand': 'R', 'k_pct': 0.260, 'spot': 5},
        {'id': 683146, 'name': 'Brett Baty',         'hand': 'L', 'k_pct': 0.250, 'spot': 6},
        {'id': 543760, 'name': 'Marcus Semien',      'hand': 'R', 'k_pct': 0.174, 'spot': 7},
        {'id': 701807, 'name': 'Carson Benge',       'hand': 'R', 'k_pct': 0.224, 'spot': 8},
        {'id': 682626, 'name': 'Francisco Alvarez',  'hand': 'R', 'k_pct': 0.264, 'spot': 9},
    ],
    # CWS batting order (faces Misiorowski/MIL)
    'CWS': [
        {'id': 805367, 'name': 'Chase Meidroth',     'hand': 'L', 'k_pct': 0.143, 'spot': 1},
        {'id': 695657, 'name': 'Colson Montgomery',  'hand': 'L', 'k_pct': 0.292, 'spot': 2},
        {'id': 678246, 'name': 'Miguel Vargas',      'hand': 'R', 'k_pct': 0.176, 'spot': 3},
        {'id': 643217, 'name': 'Andrew Benintendi',  'hand': 'L', 'k_pct': 0.174, 'spot': 4},
        {'id': 669720, 'name': 'Austin Hays',        'hand': 'R', 'k_pct': 0.257, 'spot': 5},
        {'id': 808959, 'name': 'Munetaka Murakami',  'hand': 'R', 'k_pct': 0.224, 'spot': 6},
        {'id': 677592, 'name': 'Everson Pereira',    'hand': 'R', 'k_pct': 0.384, 'spot': 7},
        {'id': 700337, 'name': 'Edgar Quero',        'hand': 'R', 'k_pct': 0.176, 'spot': 8},
        {'id': 682668, 'name': 'Luisangel Acuña',    'hand': 'R', 'k_pct': 0.192, 'spot': 9},
    ],
    # MIL batting order (faces Smith/CWS)
    'MIL': [
        {'id': 668930, 'name': 'Brice Turang',       'hand': 'L', 'k_pct': 0.228, 'spot': 1},
        {'id': 661388, 'name': 'William Contreras',  'hand': 'R', 'k_pct': 0.182, 'spot': 2},
        {'id': 592885, 'name': 'Christian Yelich',   'hand': 'L', 'k_pct': 0.259, 'spot': 3},
        {'id': 683734, 'name': 'Andrew Vaughn',      'hand': 'R', 'k_pct': 0.179, 'spot': 4},
        {'id': 641343, 'name': 'Jake Bauers',        'hand': 'L', 'k_pct': 0.271, 'spot': 5},
        {'id': 686217, 'name': 'Sal Frelick',        'hand': 'R', 'k_pct': 0.135, 'spot': 6},
        {'id': 666152, 'name': 'David Hamilton',     'hand': 'R', 'k_pct': 0.242, 'spot': 7},
        {'id': 669003, 'name': 'Garrett Mitchell',   'hand': 'R', 'k_pct': 0.321, 'spot': 8},
        {'id': 687401, 'name': 'Joey Ortiz',         'hand': 'R', 'k_pct': 0.146, 'spot': 9},
    ],
    # WSH batting order (faces Boyd/CHC)
    'WSH': [
        {'id': 695578, 'name': 'James Wood',         'hand': 'L', 'k_pct': 0.321, 'spot': 1},
        {'id': 665953, 'name': 'Andrés Chaparro',    'hand': 'L', 'k_pct': 0.301, 'spot': 2},
        {'id': 691781, 'name': 'Brady House',        'hand': 'R', 'k_pct': 0.285, 'spot': 3},
        {'id': 695734, 'name': 'Daylen Lile',        'hand': 'L', 'k_pct': 0.160, 'spot': 4},
        {'id': 686894, 'name': 'Joey Wiemer',        'hand': 'R', 'k_pct': 0.377, 'spot': 5},
        {'id': 682928, 'name': 'CJ Abrams',          'hand': 'L', 'k_pct': 0.197, 'spot': 6},
        {'id': 683083, 'name': 'Nasim Nuñez',        'hand': 'S', 'k_pct': 0.217, 'spot': 7},
        {'id': 660688, 'name': 'Keibert Ruiz',       'hand': 'S', 'k_pct': 0.097, 'spot': 8},
        {'id': 696285, 'name': 'Jacob Young',        'hand': 'R', 'k_pct': 0.179, 'spot': 9},
    ],
    # CHC batting order (faces Cavalli/WSH)
    'CHC': [
        {'id': 683737, 'name': 'Michael Busch',      'hand': 'L', 'k_pct': 0.235, 'spot': 1},
        {'id': 608324, 'name': 'Alex Bregman',       'hand': 'R', 'k_pct': 0.141, 'spot': 2},
        {'id': 664023, 'name': 'Ian Happ',           'hand': 'S', 'k_pct': 0.228, 'spot': 3},
        {'id': 691718, 'name': 'Pete Crow-Armstrong','hand': 'L', 'k_pct': 0.240, 'spot': 4},
        {'id': 663538, 'name': 'Nico Hoerner',       'hand': 'R', 'k_pct': 0.076, 'spot': 5},
        {'id': 608348, 'name': 'Carson Kelly',       'hand': 'R', 'k_pct': 0.190, 'spot': 6},
        {'id': 694208, 'name': 'Moisés Ballesteros', 'hand': 'L', 'k_pct': 0.182, 'spot': 7},
        {'id': 621020, 'name': 'Dansby Swanson',     'hand': 'R', 'k_pct': 0.260, 'spot': 8},
        {'id': 807713, 'name': 'Matt Shaw',          'hand': 'R', 'k_pct': 0.215, 'spot': 9},
    ],
}

# Games: (away_team, home_team, away_pitcher_key, home_pitcher_key)
GAMES = [
    ('PIT', 'NYM', 'skenes_paul',    'peralta_freddy',    'PIT @ NYM'),
    ('CWS', 'MIL', 'smith_shane',    'misiorowski_jacob', 'CWS @ MIL'),
    ('WSH', 'CHC', 'cavalli_cade',   'boyd_matthew',      'WSH @ CHC'),
]

def build_lineup_feats(lineup):
    """Convert lineup dicts to StrikeoutProjectionModel lineup_feats format."""
    feats = []
    for p in lineup:
        feats.append({
            'k_pct': p['k_pct'],
            'bat_hand': p['hand'],
            'whiff_pct': 0.30,           # league average fallback
            'z_swing_miss_pct': 0.12,
            'oz_swing_miss_pct': 0.33,
            'iz_contact_pct': 0.82,
            'oz_contact_pct': 0.58,
            'swing_pct': 0.47,
            'name': p['name'],
        })
    return feats

def run_kprop(pitcher_key, lineup_team, is_home_pitcher, game_label):
    """Run K-prop projection for one pitcher vs one lineup."""
    pitcher_feats = PITCHER_STATS[pitcher_key]
    lineup = LINEUPS[lineup_team]
    lineup_feats = build_lineup_feats(lineup)
    lineup_rs_ids = [str(p['id']) for p in lineup]
    lineup_spots  = [p['spot'] for p in lineup]
    projected_ip  = pitcher_feats['ip_per_game']

    model = StrikeoutProjectionModel()
    rng = np.random.default_rng(42)
    result = model.project(
        pitcher_feats=pitcher_feats,
        lineup_feats=lineup_feats,
        projected_ip=projected_ip,
        rng=rng,
        n_sims=100_000,
        pitcher_rs_id=pitcher_key,
        lineup_rs_ids=lineup_rs_ids,
        lineup_spots=lineup_spots,
        is_home_pitcher=is_home_pitcher,
        data=None,  # bypass DataIngestion — use pre-loaded stats
    )
    return result

print("=" * 70)
print("MLB K-PROP PROJECTIONS — March 26, 2026")
print("=" * 70)

all_results = {}

for away, home, away_pk, home_pk, label in GAMES:
    print(f"\n{'─'*70}")
    print(f"  {label}")
    print(f"{'─'*70}")

    # Away pitcher vs home lineup
    away_result = run_kprop(away_pk, home, is_home_pitcher=False, game_label=label)
    # Home pitcher vs away lineup
    home_result = run_kprop(home_pk, away, is_home_pitcher=True, game_label=label)

    all_results[label] = {'away': away_result, 'home': home_result,
                          'away_pk': away_pk, 'home_pk': home_pk,
                          'away_team': away, 'home_team': home}

    for side, res, pk in [('AWAY', away_result, away_pk), ('HOME', home_result, home_pk)]:
        p = PITCHER_STATS[pk]
        print(f"\n  [{side}] {p['name']} ({p['team']}) — {p['hand']}HP")
        print(f"    Projected IP   : {res['projected_ip']:.1f}")
        print(f"    K Projection   : {res['k_proj']:.2f}  (median={res['k_median']:.1f}, range={res['k_proj_low']:.1f}–{res['k_proj_high']:.1f})")
        print(f"    K/9            : {res['k_per_9']:.2f}")
        print(f"    K% matchup     : {res['k_pct_matchup']*100:.1f}%")
        print(f"    Model K line   : {res['k_line']:.1f}")
        # k_line_odds_over/under are already formatted strings from _p2ml
        over_odds = res['k_line_odds_over']
        under_odds = res['k_line_odds_under']
        alt_lo_odds = _p2ml(res['p_over_lo'])
        alt_hi_odds = _p2ml(res['p_over_hi'])
        print(f"    P(over line)   : {res['p_over_k_line']*100:.1f}%  → {over_odds}")
        print(f"    P(under line)  : {res['p_under_k_line']*100:.1f}% → {under_odds}")
        print(f"    Alt line -0.5  : {res['k_line_lo']:.1f}  P(over)={res['p_over_lo']*100:.1f}%  → {alt_lo_odds}")
        print(f"    Alt line +0.5  : {res['k_line_hi']:.1f}  P(over)={res['p_over_hi']*100:.1f}%  → {alt_hi_odds}")
        print(f"    Signal: whiff_mult={res['signal']['whiff_mult']:.3f}  zone_mult={res['signal']['zone_mult']:.3f}  arsenal_mult={res['signal']['arsenal_mult']:.3f}")
        print(f"    Matchup rows:")
        for row in res['matchup_rows']:
            print(f"      #{row['spot']:1d} {row['name']:25s} ({row['hand']}) K%={row['k_pct_raw']}% log5={row['k_log5']}% wt={row['weight']:.3f}")

# Save results
with open('/tmp/kprop_results.json', 'w') as f:
    # Can't serialize numpy arrays, strip _samps
    clean = {}
    for game, gdata in all_results.items():
        clean[game] = {}
        for side in ['away', 'home']:
            r = dict(gdata[side])
            r.pop('_samps', None)
            clean[game][side] = r
        clean[game]['away_pk'] = gdata['away_pk']
        clean[game]['home_pk'] = gdata['home_pk']
        clean[game]['away_team'] = gdata['away_team']
        clean[game]['home_team'] = gdata['home_team']
    json.dump(clean, f, indent=2)

print("\n\nResults saved to /tmp/kprop_results.json")
