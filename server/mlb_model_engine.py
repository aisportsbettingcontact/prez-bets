#!/usr/bin/env python3
"""
mlb_model_engine.py — MLB Full Game Sharp Line Origination Engine v1.0
=======================================================================
Architecture mirrors nhl_model_engine.py:
  • Correlated Negative Binomial run distributions (overdispersion k≈15, rho≈0.10)
  • 200,000 Monte Carlo simulations
  • OFF_rating / DEF_rating from team R/G, OPS, ERA (2025 full season)
  • Starting pitcher multiplier: ERA-based adjustment vs team bullpen ERA
  • Home field advantage: +0.15 runs/game (MLB standard)
  • ALL markets (ML, run line ±1.5 odds, total) from SAME joint scoring distribution
  • No market independently estimated — fully internally consistent

Protocol:
  STDIN  → single JSON object (MlbModelInput)
  STDOUT → single JSON line (MlbModelResult) — LAST line of stdout

Input schema:
  {
    "away_abbrev":          "PIT",
    "home_abbrev":          "NYM",
    "away_pitcher":         "Paul Skenes",
    "home_pitcher":         "Freddy Peralta",
    "mkt_run_line":         -1.5,          # away run line (always -1.5 or +1.5)
    "mkt_away_rl_odds":     161,            # away run line odds (American)
    "mkt_home_rl_odds":     -197,
    "mkt_total":            7.0,
    "mkt_over_odds":        -122,
    "mkt_under_odds":       102,
    "mkt_away_ml":          100,
    "mkt_home_ml":          -120,
    "team_stats": {
      "PIT": {
        "rpg":   3.599,   # runs scored per game (offense)
        "era":   3.76,    # team ERA (pitching defense)
        "ops":   ".655",  # team OPS (offensive quality)
        "whip":  1.22,
        "k9":    8.27,
        "bb9":   2.98
      },
      "NYM": { ... }
    },
    "pitcher_stats": {
      "Paul Skenes":    { "era": 1.96, "whip": 0.95, "k9": 11.2, "bb9": 2.1, "ip": 133.0 },
      "Freddy Peralta": { "era": 3.50, "whip": 1.10, "k9": 10.8, "bb9": 3.2, "ip": 158.0 }
    }
  }

Output schema (last line of stdout):
  {
    "ok": true,
    "game": "PIT @ NYM",
    "away_abbrev": "PIT",
    "home_abbrev": "NYM",
    "proj_away_runs": 3.21,
    "proj_home_runs": 4.18,
    "away_run_line": "-1.5",
    "away_rl_odds": 207,
    "home_run_line": "+1.5",
    "home_rl_odds": -207,
    "away_ml": 135,
    "home_ml": -135,
    "total_line": 7.0,
    "over_odds": -101,
    "under_odds": 101,
    "away_win_pct": 42.3,
    "home_win_pct": 57.7,
    "away_rl_cover_pct": 28.4,
    "home_rl_cover_pct": 71.6,
    "over_pct": 48.2,
    "under_pct": 51.8,
    "error": null
  }
"""
import sys
import json
import numpy as np
import time

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────
SIMULATIONS         = 200_000
LG_AVG_RPG          = 4.447    # 2025 MLB league average runs/game/team
HOME_FIELD          = 0.15     # home field run advantage (additive)
NB_DISPERSION       = 15.0     # Negative Binomial dispersion k (higher = less overdispersion)
CORR_RHO            = 0.10     # inter-team run correlation (away/home scores correlated)

# Pitcher ERA → run suppression multiplier
# A starter with ERA 2.00 vs league 4.50 suppresses ~0.56x
# We blend starter (6 IP) with bullpen (3 IP) for a 9-inning projection
SP_INNINGS          = 6.0      # expected starter innings
TOTAL_INNINGS       = 9.0

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def prob_to_ml(p: float) -> int:
    """Convert win probability to American ML odds (no cap)."""
    p = max(0.001, min(0.999, p))
    if p >= 0.5:
        return int(round(-(p / (1.0 - p)) * 100.0))
    else:
        return int(round(((1.0 - p) / p) * 100.0))

def fmt_ml(ml: int) -> str:
    return f"+{ml}" if ml > 0 else str(ml)

def vig_free_prob(odds_a: int, odds_b: int):
    """Remove vig from a two-sided market, return (p_a, p_b)."""
    def to_imp(o):
        return abs(o) / (abs(o) + 100.0) if o < 0 else 100.0 / (o + 100.0)
    pa, pb = to_imp(odds_a), to_imp(odds_b)
    total = pa + pb
    return pa / total, pb / total

def era_to_multiplier(pitcher_era: float, team_era: float, lg_era: float = 4.50) -> float:
    """
    Compute a run-suppression multiplier for a starting pitcher.
    Blends SP ERA (6 IP) with team bullpen ERA (3 IP) to get a 9-inning
    effective ERA, then normalize against league average.
    
    Bullpen ERA = (team_era * 9 - sp_era * 6) / 3  (implied from team ERA)
    """
    # Clamp SP ERA to reasonable range
    sp_era = max(1.50, min(7.50, pitcher_era))
    # Implied bullpen ERA from team ERA
    bp_era = max(2.50, min(8.00, (team_era * TOTAL_INNINGS - sp_era * SP_INNINGS) / (TOTAL_INNINGS - SP_INNINGS)))
    # Weighted 9-inning effective ERA
    eff_era = (sp_era * SP_INNINGS + bp_era * (TOTAL_INNINGS - SP_INNINGS)) / TOTAL_INNINGS
    # Multiplier: lower ERA = fewer runs allowed = lower opponent scoring
    # multiplier < 1 means pitcher suppresses runs, > 1 means allows more
    return eff_era / lg_era

def compute_expected_runs(
    off_rpg: float,      # offensive team's R/G
    def_era: float,      # defensive team's ERA (pitching)
    sp_era: float,       # starting pitcher ERA
    def_team_era: float, # defensive team's overall ERA (for bullpen calc)
    is_home: bool
) -> float:
    """
    Compute expected runs for one team in a matchup.
    
    Formula:
      base_offense = off_rpg / LG_AVG_RPG  (offensive rating relative to league)
      def_multiplier = era_to_multiplier(sp_era, def_team_era)
      expected = LG_AVG_RPG * base_offense * def_multiplier
      + home_field_bonus if is_home
    """
    off_rating = off_rpg / LG_AVG_RPG
    def_mult = era_to_multiplier(sp_era, def_team_era)
    expected = LG_AVG_RPG * off_rating * def_mult
    if is_home:
        expected += HOME_FIELD
    return max(1.5, expected)  # floor at 1.5 runs

def nb_sample(mu: float, k: float, size: int) -> np.ndarray:
    """
    Sample from Negative Binomial with mean=mu, dispersion=k.
    NB parameterization: p = k/(k+mu), r = k
    Variance = mu + mu²/k
    """
    p = k / (k + mu)
    return np.random.negative_binomial(k, p, size=size)

def simulate_game(
    exp_away: float,
    exp_home: float,
    rho: float,
    k: float,
    n_sim: int,
    mkt_run_line: float,
    mkt_total: float
) -> dict:
    """
    Run n_sim correlated Negative Binomial simulations.
    Returns all market probabilities.
    """
    rng = np.random.default_rng(seed=42)
    
    # Generate correlated runs using Gaussian copula
    # Step 1: generate correlated normals
    cov = np.array([[1.0, rho], [rho, 1.0]])
    normals = rng.multivariate_normal([0.0, 0.0], cov, size=n_sim)
    
    # Step 2: transform to uniform via CDF
    from scipy.stats import norm as sp_norm
    u_away = sp_norm.cdf(normals[:, 0])
    u_home = sp_norm.cdf(normals[:, 1])
    
    # Step 3: transform to NB via inverse CDF
    from scipy.stats import nbinom
    p_away = k / (k + exp_away)
    p_home = k / (k + exp_home)
    away_runs = nbinom.ppf(u_away, k, p_away).astype(int)
    home_runs = nbinom.ppf(u_home, k, p_home).astype(int)
    
    # Compute market outcomes
    diff = away_runs - home_runs  # positive = away wins
    total = away_runs + home_runs
    
    # ML: away win probability (no ties in baseball — extra innings handled by model)
    # Ties get re-simulated via extra innings (simplified: 50/50 split of ties)
    away_wins = diff > 0
    home_wins = diff < 0
    ties = diff == 0
    
    # Distribute ties 50/50 (extra innings approximation)
    tie_count = np.sum(ties)
    away_win_count = np.sum(away_wins) + tie_count * 0.5
    home_win_count = np.sum(home_wins) + tie_count * 0.5
    
    away_win_pct = away_win_count / n_sim * 100
    home_win_pct = home_win_count / n_sim * 100
    
    # Run line: away covers if away wins by 2+ (away -1.5)
    # If mkt_run_line is -1.5 (away favored), away covers if diff >= 2
    if mkt_run_line <= 0:  # away is favored on run line
        away_rl_cover = np.sum(diff >= 2) / n_sim * 100
        home_rl_cover = 100.0 - away_rl_cover
    else:  # home is favored on run line
        home_rl_cover = np.sum(diff <= -2) / n_sim * 100
        away_rl_cover = 100.0 - home_rl_cover
    
    # Total
    over_pct = np.sum(total > mkt_total) / n_sim * 100
    under_pct = np.sum(total < mkt_total) / n_sim * 100
    push_pct = np.sum(total == mkt_total) / n_sim * 100
    # Distribute pushes
    over_pct += push_pct * 0.5
    under_pct += push_pct * 0.5
    
    return {
        'away_win_pct': round(away_win_pct, 2),
        'home_win_pct': round(home_win_pct, 2),
        'away_rl_cover_pct': round(away_rl_cover, 2),
        'home_rl_cover_pct': round(home_rl_cover, 2),
        'over_pct': round(over_pct, 2),
        'under_pct': round(under_pct, 2),
        'proj_away_runs': round(float(np.mean(away_runs)), 2),
        'proj_home_runs': round(float(np.mean(home_runs)), 2),
        'proj_total': round(float(np.mean(total)), 2),
    }

# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────
def run_model(inp: dict) -> dict:
    t0 = time.time()
    
    away_abbrev = inp['away_abbrev']
    home_abbrev = inp['home_abbrev']
    away_pitcher = inp.get('away_pitcher', 'Unknown')
    home_pitcher = inp.get('home_pitcher', 'Unknown')
    
    team_stats = inp['team_stats']
    pitcher_stats = inp.get('pitcher_stats', {})
    
    away_ts = team_stats[away_abbrev]
    home_ts = team_stats[home_abbrev]
    
    # Market lines
    mkt_run_line  = float(inp.get('mkt_run_line', -1.5))
    mkt_total     = float(inp['mkt_total'])
    mkt_away_ml   = int(inp['mkt_away_ml'])
    mkt_home_ml   = int(inp['mkt_home_ml'])
    mkt_away_rl   = int(inp.get('mkt_away_rl_odds', 0))
    mkt_home_rl   = int(inp.get('mkt_home_rl_odds', 0))
    mkt_over      = int(inp.get('mkt_over_odds', -110))
    mkt_under     = int(inp.get('mkt_under_odds', -110))
    
    # Team offensive R/G
    away_rpg = float(away_ts['rpg'])
    home_rpg = float(home_ts['rpg'])
    
    # Team ERA (for bullpen calc)
    away_team_era = float(away_ts['era'])
    home_team_era = float(home_ts['era'])
    
    # Pitcher ERA
    away_sp_era = float(pitcher_stats.get(away_pitcher, {}).get('era', away_team_era))
    home_sp_era = float(pitcher_stats.get(home_pitcher, {}).get('era', home_team_era))
    
    # Expected runs per team
    # Away team scores against home pitcher (home_sp_era, home_team_era)
    exp_away = compute_expected_runs(
        off_rpg=away_rpg,
        def_era=home_sp_era,
        sp_era=home_sp_era,
        def_team_era=home_team_era,
        is_home=False
    )
    # Home team scores against away pitcher (away_sp_era, away_team_era)
    exp_home = compute_expected_runs(
        off_rpg=home_rpg,
        def_era=away_sp_era,
        sp_era=away_sp_era,
        def_team_era=away_team_era,
        is_home=True
    )
    
    # Market calibration: blend model projection with market-implied total
    # Market total anchors the model (60% market, 40% pure model)
    # This prevents extreme divergence from market consensus
    mkt_implied_away, mkt_implied_home = vig_free_prob(mkt_away_ml, mkt_home_ml)
    
    # Scale exp_away/exp_home so their sum matches market total (weighted blend)
    model_total = exp_away + exp_home
    MARKET_WEIGHT = 0.55  # 55% market total anchor
    blended_total = MARKET_WEIGHT * mkt_total + (1 - MARKET_WEIGHT) * model_total
    
    # Preserve model's away/home split ratio while anchoring to blended total
    if model_total > 0:
        scale = blended_total / model_total
        exp_away_final = exp_away * scale
        exp_home_final = exp_home * scale
    else:
        exp_away_final = blended_total * 0.48
        exp_home_final = blended_total * 0.52
    
    # Run simulation
    sim = simulate_game(
        exp_away=exp_away_final,
        exp_home=exp_home_final,
        rho=CORR_RHO,
        k=NB_DISPERSION,
        n_sim=SIMULATIONS,
        mkt_run_line=mkt_run_line,
        mkt_total=mkt_total
    )
    
    # Convert probabilities to American ML odds
    away_ml_fair = prob_to_ml(sim['away_win_pct'] / 100)
    home_ml_fair = prob_to_ml(sim['home_win_pct'] / 100)
    
    # Run line odds (away -1.5 or +1.5)
    away_rl_fair = prob_to_ml(sim['away_rl_cover_pct'] / 100)
    home_rl_fair = prob_to_ml(sim['home_rl_cover_pct'] / 100)
    
    # Total odds
    over_fair  = prob_to_ml(sim['over_pct'] / 100)
    under_fair = prob_to_ml(sim['under_pct'] / 100)
    
    # Run line label
    if mkt_run_line <= 0:
        away_rl_label = f"{mkt_run_line:.1f}"
        home_rl_label = f"+{abs(mkt_run_line):.1f}"
    else:
        away_rl_label = f"+{mkt_run_line:.1f}"
        home_rl_label = f"{-mkt_run_line:.1f}"
    
    elapsed = round(time.time() - t0, 2)
    
    return {
        'ok': True,
        'game': f"{away_abbrev} @ {home_abbrev}",
        'away_abbrev': away_abbrev,
        'home_abbrev': home_abbrev,
        'away_pitcher': away_pitcher,
        'home_pitcher': home_pitcher,
        'proj_away_runs': sim['proj_away_runs'],
        'proj_home_runs': sim['proj_home_runs'],
        'proj_total': sim['proj_total'],
        'exp_away_input': round(exp_away_final, 3),
        'exp_home_input': round(exp_home_final, 3),
        'model_total_raw': round(model_total, 3),
        'blended_total': round(blended_total, 3),
        # Run line
        'away_run_line': away_rl_label,
        'home_run_line': home_rl_label,
        'away_rl_odds': away_rl_fair,
        'home_rl_odds': home_rl_fair,
        'away_rl_cover_pct': sim['away_rl_cover_pct'],
        'home_rl_cover_pct': sim['home_rl_cover_pct'],
        # Moneyline
        'away_ml': away_ml_fair,
        'home_ml': home_ml_fair,
        'away_win_pct': sim['away_win_pct'],
        'home_win_pct': sim['home_win_pct'],
        # Total
        'total_line': mkt_total,
        'over_odds': over_fair,
        'under_odds': under_fair,
        'over_pct': sim['over_pct'],
        'under_pct': sim['under_pct'],
        # Meta
        'simulations': SIMULATIONS,
        'elapsed_sec': elapsed,
        'error': None
    }

if __name__ == '__main__':
    try:
        raw = sys.stdin.read().strip()
        inp = json.loads(raw)
        result = run_model(inp)
    except Exception as e:
        import traceback
        result = {
            'ok': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }
    # Always print result as last line
    print(json.dumps(result))
