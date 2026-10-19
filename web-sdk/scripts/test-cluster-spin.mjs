// Runs the real cluster actor and XState machines with controlled animation/RGS boundaries.
// Usage (from web-sdk): node --test scripts/test-cluster-spin.mjs
import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(root, 'apps/cluster/package.json'));
const { build } = createRequire(require.resolve('vite'))('esbuild');
const xstateRequire = createRequire(resolve(root, 'packages/utils-xstate/package.json'));
const { createActor, toPromise } = xstateRequire('xstate');

const mocks = {
	'state-shared': `export const { stateBet, stateBetDerived, stateUrlDerived, stateModal } = globalThis.__clusterSpinTest;`,
	'rgs-requests': `export const requestBet = async () => { throw new Error('Unexpected RGS request'); }; export const requestEndRound = requestBet;`,
	'utils-book': `export { createPlayBookUtils } from './packages/utils-book/src/createPlayBookUtils.ts'; export const checkIsMultipleRevealEvents = ({ bookEvents }) => bookEvents.filter(e => e.type === 'reveal').length > 1;`,
	'utils-slots': `export const createGetEmptyPaddedBoard = () => ({ getEmptyBoard: () => [] });`,
	'./eventEmitter': `export const eventEmitter = { broadcast: () => {} };`,
	'utils-shared/amount': `export const bookEventAmountToNormalisedAmount = amount => amount / 100 * globalThis.__clusterSpinTest.stateBet.wageredBetAmount;`,
	'./stateXstate': `export const stateXstateDerived = { isAutoBetting: () => false };`,
	'./stateGame.svelte': `export const stateGameDerived = { enhancedBoard: { preSpin: async () => { globalThis.__clusterSpinTest.starts++; }, settle: () => { globalThis.__clusterSpinTest.recoveries++; } } };`,
	'./bookEventHandlerMap': `export const bookEventHandlerMap = new Proxy({}, { get: () => async event => {
      const h = globalThis.__clusterSpinTest;
        h.events.push(event);
        if (h.failPlayback) throw new Error('Simulated animation failure');
        if (h.gate) await h.gate;
        if (event.type === 'setTotalWin') h.stateBet.winBookEventAmount = event.amount;
    } });`,
};

const bundle = await build({
	stdin: {
		contents: `export { gameActor } from './apps/cluster/src/game/actor.ts'; export { default as books } from './apps/cluster/src/stories/data/base_books.ts';`,
		resolveDir: root,
		loader: 'ts',
	},
	bundle: true,
	write: false,
	platform: 'node',
	format: 'cjs',
	define: { 'import.meta.env.DEV': 'true' },
	plugins: [
		{
			name: 'controlled-animation-boundaries',
			setup(bundler) {
				bundler.onResolve({ filter: /.*/ }, ({ path }) => {
					if (path in mocks || path === 'utils-xstate') return { path, namespace: 'test-boundary' };
					if (path === 'xstate') return { path: xstateRequire.resolve('xstate'), external: true };
					if (path === 'utils-shared/sequence')
						return { path: resolve(root, 'packages/utils-shared/sequence.ts') };
					if (path === 'constants-shared/bet')
						return { path: resolve(root, 'packages/constants-shared/bet.ts') };
				});
				bundler.onLoad({ filter: /.*/, namespace: 'test-boundary' }, ({ path }) => ({
					contents:
						path === 'utils-xstate'
							? `
          import { createPrimaryMachines as create } from './packages/utils-xstate/src/createPrimaryMachines.ts';
          export function createPrimaryMachines(options) {
            const h = globalThis.__clusterSpinTest;
            h.options = options;
            return h.primary = create(options);
          }
          export { createIntermediateMachines } from './packages/utils-xstate/src/createIntermediateMachines.ts';
          export { createGameActor } from './packages/utils-xstate/src/createGameActor.ts';
        `
							: mocks[path],
					resolveDir: root,
					loader: 'ts',
				}));
			},
		},
	],
});

function harness() {
	const h = {
		stateBet: {
			balanceAmount: 100,
			betAmount: 2,
			wageredBetAmount: 2,
			activeBetModeKey: 'BASE',
			autoSpinsCounter: 0,
			isSpaceHold: false,
			isTurbo: false,
			winBookEventAmount: 0,
			autoSpinsLossLimitAmount: Infinity,
			autoSpinsSingleWinLimitAmount: Infinity,
		},
		stateUrlDerived: { rgsUrl: () => '', replay: () => false },
		stateModal: { modal: null },
		starts: 0,
		recoveries: 0,
		events: [],
		gate: null,
		failPlayback: false,
	};
	h.stateBetDerived = {
		betCost: () => h.stateBet.betAmount,
		isBetCostAvailable: () =>
			h.stateBet.betAmount > 0 && h.stateBet.betAmount <= h.stateBet.balanceAmount,
		activeBetMode: () => ({ type: 'base' }),
	};
	globalThis.__clusterSpinTest = h;
	const compiled = new Module(resolve(root, 'scripts/cluster-spin-test.cjs'));
	compiled.filename = resolve(root, 'scripts/cluster-spin-test.cjs');
	compiled.paths = Module._nodeModulePaths(root);
	compiled._compile(bundle.outputFiles[0].text, compiled.filename);
	Object.assign(h, compiled.exports);
	h.gameActor.start();
	h.gameActor.send({ type: 'RENDERED' });
	return h;
}

async function until(predicate) {
	for (let attempt = 0; attempt < 100; attempt++) {
		if (predicate()) return;
		await new Promise((resolve) => setImmediate(resolve));
	}
	assert.fail('Round did not reach the expected state');
}

function spin(h, index) {
	const random = Math.random;
	Math.random = () => (index + 0.1) / h.books.length;
	try {
		h.gameActor.send({ type: 'BET' });
	} finally {
		Math.random = random;
	}
}

test('all recorded math outcomes map to ordered playable events and matching payouts', () => {
	const h = harness();
	const random = Math.random;
	try {
		h.books.forEach((book, index) => {
			Math.random = () => (index + 0.1) / h.books.length;
			const bet = h.options.getDemoBet();
			assert.deepEqual(bet.state, book.events);
			assert.equal(
				bet.payoutMultiplier,
				book.events.find((e) => e.type === 'finalWin').amount / 100,
			);
			for (const event of bet.state.filter((e) => e.type === 'reveal')) {
				assert.equal(event.board.length, 7);
				assert.ok(
					event.board.every((reel) => reel.length === 9),
					'7 visible rows plus padding',
				);
			}
		});
	} finally {
		Math.random = random;
		h.gameActor.stop();
	}
});

test('one spin awaits all events, ignores extra clicks, credits once, then allows another spin', async () => {
	const h = harness();
	let finishAnimation;
	h.gate = new Promise((resolve) => {
		finishAnimation = resolve;
	});
	try {
		spin(h, 1); // Recorded multi-cascade result, payout 5.5x.
		await until(() => h.events.length > 0);
		assert.equal(h.stateBet.balanceAmount, 98, 'wager debited before animations');
		assert.equal(h.gameActor.getSnapshot().value, 'bet');
		spin(h, 1);
		assert.equal(h.starts, 1, 'duplicate spin ignored');
		h.stateBet.betAmount = 5; // Settlement must use the accepted wager, even if UI state changes.
		finishAnimation();
		await until(() => h.gameActor.getSnapshot().value === 'idle');
		assert.deepEqual(h.events, h.books[1].events);
		assert.ok(h.events.filter((e) => e.type === 'tumbleBoard').length > 1);
		assert.equal(h.stateBet.balanceAmount, 109);
		assert.equal(h.stateBet.winBookEventAmount, 550);
		const settlement = createActor(h.primary.endGame, {
			input: { bet: h.options.getDemoBet(), rawBet: null },
		});
		settlement.start();
		await toPromise(settlement);
		assert.equal(h.stateBet.balanceAmount, 109, 'no second credit');
		h.gate = null;
		h.stateBet.betAmount = 2;
		h.events = [];
		spin(h, 0); // Losing round.
		await until(() => h.gameActor.getSnapshot().value === 'idle');
		assert.equal(h.starts, 2);
		assert.equal(h.stateBet.balanceAmount, 107);
		assert.equal(h.stateBet.winBookEventAmount, 0);
	} finally {
		finishAnimation();
		h.gameActor.stop();
	}
});

test('insufficient funds prevent debit and animation', async () => {
	const h = harness();
	h.stateBet.balanceAmount = 1;
	try {
		spin(h, 1);
		await until(() => h.gameActor.getSnapshot().value === 'idle');
		assert.equal(h.stateBet.balanceAmount, 1);
		assert.equal(h.starts, 0);
		assert.equal(h.stateModal.modal?.name, 'error');
	} finally {
		h.gameActor.stop();
	}
});

test('a failed demo animation refunds its wager and permits the next spin', async () => {
	const h = harness();
	h.failPlayback = true;
	try {
		spin(h, 1);
		await until(() => h.gameActor.getSnapshot().value === 'idle');
		assert.equal(h.stateBet.balanceAmount, 100);
		assert.equal(h.recoveries, 1);
		assert.equal(h.stateModal.modal?.name, 'error');
		h.failPlayback = false;
		spin(h, 1);
		await until(() => h.gameActor.getSnapshot().value === 'idle');
		assert.equal(h.stateBet.balanceAmount, 109);
	} finally {
		h.gameActor.stop();
	}
});

test('auto-spin completes its requested number of settled rounds', async () => {
	const h = harness();
	h.stateBet.autoSpinsCounter = 3;
	const random = Math.random;
	Math.random = () => 1.1 / h.books.length;
	try {
		h.gameActor.send({ type: 'AUTO_BET' });
		await until(() => h.gameActor.getSnapshot().value === 'idle');
		assert.equal(h.starts, 3);
		assert.equal(h.stateBet.autoSpinsCounter, 0);
		assert.equal(h.stateBet.balanceAmount, 127);
	} finally {
		Math.random = random;
		h.gameActor.stop();
	}
});
