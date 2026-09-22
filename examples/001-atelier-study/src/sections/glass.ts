import { Color, Group, InstancedMesh, Matrix4, MeshMatcapMaterial, BoxGeometry, Vector3, Quaternion, Euler } from 'three';
import { Easings } from '@atelier/stage';
import { createMatcap } from '@atelier/stage/effects';
import type { SectionBundle, SectionContext } from './types';

const ORIGIN = new Vector3( 0, - 24, 0 );

/** Clear: Pip turns to glass in front of a curved rainbow slide wall and slowly turns (reference section 2). */
export function createGlass( { stage }: SectionContext ): SectionBundle {

	const root = new Group();
	root.position.copy( ORIGIN );
	const a = stage.animator;
	const vis = a.add( 'glass.props', 0, Easings.easeOutCubic );

	const count = 24;
	const panels = new InstancedMesh(
		new BoxGeometry( 0.5, 1.3, 0.02 ),
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
		pip: { clip: 'float', look: 'glass', spin: - 0.35, timeScale: 0.6 },
		def: {
			name: 'glass',
			label: 'Clear',
			root,
			post: { bloom: 0.35, vignette: 1.4, grain: 0.04 },
			shot: {
				position: ORIGIN.clone().add( new Vector3( 0.3, 0.4, 6.4 ) ), target: ORIGIN.clone().add( new Vector3( 0, 0.1, 0 ) ), fov: 38, portraitFov: 34,
				anchor: { position: ORIGIN.clone().add( new Vector3( 0, - 0.1, 0.4 ) ), quaternion: new Quaternion(), scale: new Vector3( 1.05, 1.05, 1.05 ) },
			},
			enter() {

				void a.animate( 'glass.props', 1, 1.6 );

			},
			leave() {

				void a.animate( 'glass.props', 0, 0.8 );

			},
			update( _dt, st ) {

				const t = st.time.value;
				const v = vis.value;
				for ( let i = 0; i < count; i ++ ) {

					const k = Math.min( 1, Math.max( 0, v * 1.5 - ( i / count ) * 0.5 ) );
					const ang = - 1.3 + ( 2.6 * i ) / ( count - 1 ) + Math.sin( t * 0.25 ) * 0.12;
					p.set( Math.sin( ang ) * 3.6, Math.sin( t * 0.7 + i * 0.9 ) * 0.22, - Math.cos( ang ) * 3.6 + 0.4 );
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
