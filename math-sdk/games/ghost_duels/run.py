"""Main file for generating Ghost Duels results."""

import shutil
import sys
from gamestate import GameState
from game_config import GameConfig
from game_stats import print_stats
from utils.rgs_verification import execute_all_tests
from src.state.run_sims import create_books
from src.write_data.write_configs import generate_configs

if __name__ == "__main__":

    num_threads = 5  # fits a 16 GB machine and splits 1M / 100k into whole batches; each simulation seeds itself
    batching_size = 20000  # books held in memory per worker before writing; results do not depend on it
    compression = True
    profiling = False

    # Pass numbers to override (base, then bonus buy), e.g. `python games/ghost_duels/run.py 10000 2000` for a quick check
    num_sim_args = {
        "base": int(sys.argv[1]) if len(sys.argv) > 1 else int(1e6),
        "bonus": int(sys.argv[2]) if len(sys.argv) > 2 else int(1e5),
    }

    # Optimization needs Rust/cargo and a forced-criteria setup; this game publishes its natural distribution.
    run_conditions = {
        "run_sims": True,
        "run_analysis": True,
        "run_format_checks": True,
    }

    config = GameConfig()
    gamestate = GameState(config)

    if run_conditions["run_sims"]:
        create_books(
            gamestate,
            config,
            num_sim_args,
            batching_size,
            num_threads,
            compression,
            profiling,
        )
        # Without optimization the published LUT is the fresh, unweighted one (replaces any older copy)
        for bm in config.bet_modes:
            paths = gamestate.output_files.lookups[bm.get_name()]["paths"]
            shutil.copy(paths["base_lookup"], paths["optimized_lookup"])

    generate_configs(gamestate)

    if run_conditions["run_analysis"]:
        for bm in config.bet_modes:
            print_stats(config, bm.get_name())

    if run_conditions["run_format_checks"]:
        execute_all_tests(config)
