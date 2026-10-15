import type { EmitterEventBoard } from '../components/Board.svelte';
import type { EmitterEventBoardFrame } from '../components/BoardFrame.svelte';
import type { EmitterEventClusterWinAmounts } from '../components/ClusterWinAmounts.svelte';
import type { EmitterEventTumbleBoard } from '../components/TumbleBoard.svelte';
import type { EmitterEventTumbleWinAmount } from '../components/TumbleWinAmount.svelte';
import type { EmitterEventGlobalMultiplier } from '../components/GlobalMultiplier.svelte';
import type { EmitterEventMultiplierBoard } from '../components/MultiplierBoard.svelte';
import type { EmitterEventMultiplierTotal } from '../components/MultiplierTotal.svelte';
import type { EmitterEventFreeSpinIntro } from '../components/FreeSpinIntro.svelte';
import type { EmitterEventFreeSpinCounter } from '../components/FreeSpinCounter.svelte';
import type { EmitterEventFreeSpinOutro } from '../components/FreeSpinOutro.svelte';
import type { EmitterEventWin } from '../components/Win.svelte';
import type { EmitterEventSound } from '../components/Sound.svelte';
import type { EmitterEventTransition } from '../components/Transition.svelte';

export type EmitterEventGame =
	| EmitterEventBoard
	| EmitterEventBoardFrame
	| EmitterEventClusterWinAmounts
	| EmitterEventTumbleBoard
	| EmitterEventTumbleWinAmount
	| EmitterEventGlobalMultiplier
	| EmitterEventMultiplierBoard
	| EmitterEventMultiplierTotal
	| EmitterEventWin
	| EmitterEventFreeSpinIntro
	| EmitterEventFreeSpinCounter
	| EmitterEventFreeSpinOutro
	| EmitterEventSound
	| EmitterEventTransition;
