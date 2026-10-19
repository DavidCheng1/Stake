<script lang="ts" module>
	import ClusterWinAmount, { type RawWin, type Win } from './ClusterWinAmount.svelte';

	export type EmitterEventClusterWinAmounts = {
		type: 'showClusterWinAmounts';
		wins: RawWin[];
	};
</script>

<script lang="ts">
	import { waitForResolve } from 'utils-shared/wait';

	import { Container, Text } from 'pixi-svelte';
	import { getGameLayout } from '../game/layoutGeometry';
	import { getContext } from '../game/context';

	const context = getContext();
	const layout = $derived(getGameLayout(context.stateLayoutDerived.mainLayout()));

	let wins: Win[] = $state([]);

	context.eventEmitter.subscribeOnMount({
		showClusterWinAmounts: async (emitterEvent) => {
			// Show the combined cluster payout outside the board; symbol highlights remain on it.
			const result = emitterEvent.wins.reduce((total, win) => total + win.result, 0);
			wins = result > 0 ? [{ win: result, result, mult: 1, reel: 0, row: 0, oncomplete: () => {} }] : [];
			const gerPromises = () =>
				wins.map(async (win) => {
					await waitForResolve((resolve) => (win.oncomplete = resolve));
				});
			await Promise.all(gerPromises());
			wins = [];
		},
	});
</script>

<Container x={layout.resultX} y={layout.resultY}>
	{#if wins.length}
		<Text anchor={0.5} y={-32} text="CLUSTER WIN" style={{ fontFamily: 'proxima-nova', fontSize: 22, fill: 0xf2dba1 }} />
	{/if}
	{#each wins as win}
		<ClusterWinAmount {win} />
	{/each}
</Container>
