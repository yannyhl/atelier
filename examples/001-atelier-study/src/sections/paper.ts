import { Group, Quaternion, Vector3 } from 'three';
import { Easings, visibleSizeAt } from '@atelier/stage';
import { BitmapText, createGlyphAtlas } from '@atelier/stage/effects';
import type { SectionBundle, SectionContext } from './types';

const ORIGIN = new Vector3( 0, - 48, 0 );
const WORDS = [ 'make things move', 'move things make' ];

/**
 * Sketch: paper-white set, telephoto camera (reference section 4 used FOV 11.6), Pip as line art,
 * and bitmap type that swaps words with a hop every 3.5 s, followed by a small camera shake.
 */
export function createPaper( { stage, camera }: SectionContext, shake: ( amount: number, duration: number ) => void ): SectionBundle {

	const root = new Group();
	root.position.copy( ORIGIN );
	const a = stage.animator;
	const atlas = createGlyphAtlas( 'abcdefghijklmnopqrstuvwxyz', '700 96px Comfortaa' );

	const lines = [ 0, 1 ].map( ( i ) => {

		const reveal = a.add( `paper.word${i}`, 0, Easings.linear );
		const text = new BitmapText( { atlas, reveal, time: stage.time, size: 0.7, color: [ 0.02, 0.02, 0.02 ] } );
		text.setText( WORDS[ 0 ] );
		text.position.set( 0, 1.9, - 1.5 );
		root.add( text );
		return { reveal, text, name: `paper.word${i}` };

	} );

	const fitAt = new Vector3();
	let active = 0;
	let word = 0;
	let timer = 0;
	let running = false;

	const swap = () => {

		const out = lines[ active ];
		void a.animate( out.name, 2, 0.9 );
		active = 1 - active;
		word = ( word + 1 ) % WORDS.length;
		const inn = lines[ active ];
		inn.text.setText( WORDS[ word ] );
		a.set( inn.name, 0 );
		void a.animate( inn.name, 1, 1.2, { delay: 0.3 } );
		stage.scheduler.after( 0.7, () => running && shake( 0.08, 0.3 ) );

	};

	return {
		root,
		sky: { top: '#f6f4ef', bottom: '#e8e4da', accent: '#1a1a1a', style: 0 },
		pip: { clip: 'hop', look: 'line', timeScale: 0.8 },
		def: {
			name: 'paper',
			label: 'Sketch',
			root,
			post: { bloom: 0, vignette: 0.35, grain: 0.05, threshold: 0.85 },
			shot: {
				position: ORIGIN.clone().add( new Vector3( 0, 0.8, 38 ) ), target: ORIGIN.clone().add( new Vector3( 0, 0.5, 0 ) ), fov: 11.6, portraitFov: 8, parallax: undefined,
				anchor: { position: ORIGIN.clone().add( new Vector3( 0, - 0.45, 0 ) ), quaternion: new Quaternion(), scale: new Vector3( 0.8, 0.8, 0.8 ) },
			},
			enter() {

				running = true;
				timer = 0;
				a.set( lines[ active ].name, 0 );
				void a.animate( lines[ active ].name, 1, 1.4, { delay: 0.4 } );

			},
			leave() {

				running = false;
				lines.forEach( ( l ) => void a.animate( l.name, 2, 0.8 ) );

			},
			update( dt ) {

				const w = visibleSizeAt( camera, lines[ 0 ].text.getWorldPosition( fitAt ) ).width;
				lines.forEach( ( l ) => l.text.scale.setScalar( Math.min( 1, ( w * 0.86 ) / Math.max( l.text.width, 1e-3 ) ) ) );
				if ( ! running ) return;
				timer += dt;
				if ( timer >= 3.5 ) {

					timer = 0;
					swap();

				}

			},
		},
	};

}
