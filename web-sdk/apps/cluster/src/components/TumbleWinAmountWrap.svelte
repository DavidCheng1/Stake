<script lang="ts">
	import type { Snippet } from 'svelte';

	import { Container } from 'pixi-svelte';
	import { FadeContainer } from 'components-pixi';

	import { getContext } from '../game/context';
	import { SYMBOL_SIZE } from '../game/constants';
	import BoardContainer from './BoardContainer.svelte';

	type Props = {
		show: boolean;
		children: Snippet;
	};

	const props: Props = $props();
	const context = getContext();

	const desktopPosition = $derived({
		x: context.stateGameDerived.boardLayout().width * 0.5,
		y: -SYMBOL_SIZE * 0.75,
	});

	const portraitPosition = $derived({
		x:
			context.stateGameDerived.boardLayout().width *
			(context.stateGame.gameType === 'basegame' ? 0.5 : 0.37),
		y: -SYMBOL_SIZE * 0.75,
	});

	const position = $derived(
		context.stateLayoutDerived.isStacked() ? portraitPosition : desktopPosition,
	);

	const scale = 0.85;
</script>

<FadeContainer show={props.show}>
	<BoardContainer>
		<Container {...position} {scale}>
			{@render props.children()}
		</Container>
	</BoardContainer>
</FadeContainer>
