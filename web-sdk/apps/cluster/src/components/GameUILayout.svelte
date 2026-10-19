<script lang="ts">
	import { Container, Rectangle } from 'pixi-svelte';
	import { MainContainer } from 'components-layout';
	import { stateBet, stateBetDerived, stateModal, stateUi } from 'state-shared';
	import { numberToCurrencyString, bookEventAmountToCurrencyString } from 'utils-shared/amount';
	import { i18nDerived, type LayoutUiProps } from 'components-ui-pixi';
	import { getContext } from '../game/context';
	import { getGameLayout } from '../game/layoutGeometry';
	import StatusAmount from './StatusAmount.svelte';

	const props: LayoutUiProps = $props();
	const context = getContext();
	const main = $derived(context.stateLayoutDerived.mainLayout());
	const layout = $derived(getGameLayout(main));
	const buttons = $derived([props.buttonMenu, props.buttonBuyBonus, props.buttonAutoSpin, props.buttonBet, props.buttonTurbo, props.buttonDecrease, props.buttonIncrease]);
	const menuButtons = $derived([props.buttonPayTable, props.buttonGameRules, props.buttonSettings, props.buttonSoundSwitch, props.buttonMenuClose]);
	const betDisabled = $derived(!context.stateXstateDerived.isIdle());
	const openBetMenu = () => {
		if (betDisabled) return;
		context.eventEmitter.broadcast({ type: 'soundPressGeneral' });
		stateModal.modal = { name: 'betAmountMenu' };
	};
</script>

<MainContainer>
	<Container x={28} y={20}>{@render props.gameName()}</Container>
	<Container x={main.width - 28} y={20} scale={0.65}>{@render props.logo()}</Container>

	<Rectangle x={layout.footerX} y={layout.footerTop} width={layout.footerWidth} height={layout.footerHeight} borderRadius={22} backgroundColor={0x071e21} backgroundAlpha={0.94} borderWidth={2} borderColor={0x296260} />
	<Container x={layout.footerX + layout.footerWidth / 6} y={layout.footerTop + 15}>
		<StatusAmount label={i18nDerived.balance()} value={numberToCurrencyString(stateBet.balanceAmount)} width={layout.footerWidth / 3} />
	</Container>
	<Container x={main.width / 2} y={layout.footerTop + 15}>
		<StatusAmount label={i18nDerived.win()} value={bookEventAmountToCurrencyString(stateBet.winBookEventAmount)} width={layout.footerWidth / 3} />
	</Container>
	<Container x={layout.footerX + layout.footerWidth * 5 / 6} y={layout.footerTop + 15} eventMode="static" cursor={betDisabled ? 'not-allowed' : 'pointer'} onpointerup={openBetMenu}>
		<StatusAmount label={stateBetDerived.activeBetMode()?.text.betAmountLabel || i18nDerived.bet()} value={numberToCurrencyString(stateBetDerived.betCost())} width={layout.footerWidth / 3} />
	</Container>
	{#each buttons as button, index}
		<Container x={layout.footerX + layout.buttonStep * (index + 1)} y={layout.buttonY} scale={layout.buttonScale * (index === 3 ? 1.15 : 1)}>
			{@render button({ anchor: 0.5 })}
		</Container>
	{/each}

	{#if stateUi.menuOpen}
		<Rectangle width={main.width} height={main.height} backgroundColor={0x000000} backgroundAlpha={0.65} eventMode="static" cursor="pointer" onpointerup={() => (stateUi.menuOpen = false)} />
		<Rectangle x={main.width / 2 - 270} y={main.height / 2 - 160} width={540} height={320} borderRadius={24} backgroundColor={0x071e21} borderColor={0x296260} borderWidth={2} />
		{#each menuButtons as button, index}
			<Container x={main.width / 2 + ((index % 3) - 1) * 155} y={main.height / 2 - 75 + Math.floor(index / 3) * 150} scale={0.75}>
				{@render button({ anchor: 0.5 })}
			</Container>
		{/each}
	{/if}
</MainContainer>
