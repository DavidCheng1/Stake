// Board, results and controls share these game-space coordinates at every viewport size.
export const MAIN_SIZES = {
	desktop: { width: 1422, height: 1100 },
	tablet: { width: 1000, height: 1100 },
	landscape: { width: 1600, height: 1100 },
	portrait: { width: 800, height: 1250 },
};

export function getGameLayout({ width, height }: { width: number; height: number }) {
	const footerWidth = Math.min(1040, width - 48);
	const footerTop = height - 210;
	const resultHeight = 112;
	const resultY = footerTop - 68;
	const frameBottom = resultY - resultHeight / 2 - 24;
	return {
		boardX: width / 2,
		boardY: (76 + frameBottom) / 2,
		resultX: width / 2,
		resultY,
		resultWidth: 600,
		resultHeight,
		footerX: (width - footerWidth) / 2,
		footerTop,
		footerWidth,
		footerHeight: 186,
		buttonY: footerTop + 130,
		buttonStep: footerWidth / 8,
		buttonScale: Math.min(0.62, footerWidth / 1400),
	};
}
