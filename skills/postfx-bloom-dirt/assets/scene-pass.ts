import { AdditiveBlending, ShaderMaterial, type IUniform, type WebGLRenderer } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { PostFX } from '@atelier/stage';

/**
 * A full-screen pass that adds LINEAR light into `post.sceneRT` between `post.renderScene()` and
 * `post.finish()`, so the bloom, lens dirt, vignette, sRGB encode and AA all apply to it.
 * Use it for light that belongs to the scene (glows, light sweeps, fog veils); it must not read
 * sceneRT (a target cannot sample itself). Scene-reading effects go into the composite instead.
 *
 *   stage.render = () => {
 *     post.renderScene( scene, camera );
 *     sweep.render( stage.renderer, post );
 *     post.finish();
 *   };
 */
export class ScenePass {

	readonly material: ShaderMaterial;
	enabled = true;
	private quad: FullScreenQuad;

	constructor( fragmentShader: string, uniforms: Record<string, IUniform> = {}, blending = AdditiveBlending ) {

		this.material = new ShaderMaterial( {
			uniforms,
			vertexShader: /* glsl */`
				varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = vec4( position.xy, 0.0, 1.0 );
				}
			`,
			fragmentShader,
			blending,
			transparent: true,
			depthTest: false,
			depthWrite: false,
		} );
		this.quad = new FullScreenQuad( this.material );

	}

	render( renderer: WebGLRenderer, post: PostFX ) {

		if ( ! this.enabled ) return;
		const prevTarget = renderer.getRenderTarget();
		const prevAutoClear = renderer.autoClear;
		renderer.autoClear = false;
		renderer.setRenderTarget( post.sceneRT );
		this.quad.render( renderer );
		renderer.setRenderTarget( prevTarget );
		renderer.autoClear = prevAutoClear;

	}

	dispose() {

		this.material.dispose();
		this.quad.dispose();

	}

}

/**
 * Example pass: a diagonal light sweep (a glint crossing the frame), in linear units that exceed 1
 * so the bloom catches it. Drive `uSweep` 0 -> 1 with the animator on a section change.
 */
export const LIGHT_SWEEP = /* glsl */`
	uniform float uSweep;
	uniform float uStrength;
	uniform vec3 uColor;
	varying vec2 vUv;
	void main() {
		float x = vUv.x + vUv.y * 0.35 - mix( - 0.4, 1.75, uSweep );
		float band = exp( - x * x * 900.0 ) + exp( - x * x * 40.0 ) * 0.15;
		gl_FragColor = vec4( uColor * band * uStrength * sin( uSweep * 3.14159265 ), 1.0 );
	}
`;
