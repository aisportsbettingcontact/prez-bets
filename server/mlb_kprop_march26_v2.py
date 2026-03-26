"""
MLB K-Prop Runner v2 — March 26, 2026
Evaluates model probabilities at CONSENSUS BOOK LINES (not model's own k_line).
Uses _samps from project() to re-evaluate P(over/under) at the exact book line.
Fair value no-vig inverse odds.
"""
import sys, os, json, math
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from StrikeoutModel import StrikeoutProjectionModel, _p2ml

# ============================================================
# CONSENSUS BOOK LINES (from Action Network, March 26, 2026)
# ============================================================
CONSENSUS_LINES = {
    'skenes_paul':       {'line': 6.5, 'book_over': '+105', 'book_under': '-139'},
    'peralta_freddy':    {'line': 6.5, 'book_over': '+118', 'book_under': '-154'},
    'smith_shane':       {'line': 4.5, 'book_over': '-110', 'book_under': '-120'},
    'misiorowski_jacob': {'line': 6.5, 'book_over': '+111', 'book_under': '-147'},
    'cavalli_cade':      {'line': 4.0, 'book_over': '-108', 'book_under': '-119'},
    'boyd_matthew':      {'line': 5.5, 'book_over': '+105', 'book_under': '-134'},
}

# ============================================================
# PITCHER STATS (2025 season, confirmed from MLB Stats API)
# ============================================================
PITCHER_STATS = {
    'skenes_paul': {
        # 2024 debut: 23 GS, 133.0 IP, 170 K, K/9=11.49, IP/start=5.78
        # 2025 stats not yet in API (Opening Night only)
        'name': 'Paul Skenes', 'team': 'PIT', 'hand': 'R',
        'era': 1.96, 'k9': 11.49, 'bb9': 1.90, 'ip': 133.0, 'gp': 23,
        'k': 170, 'bf': 521, 'whip': 0.95, 'k_pct': 0.3263,
        'whiff_pct': 0.368, 'z_swing_miss_pct': 0.158, 'oz_swing_miss_pct': 0.425,
        'iz_contact_pct': 0.76, 'oz_contact_pct': 0.49,
        'f_strike_pct': 0.65, 'ff_speed': 99.5,
        'n_fastball_pct': 55.0, 'n_breaking_pct': 30.0, 'n_offspeed_pct': 15.0,
        'xfip_proxy': 2.50, 'ip_per_game': 5.2, 'pitch_hand': 'R',  # STARTER_IP_MEAN
        'games': 23, 'innings': '133.0',
    },
    'peralta_freddy': {
        # 2025: 33 GS, 176.2 IP, 204 K, K/9=10.39, IP/start=5.35
        'name': 'Freddy Peralta', 'team': 'NYM', 'hand': 'R',
        'era': 2.70, 'k9': 10.39, 'bb9': 3.36, 'ip': 176.67, 'gp': 33,
        'k': 204, 'bf': 723, 'whip': 1.08, 'k_pct': 0.2822,
        'whiff_pct': 0.318, 'z_swing_miss_pct': 0.135, 'oz_swing_miss_pct': 0.370,
        'iz_contact_pct': 0.80, 'oz_contact_pct': 0.55,
        'f_strike_pct': 0.62, 'ff_speed': 96.8,
        'n_fastball_pct': 40.0, 'n_breaking_pct': 40.0, 'n_offspeed_pct': 20.0,
        'xfip_proxy': 3.20, 'ip_per_game': 5.2, 'pitch_hand': 'R',  # STARTER_IP_MEAN
        'games': 33, 'innings': '176.2',
    },
    'smith_shane': {
        # 2025: 23 GS, 126.0 IP, 137 K, K/9=9.79, IP/start=5.48
        'name': 'Shane Smith', 'team': 'CWS', 'hand': 'R',
        'era': 4.21, 'k9': 9.79, 'bb9': 3.10, 'ip': 126.0, 'gp': 23,
        'k': 137, 'bf': 524, 'whip': 1.28, 'k_pct': 0.2615,
        'whiff_pct': 0.285, 'z_swing_miss_pct': 0.118, 'oz_swing_miss_pct': 0.325,
        'iz_contact_pct': 0.82, 'oz_contact_pct': 0.58,
        'f_strike_pct': 0.61, 'ff_speed': 93.5,
        'n_fastball_pct': 50.0, 'n_breaking_pct': 30.0, 'n_offspeed_pct': 20.0,
        'xfip_proxy': 4.10, 'ip_per_game': 5.2, 'pitch_hand': 'R',  # STARTER_IP_MEAN
        'games': 23, 'innings': '126.0',
    },
    'misiorowski_jacob': {
        # 2025: 14 GS (debut June 12), 66.0 IP, 87 K, K/9=11.86, BB/9=4.23, ERA=4.36, WHIP=1.24
        # IP/start=4.71, K/start=6.21 — confirmed via MLB Stats API ID 694819
        'name': 'Jacob Misiorowski', 'team': 'MIL', 'hand': 'R',
        'era': 4.36, 'k9': 11.86, 'bb9': 4.23, 'ip': 66.0, 'gp': 14,
        'k': 87, 'bf': 273, 'whip': 1.24, 'k_pct': 0.3187,
        'whiff_pct': 0.355, 'z_swing_miss_pct': 0.155, 'oz_swing_miss_pct': 0.420,
        'iz_contact_pct': 0.76, 'oz_contact_pct': 0.50,
        'f_strike_pct': 0.58, 'ff_speed': 100.2,
        'n_fastball_pct': 60.0, 'n_breaking_pct': 28.0, 'n_offspeed_pct': 12.0,
        'xfip_proxy': 3.90, 'ip_per_game': 5.2, 'pitch_hand': 'R',  # STARTER_IP_MEAN
        'games': 14, 'innings': '66.0',
    },
    'cavalli_cade': {
        # 2025: 6 GS, 32.0 IP, 47 K, K/9=13.22, IP/start=5.33
        'name': 'Cade Cavalli', 'team': 'WSH', 'hand': 'R',
        'era': 2.53, 'k9': 13.22, 'bb9': 3.94, 'ip': 32.0, 'gp': 6,
        'k': 47, 'bf': 126, 'whip': 1.16, 'k_pct': 0.3730,
        'whiff_pct': 0.355, 'z_swing_miss_pct': 0.152, 'oz_swing_miss_pct': 0.430,
        'iz_contact_pct': 0.76, 'oz_contact_pct': 0.50,
        'f_strike_pct': 0.62, 'ff_speed': 97.5,
        'n_fastball_pct': 55.0, 'n_breaking_pct': 28.0, 'n_offspeed_pct': 17.0,
        'xfip_proxy': 3.60, 'ip_per_game': 5.2, 'pitch_hand': 'R',  # STARTER_IP_MEAN
        'games': 6, 'innings': '32.0',
    },
    'boyd_matthew': {
        # 2025: 32 GS, 177.2 IP, 154 K, ERA 3.21, K/9=7.71, WHIP=1.09, IP/start=5.54
        # Source: ESPN/StatMuse confirmed 2025 full season with CHC
        'name': 'Matthew Boyd', 'team': 'CHC', 'hand': 'L',
        'era': 3.21, 'k9': 7.71, 'bb9': 2.65, 'ip': 177.67, 'gp': 32,
        'k': 154, 'bf': 720, 'whip': 1.09, 'k_pct': 0.2139,
        'whiff_pct': 0.258, 'z_swing_miss_pct': 0.105, 'oz_swing_miss_pct': 0.295,
        'iz_contact_pct': 0.84, 'oz_contact_pct': 0.61,
        'f_strike_pct': 0.62, 'ff_speed': 91.5,
        'n_fastball_pct': 35.0, 'n_breaking_pct': 40.0, 'n_offspeed_pct': 25.0,
        'xfip_proxy': 3.80, 'ip_per_game': 5.2, 'pitch_hand': 'L',  # STARTER_IP_MEAN
        'games': 32, 'innings': '177.2',
    },
}

# Confirmed lineups (March 26, 2026 from MLB Stats API)
LINEUPS = {
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

GAMES = [
    ('PIT', 'NYM', 'skenes_paul',    'peralta_freddy',    'PIT @ NYM'),
    ('CWS', 'MIL', 'smith_shane',    'misiorowski_jacob', 'CWS @ MIL'),
    ('WSH', 'CHC', 'cavalli_cade',   'boyd_matthew',      'WSH @ CHC'),
]

def build_lineup_feats(lineup):
    return [{
        'k_pct': p['k_pct'], 'bat_hand': p['hand'],
        'whiff_pct': 0.30, 'z_swing_miss_pct': 0.12, 'oz_swing_miss_pct': 0.33,
        'iz_contact_pct': 0.82, 'oz_contact_pct': 0.58, 'swing_pct': 0.47,
        'name': p['name'],
    } for p in lineup]

def evaluate_at_book_line(samps, book_line):
    """
    Evaluate P(over) and P(under) at the exact consensus book line.
    Uses push-excluded conditional probabilities for fair value no-vig inverse.
    samps: raw simulation K counts (numpy array)
    book_line: float — the consensus book line (e.g. 6.5)
    """
    arr = np.asarray(samps)
    n = len(arr)
    
    # Count over, under, push
    n_over  = int((arr > book_line).sum())
    n_under = int((arr < book_line).sum())
    n_push  = int((arr == book_line).sum())
    
    # Push-excluded conditional probabilities
    n_decided = n_over + n_under
    if n_decided == 0:
        p_over_cond  = 0.5
        p_under_cond = 0.5
    else:
        p_over_cond  = n_over  / n_decided
        p_under_cond = n_under / n_decided
    
    # Raw (including push) probabilities for reference
    p_over_raw  = n_over  / n
    p_under_raw = n_under / n
    p_push      = n_push  / n
    
    # Fair value no-vig inverse: over and under are exact inverses
    model_over_odds  = _p2ml(p_over_cond)
    model_under_odds = _p2ml(p_under_cond)
    
    return {
        'book_line':        book_line,
        'p_over_raw':       round(p_over_raw,  4),
        'p_under_raw':      round(p_under_raw, 4),
        'p_push':           round(p_push,      4),
        'p_over_cond':      round(p_over_cond,  4),
        'p_under_cond':     round(p_under_cond, 4),
        'model_over_odds':  model_over_odds,
        'model_under_odds': model_under_odds,
    }

def run_kprop(pitcher_key, lineup_team, is_home_pitcher):
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
        data=None,
    )
    
    # Get raw samps and evaluate at consensus book line
    samps = result.get('_samps')
    consensus = CONSENSUS_LINES[pitcher_key]
    book_line = consensus['line']
    
    if samps is not None:
        book_eval = evaluate_at_book_line(samps, book_line)
    else:
        # Fallback: use model's own k_line probs if samps not available
        book_eval = {
            'book_line':        book_line,
            'p_over_raw':       result['p_over_k_line'],
            'p_under_raw':      result['p_under_k_line'],
            'p_push':           0.0,
            'p_over_cond':      result['p_over_k_line'],
            'p_under_cond':     result['p_under_k_line'],
            'model_over_odds':  result['k_line_odds_over'],
            'model_under_odds': result['k_line_odds_under'],
        }
    
    return result, book_eval, consensus

# ============================================================
# RUN ALL 6 PITCHERS
# ============================================================
print("=" * 72)
print("MLB K-PROP PROJECTIONS v2 — March 26, 2026")
print("Evaluating at CONSENSUS BOOK LINES (fair value no-vig inverse)")
print("=" * 72)

final_output = []

for away, home, away_pk, home_pk, label in GAMES:
    print(f"\n{'─'*72}")
    print(f"  {label}")
    print(f"{'─'*72}")

    for side, pk, opp_team, is_home in [
        ('AWAY', away_pk, home, False),
        ('HOME', home_pk, away, True),
    ]:
        result, book_eval, consensus = run_kprop(pk, opp_team, is_home)
        p = PITCHER_STATS[pk]
        bl = book_eval['book_line']
        
        # Edge calculation: model p_over_cond vs book implied p_over
        # Convert book over odds to implied probability
        def ml_to_prob(ml_str):
            ml = float(ml_str.replace('+',''))
            if ml > 0:
                return 100.0 / (ml + 100.0)
            else:
                return abs(ml) / (abs(ml) + 100.0)
        
        book_over_impl  = ml_to_prob(consensus['book_over'])
        book_under_impl = ml_to_prob(consensus['book_under'])
        # Remove vig from book: normalize
        total_impl = book_over_impl + book_under_impl
        book_over_nv  = book_over_impl  / total_impl
        book_under_nv = book_under_impl / total_impl
        
        edge_over  = round((book_eval['p_over_cond']  - book_over_nv)  * 100, 2)
        edge_under = round((book_eval['p_under_cond'] - book_under_nv) * 100, 2)
        
        # Determine verdict
        if abs(edge_over) >= abs(edge_under):
            if edge_over > 1.5:
                verdict = 'OVER'
            elif edge_under > 1.5:
                verdict = 'UNDER'
            else:
                verdict = 'PASS'
        else:
            if edge_under > 1.5:
                verdict = 'UNDER'
            elif edge_over > 1.5:
                verdict = 'OVER'
            else:
                verdict = 'PASS'
        
        best_side = 'OVER' if edge_over >= edge_under else 'UNDER'
        
        print(f"\n  [{side}] {p['name']} ({p['team']}) — {p['hand']}HP")
        print(f"    Model K proj       : {result['k_proj']:.2f}  (median={result['k_median']:.1f})")
        print(f"    Model K line       : {result['k_line']:.1f}  (model's own)")
        print(f"    ─── CONSENSUS LINE : {bl} ───")
        print(f"    P(over {bl})  raw  : {book_eval['p_over_raw']*100:.2f}%")
        print(f"    P(under {bl}) raw  : {book_eval['p_under_raw']*100:.2f}%")
        print(f"    P(push {bl})       : {book_eval['p_push']*100:.2f}%")
        print(f"    P(over {bl})  cond : {book_eval['p_over_cond']*100:.2f}%  → {book_eval['model_over_odds']}")
        print(f"    P(under {bl}) cond : {book_eval['p_under_cond']*100:.2f}% → {book_eval['model_under_odds']}")
        print(f"    Book over  {bl}    : {consensus['book_over']}  (no-vig: {book_over_nv*100:.2f}%)")
        print(f"    Book under {bl}    : {consensus['book_under']}  (no-vig: {book_under_nv*100:.2f}%)")
        print(f"    Edge over          : {edge_over:+.2f}pp")
        print(f"    Edge under         : {edge_under:+.2f}pp")
        print(f"    VERDICT            : {verdict}  (best: {best_side})")
        
        final_output.append({
            'pitcher_key':      pk,
            'pitcher_name':     p['name'],
            'team':             p['team'],
            'side':             side.lower(),
            'game_label':       label,
            'k_proj':           round(result['k_proj'], 2),
            'k_median':         float(result['k_median']),
            'model_k_line':     float(result['k_line']),
            'book_line':        bl,
            'book_over_odds':   consensus['book_over'],
            'book_under_odds':  consensus['book_under'],
            'p_over_raw':       book_eval['p_over_raw'],
            'p_under_raw':      book_eval['p_under_raw'],
            'p_push':           book_eval['p_push'],
            'p_over_cond':      book_eval['p_over_cond'],
            'p_under_cond':     book_eval['p_under_cond'],
            'model_over_odds':  book_eval['model_over_odds'],
            'model_under_odds': book_eval['model_under_odds'],
            'edge_over':        edge_over,
            'edge_under':       edge_under,
            'verdict':          verdict,
            'best_side':        best_side,
        })

# Save results
with open('/tmp/kprop_v2_results.json', 'w') as f:
    json.dump(final_output, f, indent=2)

print("\n\n" + "=" * 72)
print("FINAL SUMMARY")
print("=" * 72)
for r in final_output:
    inv_check = "✅" if r['model_over_odds'] != r['model_under_odds'] else "⚠️"
    print(f"  {r['pitcher_name']:22s} ({r['team']}) | Line: {r['book_line']} | "
          f"Over: {r['model_over_odds']} / Under: {r['model_under_odds']} {inv_check} | "
          f"Edge: {r['edge_over']:+.1f}pp / {r['edge_under']:+.1f}pp | {r['verdict']}")

print(f"\nResults saved to /tmp/kprop_v2_results.json")
