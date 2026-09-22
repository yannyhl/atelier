import { PerspectiveCamera, Scene, Vector3 } from 'three';
import {
	bindScrollInput, Choreography, warmUp, PostFX, readCaptureParams, SectionDirector, SectionScroller, SectionTrack,
	Stage, trackPointer, type Cue,
} from '@atelier/stage';
import { clearSectionDom, lockDocumentAnimations, prepareReveal, ScrollRing, setRevealed, TimelineDots } from '@atelier/stage/dom';
import { createSkyDome, CursorTrail } from '@atelier/stage/effects';
import { createGlass } from './sections/glass';
import { createIntro } from './sections/intro';
import { createOutro } from './sections/outro';
import type { SectionContext } from './sections/types';

/** Give the main thread back between boot phases so no single task blocks input for long. */
const yieldToMain = () => new Promise<void>( ( r ) => setTimeout( r, 0 ) );

export async function boot() {

	// Separate the chunk's parse/eval task from WebGL context creation.
	await yieldToMain();
	const html = document.documentElement;
	const canvas = document.getElementById( 'stage' ) as HTMLCanvasElement;
	const capture = readCaptureParams();
	const stage = new Stage( { canvas, capture, seed: 7 } );

	const fallback = ( reason: string ) => {

		console.warn( `[atelier] static fallback: ${reason}` );
		html.classList.remove( 'is-webgl', 'is-ready', 'is-splashed' );
		clearSectionDom();
		stage.dispose();

	};

	stage.on( 'fallback', fallback );
	if ( stage.profile.tier === 0 ) return fallback( 'tier 0' );

	/* ---------- scene, camera, post ---------- */

	const scene = new Scene();
	const camera = new PerspectiveCamera( 40, 1, 0.1, 220 );
	const post = new PostFX( stage.renderer, stage.animator, stage.profile, stage.time );
	post.refraction = true;
	stage.add( { resize: ( v ) => post.resize( v ), setProfile: ( p ) => post.setProfile( p ) } );

	/* ---------- sections ---------- */

	const ctx: SectionContext = { stage, scene, camera, post };
	await yieldToMain();
	const intro = await createIntro( ctx );
	await yieldToMain();
	const bundles = [ intro, createGlass( ctx ), createOutro( ctx ) ];
	await yieldToMain();
	bundles.forEach( ( b ) => {

		scene.add( b.root );
		b.def.element = document.querySelector<HTMLElement>( `[data-section="${b.def.name}"]` );
		if ( b.setProfile ) stage.add( { setProfile: ( p ) => b.setProfile!( p ) } );

	} );

	const scroller = stage.add( new SectionScroller() );
	const director = new SectionDirector( stage, scroller, bundles.map( ( b ) => b.def ), post );
	const track = new SectionTrack( camera, scroller, bundles.map( ( b ) => b.def.shot ) );

	const sky = createSkyDome( bundles.map( ( b ) => b.sky ), director.looks, stage.time );
	scene.add( sky );

	stage.add( director );
	stage.add( track );
	stage.add( { update: () => sky.position.copy( camera.position ) } );

	/* ---------- trail (fine pointers only) ---------- */

	const finePointer = matchMedia( '(hover: hover) and (pointer: fine)' ).matches;
	const trail = ( finePointer || capture ) && stage.profile.tier >= 2 ? new CursorTrail( { time: stage.time } ) : null;
	if ( trail ) {

		scene.add( trail.mesh );
		stage.add( trail );

	}

	const pointerAt = new Vector3();
	const setPointer = ( x: number, y: number ) => {

		track.setPointer( x, y );
		if ( trail ) trail.head.copy( pointerAt.set( x, y, 0.97 ).unproject( camera ) );

	};

	/* ---------- DOM chrome ---------- */

	document.querySelectorAll<HTMLElement>( '[data-reveal]' ).forEach( ( el ) => prepareReveal( el ) );
	const revealIn = ( name: string ) => document.querySelectorAll<HTMLElement>( '[data-reveal]' ).forEach( ( el ) => {

		setRevealed( el, el.closest<HTMLElement>( '[data-section]' )?.dataset.section === name );

	} );

	const ring = new ScrollRing( document.getElementById( 'ring' )!, 'SCROLL', () => void scroller.move( scroller.target + 1 ) );
	const dots = new TimelineDots( document.getElementById( 'dots' )!, bundles.map( ( b ) => b.def.label ), ( i ) => void scroller.move( i, 2 ) );

	director.onChange = ( i, def ) => {

		dots.set( i );
		ring.setVisible( i === 0 && html.classList.contains( 'is-splashed' ) );
		revealIn( def.name );

	};

	/* ---------- input or choreography ---------- */

	if ( capture ) {

		html.classList.add( 'is-capture' );
		post.grainScale = 0.25;
		const lock = lockDocumentAnimations( stage );
		const cues: Cue[] = [
			{ at: 0, run: () => splash() },
			{ at: 4.5, run: () => void scroller.move( 1, 1.2 ) },
			{ at: 10, run: () => void scroller.move( 2, 1.2 ) },
			{ at: 16, run: () => undefined, label: 'end' },
		];
		stage.add( new Choreography( cues, ( t ) => [ Math.sin( t * 0.9 ) * 0.55, Math.sin( t * 1.3 ) * 0.35 ], setPointer ) );
		stage.render = () => {

			lock.sync();
			post.render( scene, camera );

		};

	} else {

		bindScrollInput( scroller, { reducedMotion: stage.reducedMotion } );
		trackPointer( setPointer );
		stage.render = () => post.render( scene, camera );

	}

	function splash() {

		html.classList.add( 'is-splashed' );
		ring.setVisible( director.current === 0 );
		revealIn( bundles[ director.current ].def.name );

	}

	/* ---------- warm up, then reveal ---------- */

	scene.traverse( ( o ) => ( o.visible = true ) );
	camera.layers.enableAll();
	await yieldToMain();
	await stage.renderer.compileAsync( scene, camera );
	await yieldToMain();
	// Warm-up: first draws of each set in their own task, so no single task blocks input for long.
	await warmUp( bundles.map( ( b ) => b.root ), () => post.render( scene, camera ), yieldToMain );
	camera.layers.set( 0 );
	director.reset();
	stage.reset();
	stage.seek( 0 );

	html.classList.add( 'is-ready' );
	stage.markReady();

	if ( ! capture ) {

		stage.start();
		stage.scheduler.after( 0.6, splash );

	}

}
