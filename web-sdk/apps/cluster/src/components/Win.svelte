<script lang="ts" module>
	import type { WinLevelData } from '../game/winLevelMap';
	export type EmitterEventWin =
		| { type: 'winShow' }
		| { type: 'winHide' }
		| { type: 'winUpdate'; amount: number; winLevelData: WinLevelData };
</script>

<script lang="ts">
	import { Container, Rectangle, Text } from 'pixi-svelte';
	import { FadeContainer, WinCountUpProvider, ResponsiveBitmapText } from 'components-pixi';
	import { waitForResolve, waitForTimeout } from 'utils-shared/wait';
	import { bookEventAmountToCurrencyString } from 'utils-shared/amount';
	import { MainContainer } from 'components-layout';
	import { OnMount } from 'components-shared';
	import { getContext } from '../game/context';
	import { getGameLayout } from '../game/layoutGeometry';

	const context = getContext();
	const layout = $derived(getGameLayout(context.stateLayoutDerived.mainLayout()));
	let show = $state(false);
	let amount = $state(0);
	let winLevelData = $state<WinLevelData>();
	let oncomplete = $state(() => {});
	let presentationId = $state(0);

	context.eventEmitter.subscribeOnMount({
		winShow: () => (show = true),
		winHide: () => (show = false),
		winUpdate: async (event) => {
			amount = event.amount;
			winLevelData = event.winLevelData;
			presentationId += 1;
			await waitForResolve((resolve) => (oncomplete = resolve));
		},
	});
</script>

<FadeContainer {show}>
	{#if winLevelData}
		{#key presentationId}
		<WinCountUpProvider {amount} duration={winLevelData.presentDuration} oncomplete={() => undefined}>
			{#snippet children({ countUpAmount, startCountUp, finishCountUp })}
				<OnMount onmount={async () => {
					await startCountUp();
					await waitForTimeout(300);
					oncomplete();
				}} />
				<MainContainer>
					<Container x={layout.resultX} y={layout.resultY} eventMode="static" cursor="pointer" onpointerup={finishCountUp}>
						<Rectangle anchor={0.5} width={layout.resultWidth} height={layout.resultHeight} borderRadius={18} backgroundColor={0x071e21} borderColor={0xd7b866} borderWidth={2} />
						<Text anchor={0.5} y={-32} text={winLevelData.text || 'WIN'} style={{ fontFamily: 'proxima-nova', fontSize: 22, fill: 0xf2dba1, fontWeight: '600' }} />
						<ResponsiveBitmapText anchor={0.5} y={12} maxWidth={layout.resultWidth - 40} text={bookEventAmountToCurrencyString(countUpAmount)} style={{ fontFamily: 'gold', fontSize: 48, align: 'center', fontWeight: 'bold' }} />
					</Container>
				</MainContainer>
			{/snippet}
		</WinCountUpProvider>
		{/key}
	{/if}
</FadeContainer>
