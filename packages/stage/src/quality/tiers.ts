export type Tier = 0 | 1 | 2 | 3;
export type AntiAlias = 'smaa' | 'fxaa' | 'none';

/**
 * What each tier is allowed to spend. Degrade in this order: DPR, bloom mips, AA,
 * studio shadow/AO, GPGPU counts, refraction taps. Tier 0 means "keep the static page".
 */
export interface QualityProfile {
	tier: Tier;
	dprCap: number;
	/** Scale of the post chain render targets relative to the canvas. */
	renderScale: number;
	bloomMips: number;
	/** Size of the first bloom level relative to the scene target, before halving. */
	bloomScale: number;
	aa: AntiAlias;
	halfFloat: boolean;
	shadows: boolean;
	shadowMapSize: number;
	/** Multiplier for particle, crowd and trail counts. */
	effectScale: number;
	refractionTaps: number;
}

export const PROFILES: Record<Tier, QualityProfile> = {
	0: { tier: 0, dprCap: 1, renderScale: 1, bloomMips: 0, bloomScale: 0.5, aa: 'none', halfFloat: false, shadows: false, shadowMapSize: 256, effectScale: 0, refractionTaps: 0 },
	1: { tier: 1, dprCap: 1, renderScale: 1, bloomMips: 4, bloomScale: 0.5, aa: 'fxaa', halfFloat: false, shadows: false, shadowMapSize: 512, effectScale: 0.35, refractionTaps: 4 },
	2: { tier: 2, dprCap: 1.5, renderScale: 1, bloomMips: 6, bloomScale: 0.5, aa: 'fxaa', halfFloat: true, shadows: true, shadowMapSize: 1024, effectScale: 0.7, refractionTaps: 8 },
	3: { tier: 3, dprCap: 2, renderScale: 1, bloomMips: 7, bloomScale: 1, aa: 'smaa', halfFloat: true, shadows: true, shadowMapSize: 2048, effectScale: 1, refractionTaps: 16 },
};

export interface ProbeResult {
	tier: Tier;
	renderer: string;
	reasons: string[];
	mobile: boolean;
}

const LOW_END = /(mali-[4t]|mali-g(31|51|52|57)|adreno \(tm\) (3|4|50|51|53)\d|powervr|sgx|swiftshader|llvmpipe|softpipe|microsoft basic render)/i;
const SOFTWARE = /(swiftshader|llvmpipe|softpipe|microsoft basic render)/i;
const HIGH_END = /(apple m\d|apple gpu|nvidia|geforce|rtx|radeon rx|radeon pro|arc a\d|adreno \(tm\) (7\d\d|8\d\d)|mali-g7\d\d|immortalis)/i;

/**
 * Initial tier from what the device reports. It is a starting point only:
 * FrameMonitor corrects it at runtime from measured frame times.
 * `?tier=N` in the URL always wins, which is how audits pin a tier.
 */
export function probeTier( gl: WebGL2RenderingContext | WebGLRenderingContext | null ): ProbeResult {

	const reasons: string[] = [];
	const forced = new URLSearchParams( location.search ).get( 'tier' );
	const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
	const mobile = matchMedia( '(pointer: coarse)' ).matches && Math.min( screen.width, screen.height ) < 820;

	if ( ! gl ) return { tier: 0, renderer: 'none', reasons: [ 'no webgl' ], mobile };

	const info = gl.getExtension( 'WEBGL_debug_renderer_info' );
	const renderer = String( info ? gl.getParameter( info.UNMASKED_RENDERER_WEBGL ) : gl.getParameter( gl.RENDERER ) );

	if ( forced !== null && /^[0-3]$/.test( forced ) ) return { tier: Number( forced ) as Tier, renderer, reasons: [ 'forced by ?tier' ], mobile };

	let tier: Tier = 2;

	if ( ! ( gl instanceof WebGL2RenderingContext ) ) {

		tier = 1;
		reasons.push( 'webgl1 only' );

	}

	if ( SOFTWARE.test( renderer ) ) {

		tier = 1;
		reasons.push( 'software renderer' );

	} else if ( LOW_END.test( renderer ) ) {

		tier = 1;
		reasons.push( 'low-end gpu' );

	} else if ( HIGH_END.test( renderer ) && ! mobile ) {

		tier = 3;
		reasons.push( 'high-end desktop gpu' );

	}

	if ( nav.deviceMemory !== undefined && nav.deviceMemory <= 2 ) {

		tier = Math.min( tier, 1 ) as Tier;
		reasons.push( 'deviceMemory <= 2' );

	}

	if ( nav.connection?.saveData ) {

		tier = Math.min( tier, 1 ) as Tier;
		reasons.push( 'save-data' );

	}

	if ( mobile && tier > 2 ) {

		tier = 2;
		reasons.push( 'mobile cap' );

	}

	return { tier, renderer, reasons, mobile };

}
