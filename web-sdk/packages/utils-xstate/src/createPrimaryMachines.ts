import { fromPromise } from 'xstate';

import { API_AMOUNT_MULTIPLIER } from 'constants-shared/bet';
import { stateBet, stateBetDerived, stateUrlDerived, stateModal } from 'state-shared';
import { requestBet, requestEndRound } from 'rgs-requests';

import type { BaseBet } from './types';

const handleRequestBet = async ({ onError }: { onError: () => void }) => {
	try {
		const data = await requestBet({
			rgsUrl: stateUrlDerived.rgsUrl(),
			sessionID: stateUrlDerived.sessionID(),
			currency: stateBet.currency,
			mode: stateBet.activeBetModeKey,
			amount: stateBet.betAmount,
		});

		if (data?.error) {
			throw data;
		}

		if (data?.round?.state && data?.round?.state?.length > 0) {
			stateBet.wageredBetAmount = stateBet.betAmount;

			return data;
		} else {
			throw {
				error: 'Empty state in data.round',
				message: JSON.stringify({ data }),
			};
		}
	} catch (error) {
		onError();
		stateBet.autoSpinsCounter = 0;
		stateModal.modal = { name: 'error', error };
		console.error(error);
		throw error;
	}
};

const handleRequestEndRound = async () => {
	if (stateUrlDerived.replay()) return;

	try {
		const data = await requestEndRound({
			sessionID: stateUrlDerived.sessionID(),
			rgsUrl: stateUrlDerived.rgsUrl(),
		});

		if (data?.error) {
			throw data;
		}

		if (data?.balance?.amount !== undefined) {
			return data;
		} else {
			throw {
				error: 'Empty amount in data.balance',
				message: JSON.stringify({ data }),
			};
		}
	} catch (error) {
		console.error(error);
	}
};

const handleUpdateBalance = ({ balanceAmountFromApi }: { balanceAmountFromApi: number }) => {
	stateBet.balanceAmount = balanceAmountFromApi / API_AMOUNT_MULTIPLIER;
};

type Options<TBet extends BaseBet> = {
	onResumeGameActive: (betToResume: TBet) => TBet;
	onResumeGameInactive: (betToResume: TBet) => void;
	onNewGameStart: () => Promise<void> | undefined;
	onNewGameError: () => any;
	onPlayGame: (bet: TBet) => Promise<void>;
	checkIsBonusGame: (bet: TBet) => boolean;
	/** Optional local-only bet source used by Storybook/dev previews without an RGS session. */
	getDemoBet?: () => TBet;
};

function createPrimaryMachines<TBet extends BaseBet>(options: Options<TBet>) {
	const {
		onResumeGameActive,
		onResumeGameInactive,
		onNewGameStart,
		onNewGameError,
		onPlayGame,
		checkIsBonusGame,
		getDemoBet,
	} = options;
	const isLocalDemo = () => import.meta.env.DEV && !stateUrlDerived.rgsUrl() && !!getDemoBet;

	let balanceAmountFromApiHolder: null | number = null;
	let demoRound: { bet: TBet; wager: number; cost: number } | null = null;
	const roundBalance = (amount: number) =>
		Math.round(amount * API_AMOUNT_MULTIPLIER) / API_AMOUNT_MULTIPLIER;

	const BET_TYPE_METHODS_MAP = {
		noWin: {
			newGame: async () => undefined,
			endGame: async () => undefined,
		},
		singleRoundWin: {
			newGame: async () => {
				const endRoundData = await handleRequestEndRound();
				if (endRoundData?.balance) {
					balanceAmountFromApiHolder = endRoundData.balance.amount;
				}
			},
			endGame: async () => {
				if (balanceAmountFromApiHolder !== null) {
					handleUpdateBalance({ balanceAmountFromApi: balanceAmountFromApiHolder });
					balanceAmountFromApiHolder = null;
				}
			},
		},
		bonusWin: {
			newGame: async () => undefined,
			endGame: async () => {
				const data = await handleRequestEndRound();
				if (data?.balance) {
					handleUpdateBalance({ balanceAmountFromApi: data.balance.amount });
					balanceAmountFromApiHolder = null;
				}
			},
		},
	} as const;

	const getBetType: (args: { bet: TBet }) => keyof typeof BET_TYPE_METHODS_MAP = ({ bet }) => {
		const isBonusGame = checkIsBonusGame(bet);

		if (bet.active === true) {
			if (isBonusGame) return 'bonusWin';
		}

		if (bet.payoutMultiplier && bet.payoutMultiplier > 0) {
			if (isBonusGame) return 'bonusWin';
			return 'singleRoundWin';
		}

		return 'noWin';
	};

	// newGame
	const newGame = fromPromise(async () => {
		if (isLocalDemo()) {
			try {
				const bet = getDemoBet!();
				if (!bet || !Array.isArray(bet.state) || bet.state.length === 0) {
					throw new Error('The demo round has no playable events.');
				}
				const wager = stateBet.betAmount;
				const cost = stateBetDerived.betCost();
				if (!Number.isFinite(cost) || cost <= 0 || cost > stateBet.balanceAmount) {
					throw new Error('Insufficient balance for this spin.');
				}
				demoRound = { bet, wager, cost };
				stateBet.wageredBetAmount = wager;
				stateBet.balanceAmount = roundBalance(stateBet.balanceAmount - cost);
				await onNewGameStart();
				return { bet };
			} catch (error) {
				if (demoRound) {
					stateBet.balanceAmount = roundBalance(stateBet.balanceAmount + demoRound.cost);
					demoRound = null;
				}
				stateBet.autoSpinsCounter = 0;
				stateModal.modal = { name: 'error', error };
				onNewGameError();
				throw error;
			}
		}

		await onNewGameStart();

		const data = await handleRequestBet({ onError: onNewGameError });

		if (data) {
			if (data.balance) {
				handleUpdateBalance({ balanceAmountFromApi: data.balance.amount });
			}

			const bet = data.round as TBet;
			const betType = getBetType({ bet });
			await BET_TYPE_METHODS_MAP[betType].newGame();

			return { bet };
		}

		return { bet: null };
	});

	// resumeGame
	const resumeGame = fromPromise(async () => {
		const betToResume = stateBet.betToResume as TBet;

		if (betToResume && betToResume.active) {
			// Optional chaining doesn't work here with build-node. 🤷‍♂️
			stateBet.betToResume = null;

			//End Round resumed active bet
			const bet = betToResume as TBet;
			const betType = getBetType({ bet });
			await BET_TYPE_METHODS_MAP[betType].newGame();

			return { bet: onResumeGameActive(betToResume), rawBet: betToResume };
		}

		if (betToResume && betToResume.state && betToResume.state.length > 0) {
			onResumeGameInactive(betToResume);
		}

		throw new Error('inactive Bet');
	});

	// playGame
	const playGame = fromPromise<void, { bet: TBet | null }>(async ({ input }) => {
		try {
			if (input.bet) await onPlayGame(input.bet);
		} catch (error) {
			if (!isLocalDemo()) throw error;
			// A failed local preview must not kill the actor or award a partial round.
			if (demoRound) {
				stateBet.balanceAmount = roundBalance(stateBet.balanceAmount + demoRound.cost);
				demoRound = null;
			}
			stateBet.autoSpinsCounter = 0;
			stateBet.isSpaceHold = false;
			stateBet.winBookEventAmount = 0;
			stateModal.modal = { name: 'error', error };
			onNewGameError();
			console.error(error);
		}
	});

	// endGame
	const endGame = fromPromise<void, { bet: TBet | null; rawBet: TBet | null }>(
		async ({ input }) => {
			const targetBet = input.rawBet || input.bet;

			if (isLocalDemo()) {
				if (targetBet && demoRound && targetBet === demoRound.bet) {
					// Only settle once, after playGame has awaited every math event/animation.
					stateBet.balanceAmount = roundBalance(
						stateBet.balanceAmount + demoRound.wager * (targetBet.payoutMultiplier || 0),
					);
					demoRound = null;
				}
				return;
			}

			if (targetBet) {
				const betType = getBetType({ bet: targetBet });
				await BET_TYPE_METHODS_MAP[betType].endGame();
			}
		},
	);

	return {
		newGame,
		playGame,
		endGame,
		resumeGame,
	};
}

export { createPrimaryMachines };
