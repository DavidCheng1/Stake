r"""Simulate, optimize, report and check a game built on the Stake 3-star template. Run from math-sdk:

    env\Scripts\python.exe games\<game>\run.py                    simulate, optimize, stats, format checks
    env\Scripts\python.exe games\<game>\run.py 20000 5000         quick check: 20k rounds per spin mode, 5k per buy
    env\Scripts\python.exe games\<game>\run.py --optimize-only    re-optimize the existing books (new targets)
    env\Scripts\python.exe games\<game>\run.py --configs-only     only rewrite configs, stats and checks

Optimization needs Rust/cargo (math-sdk/optimization_program).
"""

import sys
from gamestate import GameState
from game_config import GameConfig
from game_optimization import OptimizationSetup
from game_stats import print_stats
from optimization_program.run_script import OptimizationExecution
from utils.rgs_verification import execute_all_tests
from src.state.run_sims import create_books
from src.write_data.write_configs import generate_configs

if __name__ == "__main__":

    num_threads = 4  # fits a 16 GB machine; each simulation seeds itself, so results do not depend on it
    rust_threads = 8
    batching_size = 10000
    compression = True
    profiling = False

    configs_only = "--configs-only" in sys.argv
    optimize_only = "--optimize-only" in sys.argv
    counts = [int(a) for a in sys.argv[1:] if a.isdigit()]
    big, small = (counts + [None, None])[:2]

    config = GameConfig()
    gamestate = GameState(config)
    # spin modes (base, boosts) are played every spin and need the most rounds; buys are single features
    num_sim_args = {bm.get_name(): (big or int(1e6)) if bm.get_name() == "base" else
                    (big or int(5e5)) if not bm.get_buybonus() else (small or int(1e5)) for bm in config.bet_modes}

    if not (configs_only or optimize_only):
        OptimizationSetup(config)  # placeholder fences until books exist
        create_books(gamestate, config, num_sim_args, batching_size, num_threads, compression, profiling)
    generate_configs(gamestate)

    if not configs_only:
        OptimizationSetup(config)  # fences fitted to the simulated books
        OptimizationExecution().run_all_modes(config, list(num_sim_args), rust_threads)
        generate_configs(gamestate)

    for bm in config.bet_modes:
        print_stats(config, bm.get_name())
    execute_all_tests(config)
