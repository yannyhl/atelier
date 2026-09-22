import { PerspectiveCamera, Quaternion, Scene, Vector3 } from 'three';
import {
	AssetLoader, bindScrollInput, Choreography, PostFX, readCaptureParams, SectionDirector, SectionScroller, SectionTrack,
	Stage, trackPointer, warmUp, type Cue,
} from '@atelier/stage';
import { clearSectionDom, lockDocumentAnimations, prepareReveal, ScrollRing, setRevealed, splitChars, TimelineDots } from '@atelier/stage/dom';
import { createSkyDome, CursorTrail } from '@atelier/stage/effects';
import { createPip } from './pip';
import { createArrival } from './sections/arrival';
import { createFinale } from './sections/finale';
import { createGlass } from './sections/glass';
import { createNight } from './sections/night';
import { createPaper } from './sections/paper';
import type { SectionContext } from './sections/types';

const yieldToMain = () => new Promise<void>( ( r ) => setTimeout( r, 0 ) );
/** Boot phase marks: scripts/audit-perf.mjs attributes long tasks to the phase they overlap. */
const mark = ( name: string ) => performance.mark( `atelier:${name}` );

export async function boot() {

	// Separate the chunk's parse/eval task from WebGL context creation.
	await yieldToMain();
	mark( 'boot' );
	const html = document.documentElement;
	const canvas = document.getElementById( 'stage' ) as HTMLCanvasElement;
	const capture = readCaptureParams();
	const stage = new Stage( { canvas, capture, seed: 11 } );

	const fallback = ( reason: string ) => {

		console.warn( `[atelier] static fallback: ${reason}` );
		html.classList.remove( 'is-webgl', 'is-ready', 'is-splashed' );
		clearSectionDom();
		stage.dispose();

	};

	stage.on( 'fallback', fallback );
	if ( stage.profile.tier === 0 ) return fallback( 'tier 0' );

	/* ---------- assets ---------- */

	const assets = new AssetLoader( stage.renderer );
	await assets.load( [ { name: 'pip', url: '/models/mascot.glb', kind: 'gltf', priority: 'must' } ] );
	mark( 'assets' );
	await yieldToMain();

	/* ---------- scene, camera, post ---------- */

	const scene = new Scene();
	const camera = new PerspectiveCamera( 40, 1, 0.1, 240 );
	const post = new PostFX( stage.renderer, stage.animator, stage.profile, stage.time );
	post.refraction = true;
	stage.add( { resize: ( v ) => post.resize( v ), setProfile: ( p ) => post.setProfile( p ) } );

	mark( 'post' );
	const { pip, rig } = createPip( stage, assets, post );
	scene.add( rig );

	/* ---------- sets ---------- */

	const scroller = new SectionScroller();
	const track = new SectionTrack( camera, scroller );
	const ctx: SectionContext = { stage, scene, camera, post, pip };
	const bundles = [
		await createArrival( ctx ),
		createGlass( ctx ),
		createPaper( ctx, ( amount, duration ) => track.shake( amount, duration ) ),
		createNight( ctx ),
		createFinale( ctx ),
	];
	mark( 'sections' );
	await yieldToMain();

	bundles.forEach( ( b ) => {

		scene.add( b.root );
		b.def.element = document.querySelector<HTMLElement>( `[data-section="${b.def.name}"]` );
		if ( b.setProfile ) stage.add( { setProfile: ( p ) => b.setProfile!( p ) } );

	} );

	// Order matters for reset(): Pip resets before the director re-enters set 0 and starts his clip.
	stage.add( scroller );
	stage.add( pip );
	const director = new SectionDirector( stage, scroller, bundles.map( ( b ) => b.def ), post );
	track.shots = bundles.map( ( b ) => b.def.shot );

	const sky = createSkyDome( bundles.map( ( b ) => b.sky ), director.looks, stage.time );
	scene.add( sky );

	// Pip rides the interpolated section anchors; each set directs his clip, look and spin.
	const pose = { position: new Vector3(), quaternion: new Quaternion(), scale: new Vector3( 1, 1, 1 ) };
	stage.add( director );
	stage.add( track );
	stage.add( {
		update: () => {

			sky.position.copy( camera.position );
			if ( track.anchorAt( scroller.value, pose ) ) {

				rig.position.copy( pose.position );
				rig.quaternion.copy( pose.quaternion );
				rig.scale.copy( pose.scale );

			}

		},
	} );

	/* ---------- trail (fine pointers only) ---------- */

	const finePointer = matchMedia( '(hover: hover) and (pointer: fine)' ).matches;
	// The trail glows on dark sets and turns to ink on the paper set.
	const trailInk = stage.animator.add( 'trail.ink', 0 );
	const trail = ( finePointer || capture ) && stage.profile.tier >= 2 ? new CursorTrail( { time: stage.time, ink: trailInk } ) : null;
	if ( trail ) {

		scene.add( trail.mesh );
		stage.add( trail );

	}

	// Keep the trail in view space: move it with the camera so travel between sets does not stretch it.
	const lastCamera = new Vector3();
	const cameraDelta = new Vector3();
	if ( trail ) stage.add( {
		update: () => {

			cameraDelta.subVectors( camera.position, lastCamera );
			if ( lastCamera.lengthSq() > 0 ) trail.shift( cameraDelta );
			lastCamera.copy( camera.position );

		},
		reset: () => lastCamera.set( 0, 0, 0 ),
	} );

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

	// Per-character rainbow on the CTA word, driven by the stage clock (reference: hsl(360 * (0.2t - 0.05i))).
	const rainbow = document.querySelector<HTMLElement>( '[data-rainbow]' );
	const rainbowChars: HTMLElement[] = [];
	if ( rainbow ) {

		rainbow.classList.remove( 'rainbow' );
		splitChars( rainbow );
		rainbow.querySelectorAll<HTMLElement>( '.at-char' ).forEach( ( c ) => rainbowChars.push( c ) );

	}

	stage.add( {
		update: ( _dt, s ) => {

			if ( director.current !== bundles.length - 1 ) return;
			const t = s.time.value;
			rainbowChars.forEach( ( c, i ) => ( c.style.color = `hsl(${Math.round( 360 * ( ( ( 0.2 * t ) % 1 ) - 0.05 * i ) )} 85% 62%)` ) );

		},
	} );

	const ring = new ScrollRing( document.getElementById( 'ring' )!, 'SCROLL', () => void scroller.move( scroller.target + 1 ) );
	const dots = new TimelineDots( document.getElementById( 'dots' )!, bundles.map( ( b ) => b.def.label ), ( i ) => void scroller.move( i, 2 ) );

	director.onChange = ( i, def ) => {

		const d = bundles[ i ].pip;
		pip.play( d.clip, { timeScale: d.timeScale ?? 1 } );
		pip.setLook( d.look );
		pip.spin = d.spin ?? 0;
		void stage.animator.animate( 'trail.ink', def.name === 'paper' ? 1 : 0, 0.8 );
		dots.set( i );
		ring.setVisible( i === 0 && html.classList.contains( 'is-splashed' ) );
		revealIn( def.name );

	};

	/* ---------- input or choreography ---------- */

	function splash() {

		html.classList.add( 'is-splashed' );
		ring.setVisible( director.current === 0 );
		revealIn( bundles[ director.current ].def.name );

	}

	if ( capture ) {

		html.classList.add( 'is-capture' );
		// Key art and share images: ?ui=0 hides chrome and ledes, leaving the set and its title.
		if ( new URLSearchParams( location.search ).get( 'ui' ) === '0' ) html.classList.add( 'is-clean' );
		post.grainScale = 0.25;
		const lock = lockDocumentAnimations( stage );
		// 30 s teaser: one beat per set, the camera travels between them like the $LOAN launch clip.
		const cues: Cue[] = [
			{ at: 0, run: () => splash(), label: 'arrival' },
			{ at: 5, run: () => void scroller.move( 1, 1.4 ), label: 'glass' },
			{ at: 11, run: () => void scroller.move( 2, 1.4 ), label: 'paper' },
			{ at: 17.5, run: () => void scroller.move( 3, 1.4 ), label: 'night' },
			{ at: 23, run: () => void scroller.move( 4, 1.4 ), label: 'finale' },
			{ at: 30, run: () => undefined, label: 'end' },
		];
		// The scripted cursor loops around the hero, below the titles, so the trail never crosses type.
		stage.add( new Choreography( cues, ( t ) => [ Math.sin( t * 0.8 ) * 0.5, - 0.18 + Math.sin( t * 1.25 ) * 0.2 ], setPointer ) );
		stage.render = () => {

			lock.sync();
			post.render( scene, camera );

		};

	} else {

		bindScrollInput( scroller, { reducedMotion: stage.reducedMotion } );
		trackPointer( setPointer );
		stage.render = () => post.render( scene, camera );

	}

	/* ---------- warm up, then reveal ---------- */

	scene.traverse( ( o ) => ( o.visible = true ) );
	camera.layers.enableAll();
	await yieldToMain();
	await stage.renderer.compileAsync( scene, camera );
	mark( 'compiled' );
	await yieldToMain();
	// Warm-up: first draws of each set in their own task, so no single task blocks input for long.
	await warmUp( bundles.map( ( b ) => b.root ), () => post.render( scene, camera ), yieldToMain );
	camera.layers.set( 0 );
	stage.reset();
	stage.seek( 0 );
	mark( 'first-frame' );

	html.classList.add( 'is-ready' );
	stage.markReady();

	if ( ! capture ) {

		stage.start();
		stage.scheduler.after( 0.6, splash );

	}

}
