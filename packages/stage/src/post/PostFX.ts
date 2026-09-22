import {
	Camera, HalfFloatType, LinearFilter, NoColorSpace, SRGBColorSpace, Scene, ShaderMaterial, Texture,
	UnsignedByteType, Vector2, WebGLRenderTarget, type WebGLRenderer,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import type { Animator, Tween } from '../motion/Animator';
import { Easings } from '../motion/Easings';
import type { QualityProfile } from '../quality/tiers';
import type { Viewport } from '../core/Viewport';
import quadVert from './glsl/quad.vert?raw';
import brightFrag from './glsl/bright.frag?raw';
import upFrag from './glsl/up.frag?raw';
import compositeFrag from './glsl/composite.frag?raw';
import copyFrag from './glsl/copy.frag?raw';

/** Objects on this layer render after the opaque scene and can sample `post.opaqueTexture` to refract it. */
export const REFRACT_LAYER = 1;

/** Per-section post parameters. Tweened through the Animator on section change. */
export interface PostParams {
	bloom?: number;
	vignette?: number;
	dirt?: number;
	grain?: number;
	exposure?: number;
	threshold?: number;
	/** Tent radius of the bloom upsample in coarse texels. Wider = softer halos. */
	blurRange?: number;
}

const DEFAULTS: Required<PostParams> = { bloom: 0, vignette: 1, dirt: 1, grain: 0.035, exposure: 1, threshold: 0.5, blurRange: 1 };

/**
 * The house post chain:
 * scene (linear, half float when allowed) -> bloom (thresholded 13-tap down chain, tent up chain
 * weighted toward wide halos) -> composite (bicubic bloom, lens dirt, vignette, sRGB, grain, dither)
 * -> SMAA or FXAA -> screen. Quality comes from a QualityProfile; call `setProfile` on tier change.
 *
 * The reference packed all mips into one render target (a "mip strip") and blurred it;
 * that aliases into visible blocks on bright areas, so the engine uses a down/up chain instead.
 */
export class PostFX {

	readonly params: { [ K in keyof PostParams ]-?: Tween<number> };

	/** The linear scene color. Materials that refract the scene sample a copy of this (see captureScene). */
	sceneRT!: WebGLRenderTarget;
	private compositeRT!: WebGLRenderTarget;
	private down: WebGLRenderTarget[] = [];
	private up: WebGLRenderTarget[] = [];
	private profile!: QualityProfile;
	private smaa?: SMAAPass;
	private fxaa?: FXAAPass;
	private prefilterMaterial: ShaderMaterial;
	private downMaterial: ShaderMaterial;
	private upMaterial: ShaderMaterial;
	private compositeMaterial!: ShaderMaterial;
	private quad = new FullScreenQuad();
	private size = new Vector2( 1, 1 );
	/** Pixel size of sceneRT. Screen-space materials divide gl_FragCoord by this. Stable object, share it. */
	readonly sceneSize = new Vector2( 1, 1 );
	private opaqueRT!: WebGLRenderTarget;
	private copyMaterial = new ShaderMaterial( {
		vertexShader: quadVert, fragmentShader: copyFrag, uniforms: { uTex: { value: null } }, depthTest: false, depthWrite: false,
	} );

	/**
	 * A copy of the opaque scene, captured before the REFRACT_LAYER draws.
	 * Glass, refractive characters and trails sample this as `uSceneTex` (screen-space refraction).
	 * The uniform object is stable, so share it directly.
	 */
	readonly opaqueTexture: { value: Texture | null } = { value: null };

	constructor( private renderer: WebGLRenderer, animator: Animator, profile: QualityProfile, private time: Tween<number>, dirt: Texture | null = null ) {

		const p = ( name: keyof PostParams ) => animator.add( 'post.' + name, DEFAULTS[ name ], Easings.easeOutCubic ) as Tween<number>;
		this.params = {
			bloom: p( 'bloom' ), vignette: p( 'vignette' ), dirt: p( 'dirt' ), grain: p( 'grain' ),
			exposure: p( 'exposure' ), threshold: p( 'threshold' ), blurRange: p( 'blurRange' ),
		};

		const down = ( prefilter: boolean ) => new ShaderMaterial( {
			vertexShader: quadVert,
			fragmentShader: brightFrag,
			defines: prefilter ? { PREFILTER: 1 } : {},
			uniforms: { uTex: { value: null }, uTexel: { value: new Vector2() }, uThreshold: this.params.threshold },
			depthTest: false,
			depthWrite: false,
		} );
		this.prefilterMaterial = down( true );
		this.downMaterial = down( false );

		this.upMaterial = new ShaderMaterial( {
			vertexShader: quadVert,
			fragmentShader: upFrag,
			uniforms: {
				uCoarse: { value: null },
				uFine: { value: null },
				uCoarseTexel: { value: new Vector2() },
				uRadius: this.params.blurRange,
				uFineWeight: { value: 1 },
			},
			depthTest: false,
			depthWrite: false,
		} );

		this.dirt = dirt;
		this.setProfile( profile );

	}

	private dirt: Texture | null;

	setDirt( tex: Texture | null ) {

		this.dirt = tex;
		this.compositeMaterial.uniforms.uDirtTex.value = tex;
		this.compositeMaterial.uniforms.uHasDirt.value = !! tex;
		this.fitDirt();

	}

	/** Cover-fit the dirt texture to the screen so its blobs stay round on portrait phones. */
	private fitDirt() {

		const img = this.dirt?.image as { width?: number; height?: number } | undefined;
		const scale = this.compositeMaterial.uniforms.uDirtScale.value as Vector2;
		if ( ! img?.width || ! img.height ) {

			scale.set( 1, 1 );
			return;

		}

		const screen = this.size.x / Math.max( 1, this.size.y );
		const tex = img.width / img.height;
		if ( screen > tex ) scale.set( 1, tex / screen );
		else scale.set( screen / tex, 1 );

	}

	/**
	 * Animate toward a section's look. The look is complete: parameters the section does not set
	 * return to their defaults, so a section never inherits the previous section's post.
	 */
	apply( animator: Animator, params: PostParams, duration = 1 ) {

		const look = { ...DEFAULTS, ...params };
		for ( const key of Object.keys( look ) as Array<keyof PostParams> ) void animator.animate( 'post.' + key, look[ key ], duration );

	}

	setProfile( profile: QualityProfile ) {

		if ( profile === this.profile ) return;
		this.disposeTargets();
		this.profile = profile;

		// Half float only where the device can render to it; otherwise 8-bit targets stored as sRGB,
		// so linear values keep their precision in the darks instead of banding.
		const ext = this.renderer.extensions;
		const canHalf = ext.has( 'EXT_color_buffer_float' ) || ext.has( 'EXT_color_buffer_half_float' );
		const half = profile.halfFloat && canHalf;
		const type = half ? HalfFloatType : UnsignedByteType;
		const rt = ( depth: boolean, t = type ) => new WebGLRenderTarget( 1, 1, {
			type: t, depthBuffer: depth, stencilBuffer: false, generateMipmaps: false,
			minFilter: LinearFilter, magFilter: LinearFilter,
			colorSpace: t === UnsignedByteType ? SRGBColorSpace : NoColorSpace,
		} );

		this.sceneRT = rt( true );
		this.down = Array.from( { length: profile.bloomMips }, () => rt( false ) );
		this.up = Array.from( { length: Math.max( 0, profile.bloomMips - 1 ) }, () => rt( false ) );
		// The composite writes display-encoded values itself, so its target stays raw 8-bit.
		this.compositeRT = new WebGLRenderTarget( 1, 1, {
			type: UnsignedByteType, depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
			minFilter: LinearFilter, magFilter: LinearFilter, colorSpace: NoColorSpace,
		} );
		this.opaqueRT = rt( false );
		this.opaqueTexture.value = this.opaqueRT.texture;

		this.compositeMaterial?.dispose();
		this.compositeMaterial = new ShaderMaterial( {
			vertexShader: quadVert,
			fragmentShader: compositeFrag,
			uniforms: {
				uSceneTex: { value: null },
				uBloomTex: { value: null },
				uDirtTex: { value: this.dirt },
				uHasDirt: { value: !! this.dirt },
				uDirtScale: { value: new Vector2( 1, 1 ) },
				uBloomSize: { value: new Vector2( 1, 1 ) },
				uHasBloom: { value: false },
				uBloom: this.params.bloom,
				uDirt: this.params.dirt,
				uVignette: this.params.vignette,
				uGrain: this.params.grain,
				uGrainScale: this.grainScaleUniform,
				uExposure: this.params.exposure,
				uTime: this.time,
			},
			depthTest: false,
			depthWrite: false,
		} );

		this.smaa?.dispose();
		this.fxaa?.dispose();
		this.smaa = undefined;
		this.fxaa = undefined;
		if ( profile.aa === 'smaa' ) {

			this.smaa = new SMAAPass();
			this.smaa.renderToScreen = true;

		} else if ( profile.aa === 'fxaa' ) {

			this.fxaa = new FXAAPass();
			this.fxaa.renderToScreen = true;

		}

		this.setSize( this.size.x, this.size.y );

	}

	/** Size in device pixels (viewport.pixelWidth / pixelHeight). */
	setSize( width: number, height: number ) {

		this.size.set( width, height );
		const w = Math.max( 1, Math.round( width * this.profile.renderScale ) );
		const h = Math.max( 1, Math.round( height * this.profile.renderScale ) );
		this.sceneRT.setSize( w, h );
		this.compositeRT.setSize( w, h );
		this.sceneSize.set( w, h );
		const refractScale = this.profile.tier >= 3 ? 1 : 0.5;
		this.opaqueRT.setSize( Math.max( 1, Math.round( w * refractScale ) ), Math.max( 1, Math.round( h * refractScale ) ) );

		let bw = w * this.profile.bloomScale, bh = h * this.profile.bloomScale;
		this.down.forEach( ( t, i ) => {

			bw /= 2;
			bh /= 2;
			t.setSize( Math.max( 1, Math.round( bw ) ), Math.max( 1, Math.round( bh ) ) );
			this.up[ i ]?.setSize( t.width, t.height );

		} );
		if ( this.down[ 0 ] ) this.compositeMaterial.uniforms.uBloomSize.value.set( this.down[ 0 ].width, this.down[ 0 ].height );

		this.fitDirt();
		this.smaa?.setSize( w, h );
		this.fxaa?.setSize( w, h );

	}

	resize( viewport: Viewport ) {

		this.setSize( viewport.pixelWidth, viewport.pixelHeight );

	}

	/** Render the scene into the linear scene target. Split out so callers can draw extra layers into it. */
	renderScene( scene: Scene, camera: Camera ) {

		const r = this.renderer;
		const prevAutoClear = r.autoClear;
		const mask = camera.layers.mask;

		r.setRenderTarget( this.sceneRT );
		r.clear();

		if ( this.refraction ) {

			camera.layers.set( 0 );
			r.render( scene, camera );

			this.copyMaterial.uniforms.uTex.value = this.sceneRT.texture;
			this.quad.material = this.copyMaterial;
			r.setRenderTarget( this.opaqueRT );
			this.quad.render( r );

			r.setRenderTarget( this.sceneRT );
			r.autoClear = false;
			camera.layers.set( REFRACT_LAYER );
			r.render( scene, camera );
			camera.layers.mask = mask;
			r.autoClear = prevAutoClear;

		} else {

			r.render( scene, camera );

		}

	}

	/**
	 * Multiplier on film grain. Per-frame grain is incompressible noise for video encoders
	 * (a 16 s 1080p capture went from about 130 MB to a fraction of that at 0.25), so lower it in capture mode.
	 */
	set grainScale( v: number ) {

		this.grainScaleUniform.value = v;

	}

	get grainScale() {

		return this.grainScaleUniform.value;

	}

	private grainScaleUniform = { value: 1 };

	/** Enable the two-layer opaque capture. Off by default so scenes without glass pay nothing. */
	refraction = false;

	/** Run the post chain from sceneRT to the screen (or to `target` for stills). */
	finish( target: WebGLRenderTarget | null = null ) {

		const r = this.renderer;
		const prevAutoClear = r.autoClear;
		r.autoClear = true;

		const cu = this.compositeMaterial.uniforms;
		const n = this.down.length;
		cu.uHasBloom.value = n > 0 && this.params.bloom.value > 0.001;

		if ( cu.uHasBloom.value ) {

			let src = this.sceneRT;
			this.down.forEach( ( dst, i ) => {

				const m = i === 0 ? this.prefilterMaterial : this.downMaterial;
				m.uniforms.uTex.value = src.texture;
				m.uniforms.uTexel.value.set( 1 / src.width, 1 / src.height );
				this.quad.material = m;
				r.setRenderTarget( dst );
				this.quad.render( r );
				src = dst;

			} );

			const u = this.upMaterial.uniforms;
			let coarse = this.down[ n - 1 ];
			for ( let i = n - 2; i >= 0; i -- ) {

				u.uCoarse.value = coarse.texture;
				u.uFine.value = this.down[ i ].texture;
				u.uCoarseTexel.value.set( 1 / coarse.width, 1 / coarse.height );
				u.uFineWeight.value = ( i + 1 ) / n;
				this.quad.material = this.upMaterial;
				r.setRenderTarget( this.up[ i ] );
				this.quad.render( r );
				coarse = this.up[ i ];

			}

			cu.uBloomTex.value = coarse.texture;
			cu.uBloomSize.value.set( coarse.width, coarse.height );

		}

		this.compositeMaterial.uniforms.uSceneTex.value = this.sceneRT.texture;
		this.quad.material = this.compositeMaterial;

		const aa = this.smaa ?? this.fxaa;
		if ( aa && ! target ) {

			r.setRenderTarget( this.compositeRT );
			this.quad.render( r );
			aa.render( r, null as unknown as WebGLRenderTarget, this.compositeRT, 0, false );

		} else {

			r.setRenderTarget( target );
			this.quad.render( r );

		}

		r.setRenderTarget( null );
		r.autoClear = prevAutoClear;

	}

	render( scene: Scene, camera: Camera, target: WebGLRenderTarget | null = null ) {

		this.renderScene( scene, camera );
		this.finish( target );

	}

	private disposeTargets() {

		this.sceneRT?.dispose();
		this.compositeRT?.dispose();
		this.opaqueRT?.dispose();
		this.down.forEach( ( t ) => t.dispose() );
		this.up.forEach( ( t ) => t.dispose() );

	}

	dispose() {

		this.disposeTargets();
		this.prefilterMaterial.dispose();
		this.downMaterial.dispose();
		this.upMaterial.dispose();
		this.copyMaterial.dispose();
		this.compositeMaterial.dispose();
		this.smaa?.dispose();
		this.fxaa?.dispose();
		this.quad.dispose();

	}

}
