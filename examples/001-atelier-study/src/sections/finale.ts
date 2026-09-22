import { AdditiveBlending, Group, Mesh, Quaternion, ShaderMaterial, TorusGeometry, Vector3 } from 'three';
import { Easings } from '@atelier/stage';
import { createParticles, GLSL } from '@atelier/stage/effects';
import type { SectionBundle, SectionContext } from './types';

const ORIGIN = new Vector3( 0, - 96, 0 );

/** Finale: Pip runs toward the door (a rainbow ring), sparks stream past, heavy bloom, rainbow CTA. */
export function createFinale( { stage }: SectionContext ): SectionBundle {

	const root = new Group();
	root.position.copy( ORIGIN );
	const a = stage.animator;
	const vis = a.add( 'finale.fx', 0, Easings.easeOutCubic );

	const door = new Mesh(
		new TorusGeometry( 2.3, 0.04, 12, 256 ),
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
					vec3 c = atHsv2rgb( vec3( fract( vUv.x * 2.0 - uTime * 0.15 ), 0.75, 1.0 ) );
					gl_FragColor = vec4( c * 1.8 * step( vUv.x, uVis ), 1.0 );
				}
			`,
			blending: AdditiveBlending,
			depthWrite: false,
		} ),
	);
	door.position.set( 0, 0.4, - 2.2 );
	root.add( door );

	const sparks = createParticles( {
		count: Math.round( 1400 * Math.max( stage.profile.effectScale, 0.2 ) ),
		rng: stage.rng, time: stage.time, visibility: vis, size: [ 10, 6, 24 ], speed: 4, pointSize: 14, mode: 'sparks',
	} );
	root.add( sparks );

	return {
		root,
		sky: { top: '#12061f', bottom: '#000000', accent: '#7a3cff', style: 2 },
		pip: { clip: 'run', look: 'normal' },
		def: {
			name: 'finale',
			label: 'Door',
			root,
			post: { bloom: 1.6, vignette: 1, grain: 0.05 },
			shot: {
				position: ORIGIN.clone().add( new Vector3( 0, 0.6, 7.8 ) ), target: ORIGIN.clone().add( new Vector3( 0, 0.4, 0 ) ), fov: 50, portraitFov: 22,
				anchor: { position: ORIGIN.clone().add( new Vector3( 0, 0.55, 0.9 ) ), quaternion: new Quaternion(), scale: new Vector3( 0.6, 0.6, 0.6 ) },
			},
			enter() {

				void a.animate( 'finale.fx', 1, 1.8 );

			},
			leave() {

				void a.animate( 'finale.fx', 0, 0.6 );

			},
			update( _dt, st ) {

				door.rotation.set( 0.2, st.time.value * 0.1, 0 );

			},
		},
	};

}
