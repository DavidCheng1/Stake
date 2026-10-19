<script lang="ts">
	import { Container, Text } from 'pixi-svelte';
	type Props = { label: string; value: string; width: number };
	const props: Props = $props();
	let valueWidth = $state(0);
	const valueScale = $derived(Math.min(1, (props.width - 24) / (valueWidth || 1)));
</script>

<Text anchor={{ x: 0.5, y: 0 }} text={props.label} style={{ fontFamily: 'proxima-nova', fontSize: 20, fill: 0x9cd9cf }} />
<Container y={27} scale={valueScale}>
	<Text anchor={{ x: 0.5, y: 0 }} text={props.value} onresize={(size) => (valueWidth = size.width)} style={{ fontFamily: 'proxima-nova', fontSize: 32, fontWeight: '600', fill: 0xffffff }} />
</Container>
