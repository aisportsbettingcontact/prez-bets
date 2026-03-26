#!/usr/bin/env python3
"""
MLB K-Prop Calibration Audit
Reproduce Max Fried and Logan Webb results from March 25, 2026 using the
current StrikeoutProjectionModel adapter to verify calibration accuracy.

DB stored results:
  Max Fried:   kProj=4.73, bookLine=5.5, pOver=33.9%, modelOver=+100, modelUnder=-100
               signalBreakdown: combined_k=28.3%, pit_k_ha=22.8%, pit_whiff=26.6%, pit_f_strike=60.3%, ff_speed=95.8
  Logan Webb:  kProj=7.06, bookLine=6.5, pOver=54.7%, modelOver=+144, modelUnder=-144
               signalBreakdown: combined_k=41.9%, pit_k_ha=27.9%, pit_whiff=24.7%, pit_f_strike=68.5%, ff_speed=92.8
"""

import sys, os, json, math
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))

from StrikeoutModel import StrikeoutProjectionModel, _p2ml

# ─────────────────────────────────────────────────────────────────────────────
# EXACT pitcher stats used for Fried/Webb (reconstructed from DB signalBreakdown)
# ─────────────────────────────────────────────────────────────────────────────

FRIED_STATS = {
    # DB: combined_k=28.3%, pit_k_ha=22.8%, pit_whiff=26.6%, pit_f_strike=60.3%, ff_speed=95.8
    # 2025 NYY: 32 GS, ERA 3.25, K/9=7.72, BB/9=2.1, WHIP=1.12, IP=188
    'name': 'Max Fried', 'team': 'NYY', 'hand': 'L',
    'era': 3.25, 'k9': 7.72, 'bb9': 2.10, 'ip': 188.0, 'gp': 32,
    'k': 161, 'bf': 762, 'whip': 1.12, 'k_pct': 0.2114,
    'whiff_pct': 0.266, 'z_swing_miss_pct': 0.120, 'oz_swing_miss_pct': 0.380,
    'iz_contact_pct': 0.82, 'oz_contact_pct': 0.55,
    'f_strike_pct': 0.603, 'ff_speed': 95.8,
    'n_fastball_pct': 45.0, 'n_breaking_pct': 35.0, 'n_offspeed_pct': 20.0,
    'xfip_proxy': 3.40, 'ip_per_game': 5.875, 'pitch_hand': 'L',
    'games': 32, 'innings': '188.0',
}

WEBB_STATS = {
    # DB: combined_k=41.9%, pit_k_ha=27.9%, pit_whiff=24.7%, pit_f_strike=68.5%, ff_speed=92.8
    # 2025 SF: 33 GS, ERA 3.03, K/9=9.17, BB/9=1.8, WHIP=1.05, IP=197
    'name': 'Logan Webb', 'team': 'SF', 'hand': 'R',
    'era': 3.03, 'k9': 9.17, 'bb9': 1.80, 'ip': 197.0, 'gp': 33,
    'k': 201, 'bf': 793, 'whip': 1.05, 'k_pct': 0.2535,
    'whiff_pct': 0.247, 'z_swing_miss_pct': 0.130, 'oz_swing_miss_pct': 0.390,
    'iz_contact_pct': 0.80, 'oz_contact_pct': 0.52,
    'f_strike_pct': 0.685, 'ff_speed': 92.8,
    'n_fastball_pct': 35.0, 'n_breaking_pct': 40.0, 'n_offspeed_pct': 25.0,
    'xfip_proxy': 3.10, 'ip_per_game': 5.97, 'pitch_hand': 'R',
    'games': 33, 'innings': '197.0',
}

# ─────────────────────────────────────────────────────────────────────────────
# Lineups from DB matchupRows (exact k_pct values from stored data)
# ─────────────────────────────────────────────────────────────────────────────

# SF lineup facing Max Fried (from DB matchupRows)
SF_LINEUP = [
    {'name': 'Bader, Harrison',  'bat_hand': 'R', 'k_pct': 0.271, 'whiff_pct': 0.32, 'iz_contact_pct': 0.77, 'oz_contact_pct': 0.52, 'bb_pct': 0.08},
    {'name': 'Adames, Willy',    'bat_hand': 'R', 'k_pct': 0.261, 'whiff_pct': 0.31, 'iz_contact_pct': 0.78, 'oz_contact_pct': 0.51, 'bb_pct': 0.09},
    {'name': 'Lee, Jung Hoo',    'bat_hand': 'L', 'k_pct': 0.087, 'whiff_pct': 0.18, 'iz_contact_pct': 0.88, 'oz_contact_pct': 0.62, 'bb_pct': 0.07},
    {'name': 'Bailey, Patrick',  'bat_hand': 'S', 'k_pct': 0.294, 'whiff_pct': 0.33, 'iz_contact_pct': 0.76, 'oz_contact_pct': 0.50, 'bb_pct': 0.08},
    {'name': 'Ramos, Heliot',    'bat_hand': 'R', 'k_pct': 0.227, 'whiff_pct': 0.28, 'iz_contact_pct': 0.80, 'oz_contact_pct': 0.54, 'bb_pct': 0.07},
    {'name': 'Chapman, Matt',    'bat_hand': 'R', 'k_pct': 0.236, 'whiff_pct': 0.29, 'iz_contact_pct': 0.79, 'oz_contact_pct': 0.53, 'bb_pct': 0.08},
    {'name': 'Arraez, Luis',     'bat_hand': 'L', 'k_pct': 0.031, 'whiff_pct': 0.10, 'iz_contact_pct': 0.94, 'oz_contact_pct': 0.70, 'bb_pct': 0.09},
    {'name': 'Schmitt, Casey',   'bat_hand': 'R', 'k_pct': 0.200, 'whiff_pct': 0.26, 'iz_contact_pct': 0.81, 'oz_contact_pct': 0.55, 'bb_pct': 0.07},
    {'name': 'Devers, Rafael',   'bat_hand': 'L', 'k_pct': 0.185, 'whiff_pct': 0.25, 'iz_contact_pct': 0.82, 'oz_contact_pct': 0.56, 'bb_pct': 0.08},
]

# NYY lineup facing Logan Webb (from DB matchupRows)
NYY_LINEUP = [
    {'name': 'Grisham, Trent',    'bat_hand': 'L', 'k_pct': 0.243, 'whiff_pct': 0.29, 'iz_contact_pct': 0.80, 'oz_contact_pct': 0.54, 'bb_pct': 0.09},
    {'name': 'McMahon, Ryan',     'bat_hand': 'L', 'k_pct': 0.323, 'whiff_pct': 0.35, 'iz_contact_pct': 0.75, 'oz_contact_pct': 0.49, 'bb_pct': 0.08},
    {'name': 'Stanton, Giancarlo','bat_hand': 'R', 'k_pct': 0.342, 'whiff_pct': 0.38, 'iz_contact_pct': 0.73, 'oz_contact_pct': 0.47, 'bb_pct': 0.09},
    {'name': 'Bellinger, Cody',   'bat_hand': 'L', 'k_pct': 0.137, 'whiff_pct': 0.22, 'iz_contact_pct': 0.85, 'oz_contact_pct': 0.59, 'bb_pct': 0.08},
    {'name': 'Caballero, Jose',   'bat_hand': 'R', 'k_pct': 0.265, 'whiff_pct': 0.31, 'iz_contact_pct': 0.78, 'oz_contact_pct': 0.52, 'bb_pct': 0.07},
    {'name': 'Chisholm, Jazz',    'bat_hand': 'L', 'k_pct': 0.192, 'whiff_pct': 0.26, 'iz_contact_pct': 0.81, 'oz_contact_pct': 0.55, 'bb_pct': 0.10},
    {'name': 'Wells, Austin',     'bat_hand': 'L', 'k_pct': 0.356, 'whiff_pct': 0.39, 'iz_contact_pct': 0.72, 'oz_contact_pct': 0.46, 'bb_pct': 0.08},
    {'name': 'Judge, Aaron',      'bat_hand': 'R', 'k_pct': 0.236, 'whiff_pct': 0.29, 'iz_contact_pct': 0.79, 'oz_contact_pct': 0.53, 'bb_pct': 0.12},
    {'name': 'Rice, Ben',         'bat_hand': 'L', 'k_pct': 0.235, 'whiff_pct': 0.28, 'iz_contact_pct': 0.80, 'oz_contact_pct': 0.54, 'bb_pct': 0.08},
]

def ml_to_prob_nv(ml_str):
    """Convert American odds string to no-vig implied probability."""
    ml = float(str(ml_str).replace('+',''))
    if ml < 0:
        return abs(ml) / (abs(ml) + 100)
    else:
        return 100 / (ml + 100)

def run_pitcher_audit(pitcher_stats, lineup, projected_ip, book_line,
                      book_over_str, book_under_str, label,
                      db_k_proj, db_p_over, db_model_over):
    print(f"\n{'='*72}")
    print(f"  {label}")
    print(f"  DB target: kProj={db_k_proj}, pOver={db_p_over*100:.1f}%, modelOver={db_model_over}")
    print(f"{'='*72}")

    model = StrikeoutProjectionModel()
    rng = np.random.default_rng(42)
    result = model.project(
        pitcher_feats=pitcher_stats,
        lineup_feats=lineup,
        projected_ip=projected_ip,
        rng=rng,
        n_sims=100_000,
        pitcher_rs_id='',
        lineup_rs_ids=[''] * len(lineup),
        lineup_spots=list(range(1, len(lineup)+1)),
        is_home_pitcher=(pitcher_stats['team'] in ['SF', 'NYM', 'MIL', 'CHC', 'BAL', 'CIN', 'HOU', 'SD', 'STL', 'PHI', 'LAD', 'SEA']),
        data=None,
    )

    k_proj   = result['k_proj']
    k_median = result['k_median']
    k_line   = result['k_line']
    samps    = result['_samps']
    sig      = result.get('signal', {})

    print(f"\n  PROJECTION:")
    print(f"    Model K proj     : {k_proj:.2f}  (DB target: {db_k_proj})  delta={k_proj-db_k_proj:+.2f}")
    print(f"    Model K median   : {k_median:.2f}")
    print(f"    Model K line     : {k_line}  (model's own)")
    print(f"    combined_k       : {sig.get('combined_k', 0)*100:.2f}%  (DB: {sig.get('combined_k', 0)*100:.2f}%)")
    print(f"    pit_k_ha_rate    : {sig.get('pit_k_ha_rate', 0)*100:.2f}%")
    print(f"    pit_whiff        : {sig.get('pit_whiff', 0)*100:.2f}%")
    print(f"    lu_whiff         : {sig.get('lu_whiff', 0)*100:.2f}%")
    print(f"    pit_f_strike     : {sig.get('pit_f_strike', 0)*100:.2f}%")
    print(f"    ff_speed         : {sig.get('ff_speed', 0):.1f} mph")

    # Evaluate at book line
    samps_arr = np.array(samps)
    p_over_raw  = float((samps_arr > book_line).mean())
    p_under_raw = float((samps_arr < book_line).mean())
    p_push_raw  = float((samps_arr == book_line).mean())
    p_over_cond  = p_over_raw  / (1.0 - p_push_raw) if p_push_raw < 1.0 else 0.5
    p_under_cond = p_under_raw / (1.0 - p_push_raw) if p_push_raw < 1.0 else 0.5

    model_over_str  = _p2ml(p_over_cond)
    model_under_str = _p2ml(p_under_cond)

    print(f"\n  AT BOOK LINE {book_line}:")
    print(f"    P(over {book_line})  raw  : {p_over_raw*100:.2f}%  (DB target: {db_p_over*100:.1f}%)  delta={p_over_raw-db_p_over:+.3f}")
    print(f"    P(under {book_line}) raw  : {p_under_raw*100:.2f}%")
    print(f"    P(push {book_line})       : {p_push_raw*100:.2f}%")
    print(f"    P(over {book_line})  cond : {p_over_cond*100:.2f}%  → {model_over_str}  (DB target: {db_model_over})")
    print(f"    P(under {book_line}) cond : {p_under_cond*100:.2f}% → {model_under_str}")

    # Book no-vig
    bk_over_p  = ml_to_prob_nv(book_over_str)
    bk_under_p = ml_to_prob_nv(book_under_str)
    vig = bk_over_p + bk_under_p
    bk_over_nv  = bk_over_p  / vig
    bk_under_nv = bk_under_p / vig
    edge_over  = p_over_cond  - bk_over_nv
    edge_under = p_under_cond - bk_under_nv

    print(f"\n  EDGE vs BOOK:")
    print(f"    Book over  {book_line}    : {book_over_str}  (no-vig: {bk_over_nv*100:.2f}%)")
    print(f"    Book under {book_line}    : {book_under_str}  (no-vig: {bk_under_nv*100:.2f}%)")
    print(f"    Edge over          : {edge_over*100:+.2f}pp")
    print(f"    Edge under         : {edge_under*100:+.2f}pp")
    verdict = 'OVER' if edge_over > edge_under else 'UNDER'
    print(f"    VERDICT            : {verdict}")

    print(f"\n  CALIBRATION CHECK:")
    k_delta = k_proj - db_k_proj
    p_delta = p_over_cond - db_p_over
    print(f"    kProj delta        : {k_delta:+.2f}  ({'✅ OK' if abs(k_delta) < 0.5 else '❌ DRIFT'})")
    print(f"    pOver delta        : {p_delta*100:+.2f}pp  ({'✅ OK' if abs(p_delta) < 0.05 else '❌ DRIFT'})")

    return result, k_proj, p_over_cond

# ─────────────────────────────────────────────────────────────────────────────
print("=" * 72)
print("  MLB K-PROP CALIBRATION AUDIT — Fried/Webb Reproduction Test")
print("  Seed=42, n_sims=100,000")
print("=" * 72)

fried_result, fried_k, fried_p = run_pitcher_audit(
    FRIED_STATS, SF_LINEUP,
    projected_ip=5.875,
    book_line=5.5,
    book_over_str='+114',
    book_under_str='-150',
    label='Max Fried (NYY) vs SF Lineup — REPRODUCTION TEST',
    db_k_proj=4.73,
    db_p_over=0.339,
    db_model_over='+100',
)

webb_result, webb_k, webb_p = run_pitcher_audit(
    WEBB_STATS, NYY_LINEUP,
    projected_ip=5.97,
    book_line=6.5,
    book_over_str='+105',
    book_under_str='-136',
    label='Logan Webb (SF) vs NYY Lineup — REPRODUCTION TEST',
    db_k_proj=7.06,
    db_p_over=0.547,
    db_model_over='+144',
)

print("\n" + "=" * 72)
print("  FINAL CALIBRATION SUMMARY")
print("=" * 72)
print(f"  Fried  | DB kProj=4.73  | Current={fried_k:.2f}  | Delta={fried_k-4.73:+.2f}  | pOver DB=33.9% | Current={fried_p*100:.1f}%")
print(f"  Webb   | DB kProj=7.06  | Current={webb_k:.2f}  | Delta={webb_k-7.06:+.2f}  | pOver DB=54.7% | Current={webb_p*100:.1f}%")
print()
print("  Calibration thresholds:")
print("    kProj delta < 0.5  → ✅ consistent")
print("    kProj delta >= 0.5 → ❌ drift — investigate signal weights")
print("    pOver delta < 5pp  → ✅ consistent")
print("    pOver delta >= 5pp → ❌ drift — investigate NB distribution params")
