<script lang="ts">
	import { Container } from 'pixi-svelte';

	import StickySymbol from './StickySymbol.svelte';
	import { getSymbolX } from '../game/utils';
	import { getContext } from '../game/context';
	import { SYMBOL_SIZE } from '../game/constants';

	const context = getContext();
</script>

{#each context.stateGame.stickySymbols as stickySymbol}
	<Container
		x={getSymbolX(stickySymbol.prize.reel)}
		y={stickySymbol.prize.row * SYMBOL_SIZE + SYMBOL_SIZE * 0.5}
	>
		<StickySymbol {stickySymbol} />
	</Container>
{/each}
