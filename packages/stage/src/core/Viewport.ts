/**
 * Canvas size information shared by every system.
 *
 * `portraitWeight` is the single responsive scalar from the JUNNI architecture:
 * 0 at 16:9 landscape or wider, 1 at 1:2 portrait or narrower.
 * Cameras widen their FOV and layouts shift by this weight instead of by breakpoints.
 */
export interface Viewport {
	width: number;
	height: number;
	dpr: number;
	pixelWidth: number;
	pixelHeight: number;
	aspect: number;
	portraitWeight: number;
}

export function portraitWeightOf( aspect: number ): number {

	return Math.min( 1, Math.max( 0, 1 - ( aspect - 0.5 ) / ( 16 / 9 - 0.5 ) ) );

}

export function createViewport( width: number, height: number, dpr: number ): Viewport {

	const w = Math.max( 1, width );
	const h = Math.max( 1, height );
	const aspect = w / h;

	return {
		width: w,
		height: h,
		dpr,
		pixelWidth: Math.max( 1, Math.round( w * dpr ) ),
		pixelHeight: Math.max( 1, Math.round( h * dpr ) ),
		aspect,
		portraitWeight: portraitWeightOf( aspect ),
	};

}
