import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial } from 'three';
import type { Rng } from '../core/random';
import type { Tween } from '../motion/Animator';
import { GLSL } from './chunks';

export interface ParticleOptions {
	count: number;
	rng: Rng;
	time: Tween<number>;
	visibility: Tween<number>;
	/** Box the particles wrap inside (world units, centered on the object). */
	size?: [ number, number, number ];
	/** World units per second, negative falls. */
	speed?: number;
	pointSize?: number;
	/** 'snow' drifts and falls, 'sparks' streams toward the camera. */
	mode?: 'snow' | 'sparks';
	/** Linear RGB, default white. */
	color?: [ number, number, number ];
	/**
	 * Share a uniform holding the canvas pixel ratio so point sizes stay the same in CSS pixels
	 * on every screen. Omit to size in device pixels (the look is then tuned per DPR).
	 */
	pixelRatio?: { value: number };
}

/**
 * Particle field whose positions are a pure function of time and per-particle seeds:
 * zero CPU per frame and automatically deterministic for capture.
 * Scale `count` by `stage.profile.effectScale`.
 */
export function createParticles( o: ParticleOptions ) {

	const seeds = new Float32Array( o.count * 4 );
	for ( let i = 0; i < seeds.length; i ++ ) seeds[ i ] = o.rng();
	const geometry = new BufferGeometry();
	geometry.setAttribute( 'position', new BufferAttribute( new Float32Array( o.count * 3 ), 3 ) );
	geometry.setAttribute( 'aSeed', new BufferAttribute( seeds, 4 ) );

	const material = new ShaderMaterial( {
		defines: { SPARKS: o.mode === 'sparks' ? 1 : 0 },
		uniforms: {
			uTime: o.time,
			uVisibility: o.visibility,
			uBox: { value: o.size ?? [ 12, 8, 12 ] },
			uSpeed: { value: o.speed ?? - 0.35 },
			uPointSize: { value: o.pointSize ?? 18 },
			uColor: { value: o.color ?? [ 1, 1, 1 ] },
			uPixelRatio: o.pixelRatio ?? { value: 1 },
		},
		vertexShader: GLSL.common + /* glsl */`
			attribute vec4 aSeed;
			uniform float uTime;
			uniform vec3 uBox;
			uniform float uSpeed;
			uniform float uPointSize;
			uniform float uPixelRatio;
			varying float vFade;
			varying float vSeed;
			void main() {
				vec3 p = ( aSeed.xyz - 0.5 ) * uBox;
				#if SPARKS
					p.z = ( fract( aSeed.z + uTime * uSpeed * ( 0.5 + aSeed.w ) / uBox.z ) - 0.5 ) * uBox.z;
				#else
					p.y = ( fract( aSeed.y + uTime * uSpeed * ( 0.6 + aSeed.w * 0.8 ) / uBox.y ) - 0.5 ) * uBox.y;
					p.x += sin( uTime * ( 0.5 + aSeed.w ) + aSeed.x * 20.0 ) * 0.25;
				#endif
				vec4 mv = modelViewMatrix * vec4( p, 1.0 );
				gl_Position = projectionMatrix * mv;
				gl_PointSize = uPointSize * uPixelRatio * ( 0.4 + aSeed.w ) / max( - mv.z, 0.1 );
				vec3 edge = abs( p / ( uBox * 0.5 ) );
				vFade = 1.0 - smoothstep( 0.8, 1.0, max( edge.x, max( edge.y, edge.z ) ) );
				vSeed = aSeed.w;
			}
		`,
		fragmentShader: /* glsl */`
			uniform float uVisibility;
			uniform vec3 uColor;
			varying float vFade;
			varying float vSeed;
			void main() {
				vec2 c = gl_PointCoord * 2.0 - 1.0;
				float a = smoothstep( 1.0, 0.2, length( c ) ) * vFade * uVisibility * ( 0.5 + vSeed * 0.5 );
				gl_FragColor = vec4( uColor * a, 1.0 );
			}
		`,
		transparent: true,
		depthWrite: false,
		blending: AdditiveBlending,
	} );

	const points = new Points( geometry, material );
	points.frustumCulled = false;
	return points;

}
