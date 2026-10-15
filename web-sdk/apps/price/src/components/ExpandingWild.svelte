<script lang="ts">
	import { SpineProvider, SpineTrack, type SpineTrackProps } from 'pixi-svelte';
	import { stateBetDerived } from 'state-shared';

	import { SYMBOL_SIZE } from '../game/constants';

	type Props = {
		loop: SpineTrackProps['loop'];
		listener?: SpineTrackProps['listener'];
		animationName: SpineTrackProps['animationName'];
	};

	const props: Props = $props();
</script>

<SpineProvider key="symbols" width={SYMBOL_SIZE * 1.2} height={SYMBOL_SIZE * 1.3}>
	<SpineTrack
		trackIndex={0}
		timeScale={stateBetDerived.timeScale()}
		loop={props.loop}
		listener={props.listener}
		animationName={props.animationName}
	/>
</SpineProvider>
