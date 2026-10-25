"""Main file for generating Ghost Duels results.

    env\\Scripts\\python.exe games\\ghost_duels\\run.py                    simulate, optimize, stats, format checks
    env\\Scripts\\python.exe games\\ghost_duels\\run.py --optimize-only    re-optimize the existing books (new targets)
    env\\Scripts\\python.exe games\\ghost_duels\\run.py --configs-only     only rewrite configs, stats and checks
    env\\Scripts\\python.exe games\\ghost_duels\\run.py 20000 5000         quick check: 20k rounds per big mode, 5k per small one

Optimization needs Rust/cargo (math-sdk/optimization_program); targets are in game_optimization.py.
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
    batching_size = 10000  # books held in memory per worker before writing; results do not depend on it
    compression = True
    profiling = False

    configs_only = "--configs-only" in sys.argv
    optimize_only = "--optimize-only" in sys.argv
    counts = [int(a) for a in sys.argv[1:] if a.isdigit()]
    big, small = (counts + [None, None])[:2]
    # base and the boosts are played every spin and need the most rounds; buys and VS Spin are single features
    num_sim_args = {"base": big or int(1e6), "boost": big or int(5e5), "boost6": big or int(5e5)}
    for name in ("bonus", "bonus4", "bonus5", "vsspin"):
        num_sim_args[name] = small or int(1e5)

    run_conditions = {
        "run_sims": not (configs_only or optimize_only),
        "run_optimization": not configs_only,
        "run_analysis": True,
        "run_format_checks": True,
    }

    config = GameConfig()
    gamestate = GameState(config)
    OptimizationSetup(config)

    if run_conditions["run_sims"]:
        create_books(gamestate, config, num_sim_args, batching_size, num_threads, compression, profiling)

    generate_configs(gamestate)

    if run_conditions["run_optimization"]:
        OptimizationExecution().run_all_modes(config, list(num_sim_args), rust_threads)
        generate_configs(gamestate)

    if run_conditions["run_analysis"]:
        for bm in config.bet_modes:
            print_stats(config, bm.get_name())

    if run_conditions["run_format_checks"]:
        execute_all_tests(config)
