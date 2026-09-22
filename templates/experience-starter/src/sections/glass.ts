import { Color, Group, InstancedMesh, Matrix4, Mesh, MeshMatcapMaterial, BoxGeometry, TorusKnotGeometry, Vector3, Quaternion, Euler } from 'three';
import { Easings, REFRACT_LAYER } from '@atelier/stage';
import { createGlassMaterial, createMatcap } from '@atelier/stage/effects';
import type { SectionBundle, SectionContext } from './types';

const ORIGIN = new Vector3( 0, - 24, 0 );

/**
 * Glass: a torus knot refracting a slowly turning carousel of thin glossy panels in a hue ramp.
 * The knot sits on REFRACT_LAYER, so it samples the opaque scene captured just before it draws.
 */
export function createGlass( { stage, post }: SectionContext ): SectionBundle {

	const root = new Group();
	root.position.copy( ORIGIN );
	const a = stage.animator;
	const vis = a.add( 'glass.props', 0, Easings.easeOutCubic );

	const glass = createGlassMaterial( {
		sceneTexture: post.opaqueTexture,
		time: stage.time,
		resolution: post.sceneSize,
		taps: stage.profile.refractionTaps,
		iridescence: 0.75,
	} );
	const knot = new Mesh( new TorusKnotGeometry( 1.0, 0.34, 260, 40 ), glass );
	knot.layers.set( REFRACT_LAYER );
	root.add( knot );

	// A curved wall of slides behind the knot, so the refraction always has color to bend.
	const count = 22;
	const panels = new InstancedMesh(
		new BoxGeometry( 0.5, 1.25, 0.02 ),
		new MeshMatcapMaterial( { matcap: createMatcap( '#ffffff', '#a9b3c4', '#ffffff', '#ffffff' ) } ),
		count,
	);
	const color = new Color();
	for ( let i = 0; i < count; i ++ ) panels.setColorAt( i, color.setHSL( 0.95 - ( i / count ) * 0.8, 0.85, 0.6 ) );
	root.add( panels );

	const m = new Matrix4();
	const q = new Quaternion();
	const e = new Euler();
	const p = new Vector3();
	const s = new Vector3();
	const easeBack = Easings.easeOutBack( 1.6 );

	return {
		root,
		sky: { top: '#0b111a', bottom: '#020305', accent: '#3f7fd6', style: 2 },
		setProfile( profile ) {

			glass.defines.REFRACT_TAPS = Math.max( 1, profile.refractionTaps );
			glass.needsUpdate = true;

		},
		def: {
			name: 'glass',
			label: 'Glass',
			root,
			post: { bloom: 0.35, vignette: 1.4, grain: 0.04 },
			shot: { position: ORIGIN.clone().add( new Vector3( 0.4, 0.5, 6.4 ) ), target: ORIGIN.clone().add( new Vector3( 0, 0.1, 0 ) ), fov: 38, portraitFov: 34 },
			enter() {

				void a.animate( 'glass.props', 1, 1.6 );

			},
			leave() {

				void a.animate( 'glass.props', 0, 0.8 );

			},
			update( _dt, st ) {

				const t = st.time.value;
				const v = vis.value;
				knot.rotation.set( t * 0.21, t * 0.33, 0 );
				knot.scale.setScalar( Math.max( 1e-3, 0.3 + 0.7 * easeBack( v ) ) );

				for ( let i = 0; i < count; i ++ ) {

					const k = Math.min( 1, Math.max( 0, v * 1.5 - ( i / count ) * 0.5 ) );
					const ang = - 1.3 + ( 2.6 * i ) / ( count - 1 ) + Math.sin( t * 0.25 ) * 0.12;
					const r = 3.6;
					p.set( Math.sin( ang ) * r, Math.sin( t * 0.7 + i * 0.9 ) * 0.22, - Math.cos( ang ) * r + 0.6 );
					e.set( 0, - ang, Math.sin( t * 0.5 + i ) * 0.06 );
					q.setFromEuler( e );
					s.set( 1, Math.max( 1e-3, easeBack( k ) ), 1 );
					panels.setMatrixAt( i, m.compose( p, q, s ) );

				}

				panels.instanceMatrix.needsUpdate = true;

			},
		},
	};

}
