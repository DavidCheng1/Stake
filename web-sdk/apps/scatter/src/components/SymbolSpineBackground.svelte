<script lang="ts">
	import { SpineProvider, SpineTrack } from 'pixi-svelte';
	import { stateBetDerived } from 'state-shared';

	import { getSymbolBackgroundInfo } from '../game/utils';
	import { SYMBOL_SIZE } from '../game/constants';

	type Props = {
		symbolBackgroundInfo: ReturnType<typeof getSymbolBackgroundInfo>;
		x?: number;
		y?: number;
		loop?: boolean;
	};

	const props: Props = $props();
</script>

<!-- background -->
{#if props.symbolBackgroundInfo}
	<SpineProvider
		x={props.x}
		y={props.y}
		key={props.symbolBackgroundInfo.assetKey}
		height={SYMBOL_SIZE * props.symbolBackgroundInfo.sizeRatios.height}
	>
		<SpineTrack
			loop={props.loop}
			trackIndex={0}
			animationName={props.symbolBackgroundInfo.animationName}
			timeScale={stateBetDerived.timeScale()}
		/>
	</SpineProvider>
{/if}
