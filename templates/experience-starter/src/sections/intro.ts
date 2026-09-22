import { Group, Mesh, MeshMatcapMaterial, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { Easings } from '@atelier/stage';
import { BitmapText, createGlyphAtlas, createMatcap, createParticles } from '@atelier/stage/effects';
import type { SectionBundle, SectionContext } from './types';

/**
 * Intro: bitmap-type title spinning in over the brand ice gradient, drifting snow and a few
 * matcap props that pop in with a staggered overshoot.
 */
export async function createIntro( { stage, camera }: SectionContext ): Promise<SectionBundle> {

	const root = new Group();
	const a = stage.animator;
	const reveal = a.add( 'intro.title', 0, Easings.linear );
	const props = a.add( 'intro.props', 0, Easings.linear );

	await document.fonts.load( '700 96px Comfortaa' );
	const atlas = createGlyphAtlas( 'abcdefghijklmnopqrstuvwxyz', '700 96px Comfortaa' );
	const title = new BitmapText( { atlas, reveal, time: stage.time, size: 1.15, color: [ 0.08, 0.2, 0.28 ] } );
	title.setText( 'atelier' );
	title.position.set( 0, 0.35, 0 );
	root.add( title );

	const lime = new MeshMatcapMaterial( { matcap: createMatcap( '#d9ff6a', '#3f7d12', '#ffffff', '#f4ffd0' ) } );
	const ice = new MeshMatcapMaterial( { matcap: createMatcap( '#bfe6ff', '#2c6f9c', '#ffffff', '#e8f7ff' ) } );
	// Landscape and portrait positions; the live position blends by viewport.portraitWeight.
	const shapes = [
		{ mesh: new Mesh( new SphereGeometry( 0.32, 48, 24 ), lime ), at: new Vector3( - 2.6, 1.3, - 0.8 ), portrait: new Vector3( - 0.9, 2.3, - 0.8 ) },
		{ mesh: new Mesh( new TorusGeometry( 0.34, 0.12, 24, 64 ), ice ), at: new Vector3( 2.5, 1.1, - 0.4 ), portrait: new Vector3( 1.0, 1.7, - 0.4 ) },
		{ mesh: new Mesh( new SphereGeometry( 0.2, 32, 16 ), ice ), at: new Vector3( 1.9, - 0.9, 0.3 ), portrait: new Vector3( 1.0, - 0.55, 0.3 ) },
		{ mesh: new Mesh( new TorusGeometry( 0.22, 0.08, 20, 48 ), lime ), at: new Vector3( - 2.1, - 0.8, 0.2 ), portrait: new Vector3( - 1.0, - 0.8, 0.2 ) },
	];
	const place = new Vector3();
	shapes.forEach( ( s ) => root.add( s.mesh ) );

	const snowCount = Math.round( 900 * Math.max( stage.profile.effectScale, 0.2 ) );
	const snow = createParticles( { count: snowCount, rng: stage.rng, time: stage.time, visibility: props, size: [ 14, 9, 8 ], speed: - 0.3, pointSize: 22 } );
	root.add( snow );

	const easeBack = Easings.easeOutBack( 2.2 );

	return {
		root,
		sky: { top: '#d6edfa', bottom: '#8fc9e8', accent: '#b7f516', style: 1 },
		def: {
			name: 'intro',
			label: 'Intro',
			root,
			post: { bloom: 0.25, vignette: 0.7, grain: 0.03, threshold: 0.85 },
			shot: { position: new Vector3( 0, 0.2, 6.2 ), target: new Vector3( 0, 0.15, 0 ), fov: 36, portraitFov: 26, parallax: undefined },
			enter() {

				if ( reveal.value >= 1.5 ) a.set( 'intro.title', 0 );
				void a.animate( 'intro.title', 1, 1.6, { delay: 0.2 } );
				void a.animate( 'intro.props', 1, 1.2 );

			},
			leave() {

				void a.animate( 'intro.title', 2, 0.9 );
				void a.animate( 'intro.props', 0, 0.8 );

			},
			update( _dt, s ) {

				const t = s.time.value;
				const pw = s.viewport.portraitWeight;

				// Fit the title to 84% of the visible width at its depth, never larger than designed.
				const dist = camera.position.distanceTo( root.position );
				const visibleW = 2 * dist * Math.tan( ( camera.fov * Math.PI ) / 360 ) * camera.aspect;
				title.scale.setScalar( Math.min( 1, ( visibleW * 0.84 ) / Math.max( title.width, 1e-3 ) ) );
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
