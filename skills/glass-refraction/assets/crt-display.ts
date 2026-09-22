import { ShaderMaterial, type Texture } from 'three';
import type { Tween } from '@atelier/stage';
import { GLSL } from '@atelier/stage/effects';
import crt from './crt-display.glsl?raw';

export type CrtContent = 'image' | 'tunnel' | 'blobs';

export interface CrtDisplayOptions {
	time: Tween<number>;
	/** 0..1 fade (section visibility). */
	visibility: Tween<number>;
	content: CrtContent;
	/** Image shown when content is 'image' (sRGB texture; sampled as linear). */
	map?: Texture | null;
	/** Distinct per panel so panels glitch out of sync (reference: panel index). */
	seed?: number;
	/** Linear brightness multiplier; above 1 feeds the bloom. */
	intensity?: number;
}

/**
 * Screen content for a CRT panel: the reference section-3 display shader (MIT, adapted) with
 * an image, tunnel or metaball raymarch under noise bursts, flicker, inversion and scanlines.
 * Opaque, on the default layer: put a glass front (createGlassMaterial on REFRACT_LAYER) over it
 * so the picture bends and splits at the curved edges.
 */
export function createCrtDisplayMaterial( o: CrtDisplayOptions ) {

	const mode = o.content === 'image' ? 0 : o.content === 'tunnel' ? 1 : 2;
	return new ShaderMaterial( {
		defines: { CRT_MODE: mode },
		uniforms: {
			uTime: o.time,
			uVisibility: o.visibility,
			uMap: { value: o.map ?? null },
			uSeed: { value: o.seed ?? 0 },
			uIntensity: { value: o.intensity ?? 1.4 },
		},
		vertexShader: /* glsl */`
			varying vec2 vUv;
			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}
		`,
		fragmentShader: GLSL.common + crt + /* glsl */`
			uniform float uTime;
			uniform float uVisibility;
			uniform sampler2D uMap;
			uniform float uSeed;
			uniform float uIntensity;
			varying vec2 vUv;

			void main() {
				float t = uTime + uSeed * 3.7;
				vec3 state = atCrtState( uTime, uSeed );
				vec3 color;
				#if CRT_MODE == 0
					vec2 n = atCrtTear( vUv, uTime, state.z );
					color = vec3(
						texture2D( uMap, vUv + n ).r,
						texture2D( uMap, vUv + n * 0.5 ).g,
						texture2D( uMap, vUv ).b );
				#else
					vec2 jitter = atCrtTear( vUv, uTime, state.z );
					color = atCrtRaymarch( vUv, t, atCrtEffect( uTime, uSeed, 1.3 ), CRT_MODE, jitter, state.y );
				#endif
				color = atCrtSignal( color, vUv, uTime, state );
				gl_FragColor = vec4( color * uIntensity * uVisibility, 1.0 );
			}
		`,
	} );

}
