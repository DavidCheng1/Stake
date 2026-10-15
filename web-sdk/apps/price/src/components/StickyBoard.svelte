<script lang="ts" module>
	import type { Prize, PrizeWin } from '../game/types';

	export type EmitterEventStickyBoard =
		| { type: 'stickyBoardShow' }
		| { type: 'stickyBoardHide' }
		| { type: 'stickyBoardNew'; prizes: Prize[] }
		| {
				type: 'stickyBoardAnimateSymbols';
				prizeWins: PrizeWin[];
		  }
		| { type: 'stickyBoardClear' };
</script>

<script lang="ts">
	import _ from 'lodash';

	import { waitForResolve } from 'utils-shared/wait';
	import { BoardContext } from 'components-shared';

	import BoardMask from './BoardMask.svelte';
	import BoardContainer from './BoardContainer.svelte';
	import StickyBoardBase from './StickyBoardBase.svelte';
	import { getContext } from '../game/context';
	import type { StickySymbolState } from '../game/stateGame.svelte';

	const context = getContext();

	let show = $state(true);

	context.eventEmitter.subscribeOnMount({
		stickyBoardShow: () => (show = true),
		stickyBoardHide: () => (show = false),
		stickyBoardNew: async (emitterEvent) => {
			const newStickySymbols = emitterEvent.prizes.map((prize) => {
				return {
					prize,
					isOpen: false,
					state: 'open' as StickySymbolState,
					oncomplete: () => {},
				};
			});

			context.stateGame.stickySymbols = [...context.stateGame.stickySymbols, ...newStickySymbols];

			const getPromises = () =>
				context.stateGame.stickySymbols.map(async (stickSymbol) => {
					await waitForResolve(
						(resolve) =>
							(stickSymbol.oncomplete = () => {
								stickSymbol.isOpen = true;
								stickSymbol.state = 'idle';
								resolve();
							}),
					);
				});

			await Promise.all(getPromises());
		},
		stickyBoardAnimateSymbols: async ({ prizeWins }) => {
			const getPromises = () =>
				context.stateGame.stickySymbols.map((stickSymbol) => {
					return prizeWins.map(async (prizeWin) => {
						if (
							stickSymbol.prize.row === prizeWin.row &&
							stickSymbol.prize.reel === prizeWin.reel
						) {
							stickSymbol.state = 'win';
							await waitForResolve(
								(resolve) =>
									(stickSymbol.oncomplete = () => {
										stickSymbol.state = 'idle';
										resolve();
									}),
							);
						}
					});
				});

			await Promise.all(_.flatten(getPromises()));
		},
		stickyBoardClear: () => {
			context.stateGame.stickySymbols = [];
		},
	});
</script>

{#if show}
	<BoardContext animate={false}>
		<BoardContainer>
			<BoardMask />
			<StickyBoardBase />
		</BoardContainer>
	</BoardContext>

	<BoardContext animate={true}>
		<BoardContainer>
			<StickyBoardBase />
		</BoardContainer>
	</BoardContext>
{/if}
