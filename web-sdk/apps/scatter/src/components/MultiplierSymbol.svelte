<script lang="ts">
	import { getSymbolBackgroundInfo, getSymbolInfo } from '../game/utils';
	import type { MultiplierSymbol } from '../game/stateGame.svelte';
	import SymbolSpineMain from './SymbolSpineMain.svelte';
	import SymbolSpineBackground from './SymbolSpineBackground.svelte';

	type Props = {
		reelIndex: number;
		multiplierSymbol: MultiplierSymbol;
	};

	const props: Props = $props();

	const symbolInfo = $derived(
		getSymbolInfo({
			rawSymbol: props.multiplierSymbol.rawSymbol,
			state: props.multiplierSymbol.symbolState,
		}),
	);

	const symbolBackgroundInfo = $derived(
		getSymbolBackgroundInfo({
			rawSymbol: props.multiplierSymbol.rawSymbol,
			state: props.multiplierSymbol.symbolState,
		}),
	);
</script>

<SymbolSpineBackground
	{symbolBackgroundInfo}
	x={props.multiplierSymbol.initX}
	y={props.multiplierSymbol.initY}
/>

<SymbolSpineMain
	{symbolInfo}
	x={props.multiplierSymbol.symbolX.current}
	y={props.multiplierSymbol.symbolY.current}
	listener={{
		complete: props.multiplierSymbol.oncomplete,
	}}
/>
