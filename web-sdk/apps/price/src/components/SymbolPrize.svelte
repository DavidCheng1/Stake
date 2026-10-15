<script lang="ts">
	import { ResponsiveBitmapText } from 'components-pixi';
	import { bookEventAmountToCurrencyString } from 'utils-shared/amount';

	import { SYMBOL_SIZE } from '../game/constants';

	type Props = {
		x?: number;
		y?: number;
		prize: number;
	};

	const props: Props = $props();
</script>

<ResponsiveBitmapText
	x={props.x}
	y={props.y}
	maxWidth={SYMBOL_SIZE}
	anchor={0.5}
	text={bookEventAmountToCurrencyString(props.prize)}
	style={{
		fontFamily: 'gold',
		fontSize: SYMBOL_SIZE * 0.3,
	}}
/>
