<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf';

	const { Story } = defineMeta({
		title: 'Components/<ExpandingWild>',
		component: ExpandingWild,
		args: {
			x: 100,
			y: 100,
			rawSymbol: { name: 'S', scatter: true },
			state: 'static',
		},
	});
</script>

<script lang="ts">
	import { Container, Text } from 'pixi-svelte';
	import { StoryPixiApp } from 'components-storybook';

	import assets from '../game/assets';
	import ExpandingWild from '../components/ExpandingWild.svelte';
	import { SYMBOL_SIZE } from '../game/constants';

	const ANIMATION_NAMES = [
		'wild_expand', // wild_expand (expand)
		'wild_event', // wild_event (shorter, win)
		'wild_loop', // wild_loop (idle)
		'wild_reveal', // wild_reveal (win)
		'wild_static', // wild_static (static)
	];
</script>

<Story name="expandingWilds">
	{#snippet template()}
		<StoryPixiApp {assets}>
			{#each ANIMATION_NAMES as animationName, index}
				<Container x={SYMBOL_SIZE * index * 2 + SYMBOL_SIZE}>
					<Text anchor={{ x: 0.5, y: 0 }} text={animationName} />
					<Container y={100}>
						<ExpandingWild {animationName} loop />
					</Container>
				</Container>
			{/each}
		</StoryPixiApp>
	{/snippet}
</Story>
