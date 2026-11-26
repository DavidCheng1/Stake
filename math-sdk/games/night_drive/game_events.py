"""Night Drive events. Win amounts are bet multipliers x100 (integers), like the SDK events. Positions are
{"reel", "row"} with row 0 at the top; there are no padding rows. A board cell is {"name": ..} plus "m" (a car's x)
and, in The Chase, "car" (the id of a car that stays).

Base round:  reveal, [driveBy], [winInfo, updateWin], setTotalWin, [freeSpinTrigger, the Chase ...], finalWin
Chase spin:  [chaseMove], updateFreeSpin, reveal, [carsLand], [winInfo, updateWin], setTotalWin
End:         freeSpinEnd, setTotalWin, [wincap], finalWin
"""


def cents(value):
    return int(round(value * 100))


def add_event(gamestate, event_type, **fields):
    gamestate.book.add_event({"index": len(gamestate.book.events), "type": event_type, **fields})


def cell(sym):
    out = {"name": sym["name"]}
    if "m" in sym:
        out["m"] = sym["m"]
    if "car" in sym:
        out["car"] = sym["car"]
    return out


def reveal_event(gamestate, board):
    add_event(gamestate, "reveal", board=[[cell(s) for s in col] for col in board], gameType=gamestate.gametype)


def driveby_event(gamestate, row, cars, under):
    """The board after reveal changes: these cells become cars (under: what the reveal showed there)."""
    add_event(gamestate, "driveBy", row=row, cars=[{"reel": c, "row": row, "m": m} for c, m in cars],
              under=[{"reel": c, "row": row, "name": n} for c, n in under])


def win_info_event(gamestate, wins, total):
    add_event(gamestate, "winInfo", totalWin=cents(total), wins=[
        {"symbol": w["symbol"], "kind": w["kind"], "ways": w["ways"], "win": cents(w["win"])} for w in wins])
# (no positions: a win is its symbol and the cars on the first `kind` reels of the board just revealed; leaving them out
# keeps the books about a third smaller)


def update_win_event(gamestate):
    add_event(gamestate, "updateWin", amount=cents(gamestate.win_manager.spin_win))


def set_total_win_event(gamestate):
    add_event(gamestate, "setTotalWin", amount=cents(min(gamestate.win_manager.running_bet_win, gamestate.config.wincap)))


def fs_trigger_event(gamestate, positions, total, super_mode):
    add_event(gamestate, "freeSpinTrigger", totalFs=total, super=super_mode,
              positions=[{"reel": c, "row": r} for c, r in positions])


def chase_move_event(gamestate, cars, exits, total):
    """Before a Chase spin every car drives one reel left; cars leaving the board give +1 spin each."""
    add_event(gamestate, "chaseMove", cars=[{"id": c["id"], "reel": c["reel"], "row": c["row"], "m": c["m"]} for c in cars],
              exits=[{"id": c["id"], "row": c["row"], "m": c["m"]} for c in exits], totalFs=total)


def update_freespin_event(gamestate, spin, total):
    add_event(gamestate, "updateFreeSpin", amount=spin, total=total)


def cars_land_event(gamestate, cars):
    add_event(gamestate, "carsLand", cars=[{"id": c["id"], "reel": c["reel"], "row": c["row"], "m": c["m"]} for c in cars])


def freespin_end_event(gamestate, amount):
    add_event(gamestate, "freeSpinEnd", amount=cents(amount))


def wincap_event(gamestate):
    add_event(gamestate, "wincap", amount=cents(gamestate.config.wincap))


def final_win_event(gamestate):
    add_event(gamestate, "finalWin", amount=cents(min(gamestate.final_win, gamestate.config.wincap)))
