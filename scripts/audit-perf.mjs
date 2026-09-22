#!/usr/bin/env node
/**
 * Performance audit against scripts/budgets.json (or --budgets path).
 * For each profile: CPU throttling via CDP, load the page, record FCP, CLS, long tasks and transfer
 * sizes, then walk every section with the keyboard while sampling requestAnimationFrame intervals.
 * CPU throttling does not slow the GPU, so treat GPU-bound numbers from a fast machine as optimistic
 * and confirm on a real low-end phone before calling a budget met.
 *
 * Usage: node scripts/audit-perf.mjs --url http://localhost:4173/ [--out work/001-x/perf.json] [--budgets file]
 * Run it against a production build (vite build && vite preview), never the dev server.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from './lib/args.mjs';
import { launch, VIEWPORTS, waitForStage, watchConsole } from './lib/browser.mjs';

const a = parseArgs();
const url = a.url ?? 'http://localhost:4173/';
const budgets = JSON.parse( readFileSync( a.budgets ?? new URL( './budgets.json', import.meta.url ), 'utf8' ) );
const browser = await launch();
const results = { url, auditedAt: new Date().toISOString(), profiles: {}, failures: [] };

for ( const [ name, prof ] of Object.entries( budgets.profiles ) ) {

	const ctx = await browser.newContext( VIEWPORTS[ prof.viewport ] );
	const page = await ctx.newPage();
	const errors = watchConsole( page );
	const cdp = await ctx.newCDPSession( page );
	await cdp.send( 'Emulation.setCPUThrottlingRate', { rate: prof.cpuThrottle } );

	await page.addInitScript( () => {

		window.__perf = { cls: 0, longTasks: [], fcp: null, frames: [] };
		new PerformanceObserver( ( l ) => l.getEntries().forEach( ( e ) => { if ( ! e.hadRecentInput ) window.__perf.cls += e.value; } ) ).observe( { type: 'layout-shift', buffered: true } );
		new PerformanceObserver( ( l ) => l.getEntries().forEach( ( e ) => window.__perf.longTasks.push( Math.round( e.duration ) ) ) ).observe( { type: 'longtask', buffered: true } );
		new PerformanceObserver( ( l ) => l.getEntries().forEach( ( e ) => { if ( e.name === 'first-contentful-paint' ) window.__perf.fcp = e.startTime; } ) ).observe( { type: 'paint', buffered: true } );

	} );

	await page.goto( url, { waitUntil: 'networkidle' } );
	const staged = await waitForStage( page, 60000 );
	await page.waitForTimeout( 1500 );

	const sections = await page.evaluate( () => document.querySelectorAll( 'body [data-section]' ).length );
	await page.evaluate( () => {

		const f = window.__perf.frames;
		let last = performance.now();
		const tick = ( now ) => {

			f.push( now - last );
			last = now;
			if ( ! window.__perf.stop ) requestAnimationFrame( tick );

		};
		requestAnimationFrame( tick );

	} );

	for ( let i = 1; i < sections; i ++ ) {

		await page.keyboard.press( 'ArrowDown' );
		await page.waitForTimeout( 2500 );

	}

	await page.waitForTimeout( 1000 );
	const perf = await page.evaluate( () => {

		window.__perf.stop = true;
		const res = performance.getEntriesByType( 'resource' );
		const nav = performance.getEntriesByType( 'navigation' )[ 0 ];
		const total = res.reduce( ( s, r ) => s + ( r.transferSize || 0 ), nav?.transferSize ?? 0 );
		const js = res.filter( ( r ) => r.initiatorType === 'script' || r.name.endsWith( '.js' ) ).reduce( ( s, r ) => s + ( r.transferSize || 0 ), 0 );
		return { ...window.__perf, totalTransfer: total, jsTransfer: js, stats: window.__atelier?.stats() ?? null };

	} );

	const frames = perf.frames.slice( 5 ).sort( ( x, y ) => x - y );
	const pct = ( p ) => frames.length ? Math.round( frames[ Math.min( frames.length - 1, Math.floor( frames.length * p ) ) ] * 10 ) / 10 : null;
	const r = {
		cpuThrottle: prof.cpuThrottle, viewport: prof.viewport, webgl: staged, tier: perf.stats?.tier ?? 0, renderer: perf.stats?.probe?.renderer,
		drawCalls: perf.stats?.calls, triangles: perf.stats?.triangles, frames: frames.length, frameP50Ms: pct( 0.5 ), frameP95Ms: pct( 0.95 ),
		fcpMs: perf.fcp && Math.round( perf.fcp ), cls: Math.round( perf.cls * 1000 ) / 1000, longTasks: perf.longTasks,
		totalTransferKB: Math.round( perf.totalTransfer / 1024 ), jsTransferKB: Math.round( perf.jsTransfer / 1024 ), consoleErrors: errors,
	};
	results.profiles[ name ] = r;

	const fail = ( what ) => results.failures.push( `${name}: ${what}` );
	if ( r.frameP95Ms !== null && r.frameP95Ms > prof.frameP95Ms ) fail( `frame p95 ${r.frameP95Ms} ms > ${prof.frameP95Ms}` );
	if ( staged && r.tier < prof.tierMin ) fail( `tier ${r.tier} < ${prof.tierMin}` );
	if ( r.fcpMs > budgets.page.fcpMs * Math.max( 1, prof.cpuThrottle / 2 ) ) fail( `FCP ${r.fcpMs} ms` );
	if ( r.cls > budgets.page.cls ) fail( `CLS ${r.cls}` );
	if ( r.totalTransferKB > budgets.page.totalTransferKB ) fail( `transfer ${r.totalTransferKB} KB` );
	if ( r.jsTransferKB > budgets.page.jsTransferKB ) fail( `JS ${r.jsTransferKB} KB` );
	if ( r.longTasks.filter( ( t ) => t > 200 ).length > budgets.page.longTasksOver200ms ) fail( `long tasks ${r.longTasks.join( ',' )}` );
	if ( errors.length ) fail( `${errors.length} console errors` );

	console.log( `${name.padEnd( 10 )} tier ${r.tier} p50 ${r.frameP50Ms}ms p95 ${r.frameP95Ms}ms fcp ${r.fcpMs}ms cls ${r.cls} js ${r.jsTransferKB}KB total ${r.totalTransferKB}KB calls ${r.drawCalls}` );
	await ctx.close();

}

await browser.close();
if ( a.out ) {

	mkdirSync( dirname( a.out ), { recursive: true } );
	writeFileSync( a.out, JSON.stringify( results, null, 2 ) + '\n' );

}

if ( results.failures.length ) {

	console.error( 'budget failures:\n  ' + results.failures.join( '\n  ' ) );
	process.exit( 1 );

}

console.log( 'all budgets met' );
