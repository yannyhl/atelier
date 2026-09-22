#!/usr/bin/env node
/**
 * Deterministic WebGL -> MP4 renderer.
 *
 * Loads a stage page in capture mode (`?capture=1&w=&h=`), then for every frame calls
 * `window.__atelier.seek(t)` and screenshots the page (canvas + DOM overlays), piping PNGs to ffmpeg.
 * Because every system advances on the fixed-step clock, the same inputs always give the same frames.
 *
 * Usage:
 *   node scripts/render-video.mjs --url http://localhost:4173/ --out work/001-x/teaser.mp4 \
 *     --duration 16 [--fps 30] [--w 1920] [--h 1080] [--crf 16] [--review 2] [--verify]
 *
 * --review N  saves a PNG every N seconds next to the video for inspection.
 * --verify    renders probe frames in two fresh page loads and fails if any hash differs.
 *             Frames are always rendered forward in time; rewinding is supported for WebGL state
 *             but CSS transitions cannot be rewound, so never rely on it for final output.
 * Refuses to overwrite an existing MP4: archive it first.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { parseArgs } from './lib/args.mjs';
import { launch, waitForStage, watchConsole, withQuery } from './lib/browser.mjs';

const a = parseArgs();
const url = a.url ?? 'http://localhost:4173/';
const out = a.out;
const fps = Number( a.fps ?? 30 );
const duration = Number( a.duration ?? 10 );
const w = Number( a.w ?? 1920 );
const h = Number( a.h ?? 1080 );
const crf = String( a.crf ?? 18 );
const review = a.review === undefined ? 0 : Number( a.review );

if ( ! out || ! out.endsWith( '.mp4' ) ) {

	console.error( 'render-video: --out path/to/file.mp4 is required' );
	process.exit( 2 );

}

if ( existsSync( out ) ) {

	console.error( `render-video: ${out} exists. Archive it before rendering a new version.` );
	process.exit( 2 );

}

mkdirSync( dirname( out ), { recursive: true } );
const reviewDir = join( dirname( out ), basename( out, '.mp4' ) + '-frames' );
if ( review ) mkdirSync( reviewDir, { recursive: true } );

const browser = await launch();
const context = await browser.newContext( { viewport: { width: w, height: h }, deviceScaleFactor: 1 } );
const page = await context.newPage();
const errors = watchConsole( page );
await page.goto( withQuery( url, { capture: 1, w, h, dpr: 1 } ), { waitUntil: 'networkidle' } );

if ( ! ( await waitForStage( page ) ) ) {

	console.error( 'render-video: no window.__atelier on the page; is it a stage page?' );
	await browser.close();
	process.exit( 1 );

}

// Freeze the document animation clock: CSS can only move when lockDocumentAnimations sets currentTime.
const freezeAnimations = async ( p ) => {

	const cdp = await context.newCDPSession( p );
	await cdp.send( 'Animation.enable' );
	await cdp.send( 'Animation.setPlaybackRate', { playbackRate: 0 } );

};
await freezeAnimations( page );

// CDP screenshots with optimizeForSpeed are lossless PNG at a fraction of Playwright's encode cost.
const cdp = await context.newCDPSession( page );
const shot = async ( t ) => {

	await page.evaluate( ( time ) => window.__atelier.seek( time ), t );
	const { data } = await cdp.send( 'Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, captureBeyondViewport: false } );
	return Buffer.from( data, 'base64' );

};

if ( a.verify ) {

	// Same frames from two independent page loads, seeking forward only (the rendering contract).
	const probes = [ 0.5, duration * 0.33, duration * 0.66, duration - 1 / fps ].map( ( t ) => Math.round( t * fps ) / fps );
	const hashes = async ( p ) => {

		const list = [];
		for ( const t of probes ) {

			await p.evaluate( ( time ) => window.__atelier.seek( time ), t );
			const s = await context.newCDPSession( p );
			const { data } = await s.send( 'Page.captureScreenshot', { format: 'png', optimizeForSpeed: true } );
			list.push( createHash( 'sha256' ).update( data ).digest( 'hex' ) );

		}

		return list;

	};

	const fresh = async () => {

		const p = await context.newPage();
		await freezeAnimations( p );
		await p.goto( withQuery( url, { capture: 1, w, h, dpr: 1 } ), { waitUntil: 'networkidle' } );
		await waitForStage( p );
		const list = await hashes( p );
		await p.close();
		return list;

	};

	const first = await fresh();
	const second = await fresh();
	const same = first.every( ( x, i ) => x === second[ i ] );
	console.log( `determinism: ${same ? 'PASS' : 'FAIL'} (${probes.length} frames, two fresh page loads)` );
	if ( ! same ) {

		console.log( { probes, first, second } );
		await browser.close();
		process.exit( 1 );

	}

}

const ffmpeg = spawn( 'ffmpeg', [
	'-loglevel', 'error', '-y',
	'-f', 'image2pipe', '-framerate', String( fps ), '-i', '-',
	'-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p',
	'-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
	'-movflags', '+faststart', out,
], { stdio: [ 'pipe', 'inherit', 'inherit' ] } );
const ffDone = new Promise( ( resolve, reject ) => ffmpeg.on( 'close', ( c ) => ( c === 0 ? resolve() : reject( new Error( `ffmpeg exited ${c}` ) ) ) ) );

const total = Math.round( duration * fps );
const started = Date.now();
for ( let f = 0; f < total; f ++ ) {

	const png = await shot( f / fps );
	if ( ! ffmpeg.stdin.write( png ) ) await new Promise( ( r ) => ffmpeg.stdin.once( 'drain', r ) );
	if ( review && f % Math.round( review * fps ) === 0 ) writeFileSync( join( reviewDir, `t${( f / fps ).toFixed( 2 ).padStart( 6, '0' )}.png` ), png );
	if ( f % fps === 0 ) process.stdout.write( `\rframe ${f}/${total}` );

}

ffmpeg.stdin.end();
await ffDone;
await browser.close();

const bytes = statSync( out ).size;
const meta = {
	file: basename( out ), url, width: w, height: h, fps, durationInSeconds: duration, frames: total,
	codec: 'h264', pixelFormat: 'yuv420p', colorSpace: 'bt709', crf: Number( crf ), bytes,
	sha256: createHash( 'sha256' ).update( readFileSync( out ) ).digest( 'hex' ),
	renderSeconds: Math.round( ( Date.now() - started ) / 1000 ), consoleErrors: errors, renderedAt: new Date().toISOString(),
};
writeFileSync( out.replace( /\.mp4$/, '.json' ), JSON.stringify( meta, null, 2 ) + '\n' );
console.log( `\nwrote ${out} (${( bytes / 1e6 ).toFixed( 2 )} MB, ${meta.renderSeconds}s)` );
if ( errors.length ) console.log( 'console errors:\n' + errors.join( '\n' ) );
