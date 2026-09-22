import { Group, Mesh, MeshMatcapMaterial, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { Easings, visibleSizeAt } from '@atelier/stage';
import { BitmapText, createGlyphAtlas, createMatcap, createParticles } from '@atelier/stage/effects';
import type { SectionBundle, SectionContext } from './types';

/** Arrival: ice and lime daylight, Pip waves, the wordmark spins in, props pop, snow drifts. */
export async function createArrival( { stage, camera }: SectionContext ): Promise<SectionBundle> {

	const root = new Group();
	const a = stage.animator;
	const reveal = a.add( 'arrival.title', 0, Easings.linear );
	const props = a.add( 'arrival.props', 0, Easings.linear );

	await document.fonts.load( '700 96px Comfortaa' );
	const atlas = createGlyphAtlas( 'abcdefghijklmnopqrstuvwxyz', '700 96px Comfortaa' );
	const title = new BitmapText( { atlas, reveal, time: stage.time, size: 1.2, color: [ 0.06, 0.16, 0.24 ] } );
	title.setText( 'pip' );
	title.position.set( 0, 1.6, - 0.4 );
	root.add( title );

	const lime = new MeshMatcapMaterial( { matcap: createMatcap( '#d9ff6a', '#3f7d12', '#ffffff', '#f4ffd0' ) } );
	const ice = new MeshMatcapMaterial( { matcap: createMatcap( '#bfe6ff', '#2c6f9c', '#ffffff', '#e8f7ff' ) } );
	const shapes = [
		{ mesh: new Mesh( new SphereGeometry( 0.3, 48, 24 ), lime ), at: new Vector3( - 2.8, 1.1, - 1 ), portrait: new Vector3( - 1.05, 3.05, - 1 ) },
		{ mesh: new Mesh( new TorusGeometry( 0.32, 0.11, 24, 64 ), ice ), at: new Vector3( 2.7, 1.3, - 0.6 ), portrait: new Vector3( 1.0, 3.2, - 0.6 ) },
		{ mesh: new Mesh( new SphereGeometry( 0.18, 32, 16 ), ice ), at: new Vector3( 2.2, - 0.8, 0.4 ), portrait: new Vector3( 1.1, - 0.95, 0.4 ) },
		{ mesh: new Mesh( new TorusGeometry( 0.2, 0.07, 20, 48 ), lime ), at: new Vector3( - 2.3, - 0.6, 0.3 ), portrait: new Vector3( - 1.1, - 1.05, 0.3 ) },
	];
	shapes.forEach( ( s ) => root.add( s.mesh ) );

	const snow = createParticles( {
		count: Math.round( 900 * Math.max( stage.profile.effectScale, 0.2 ) ),
		rng: stage.rng, time: stage.time, visibility: props, size: [ 14, 9, 8 ], speed: - 0.3, pointSize: 22,
	} );
	root.add( snow );

	const easeBack = Easings.easeOutBack( 2.2 );
	const place = new Vector3();

	return {
		root,
		sky: { top: '#d6edfa', bottom: '#8fc9e8', accent: '#b7f516', style: 1 },
		pip: { clip: 'wave', look: 'normal' },
		def: {
			name: 'arrival',
			label: 'Arrival',
			root,
			post: { bloom: 0.2, vignette: 0.7, grain: 0.03, threshold: 0.85 },
			shot: {
				position: new Vector3( 0, 0.35, 7 ), target: new Vector3( 0, 0.25, 0 ), fov: 34, portraitFov: 30,
				anchor: { position: new Vector3( 0, - 0.12, 0 ), quaternion: new Quaternion(), scale: new Vector3( 0.72, 0.72, 0.72 ) },
			},
			enter() {

				if ( reveal.value >= 1.5 ) a.set( 'arrival.title', 0 );
				void a.animate( 'arrival.title', 1, 1.6, { delay: 0.3 } );
				void a.animate( 'arrival.props', 1, 1.2 );

			},
			leave() {

				void a.animate( 'arrival.title', 2, 0.9 );
				void a.animate( 'arrival.props', 0, 0.8 );

			},
			update( _dt, s ) {

				const t = s.time.value;
				const pw = s.viewport.portraitWeight;
				const visibleW = visibleSizeAt( camera, title.getWorldPosition( place ) ).width;
				title.scale.setScalar( Math.min( 1, ( visibleW * 0.6 ) / Math.max( title.width, 1e-3 ) ) );
				title.position.y = 1.6 + pw * 0.45;

				shapes.forEach( ( sh, i ) => {

					const k = easeBack( Math.min( 1, Math.max( 0, props.value * 1.6 - i * 0.15 ) ) );
					sh.mesh.scale.setScalar( Math.max( 1e-3, k ) );
					place.lerpVectors( sh.at, sh.portrait, pw );
					sh.mesh.position.copy( place ).setY( place.y + Math.sin( t * 0.9 + i * 1.7 ) * 0.12 );
					sh.mesh.rotation.set( t * 0.3 + i, t * 0.4 + i * 2, 0 );

				} );

			},
		},
	};

}
