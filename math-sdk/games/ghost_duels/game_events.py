"""Ghost Duels events. All win amounts are bet multipliers x100 (integers), like the SDK events.
Positions are {"reel", "row"} with row 0 at the top; there are no padding rows."""


def cents(value):
    return int(round(value * 100))


def add_event(gamestate, event_type, **fields):
    gamestate.book.add_event({"index": len(gamestate.book.events), "type": event_type, **fields})


def reveal_event(gamestate):
    """Initial board. VS reels are listed separately and show 'vs' in every cell."""
    add_event(
        gamestate,
        "reveal",
        board=[[{"name": sym} for sym in col] for col in gamestate.board],
        vsReels=list(gamestate.vs_reels),
        gameType=gamestate.gametype,
    )


def vs_duel_event(gamestate, duel):
    """One duel inside a VS reel, including the cosmetic rounds the animation plays."""
    add_event(gamestate, "vsDuel", **duel)


def win_info_event(gamestate, clusters, tumble_win):
    wins = []
    for cl in clusters:
        wins.append(
            {
                "symbol": cl["symbol"],
                "positions": [{"reel": c, "row": r} for c, r in cl["cells"]],
                "vsReels": cl["vsReels"],
                "wildOnly": cl["wildOnly"],
                "base": cents(cl["base"]),
                "mult": cl["mult"],
                "win": cents(cl["win"]),
            }
        )
    add_event(gamestate, "winInfo", totalWin=cents(tumble_win), wins=wins)


def update_tumble_win_event(gamestate):
    add_event(gamestate, "updateTumbleWin", amount=cents(gamestate.win_manager.spin_win))


def tumble_board_event(gamestate, tumble):
    add_event(gamestate, "tumbleBoard", **tumble)


def wincap_event(gamestate):
    add_event(gamestate, "wincap", amount=cents(gamestate.config.wincap))


def bonus_trigger_event(gamestate, positions):
    add_event(gamestate, "bonusTrigger", positions=[{"reel": c, "row": r} for c, r in positions])


def bonus_start_event(gamestate, crates, lives):
    """FS symbols turn into crates with a starting multiplier."""
    add_event(gamestate, "bonusStart", crates=crates, lives=lives)


def bonus_spin_event(gamestate, spin, landed, lives):
    add_event(gamestate, "bonusSpin", spin=spin, landed=landed, lives=lives)


def bonus_end_event(gamestate, groups, total):
    out = [{**g, "sum": cents(g["sum"]), "win": cents(g["win"])} for g in groups]
    add_event(gamestate, "bonusEnd", groups=out, totalWin=cents(total))


def set_total_win_event(gamestate):
    add_event(
        gamestate,
        "setTotalWin",
        amount=cents(min(gamestate.win_manager.running_bet_win, gamestate.config.wincap)),
    )


def final_win_event(gamestate):
    add_event(gamestate, "finalWin", amount=cents(min(gamestate.final_win, gamestate.config.wincap)))
