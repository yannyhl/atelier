import { AdditiveBlending, Group, Mesh, Quaternion, ShaderMaterial, TorusGeometry, Vector3 } from 'three';
import { Easings } from '@atelier/stage';
import { createParticles, GLSL } from '@atelier/stage/effects';
import type { SectionBundle, SectionContext } from './types';

const ORIGIN = new Vector3( 0, - 72, 0 );

/** Night: Pip in the dark look (black body, white rim), a neon ring drawing itself, a vertical manifesto. */
export function createNight( { stage }: SectionContext ): SectionBundle {

	const root = new Group();
	root.position.copy( ORIGIN );
	const a = stage.animator;
	const vis = a.add( 'night.fx', 0, Easings.easeOutCubic );

	const ring = new Mesh(
		new TorusGeometry( 1.75, 0.03, 12, 240 ),
		new ShaderMaterial( {
			uniforms: { uTime: stage.time, uVis: vis },
			vertexShader: /* glsl */`
				varying vec2 vUv;
				void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }
			`,
			fragmentShader: GLSL.common + /* glsl */`
				uniform float uTime;
				uniform float uVis;
				varying vec2 vUv;
				void main() {
					vec3 c = mix( vec3( 0.35, 0.55, 1.0 ), vec3( 0.75, 0.35, 1.0 ), 0.5 + 0.5 * sin( vUv.x * AT_TPI + uTime * 0.6 ) );
					gl_FragColor = vec4( c * 2.2 * step( vUv.x, uVis ), 1.0 );
				}
			`,
			blending: AdditiveBlending,
			depthWrite: false,
		} ),
	);
	ring.position.set( 0, 0.1, - 0.6 );
	root.add( ring );

	const dust = createParticles( {
		count: Math.round( 700 * Math.max( stage.profile.effectScale, 0.2 ) ),
		rng: stage.rng, time: stage.time, visibility: vis, size: [ 12, 8, 10 ], speed: 0.12, pointSize: 12,
	} );
	root.add( dust );

	return {
		root,
		sky: { top: '#0a1030', bottom: '#000000', accent: '#3a5cff', style: 2 },
		pip: { clip: 'idle', look: 'dark', spin: 0.18, timeScale: 0.7 },
		def: {
			name: 'night',
			label: 'Night',
			root,
			post: { bloom: 1, vignette: 1, grain: 0.05 },
			shot: {
				position: ORIGIN.clone().add( new Vector3( 1.3, 0.3, 6.6 ) ), target: ORIGIN.clone().add( new Vector3( 1.3, 0.1, 0 ) ), fov: 44, portraitFov: 22, portraitOffset: new Vector3( - 1.3, 0.9, 1.2 ),
				anchor: { position: ORIGIN.clone().add( new Vector3( 0, - 0.2, 0 ) ), quaternion: new Quaternion(), scale: new Vector3( 0.95, 0.95, 0.95 ) },
			},
			enter() {

				void a.animate( 'night.fx', 1, 2.2 );

			},
			leave() {

				void a.animate( 'night.fx', 0, 0.6 );

			},
			update( _dt, st ) {

				ring.rotation.set( 0.25, st.time.value * 0.12, 0 );

			},
		},
	};

}
