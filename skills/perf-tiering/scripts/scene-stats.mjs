#!/usr/bin/env node
/**
 * Per-tier, per-section scene cost from `window.__atelier.stats()`: draw calls, triangles,
 * textures, geometries and shader programs, with optional hard limits.
 *
 * For each requested tier it loads `<url>?tier=N`, waits for the stage, then walks every
 * `[data-section]` with ArrowDown and samples stats after each move settles.
 * Draw calls include the post chain (bloom levels, composite, AA), so they differ per tier.
 *
 * Usage:
 *   node scene-stats.mjs --url http://localhost:4173/ [--tiers 1,2,3] [--viewport laptop]
 *     [--settle 2600] [--max-calls 60] [--max-triangles 300000] [--out stats.json]
 *
 * Prints one JSON document; exits 1 if a limit is exceeded, the page falls back to static,
 * the stage ends on a different tier than requested, or the console shows errors.
 * Needs the atelier checkout (it imports scripts/lib/browser.mjs and its Playwright);
 * run it from the repo or through the skill symlink that install-skills creates.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

let lib;
try {

	lib = await import( new URL( '../../../scripts/lib/browser.mjs', import.meta.url ) );

} catch ( error ) {

	console.error( `scene-stats: cannot load the atelier browser helpers (${error.message}).\nRun this script from an atelier checkout, or through the symlink created by npm run install-skills.` );
	process.exit( 2 );

}

const { parseArgs } = await import( new URL( '../../../scripts/lib/args.mjs', import.meta.url ) );
const { launch, VIEWPORTS, waitForStage, watchConsole, withQuery } = lib;

const a = parseArgs();
const url = a.url ?? 'http://localhost:4173/';
const tiers = String( a.tiers ?? '1,2,3' ).split( ',' ).map( Number );
const viewportName = a.viewport ?? 'laptop';
const settle = Number( a.settle ?? 2600 );
const maxCalls = a[ 'max-calls' ] === undefined ? Infinity : Number( a[ 'max-calls' ] );
const maxTriangles = a[ 'max-triangles' ] === undefined ? Infinity : Number( a[ 'max-triangles' ] );

if ( ! VIEWPORTS[ viewportName ] ) {

	console.error( `scene-stats: unknown --viewport ${viewportName} (use ${Object.keys( VIEWPORTS ).join( ', ' )})` );
	process.exit( 2 );

}

const browser = await launch();
const report = { url, viewport: viewportName, measuredAt: new Date().toISOString(), runs: [], failures: [] };

for ( const tier of tiers ) {

	const ctx = await browser.newContext( VIEWPORTS[ viewportName ] );
	const page = await ctx.newPage();
	const errors = watchConsole( page );
	await page.goto( withQuery( url, { tier } ), { waitUntil: 'networkidle' } );
	const staged = await waitForStage( page );
	const run = { requestedTier: tier, webgl: staged, sections: [], errors };

	if ( ! staged ) {

		report.failures.push( `tier ${tier}: no stage on the page (static fallback)` );
		report.runs.push( run );
		await ctx.close();
		continue;

	}

	await page.waitForTimeout( settle );
	// Scope to body: SectionDirector also mirrors the current section onto <html data-section>.
	const count = await page.evaluate( () => document.body.querySelectorAll( '[data-section]' ).length );

	for ( let i = 0; i < count; i ++ ) {

		if ( i > 0 ) {

			await page.keyboard.press( 'ArrowDown' );
			await page.waitForTimeout( settle );

		}

		const s = await page.evaluate( () => window.__atelier?.stats() ?? null );
		if ( ! s ) {

			report.failures.push( `tier ${tier}: stage disappeared at section ${i} (fallback or context loss)` );
			break;

		}

		const row = {
			section: i, tier: s.tier, calls: s.calls, triangles: s.triangles, textures: s.textures,
			geometries: s.geometries, programs: s.programs, pixels: `${s.viewport.pixelWidth}x${s.viewport.pixelHeight}`, dpr: s.viewport.dpr,
		};
		run.sections.push( row );
		if ( s.tier !== tier ) report.failures.push( `tier ${tier}: stage is on tier ${s.tier} at section ${i} (?tier=N should pin it; check stats().probe.forced)` );
		if ( s.calls > maxCalls ) report.failures.push( `tier ${tier} section ${i}: ${s.calls} draw calls > ${maxCalls}` );
		if ( s.triangles > maxTriangles ) report.failures.push( `tier ${tier} section ${i}: ${s.triangles} triangles > ${maxTriangles}` );

	}

	run.renderer = await page.evaluate( () => window.__atelier?.stats().probe.renderer ?? null );
	if ( errors.length ) report.failures.push( `tier ${tier}: ${errors.length} console errors` );
	report.runs.push( run );
	await ctx.close();

}

await browser.close();

const json = JSON.stringify( report, null, 2 ) + '\n';
if ( a.out ) {

	mkdirSync( dirname( a.out ), { recursive: true } );
	writeFileSync( a.out, json );

}

process.stdout.write( json );
process.exit( report.failures.length ? 1 : 0 );
