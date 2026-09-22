#!/usr/bin/env node
/**
 * Deterministic still from a stage page: OG images, X headers, posters and key art.
 *
 * Loads the page in capture mode (`?capture=1&w=&h=&dpr=`) with CSS animations frozen, walks the
 * stage clock forward on the same frame grid as scripts/render-video.mjs (so DOM transitions start
 * exactly when they would in the video), screenshots the frame and records an asset-manifest entry.
 *
 * Usage:
 *   node render-still.mjs --url http://localhost:4173/ --out work/001-x/stills/og.png --preset og --t 6
 *   node render-still.mjs --url ... --out key-art.png --w 3840 --h 2160 --dpr 2 --cue finale --after 2
 *
 * Options:
 *   --t <s>            stage time to show (snapped to the --fps grid). Default 0.
 *   --cue <label>      use the time of the Choreography cue with this label instead of --t.
 *   --after <s>        seconds added to the cue time (settle time for what the cue starts).
 *   --preset <name>    og 1200x630, x-header 1500x500, x-post 1600x900, square 1080x1080,
 *                      portrait 1080x1350, story 1080x1920@3, 4k 3840x2160@2, poster-a 2480x3508@2 (A4 at 300 dpi).
 *   --w --h            output size in pixels (same convention as render-video.mjs). Overrides the preset.
 *   --dpr <n>          device pixel ratio: the page is laid out at w/dpr x h/dpr CSS pixels, so dpr 3
 *                      on 1080x1920 gives the real phone layout (360x640 CSS). w/dpr and h/dpr must be whole.
 *   --fps <n>          frame grid for the walk. Default 30 (same as render-video).
 *   --format png|jpeg  default png. --quality 0-100 for jpeg (default 92).
 *   --manifest <file>  asset-manifest.json to update. Default: next to --out.
 *   --force            overwrite an existing output file.
 *
 * Prints the manifest entry as JSON. Exits 1 on console errors, a size mismatch or a missing stage.
 * Needs the atelier checkout (imports scripts/lib/browser.mjs and its Playwright); run it from the
 * repo or through the skill symlink that `npm run install-skills` creates.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

let lib;
try {

	lib = await import( new URL( '../../../scripts/lib/browser.mjs', import.meta.url ) );

} catch ( error ) {

	console.error( `render-still: cannot load the atelier browser helpers (${error.message}).\nRun this script from an atelier checkout, or through the symlink created by npm run install-skills.` );
	process.exit( 2 );

}

const { parseArgs } = await import( new URL( '../../../scripts/lib/args.mjs', import.meta.url ) );
const { launch, waitForStage, watchConsole, withQuery } = lib;

const PRESETS = {
	'og': { w: 1200, h: 630, dpr: 1 },
	'x-header': { w: 1500, h: 500, dpr: 1 },
	'x-post': { w: 1600, h: 900, dpr: 1 },
	'square': { w: 1080, h: 1080, dpr: 1 },
	'portrait': { w: 1080, h: 1350, dpr: 1 },
	'story': { w: 1080, h: 1920, dpr: 3 },
	'4k': { w: 3840, h: 2160, dpr: 2 },
	'poster-a': { w: 2480, h: 3508, dpr: 2 },
};

const a = parseArgs();
const url = a.url ?? 'http://localhost:4173/';
const out = a.out;
const preset = a.preset ? PRESETS[ a.preset ] : { w: 1920, h: 1080, dpr: 1 };
const format = a.format ?? ( out?.endsWith( '.jpg' ) || out?.endsWith( '.jpeg' ) ? 'jpeg' : 'png' );
const fps = Number( a.fps ?? 30 );

const fail = ( msg, code = 2 ) => {

	console.error( `render-still: ${msg}` );
	process.exit( code );

};

if ( a.preset && ! preset ) fail( `unknown --preset ${a.preset} (use ${Object.keys( PRESETS ).join( ', ' )})` );
if ( ! out ) fail( '--out path/to/file.png is required' );
if ( ! [ 'png', 'jpeg' ].includes( format ) ) fail( '--format must be png or jpeg' );
if ( existsSync( out ) && ! a.force ) fail( `${out} exists. Pass --force to replace it, or archive it first.` );

const pixelW = Number( a.w ?? preset.w );
const pixelH = Number( a.h ?? preset.h );
const dpr = Number( a.dpr ?? ( a.w || a.h ? 1 : preset.dpr ) );
if ( ! ( pixelW > 0 && pixelH > 0 && dpr > 0 ) ) fail( '--w, --h and --dpr must be positive numbers' );
// CSS layout size. It must be whole, or Chromium rounds the canvas and the output misses the placement size.
const w = pixelW / dpr;
const h = pixelH / dpr;
if ( Math.abs( w - Math.round( w ) ) > 1e-6 || Math.abs( h - Math.round( h ) ) > 1e-6 ) {

	fail( `${pixelW}x${pixelH} at --dpr ${dpr} is ${w}x${h} CSS pixels; pick a dpr that divides both sizes` );

}

const browser = await launch();
const context = await browser.newContext( { viewport: { width: w, height: h }, deviceScaleFactor: dpr } );
const page = await context.newPage();
const errors = watchConsole( page );

// Freeze the document animation clock before anything runs: CSS moves only when
// lockDocumentAnimations sets currentTime from the stage clock.
const cdp = await context.newCDPSession( page );
await cdp.send( 'Animation.enable' );
await cdp.send( 'Animation.setPlaybackRate', { playbackRate: 0 } );

const pageUrl = withQuery( url, { capture: 1, w, h, dpr } );
await page.goto( pageUrl, { waitUntil: 'networkidle' } );

if ( ! ( await waitForStage( page ) ) ) {

	await browser.close();
	fail( 'no window.__atelier on the page; is it a stage page, and does WebGL work here?', 1 );

}

const limits = await page.evaluate( () => {

	const r = window.__atelier.stage.renderer;
	const gl = r.getContext();
	const dims = gl.getParameter( gl.MAX_VIEWPORT_DIMS );
	return {
		maxTexture: r.capabilities.maxTextureSize,
		maxRenderbuffer: gl.getParameter( gl.MAX_RENDERBUFFER_SIZE ),
		maxViewport: [ dims[ 0 ], dims[ 1 ] ],
		capture: window.__atelier.stage.capture,
	};

} );

if ( ! limits.capture ) {

	await browser.close();
	fail( 'the page did not enter capture mode; it must pass readCaptureParams() to new Stage( { capture } )', 1 );

}

const maxSide = Math.min( limits.maxTexture, limits.maxRenderbuffer, limits.maxViewport[ 0 ], limits.maxViewport[ 1 ] );
if ( Math.max( pixelW, pixelH ) > maxSide ) {

	await browser.close();
	fail( `${pixelW}x${pixelH} exceeds this GPU's ${maxSide} px limit; render a smaller size or tiles (see references/key-art.md)`, 1 );

}

// Resolve the frame time: a cue label or --t, snapped to the frame grid render-video uses.
let requested = Number( a.t ?? 0 );
let cue = null;
if ( a.cue ) {

	cue = await page.evaluate( ( label ) => {

		// window.__atelier.cues() lists every labelled moment registered by Choreography systems.
		const found = ( window.__atelier.cues?.() ?? [] ).find( ( c ) => c.label === label );
		return found ? { label, at: found.at } : null;

	}, String( a.cue ) );
	if ( ! cue ) {

		await browser.close();
		fail( `no Choreography cue labelled "${a.cue}" (give cues a label, or use --t)`, 1 );

	}

	requested = cue.at + Number( a.after ?? 0 );

}

const frame = Math.max( 0, Math.round( requested * fps ) );
const t = frame / fps;

// Walk forward frame by frame (no screenshots) exactly like the video renderer, so every CSS
// transition is registered at the frame it starts; one big seek would register them all at t.
// Yielding a task per frame mirrors the video renderer's one evaluate call per frame; it costs
// milliseconds and keeps any promise-based project code on the same schedule as the video.
await page.evaluate( async ( { frames, rate } ) => {

	for ( let f = 0; f <= frames; f ++ ) {

		window.__atelier.seek( f / rate );
		await new Promise( ( r ) => setTimeout( r, 0 ) );

	}

}, { frames: frame, rate: fps } );

// A raw CDP screenshot is in CSS pixels; the clip scale asks for device pixels (w*dpr x h*dpr).
const shot = await cdp.send( 'Page.captureScreenshot', {
	format, ...( format === 'jpeg' ? { quality: Number( a.quality ?? 92 ) } : {} ),
	clip: { x: 0, y: 0, width: w, height: h, scale: dpr }, captureBeyondViewport: false,
} );
const bytes = Buffer.from( shot.data, 'base64' );
const stats = await page.evaluate( () => window.__atelier.stats() );
await browser.close();

mkdirSync( dirname( resolve( out ) ), { recursive: true } );
writeFileSync( out, bytes );

const image = format === 'png' ? pngInfo( bytes ) : jpegInfo( bytes );
const problems = [];
if ( image.width !== pixelW || image.height !== pixelH ) problems.push( `output is ${image.width}x${image.height}, expected ${pixelW}x${pixelH}` );
if ( errors.length ) problems.push( `${errors.length} console errors` );

const manifestPath = a.manifest ?? join( dirname( resolve( out ) ), 'asset-manifest.json' );
const entry = {
	file: relative( dirname( resolve( manifestPath ) ), resolve( out ) ),
	width: image.width,
	height: image.height,
	mode: image.mode,
	transparency: image.transparentPixels + image.partialAlphaPixels > 0,
	transparentPixels: image.transparentPixels,
	partialAlphaPixels: image.partialAlphaPixels,
	opaquePixels: image.opaquePixels,
	bytes: bytes.length,
	sha256: createHash( 'sha256' ).update( bytes ).digest( 'hex' ),
	format,
	tool: 'atelier skills/stills-and-posters/scripts/render-still.mjs (Playwright Chromium, CDP screenshot)',
	source: { url: pageUrl, t, frame, fps, ...( cue ? { cue: cue.label, cueAt: cue.at, after: Number( a.after ?? 0 ) } : {} ) },
	capture: { cssWidth: w, cssHeight: h, dpr, tier: stats.tier, renderer: stats.probe?.renderer ?? null },
	renderedAt: new Date().toISOString(),
	consoleErrors: errors,
};

const manifest = existsSync( manifestPath ) ? JSON.parse( readFileSync( manifestPath, 'utf8' ) ) : [];
if ( ! Array.isArray( manifest ) ) fail( `${manifestPath} is not a JSON array of entries`, 1 );
const at = manifest.findIndex( ( e ) => e.file === entry.file );
if ( at >= 0 && manifest[ at ].notes !== undefined ) entry.notes = manifest[ at ].notes; // hand-written notes survive re-renders
if ( at >= 0 ) manifest[ at ] = entry;
else manifest.push( entry );
writeFileSync( manifestPath, JSON.stringify( manifest, null, 2 ) + '\n' );

console.log( JSON.stringify( { ...entry, manifest: manifestPath, problems }, null, 2 ) );
if ( problems.length ) {

	console.error( `render-still: ${problems.join( '; ' )}` );
	process.exit( 1 );

}

console.error( `wrote ${basename( out )} ${image.width}x${image.height} ${( bytes.length / 1e6 ).toFixed( 2 )} MB at t=${t}s` );

/**
 * PNG header plus exact alpha statistics (decodes 8-bit and 16-bit, non-interlaced images).
 * `mode` follows the lurk convention: RGB, RGBA, L, LA or P.
 */
function pngInfo( buf ) {

	if ( buf.subarray( 0, 8 ).toString( 'hex' ) !== '89504e470d0a1a0a' ) throw new Error( 'not a PNG' );
	const width = buf.readUInt32BE( 16 );
	const height = buf.readUInt32BE( 20 );
	const depth = buf[ 24 ];
	const colorType = buf[ 25 ];
	const interlace = buf[ 28 ];
	const mode = { 0: 'L', 2: 'RGB', 3: 'P', 4: 'LA', 6: 'RGBA' }[ colorType ];
	const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ colorType ];
	const result = { width, height, mode, transparentPixels: 0, partialAlphaPixels: 0, opaquePixels: width * height };
	if ( colorType !== 4 && colorType !== 6 ) return result;
	if ( interlace ) throw new Error( 'interlaced PNG alpha statistics are not supported' );

	const idat = [];
	for ( let o = 8; o < buf.length; ) {

		const len = buf.readUInt32BE( o );
		const type = buf.toString( 'latin1', o + 4, o + 8 );
		if ( type === 'IDAT' ) idat.push( buf.subarray( o + 8, o + 8 + len ) );
		o += 12 + len;

	}

	const raw = inflateSync( Buffer.concat( idat ) );
	const bpp = channels * ( depth / 8 );
	const stride = width * bpp;
	let prev = Buffer.alloc( stride );
	let cur = Buffer.alloc( stride );
	const maxA = depth === 16 ? 65535 : 255;
	let transparent = 0, partial = 0;

	for ( let y = 0; y < height; y ++ ) {

		const base = y * ( stride + 1 );
		const filter = raw[ base ];
		for ( let x = 0; x < stride; x ++ ) {

			const v = raw[ base + 1 + x ];
			const left = x >= bpp ? cur[ x - bpp ] : 0;
			const up = prev[ x ];
			const upLeft = x >= bpp ? prev[ x - bpp ] : 0;
			let r;
			if ( filter === 0 ) r = v;
			else if ( filter === 1 ) r = v + left;
			else if ( filter === 2 ) r = v + up;
			else if ( filter === 3 ) r = v + ( ( left + up ) >> 1 );
			else {

				const p = left + up - upLeft;
				const pa = Math.abs( p - left ), pb = Math.abs( p - up ), pc = Math.abs( p - upLeft );
				r = v + ( pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft );

			}

			cur[ x ] = r & 255;

		}

		for ( let x = 0; x < width; x ++ ) {

			const o = x * bpp + ( channels - 1 ) * ( depth / 8 );
			const alpha = depth === 16 ? ( cur[ o ] << 8 ) | cur[ o + 1 ] : cur[ o ];
			if ( alpha === 0 ) transparent ++;
			else if ( alpha < maxA ) partial ++;

		}

		[ prev, cur ] = [ cur, prev ];

	}

	result.transparentPixels = transparent;
	result.partialAlphaPixels = partial;
	result.opaquePixels = width * height - transparent - partial;
	return result;

}

/** JPEG size from the first SOF marker. JPEG has no alpha. */
function jpegInfo( buf ) {

	for ( let o = 2; o < buf.length; ) {

		const marker = buf[ o + 1 ];
		const len = buf.readUInt16BE( o + 2 );
		if ( marker >= 0xc0 && marker <= 0xcf && ! [ 0xc4, 0xc8, 0xcc ].includes( marker ) ) {

			const height = buf.readUInt16BE( o + 5 );
			const width = buf.readUInt16BE( o + 7 );
			return { width, height, mode: 'RGB', transparentPixels: 0, partialAlphaPixels: 0, opaquePixels: width * height };

		}

		o += 2 + len;

	}

	throw new Error( 'no SOF marker in JPEG' );

}
