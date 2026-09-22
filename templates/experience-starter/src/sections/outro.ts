import { AdditiveBlending, Group, Mesh, ShaderMaterial, TorusGeometry, Vector3 } from 'three';
import { Easings } from '@atelier/stage';
import { createParticles, GLSL } from '@atelier/stage/effects';
import type { SectionBundle, SectionContext } from './types';

const ORIGIN = new Vector3( 0, - 48, 0 );

/** Outro: a rainbow ring and sparks streaming at the camera, heavy bloom, DOM call to action. */
export function createOutro( { stage }: SectionContext ): SectionBundle {

	const root = new Group();
	root.position.copy( ORIGIN );
	const a = stage.animator;
	const vis = a.add( 'outro.fx', 0, Easings.easeOutCubic );

	const ringMat = new ShaderMaterial( {
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
				float cut = step( vUv.x, uVis );
				gl_FragColor = vec4( c * 1.8 * cut, 1.0 );
			}
		`,
		blending: AdditiveBlending,
		depthWrite: false,
	} );
	const ring = new Mesh( new TorusGeometry( 1.9, 0.035, 12, 240 ), ringMat );
	root.add( ring );

	const sparks = createParticles( {
		count: Math.round( 1400 * Math.max( stage.profile.effectScale, 0.2 ) ),
		rng: stage.rng, time: stage.time, visibility: vis, size: [ 10, 6, 24 ], speed: 4, pointSize: 14, mode: 'sparks',
	} );
	root.add( sparks );

	return {
		root,
		sky: { top: '#12061f', bottom: '#000000', accent: '#7a3cff', style: 2 },
		def: {
			name: 'outro',
			label: 'Join',
			root,
			post: { bloom: 1.6, vignette: 1, grain: 0.05 },
			shot: { position: ORIGIN.clone().add( new Vector3( 0, 0, 7.5 ) ), target: ORIGIN.clone(), fov: 50, portraitFov: 20 },
			enter() {

				void a.animate( 'outro.fx', 1, 1.8 );

			},
			leave() {

				void a.animate( 'outro.fx', 0, 0.6 );

			},
			update( _dt, st ) {

				ring.rotation.set( 0.35, st.time.value * 0.1, 0 );

			},
		},
	};

}
