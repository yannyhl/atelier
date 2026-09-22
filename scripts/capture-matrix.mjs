#!/usr/bin/env node
/**
 * Screenshot every section at every viewport, plus the static fallback and reduced-motion runs.
 * Output: <out>/<viewport>[-static|-reduced]-sNN.png and <out>/matrix.json (console errors, tier, draw calls).
 *
 * Usage: node scripts/capture-matrix.mjs --url http://localhost:4173/ --out work/001-x/captures [--sections 3] [--viewports phone,laptop]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from './lib/args.mjs';
import { launch, VIEWPORTS, waitForStage, watchConsole, withQuery } from './lib/browser.mjs';

const a = parseArgs();
const url = a.url ?? 'http://localhost:4173/';
const out = a.out ?? 'artifacts/captures';
const settle = Number( a.settle ?? 2600 );
const names = ( a.viewports ?? Object.keys( VIEWPORTS ).join( ',' ) ).split( ',' );
mkdirSync( out, { recursive: true } );

const browser = await launch();
const report = { url, capturedAt: new Date().toISOString(), runs: [] };
let failed = false;

for ( const name of names ) {

	for ( const mode of [ 'webgl', 'reduced', 'static' ] ) {

		const ctx = await browser.newContext( { ...VIEWPORTS[ name ], reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' } );
		const page = await ctx.newPage();
		const errors = watchConsole( page );
		await page.goto( withQuery( url, mode === 'static' ? { static: 1 } : {} ), { waitUntil: 'networkidle' } );
		const run = { viewport: name, mode, shots: [], errors };

		if ( mode === 'static' ) {

			const file = `${name}-static.png`;
			await page.screenshot( { path: join( out, file ), fullPage: true } );
			run.shots.push( file );
			run.webgl = await page.evaluate( () => document.documentElement.classList.contains( 'is-webgl' ) );

		} else {

			const staged = await waitForStage( page );
			await page.waitForTimeout( settle );
			const count = Number( a.sections ?? ( await page.evaluate( () => document.querySelectorAll( '[data-section]' ).length ) ) );
			run.stats = staged ? await page.evaluate( () => window.__atelier.stats() ) : null;

			for ( let i = 0; i < count; i ++ ) {

				if ( i > 0 ) {

					await page.keyboard.press( 'ArrowDown' );
					await page.waitForTimeout( settle );

				}

				const file = `${name}${mode === 'reduced' ? '-reduced' : ''}-s${String( i ).padStart( 2, '0' )}.png`;
				await page.screenshot( { path: join( out, file ) } );
				run.shots.push( file );

			}

		}

		if ( errors.length ) failed = true;
		report.runs.push( run );
		console.log( `${name.padEnd( 8 )} ${mode.padEnd( 8 )} ${run.shots.length} shots, tier ${run.stats?.tier ?? '-'}, ${errors.length} console errors` );
		await ctx.close();

	}

}

await browser.close();
writeFileSync( join( out, 'matrix.json' ), JSON.stringify( report, null, 2 ) + '\n' );
if ( failed ) {

	console.error( 'capture-matrix: console errors found, see matrix.json' );
	process.exit( 1 );

}
