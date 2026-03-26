#!/usr/bin/env python3
"""
mlb_engine_adapter.py
=====================
Self-contained adapter for the MLB AI Derived Market Engine.

Bypasses Layers 1 (DataIngestion) and 10/11 (Backtest/LearningLoop)
which require Retrosheet/Statcast file paths.

Directly instantiates Layers 3-9 (PAOutcomeModel, RunConversionModel,
BullpenUsageModel, VarianceModel, GameStateBuilder, DistributionEngine,
MonteCarloEngine, MarketDerivation, EdgeDetector, ValidationLayer)
with pre-computed 2025 team and pitcher stats injected as feature dicts.

This preserves the EXACT same math as the full engine:
  - Log5 PA outcome probabilities
  - 24-state Markov RE matrix for run conversion
  - Times-through-order penalty
  - Dynamic HFA (park factor + month factor + team delta)
  - Negative Binomial distribution
  - 100,000 Monte Carlo simulations
  - No-vig market derivation (ML, RL ±1.5 odds, O/U)
  - Edge detection vs. book lines
  - Validation layer
"""

import os, sys, json, math, time, warnings
import numpy as np
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from scipy.stats import norm
from collections import defaultdict

warnings.filterwarnings('ignore')

# ─────────────────────────────────────────────────────────────────────────────
# COPY ENGINE CONSTANTS (identical to pasted_content_9.txt)
# ─────────────────────────────────────────────────────────────────────────────
SIMULATIONS           = 100_000
MIN_SIMULATIONS       = 50_000
MAX_EDGE_THRESHOLD    = 0.08
MIN_EDGE_THRESHOLD    = 0.01
BULLPEN_LOOKBACK_DAYS = 5
LINEUP_TOP_WEIGHT     = 0.65
LINEUP_BOTTOM_WEIGHT  = 0.35

LEAGUE_K_PCT   = 0.224
LEAGUE_BB_PCT  = 0.083
LEAGUE_HR_PCT  = 0.034
LEAGUE_1B_PCT  = 0.148
LEAGUE_2B_PCT  = 0.046
LEAGUE_3B_PCT  = 0.005
LEAGUE_WOBA    = 0.312
LEAGUE_XWOBA   = 0.312

STARTER_IP_MEAN = 5.2
STARTER_IP_MIN  = 1.0
STARTER_IP_MAX  = 9.0

TTO_PENALTY = [0.0, 0.025, 0.055]

HFA_BASE_WEIGHT  = 0.35
HFA_MONTH_SCALE  = 0.80
HFA_TEAM_SCALE   = 2.5
HFA_MONTHLY_FACTORS = {
    3: 1.1888, 4: 1.0832, 5: 1.0416, 6: 0.9984,
    7: 0.9552, 8: 0.9744, 9: 1.0000, 10: 1.0608,
}
HFA_TEAM_DELTA = {
    'COL': -0.193, 'HOU':  0.095, 'CHN':  0.095, 'ATL':  0.080,
    'LAN':  0.072, 'NYA':  0.068, 'BOS':  0.065, 'SFN':  0.060,
    'STL':  0.055, 'MIL':  0.050, 'MIN':  0.045, 'CLE':  0.040,
    'TBA':  0.038, 'SDN':  0.035, 'PHI':  0.032, 'SEA':  0.030,
    'ARI':  0.028, 'NYN':  0.025, 'DET':  0.022, 'BAL':  0.020,
    'CIN':  0.018, 'PIT':  0.015, 'KCA':  0.012, 'TEX':  0.010,
    'CHA':  0.008, 'MIA':  0.005, 'WAS':  0.003, 'OAK':  0.000,
    'TOR': -0.005, 'ANA': -0.010,
}
# DB abbrev → Retrosheet abbrev mapping (for HFA/park lookups)
DB_TO_RETRO = {
    'PIT': 'PIT', 'NYM': 'NYN', 'CWS': 'CHA', 'MIL': 'MIL',
    'WSH': 'WAS', 'CHC': 'CHN', 'NYY': 'NYA', 'SF':  'SFN',
    'LAD': 'LAN', 'SD':  'SDN', 'STL': 'STL', 'TB':  'TBA',
    'PHI': 'PHI', 'HOU': 'HOU', 'DET': 'DET', 'ARI': 'ARI',
    'SEA': 'SEA', 'CLE': 'CLE', 'MIN': 'MIN', 'BAL': 'BAL',
    'BOS': 'BOS', 'CIN': 'CIN', 'LAA': 'ANA', 'TEX': 'TEX',
    'ATL': 'ATL', 'COL': 'COL', 'KC':  'KCA', 'TOR': 'TOR',
    'OAK': 'OAK', 'MIA': 'MIA',
}

PARK_FACTORS = {
    'COL': {'r': 113, 'hr': 119, 'h': 108}, 'BOS': {'r': 105, 'hr': 103, 'h': 106},
    'CIN': {'r': 105, 'hr': 108, 'h': 103}, 'PHI': {'r': 104, 'hr': 106, 'h': 103},
    'NYA': {'r': 104, 'hr': 108, 'h': 102}, 'BAL': {'r': 103, 'hr': 107, 'h': 102},
    'TEX': {'r': 103, 'hr': 105, 'h': 102}, 'HOU': {'r': 102, 'hr': 101, 'h': 102},
    'MIL': {'r': 102, 'hr': 103, 'h': 101}, 'ARI': {'r': 102, 'hr': 104, 'h': 101},
    'ATL': {'r': 101, 'hr': 102, 'h': 101}, 'LAN': {'r': 100, 'hr':  99, 'h': 100},
    'CHN': {'r': 100, 'hr': 101, 'h': 100}, 'SFN': {'r':  99, 'hr':  97, 'h':  99},
    'STL': {'r':  99, 'hr':  98, 'h':  99}, 'NYN': {'r':  99, 'hr':  99, 'h':  99},
    'SDN': {'r':  98, 'hr':  96, 'h':  98}, 'MIN': {'r':  98, 'hr':  99, 'h':  98},
    'DET': {'r':  98, 'hr':  97, 'h':  98}, 'CLE': {'r':  97, 'hr':  95, 'h':  97},
    'SEA': {'r':  97, 'hr':  94, 'h':  97}, 'TBA': {'r':  97, 'hr':  96, 'h':  97},
    'CHA': {'r':  97, 'hr':  96, 'h':  97}, 'PIT': {'r':  97, 'hr':  95, 'h':  97},
    'KCA': {'r':  96, 'hr':  94, 'h':  96}, 'WAS': {'r':  96, 'hr':  95, 'h':  96},
    'MIA': {'r':  95, 'hr':  92, 'h':  95}, 'OAK': {'r':  95, 'hr':  93, 'h':  95},
    'TOR': {'r': 100, 'hr': 100, 'h': 100}, 'ANA': {'r':  99, 'hr':  98, 'h':  99},
}

RE_MATRIX = {
    (0, 0): 0.481, (0, 1): 0.859, (0, 2): 1.100, (0, 3): 1.437,
    (0, 4): 1.350, (0, 5): 1.784, (0, 6): 1.964, (0, 7): 2.292,
    (1, 0): 0.254, (1, 1): 0.509, (1, 2): 0.664, (1, 3): 0.908,
    (1, 4): 0.865, (1, 5): 1.211, (1, 6): 1.373, (1, 7): 1.546,
    (2, 0): 0.098, (2, 1): 0.224, (2, 2): 0.319, (2, 3): 0.429,
    (2, 4): 0.343, (2, 5): 0.497, (2, 6): 0.580, (2, 7): 0.753,
}

RUN_VALUES = {
    'K': -0.270, 'OUT': -0.270, 'BB': 0.310,
    '1B': 0.470, '2B': 0.776, '3B': 1.063, 'HR': 1.376,
}

# ─────────────────────────────────────────────────────────────────────────────
# UTILITY FUNCTIONS (identical to engine)
# ─────────────────────────────────────────────────────────────────────────────
def _log5(p_pit: float, p_bat: float, p_lg: float) -> float:
    if p_lg <= 0 or p_lg >= 1:
        return p_bat
    num = p_bat * p_pit / p_lg
    den = num + (1 - p_bat) * (1 - p_pit) / (1 - p_lg)
    return float(np.clip(num / max(den, 1e-9), 0.0, 1.0))

def _lineup_weights(n: int) -> List[float]:
    top = min(5, n)
    bot = max(0, n - top)
    w   = [LINEUP_TOP_WEIGHT / top] * top + \
          ([LINEUP_BOTTOM_WEIGHT / bot] * bot if bot > 0 else [])
    return w[:n]

def _nearest_key(total: float) -> float:
    keys = [k * 0.5 for k in range(13, 21)]
    return min(keys, key=lambda k: abs(k - total))

def _default_bullpen() -> dict:
    return {
        'fatigue_score': 0.3, 'leverage_arms': 2,
        'bullpen_k_bb': LEAGUE_K_PCT - LEAGUE_BB_PCT,
        'bullpen_xfip': 4.0, 'total_bp_outs_5d': 0,
    }

def prob_to_ml(p: float) -> float:
    p = float(np.clip(p, 0.001, 0.999))
    return round(-(p / (1.0 - p)) * 100.0, 2) if p >= 0.5 \
           else round(((1.0 - p) / p) * 100.0, 2)

def ml_to_prob(odds: float) -> float:
    return abs(odds) / (abs(odds) + 100.0) if odds < 0 \
           else 100.0 / (odds + 100.0)

def remove_vig(p_a: float, p_b: float) -> Tuple[float, float]:
    t = p_a + p_b
    return p_a / t, p_b / t

def fmt_ml(ml) -> str:
    ml = int(round(ml))
    return f"+{ml}" if ml > 0 else str(ml)

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 3: AI MODEL LAYER (identical to engine)
# ─────────────────────────────────────────────────────────────────────────────
class PAOutcomeModel:
    def get_pa_probs(self, pitcher: dict, batter: dict, tto: int = 0) -> dict:
        pen = TTO_PENALTY[min(tto, 2)]
        k  = _log5(pitcher['k_pct'],      batter['k_pct'],      LEAGUE_K_PCT)
        bb = _log5(pitcher['bb_pct'],     batter['bb_pct'],     LEAGUE_BB_PCT)
        hr = _log5(pitcher['hr_pct'],     batter['hr_pct'],     LEAGUE_HR_PCT)
        s1 = _log5(pitcher['single_pct'], batter['single_pct'], LEAGUE_1B_PCT)
        s2 = _log5(pitcher['double_pct'], batter['double_pct'], LEAGUE_2B_PCT)
        s3 = _log5(pitcher['triple_pct'], batter['triple_pct'], LEAGUE_3B_PCT)
        k  = max(0.0, k  - pen * 0.5)
        bb = min(0.30, bb + pen * 0.3)
        hr = min(0.10, hr + pen * 0.2)
        raw = {'K': k, 'BB': bb, 'HR': hr, '1B': s1, '2B': s2, '3B': s3}
        total = sum(raw.values())
        raw['OUT'] = max(0.0, 1.0 - total)
        s = sum(raw.values())
        return {ev: v / s for ev, v in raw.items()}

class RunConversionModel:
    def expected_runs_per_inning(self, pa_probs: dict, run_factor: float = 1.0) -> float:
        exp_rv = sum(pa_probs.get(ev, 0.0) * rv for ev, rv in RUN_VALUES.items())
        base   = RE_MATRIX.get((0, 0), 0.481)
        return max(0.0, (base + exp_rv) * run_factor)

class BullpenUsageModel:
    def project_starter_innings(self, pitcher: dict, bullpen: dict) -> dict:
        base     = STARTER_IP_MEAN
        xfip_adj = (4.0 - pitcher.get('xfip_proxy', 4.0)) * 0.3
        hist_ip  = pitcher.get('ip_per_game', STARTER_IP_MEAN)
        if hist_ip > 1.0:
            base = 0.5 * base + 0.5 * hist_ip
        fatigue_adj = bullpen.get('fatigue_score', 0.3) * 0.2
        starter_ip  = float(np.clip(base + xfip_adj + fatigue_adj, STARTER_IP_MIN, STARTER_IP_MAX))
        return {
            'starter_ip':   round(starter_ip, 2),
            'bullpen_ip':   round(max(0.0, 9.0 - starter_ip), 2),
            'starter_frac': round(starter_ip / 9.0, 4),
        }
    def quality_by_inning(self, bullpen: dict, starter_ip: float) -> Dict[int, float]:
        xfip = bullpen.get('bullpen_xfip', 4.0)
        bp_q = 1.0 + (xfip - 4.0) * 0.05
        return {i: (1.0 if i <= int(starter_ip) else bp_q) for i in range(1, 10)}

class VarianceModel:
    def compute(self, lineup: List[dict], pitcher: dict, env: dict) -> dict:
        n = len(lineup)
        w = _lineup_weights(n)
        barrels  = [b.get('barrel_rate', 0.08) for b in lineup]
        isos     = [b.get('iso', 0.15)         for b in lineup]
        hard_hit = [b.get('hard_hit', 0.35)    for b in lineup]
        avg_barrel   = float(np.average(barrels,  weights=w))
        avg_iso      = float(np.average(isos,     weights=w))
        avg_hard_hit = float(np.average(hard_hit, weights=w))
        base_var  = 2.9 ** 2
        power_adj = 1.0 + (avg_barrel - 0.08) * 3.0 + (avg_iso - 0.15) * 2.0
        k_adj     = 1.0 - (pitcher.get('k_pct', LEAGUE_K_PCT) - LEAGUE_K_PCT) * 2.0
        park_adj  = 1.0 + (env.get('park_hr_factor', 1.0) - 1.0) * 0.5
        variance  = float(np.clip(base_var * power_adj * k_adj * park_adj, 3.0, 20.0))
        skew      = float(np.clip(0.3 + avg_barrel * 2.0 + avg_iso * 1.5, 0.1, 1.5))
        return {
            'variance':    round(variance, 4),
            'std':         round(math.sqrt(variance), 4),
            'skew':        round(skew, 4),
            'avg_barrel':  round(avg_barrel, 4),
            'avg_iso':     round(avg_iso, 4),
            'avg_hard_hit':round(avg_hard_hit, 4),
        }

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 4: GAME STATE BUILDER (identical to engine)
# ─────────────────────────────────────────────────────────────────────────────
class GameStateBuilder:
    def __init__(self):
        self.pa_model  = PAOutcomeModel()
        self.run_model = RunConversionModel()
        self.bp_model  = BullpenUsageModel()
        self.var_model = VarianceModel()

    def build(self, lineup: List[dict], opp_pitcher: dict,
              bullpen: dict, env: dict, quality_mult: float = 1.0) -> dict:
        starter_proj = self.bp_model.project_starter_innings(opp_pitcher, bullpen)
        starter_ip   = starter_proj['starter_ip']
        bp_quality   = self.bp_model.quality_by_inning(bullpen, starter_ip)
        run_factor   = env.get('park_run_factor', 1.0) * env.get('weather_run_adj', 1.0)
        total_runs   = 0.0
        for inning in range(1, 10):
            tto      = min(2, (inning - 1) // 3)
            pa_probs = self._weighted_pa_probs(lineup, opp_pitcher, tto)
            exp_runs = self.run_model.expected_runs_per_inning(pa_probs, run_factor)
            total_runs += exp_runs * bp_quality.get(inning, 1.0)
        total_runs *= quality_mult
        var_feats = self.var_model.compute(lineup, opp_pitcher, env)
        return {
            'mu':         round(total_runs, 4),
            'variance':   var_feats['variance'],
            'std':        var_feats['std'],
            'skew':       var_feats['skew'],
            'starter_ip': starter_ip,
            'bullpen_ip': starter_proj['bullpen_ip'],
            'avg_barrel': var_feats['avg_barrel'],
            'avg_iso':    var_feats['avg_iso'],
        }

    def _weighted_pa_probs(self, lineup: List[dict], pitcher: dict, tto: int) -> dict:
        n = len(lineup)
        w = _lineup_weights(n)
        combined: Dict[str, float] = defaultdict(float)
        for batter, wt in zip(lineup, w):
            for ev, p in self.pa_model.get_pa_probs(pitcher, batter, tto).items():
                combined[ev] += p * wt
        total = sum(combined.values())
        return {ev: v / total for ev, v in combined.items()} if total > 0 else dict(combined)

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 5: DISTRIBUTION ENGINE (identical to engine)
# ─────────────────────────────────────────────────────────────────────────────
class DistributionEngine:
    @staticmethod
    def fit(mu: float, variance: float) -> Tuple[float, float]:
        variance = max(variance, mu + 0.01)
        p = float(np.clip(mu / variance, 0.01, 0.99))
        r = max(0.01, (mu * p) / (1.0 - p))
        return r, p

    @staticmethod
    def sample(mu: float, variance: float, n: int, rng: np.random.Generator) -> np.ndarray:
        r, p = DistributionEngine.fit(mu, variance)
        return rng.negative_binomial(r, p, size=n).astype(float)

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 6: MONTE CARLO (identical to engine)
# ─────────────────────────────────────────────────────────────────────────────
class MonteCarloEngine:
    def __init__(self, n_sims: int = SIMULATIONS, seed: Optional[int] = None):
        self.n_sims = max(n_sims, MIN_SIMULATIONS)
        self.rng    = np.random.default_rng(seed)
        self.dist   = DistributionEngine()

    def simulate(self, home_state: dict, away_state: dict,
                 env: dict, ou_line: Optional[float] = None,
                 rl_spread: float = -1.5) -> dict:
        hfa     = env.get('hfa_weight', HFA_BASE_WEIGHT)
        home_mu = home_state['mu'] * (1.0 + hfa * 0.15)
        away_mu = away_state['mu'] * (1.0 - hfa * 0.08)

        home_runs = self.dist.sample(home_mu, home_state['variance'], self.n_sims, self.rng)
        away_runs = self.dist.sample(away_mu, away_state['variance'], self.n_sims, self.rng)

        ties      = home_runs == away_runs
        tie_flips = self.rng.random(self.n_sims) < 0.5
        home_win  = (home_runs > away_runs) | (ties & tie_flips)

        p_home = float(home_win.mean())
        p_away = 1.0 - p_home
        margins = home_runs - away_runs
        totals  = home_runs + away_runs

        # Run line: rl_spread is from HOME perspective
        # margins = home_runs - away_runs
        #
        # Case A: rl_spread = -1.5 (HOME is RL favorite, e.g. MIL -1.5)
        #   Home covers -1.5 when: home_runs - away_runs > 1.5  → margin > 1.5
        #   p_home_rl = P(margin > 1.5)  ✓
        #   p_away_rl = 1 - p_home_rl = P(away covers +1.5)  ✓
        #
        # Case B: rl_spread = +1.5 (AWAY is RL favorite, e.g. PIT -1.5)
        #   Away covers -1.5 when: away_runs - home_runs > 1.5  → margin < -1.5
        #   Home covers +1.5 when: away_runs - home_runs <= 1.5 → margin >= -1.5
        #   p_home_rl = P(margin >= -1.5) = P(home covers +1.5)  ✓
        #   p_away_rl = 1 - p_home_rl = P(away covers -1.5)  ✓
        #
        # CRITICAL FIX: In Case B, p_home_rl must be P(margin >= -1.5), NOT P(margin < -1.5)
        # The old code had: else float((margins < -abs(rl_spread)).mean())
        # which computed P(away covers -1.5) and stored it as p_home_rl — INVERTED.
        if rl_spread < 0:
            # Home is RL fav (-1.5): home covers when margin > 1.5
            p_home_rl = float((margins > abs(rl_spread)).mean())
        else:
            # Away is RL fav (-1.5): home covers +1.5 when margin >= -1.5
            # (i.e. away does NOT cover -1.5)
            p_home_rl = float((margins >= -abs(rl_spread)).mean())

        exp_total = float(totals.mean())
        nat_key   = _nearest_key(exp_total)
        p_over_nat  = float((totals > nat_key).mean())
        p_under_nat = float((totals < nat_key).mean())

        p_over_line  = float((totals > ou_line).mean()) if ou_line else p_over_nat
        p_under_line = float((totals < ou_line).mean()) if ou_line else p_under_nat

        pct = np.percentile(totals, [5, 25, 50, 75, 95])

        return {
            'p_home_win':       round(p_home, 6),
            'p_away_win':       round(p_away, 6),
            'exp_home_runs':    round(float(home_runs.mean()), 2),
            'exp_away_runs':    round(float(away_runs.mean()), 2),
            'exp_total':        round(exp_total, 2),
            'median_total':     round(float(np.median(totals)), 2),
            'p_home_cover_rl':  round(p_home_rl, 6),
            'p_away_cover_rl':  round(1.0 - p_home_rl, 6),
            'rl_spread':        rl_spread,
            'natural_key':      nat_key,
            'p_over_natural':   round(p_over_nat, 6),
            'p_under_natural':  round(p_under_nat, 6),
            'p_over_at_line':   round(p_over_line, 6),
            'p_under_at_line':  round(p_under_line, 6),
            'home_std':         round(float(home_runs.std()), 3),
            'away_std':         round(float(away_runs.std()), 3),
            'total_pct_5':      round(float(pct[0]), 2),
            'total_pct_25':     round(float(pct[1]), 2),
            'total_pct_50':     round(float(pct[2]), 2),
            'total_pct_75':     round(float(pct[3]), 2),
            'total_pct_95':     round(float(pct[4]), 2),
            'n_sims':           self.n_sims,
        }

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 7: MARKET DERIVATION (identical to engine)
# ─────────────────────────────────────────────────────────────────────────────
class MarketDerivation:
    def derive(self, sim: dict, home_team: str, away_team: str,
               ou_line: Optional[float] = None) -> dict:
        p_home = sim['p_home_win']
        p_away = sim['p_away_win']
        p_hrl  = sim['p_home_cover_rl']
        p_arl  = sim['p_away_cover_rl']

        total_key = ou_line if ou_line else sim['natural_key']
        p_over    = sim['p_over_at_line'] if ou_line else sim['p_over_natural']
        p_under   = sim['p_under_at_line'] if ou_line else sim['p_under_natural']

        combined_std = math.sqrt(sim['home_std'] ** 2 + sim['away_std'] ** 2)
        model_spread = round(-norm.ppf(p_home) * combined_std, 2)

        return {
            'home_team':        home_team,
            'away_team':        away_team,
            'p_home_win':       round(p_home, 4),
            'p_away_win':       round(p_away, 4),
            'ml_home':          prob_to_ml(p_home),
            'ml_away':          prob_to_ml(p_away),
            'rl_home_spread':   sim['rl_spread'],
            'rl_away_spread':   -sim['rl_spread'],
            'rl_home_odds':     prob_to_ml(p_hrl),
            'rl_away_odds':     prob_to_ml(p_arl),
            'p_home_cover_rl':  round(p_hrl, 4),
            'p_away_cover_rl':  round(p_arl, 4),
            'total_key':        total_key,
            'p_over':           round(p_over, 4),
            'p_under':          round(p_under, 4),
            'over_odds':        prob_to_ml(p_over),
            'under_odds':       prob_to_ml(p_under),
            'exp_home_runs':    sim['exp_home_runs'],
            'exp_away_runs':    sim['exp_away_runs'],
            'exp_total':        sim['exp_total'],
            'model_spread':     model_spread,
        }

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 8: EDGE DETECTION (identical to engine)
# ─────────────────────────────────────────────────────────────────────────────
class EdgeDetector:
    def detect(self, market: dict, book: dict) -> List[dict]:
        edges = []
        checks = [
            ('home_ml',  market['p_home_win'],     book.get('ml_home')),
            ('away_ml',  market['p_away_win'],      book.get('ml_away')),
            ('home_rl',  market['p_home_cover_rl'], book.get('rl_home')),
            ('away_rl',  market['p_away_cover_rl'], book.get('rl_away')),
        ]
        for label, model_p, book_odds in checks:
            if book_odds is None:
                continue
            bp = ml_to_prob(book_odds)
            bp_nv, _ = remove_vig(bp, 1.0 - bp)
            edge = model_p - bp_nv
            if MIN_EDGE_THRESHOLD <= edge <= MAX_EDGE_THRESHOLD:
                edges.append({
                    'market':     label,
                    'model_p':    round(model_p, 4),
                    'book_p':     round(bp_nv, 4),
                    'edge':       round(edge, 4),
                    'book_odds':  book_odds,
                    'model_odds': prob_to_ml(model_p),
                })
        ou_line    = book.get('ou_line')
        over_odds  = book.get('over_odds')
        under_odds = book.get('under_odds')
        if ou_line and over_odds:
            bop = ml_to_prob(over_odds)
            bup = ml_to_prob(under_odds) if under_odds else 1.0 - bop
            bop_nv, bup_nv = remove_vig(bop, bup)
            for label, mp, bp in [('over', market['p_over'], bop_nv),
                                   ('under', market['p_under'], bup_nv)]:
                edge = mp - bp
                if MIN_EDGE_THRESHOLD <= edge <= MAX_EDGE_THRESHOLD:
                    edges.append({
                        'market':  f'total_{label}',
                        'model_p': round(mp, 4),
                        'book_p':  round(bp, 4),
                        'edge':    round(edge, 4),
                        'ou_line': ou_line,
                    })
        return edges

# ─────────────────────────────────────────────────────────────────────────────
# LAYER 9: VALIDATION (identical to engine)
# ─────────────────────────────────────────────────────────────────────────────
class ValidationLayer:
    def validate(self, market: dict) -> Tuple[bool, List[str]]:
        w = []
        if (market['p_home_win'] > 0.5) != (market['exp_home_runs'] > market['exp_away_runs']):
            w.append(f"ML/runs inconsistency: p_home={market['p_home_win']:.3f} "
                     f"exp_home={market['exp_home_runs']:.2f} exp_away={market['exp_away_runs']:.2f}")
        if market['p_home_win'] > 0.70 and market['p_home_cover_rl'] < 0.40:
            w.append(f"RL inconsistency: heavy favorite but low RL cover rate")
        if abs(market['exp_total'] - market['total_key']) > 2.5:
            w.append(f"Total key mismatch: exp={market['exp_total']:.2f} key={market['total_key']}")
        for f in ['p_home_win', 'p_away_win', 'p_over', 'p_under']:
            v = market.get(f)
            if v is not None and not (0.0 <= v <= 1.0):
                w.append(f'{f}={v:.4f} out of bounds')
        return len(w) == 0, w

# ─────────────────────────────────────────────────────────────────────────────
# ENVIRONMENT FEATURES (from FeatureEngineer.get_environment_features)
# ─────────────────────────────────────────────────────────────────────────────
def get_environment_features(home_team_db: str, game_month: int,
                              weather: Optional[dict] = None) -> dict:
    retro = DB_TO_RETRO.get(home_team_db, home_team_db)
    pf = PARK_FACTORS.get(retro, {'r': 100, 'hr': 100, 'h': 100})
    park_run = pf['r'] / 100.0
    park_hr  = pf['hr'] / 100.0

    weather_run = 1.0
    weather_hr  = 1.0
    if weather:
        temp = weather.get('temp_f', 72)
        wind = weather.get('wind_speed_mph', 5)
        wdir = str(weather.get('wind_dir', 'calm')).lower()
        weather_run = 1.0 + (temp - 72) * 0.001
        if 'out' in wdir:
            weather_hr = 1.0 + wind * 0.006
        elif 'in' in wdir:
            weather_hr = 1.0 - wind * 0.004

    mf = HFA_MONTHLY_FACTORS.get(game_month, 1.0)
    td = HFA_TEAM_DELTA.get(retro, 0.0)
    hfa = float(np.clip(
        HFA_BASE_WEIGHT * (HFA_MONTH_SCALE * mf + (1.0 - HFA_MONTH_SCALE)) *
        (1.0 + HFA_TEAM_SCALE * td),
        -0.60, 0.80
    ))

    return {
        'park_run_factor':  round(park_run, 4),
        'park_hr_factor':   round(park_hr, 4),
        'weather_run_adj':  round(weather_run, 4),
        'weather_hr_adj':   round(weather_hr, 4),
        'hfa_weight':       round(hfa, 4),
        'hfa_month_factor': round(mf, 4),
        'hfa_team_delta':   round(td, 4),
    }

# ─────────────────────────────────────────────────────────────────────────────
# TEAM STAT → FEATURE DICT CONVERTER
# Converts 2025 season stats into the feature dict format the engine expects
# ─────────────────────────────────────────────────────────────────────────────
def team_stats_to_pitcher_features(stats: dict) -> dict:
    """
    Convert team-level pitching stats into a pitcher feature dict.
    Used for the OPPOSING pitcher (defense) side.
    ERA → xfip_proxy, K/9 → k_pct, BB/9 → bb_pct, etc.
    """
    era  = float(stats.get('era', 4.50))
    k9   = float(stats.get('k9', 8.5))
    bb9  = float(stats.get('bb9', 3.2))
    whip = float(stats.get('whip', 1.30))
    ip_per_game = float(stats.get('ip_per_game', STARTER_IP_MEAN))

    # Convert K/9 and BB/9 to per-PA rates
    # ~4.3 PA per inning (27 outs / 9 innings * adjustment for baserunners)
    pa_per_9 = 38.0  # approximate PA per 9 innings
    k_pct    = k9  / pa_per_9
    bb_pct   = bb9 / pa_per_9

    # HR/PA from ERA and WHIP (rough approximation)
    # League avg HR/PA = 0.034; scale by ERA relative to league
    hr_pct = LEAGUE_HR_PCT * (era / 4.50)

    # Hit distribution: singles, doubles, triples
    # Hits/PA from WHIP: WHIP = (BB + H) / IP → H/IP = WHIP - BB/9/9
    h_per_9 = whip * 9.0 - bb9
    h_pct   = h_per_9 / pa_per_9
    # Distribute hits: ~63% singles, ~20% doubles, ~2% triples, ~15% HR of hits
    single_pct = h_pct * 0.63
    double_pct = h_pct * 0.20
    triple_pct = h_pct * 0.02

    xfip_proxy = 3.5 + (era - 4.50) * 0.5

    return {
        'k_pct':       float(np.clip(k_pct, 0.10, 0.40)),
        'bb_pct':      float(np.clip(bb_pct, 0.04, 0.18)),
        'hr_pct':      float(np.clip(hr_pct, 0.01, 0.07)),
        'single_pct':  float(np.clip(single_pct, 0.08, 0.22)),
        'double_pct':  float(np.clip(double_pct, 0.02, 0.08)),
        'triple_pct':  float(np.clip(triple_pct, 0.001, 0.01)),
        'xwoba':       LEAGUE_XWOBA,
        'barrel_rate': 0.08,
        'hard_hit':    0.35,
        'gb_pct':      0.43,
        'fb_pct':      0.35,
        'whiff_pct':   0.24,
        'ff_speed':    92.0,
        'ip_per_game': ip_per_game,
        'pitch_hand':  'R',
        'xfip_proxy':  float(np.clip(xfip_proxy, 2.5, 6.5)),
    }

def team_stats_to_batter_features(stats: dict) -> dict:
    """
    Convert team-level hitting stats into a batter feature dict.
    OPS, AVG, OBP, SLG → per-PA event rates.
    """
    avg  = float(stats.get('avg', 0.245))
    obp  = float(stats.get('obp', 0.310))
    slg  = float(stats.get('slg', 0.410))
    ops  = obp + slg

    # BB/PA from OBP and AVG: OBP = (H + BB + HBP) / PA
    # Approximate: BB/PA ≈ OBP - AVG - 0.01 (HBP)
    bb_pct = max(0.04, obp - avg - 0.01)

    # HR/PA from SLG and AVG: SLG = (1B + 2*2B + 3*3B + 4*HR) / AB
    # Rough: HR/PA ≈ (SLG - AVG) * 0.25
    hr_pct = float(np.clip((slg - avg) * 0.25, 0.01, 0.07))

    # Hit distribution from AVG
    single_pct = avg * 0.63
    double_pct = avg * 0.20
    triple_pct = avg * 0.02

    # K rate from OPS (lower OPS = higher K rate roughly)
    k_pct = float(np.clip(0.35 - ops * 0.15, 0.12, 0.32))

    # ISO = SLG - AVG
    iso = max(0.05, slg - avg)

    return {
        'k_pct':       float(np.clip(k_pct, 0.12, 0.32)),
        'bb_pct':      float(np.clip(bb_pct, 0.04, 0.18)),
        'hr_pct':      float(np.clip(hr_pct, 0.01, 0.07)),
        'single_pct':  float(np.clip(single_pct, 0.08, 0.22)),
        'double_pct':  float(np.clip(double_pct, 0.02, 0.08)),
        'triple_pct':  float(np.clip(triple_pct, 0.001, 0.01)),
        'xwoba':       LEAGUE_XWOBA,
        'woba':        LEAGUE_WOBA,
        'iso':         iso,
        'barrel_rate': float(np.clip(0.06 + iso * 0.15, 0.04, 0.14)),
        'hard_hit':    float(np.clip(0.28 + iso * 0.30, 0.25, 0.50)),
        'bat_hand':    'R',
    }

def pitcher_stats_to_features(stats: dict, team_era: float = 4.50) -> dict:
    """
    Convert individual pitcher stats into pitcher feature dict.
    """
    era  = float(stats.get('era', team_era))
    k9   = float(stats.get('k9', 8.5))
    bb9  = float(stats.get('bb9', 3.2))
    whip = float(stats.get('whip', 1.30))
    ip   = float(stats.get('ip', 150.0))
    gp   = max(1, int(stats.get('gp', 28)))
    ip_per_game = ip / gp

    pa_per_9 = 38.0
    k_pct    = k9  / pa_per_9
    bb_pct   = bb9 / pa_per_9
    hr_pct   = LEAGUE_HR_PCT * (era / 4.50)
    h_per_9  = whip * 9.0 - bb9
    h_pct    = h_per_9 / pa_per_9
    single_pct = h_pct * 0.63
    double_pct = h_pct * 0.20
    triple_pct = h_pct * 0.02
    xfip_proxy = 3.5 + (era - 4.50) * 0.5

    return {
        'k_pct':       float(np.clip(k_pct, 0.10, 0.45)),
        'bb_pct':      float(np.clip(bb_pct, 0.03, 0.18)),
        'hr_pct':      float(np.clip(hr_pct, 0.01, 0.07)),
        'single_pct':  float(np.clip(single_pct, 0.06, 0.22)),
        'double_pct':  float(np.clip(double_pct, 0.01, 0.08)),
        'triple_pct':  float(np.clip(triple_pct, 0.001, 0.01)),
        'xwoba':       LEAGUE_XWOBA,
        'barrel_rate': 0.08,
        'hard_hit':    0.35,
        'gb_pct':      0.43,
        'fb_pct':      0.35,
        'whiff_pct':   float(np.clip(k_pct * 0.9, 0.15, 0.40)),
        'ff_speed':    92.0,
        'ip_per_game': ip_per_game,
        'pitch_hand':  'R',
        'xfip_proxy':  float(np.clip(xfip_proxy, 2.0, 6.5)),
    }

# ─────────────────────────────────────────────────────────────────────────────
# MAIN PROJECTION FUNCTION
# ─────────────────────────────────────────────────────────────────────────────
def project_game(
    away_abbrev: str,
    home_abbrev: str,
    away_team_stats: dict,    # 2025 season stats: rpg, era, avg, obp, slg, k9, bb9, whip
    home_team_stats: dict,
    away_pitcher_stats: dict, # individual SP stats: era, k9, bb9, whip, ip, gp
    home_pitcher_stats: dict,
    book_lines: dict,         # ml_home, ml_away, ou_line, over_odds, under_odds, rl_home, rl_away
    game_date: datetime,
    weather: Optional[dict] = None,
    seed: int = 42,
) -> dict:
    t0 = time.time()

    # Build environment (park factor + HFA)
    env = get_environment_features(home_abbrev, game_date.month, weather)

    # Build feature dicts
    # Away offense (batting) faces home pitcher
    away_lineup_feat = team_stats_to_batter_features(away_team_stats)
    # Home offense (batting) faces away pitcher
    home_lineup_feat = team_stats_to_batter_features(home_team_stats)

    # Pitcher features (the OPPOSING pitcher each team faces)
    away_sp_feat  = pitcher_stats_to_features(away_pitcher_stats, away_team_stats.get('era', 4.50))
    home_sp_feat  = pitcher_stats_to_features(home_pitcher_stats, home_team_stats.get('era', 4.50))

    # Build 9-batter lineup (all same team-average batter)
    away_lineup = [away_lineup_feat] * 9
    home_lineup = [home_lineup_feat] * 9

    # Bullpen: use default (no recent game data available)
    bullpen = _default_bullpen()

    # Game state: home offense faces away SP; away offense faces home SP
    gs_builder = GameStateBuilder()
    home_state = gs_builder.build(home_lineup, away_sp_feat, bullpen, env, quality_mult=1.0)
    away_state = gs_builder.build(away_lineup, home_sp_feat, bullpen, env, quality_mult=1.0)

    # Run line convention: always ±1.5 in MLB
    # rl_spread in simulate() is from HOME perspective
    # If home is -1.5 on the run line: rl_spread = -1.5 (home covers if margin > 1.5)
    # If away is -1.5 on the run line: rl_spread = +1.5 (home covers if margin < -1.5)
    #
    # CRITICAL: Use the book's ACTUAL run line direction, NOT the ML direction.
    # In MLB, the run line favorite (-1.5) is NOT always the ML favorite.
    # A team can be the ML underdog (+ML) but still be -1.5 on the run line.
    # Example: PIT +109 ML but PIT -1.5 RL (book prices PIT as RL favorite)
    #
    # book_lines must include 'rl_home_spread' (e.g. -1.5 or +1.5 for home team)
    # If not provided, fall back to ML direction as a last resort.
    rl_home_spread = book_lines.get('rl_home_spread', None)
    if rl_home_spread is not None:
        rl_spread = float(rl_home_spread)  # -1.5 if home is RL favorite, +1.5 if away is RL favorite
    else:
        # Fallback: infer from ML (less accurate — avoid if possible)
        ml_home = book_lines.get('ml_home', 0)
        ml_away = book_lines.get('ml_away', 0)
        if ml_home < 0:
            rl_spread = -1.5  # home ML favorite → assume home RL favorite
        else:
            rl_spread = 1.5   # away ML favorite → assume away RL favorite

    ou_line = book_lines.get('ou_line')

    mc = MonteCarloEngine(n_sims=SIMULATIONS, seed=seed)
    sim = mc.simulate(home_state, away_state, env, ou_line=ou_line, rl_spread=rl_spread)

    market = MarketDerivation().derive(sim, home_abbrev, away_abbrev, ou_line)
    edges  = EdgeDetector().detect(market, book_lines)
    ok, warnings_list = ValidationLayer().validate(market)

    elapsed = round(time.time() - t0, 2)

    # Format output for display
    home_rl_label = f"{rl_spread:+.1f}"
    away_rl_label = f"{-rl_spread:+.1f}"

    return {
        'ok':              True,
        'game':            f"{away_abbrev} @ {home_abbrev}",
        'away_abbrev':     away_abbrev,
        'home_abbrev':     home_abbrev,
        # Projected runs
        'proj_away_runs':  market['exp_away_runs'],
        'proj_home_runs':  market['exp_home_runs'],
        'proj_total':      market['exp_total'],
        # Moneyline
        'away_ml':         market['ml_away'],
        'home_ml':         market['ml_home'],
        'away_win_pct':    round(market['p_away_win'] * 100, 2),
        'home_win_pct':    round(market['p_home_win'] * 100, 2),
        # Run line
        'away_run_line':   away_rl_label,
        'home_run_line':   home_rl_label,
        'away_rl_odds':    market['rl_away_odds'],
        'home_rl_odds':    market['rl_home_odds'],
        'away_rl_cover_pct': round(market['p_away_cover_rl'] * 100, 2),
        'home_rl_cover_pct': round(market['p_home_cover_rl'] * 100, 2),
        # Total
        'total_line':      market['total_key'],
        'over_odds':       market['over_odds'],
        'under_odds':      market['under_odds'],
        'over_pct':        round(market['p_over'] * 100, 2),
        'under_pct':       round(market['p_under'] * 100, 2),
        # Model spread
        'model_spread':    market['model_spread'],
        # Edges
        'edges':           edges,
        # Validation
        'valid':           ok,
        'warnings':        warnings_list,
        # Environment
        'env':             env,
        'home_state_mu':   home_state['mu'],
        'away_state_mu':   away_state['mu'],
        # Meta
        'simulations':     SIMULATIONS,
        'elapsed_sec':     elapsed,
        'error':           None,
    }
