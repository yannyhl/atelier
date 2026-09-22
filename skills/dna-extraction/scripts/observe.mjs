#!/usr/bin/env node
/**
 * Live observation of a reference page with the repo's GPU-enabled Chromium (scripts/lib/browser.mjs).
 * Loads the page, records every network response (type, status, decoded bytes), console errors,
 * the WebGL renderer, three.js revision and fonts actually used, then scrolls with real wheel
 * events and screenshots each step. Screenshots are working notes for the dossier: keep them in a
 * scratch folder, never in dna/<slug>/evidence/ (they contain third-party art).
 *
 * Usage:
 *   node observe.mjs --url https://example.com/ --out /tmp/ref-observe [--viewport laptop]
 *     [--steps 6] [--delta 600] [--interval 1800] [--wait 6000] [--headed]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from '../../../scripts/lib/args.mjs';
import { launch, VIEWPORTS, watchConsole } from '../../../scripts/lib/browser.mjs';

const a = parseArgs();
if ( ! a.url || ! a.out ) {

	console.error( 'usage: node observe.mjs --url <url> --out <dir> [--viewport laptop] [--steps 6] [--delta 600] [--interval 1800] [--wait 6000]' );
	process.exit( 2 );

}

const viewport = a.viewport ?? 'laptop';
const steps = Number( a.steps ?? 6 );
const delta = Number( a.delta ?? 600 );
const interval = Number( a.interval ?? 1800 );
const wait = Number( a.wait ?? 6000 );
mkdirSync( a.out, { recursive: true } );

const browser = await launch( { headed: !! a.headed } );
const context = await browser.newContext( VIEWPORTS[ viewport ] );
const page = await context.newPage();
const errors = watchConsole( page );
const responses = [];

page.on( 'response', async ( res ) => {

	const row = { url: res.url(), status: res.status(), type: res.request().resourceType(), contentType: res.headers()[ 'content-type' ] ?? null, bytes: null };
	responses.push( row );
	try {

		row.bytes = ( await res.body() ).length;

	} catch {

		// Redirects and aborted requests have no body.

	}

} );

await page.goto( a.url, { waitUntil: 'load', timeout: 90000 } );
await page.waitForTimeout( wait );

const shots = [];
const snap = async ( label ) => {

	const file = `${viewport}-${String( shots.length ).padStart( 2, '0' )}-${label}.png`;
	await page.screenshot( { path: join( a.out, file ) } );
	shots.push( file );

};

await snap( 'load' );
await page.mouse.move( VIEWPORTS[ viewport ].viewport.width / 2, VIEWPORTS[ viewport ].viewport.height / 2 );
for ( let i = 1; i <= steps; i ++ ) {

	await page.mouse.wheel( 0, delta );
	await page.waitForTimeout( interval );
	await snap( `wheel${i}` );

}

const env = await page.evaluate( () => {

	const canvas = document.createElement( 'canvas' );
	const gl = canvas.getContext( 'webgl2' ) ?? canvas.getContext( 'webgl' );
	const info = gl?.getExtension( 'WEBGL_debug_renderer_info' );
	const fonts = [ ...document.fonts ].filter( ( f ) => f.status === 'loaded' ).map( ( f ) => `${f.family} ${f.weight} ${f.style}` );
	return {
		title: document.title,
		threeRevision: window.__THREE__ ?? null,
		canvases: document.querySelectorAll( 'canvas' ).length,
		compatMode: document.compatMode,
		documentScrolls: ( document.scrollingElement ?? document.documentElement ).scrollHeight > innerHeight + 1,
		bodyOverflow: getComputedStyle( document.body ).overflow,
		webgl: gl ? { version: gl instanceof WebGL2RenderingContext ? 2 : 1, renderer: info ? gl.getParameter( info.UNMASKED_RENDERER_WEBGL ) : gl.getParameter( gl.RENDERER ) } : null,
		fontsLoaded: [ ...new Set( fonts ) ],
		reducedMotionQueries: [ ...document.styleSheets ].flatMap( ( s ) => {

			try {

				return [ ...s.cssRules ].filter( ( r ) => r.conditionText?.includes( 'prefers-reduced-motion' ) ).map( ( r ) => r.conditionText );

			} catch {

				return [];

			}

		} ),
	};

} );

await page.waitForTimeout( 500 );
await browser.close();

const byType = {};
for ( const r of responses ) {

	byType[ r.type ] ??= { count: 0, bytes: 0 };
	byType[ r.type ].count ++;
	byType[ r.type ].bytes += r.bytes ?? 0;

}

const report = {
	url: a.url, observedAt: new Date().toISOString(), viewport, steps, delta, env,
	totalDecodedBytes: responses.reduce( ( s, r ) => s + ( r.bytes ?? 0 ), 0 ),
	byType, responses: responses.sort( ( x, y ) => ( y.bytes ?? 0 ) - ( x.bytes ?? 0 ) ), consoleErrors: errors, shots,
};
writeFileSync( join( a.out, 'observe.json' ), JSON.stringify( report, null, 2 ) + '\n' );

console.log( `${env.title} | three r${env.threeRevision ?? '-'} | ${env.webgl ? `WebGL${env.webgl.version} ${env.webgl.renderer}` : 'no WebGL'} | canvases ${env.canvases} | ${env.compatMode} | document scrolls: ${env.documentScrolls}` );
console.log( `responses ${responses.length}, ${( report.totalDecodedBytes / 1024 ).toFixed( 0 )} KB decoded: ${Object.entries( byType ).map( ( [ k, v ] ) => `${k} ${v.count}/${( v.bytes / 1024 ).toFixed( 0 )}KB` ).join( ', ' )}` );
console.log( `fonts: ${env.fontsLoaded.join( '; ' ) || '-'}` );
console.log( `console errors: ${errors.length}; ${shots.length} screenshots in ${a.out}` );
