<script lang="ts" module>
	import type { Position, Wild } from '../game/types';

	export type EmitterEventExpandingWilds =
		| { type: 'expandingWildsShow' }
		| { type: 'expandingWildsHide' }
		| { type: 'expandingWildsNew'; wilds: Wild[] }
		| { type: 'expandingWildsWin'; positions: Position[] }
		| { type: 'expandingWildsUpdate'; wilds: Wild[] }
		| { type: 'expandingWildsClear' };
</script>

<script lang="ts">
	import _ from 'lodash';
	import { Tween } from 'svelte/motion';

	import { BitmapText, Container } from 'pixi-svelte';
	import { waitForResolve } from 'utils-shared/wait';

	import ExpandingWild from './ExpandingWild.svelte';
	import BoardContainer from './BoardContainer.svelte';
	import { stateGame } from '../game/stateGame.svelte';
	import { SYMBOL_SIZE } from '../game/constants';
	import { getContext } from '../game/context';

	const context = getContext();
	// wild_expand (expand)
	// 'wild_event' (shorter, win)
	// 'wild_loop' (idle)
	// 'wild_reveal' (win)
	// 'wild_static' (static)
	const EXPANDING_WILD_MAP = {
		expand: 'wild_expand',
		expandedIdle: 'wild_loop',
		expandedWin: 'wild_reveal',
	} as const;

	let show = $state(false);

	context.eventEmitter.subscribeOnMount({
		expandingWildsShow: () => (show = true),
		expandingWildsHide: () => (show = false),
		expandingWildsNew: async (emitterEvent) => {
			const newExpandingWilds = emitterEvent.wilds.map((wild) => ({
				wild,
				state: 'expand' as const,
				multiplierScale: new Tween(1),
				oncomplete: () => {},
			}));

			stateGame.expandingWilds = [...stateGame.expandingWilds, ...newExpandingWilds];

			const getPromises = () =>
				newExpandingWilds.map(async (expandingWild) => {
					await waitForResolve((resolve) => (expandingWild.oncomplete = resolve));
				});

			await Promise.all(getPromises());
		},
		expandingWildsWin: async ({ positions }) => {
			const reelPositions = positions.map((position) => position.reel);

			stateGame.expandingWilds.forEach((expandingWild) => {
				if (reelPositions.includes(expandingWild.wild.reel)) {
					expandingWild.state = 'expandedIdle';
					expandingWild.state = 'expandedWin';
				}
			});

			const getPromises = () =>
				stateGame.expandingWilds.map(async (expandingWild) => {
					if (reelPositions.includes(expandingWild.wild.reel)) {
						await waitForResolve((resolve) => (expandingWild.oncomplete = resolve));
					}
				});

			await Promise.all(getPromises());
		},
		expandingWildsUpdate: async (emitterEvent) => {
			const getPromises = () =>
				stateGame.expandingWilds.map((expandingWild) => {
					return emitterEvent.wilds.map(async (wild) => {
						if (expandingWild.wild.reel === wild.reel && expandingWild.wild.row === wild.row) {
							await expandingWild.multiplierScale.set(2, { duration: 600 });
							expandingWild.wild.mult = wild.mult;
							await expandingWild.multiplierScale.set(1, { duration: 200 });
						}
					});
				});

			await Promise.all(_.flatten(getPromises()));
		},
		expandingWildsClear: () => {
			stateGame.expandingWilds = [];
		},
	});
</script>

{#if show}
	<BoardContainer>
		{#each stateGame.expandingWilds as expandingWild}
			{@const animationName = EXPANDING_WILD_MAP[expandingWild.state]}
			<Container
				x={expandingWild.wild.reel * SYMBOL_SIZE + SYMBOL_SIZE * 0.5}
				y={SYMBOL_SIZE * 0.5}
			>
				<ExpandingWild
					{animationName}
					loop={expandingWild.state === 'expandedIdle'}
					listener={{
						complete: () => {
							if (['expand', 'expandedWin'].includes(expandingWild.state)) {
								expandingWild.state = 'expandedIdle';
								expandingWild.oncomplete();
							}
						},
					}}
				/>
				{#if expandingWild.state !== 'expand'}
					<BitmapText
						scale={expandingWild.multiplierScale.current}
						y={expandingWild.wild.row * SYMBOL_SIZE}
						anchor={0.5}
						text={`${expandingWild.wild.mult}X`}
						style={{
							fontFamily: 'gold',
							fontSize: 0.5 * SYMBOL_SIZE,
							wordWrap: false,
						}}
					/>
				{/if}
			</Container>
		{/each}
	</BoardContainer>
{/if}
