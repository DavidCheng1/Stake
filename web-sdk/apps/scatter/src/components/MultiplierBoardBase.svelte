<script lang="ts">
	import MultiplierSymbol from './MultiplierSymbol.svelte';
	import { getContext } from '../game/context';

	const context = getContext();
</script>

{#each context.stateGame.multiplierBoard as multiplierSymbols, reelIndex (reelIndex)}
	{#each multiplierSymbols as multiplierSymbol}
		{#if multiplierSymbol}
			<MultiplierSymbol {reelIndex} {multiplierSymbol} />
		{/if}
	{/each}
{/each}
