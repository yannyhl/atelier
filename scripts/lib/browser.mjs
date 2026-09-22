import { chromium } from 'playwright';

/**
 * Chromium with the real GPU. Headless Chromium on macOS renders WebGL through ANGLE/Metal,
 * so captures and audits see the same pipeline a visitor does. On Linux CI it falls back to
 * SwiftShader, which the stage probes as tier 1: pin `?tier=` there if you need a specific tier.
 */
export async function launch( { headed = false } = {} ) {

	const args = [ '--ignore-gpu-blocklist', '--enable-gpu-rasterization' ];
	if ( process.platform === 'darwin' ) args.push( '--use-angle=metal' );
	return chromium.launch( { headless: ! headed, args } );

}

export const VIEWPORTS = {
	phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
	tablet: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
	laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
	desktop: { viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 },
};

export function withQuery( url, params ) {

	const u = new URL( url );
	for ( const [ k, v ] of Object.entries( params ) ) if ( v !== undefined && v !== null ) u.searchParams.set( k, String( v ) );
	return u.toString();

}

/** Collect console errors and page errors (ignores Vite HMR chatter). */
export function watchConsole( page ) {

	const errors = [];
	page.on( 'console', ( m ) => {

		if ( ( m.type() === 'error' || m.type() === 'warning' ) && ! m.text().includes( '[vite]' ) ) errors.push( `${m.type()}: ${m.text()}` );

	} );
	page.on( 'pageerror', ( e ) => errors.push( `pageerror: ${e.message}` ) );
	page.on( 'response', ( r ) => {

		if ( r.status() >= 400 ) errors.push( `http ${r.status()}: ${r.url()}` );

	} );
	return errors;

}

/** Resolves when the stage says it is ready, or returns false for a static page. */
export async function waitForStage( page, timeout = 30000 ) {

	return page.evaluate( async ( t ) => {

		const until = Date.now() + t;
		while ( ! window.__atelier && Date.now() < until ) await new Promise( ( r ) => setTimeout( r, 50 ) );
		if ( ! window.__atelier ) return false;
		await Promise.race( [ window.__atelier.ready, new Promise( ( r ) => setTimeout( r, t ) ) ] );
		return true;

	}, timeout );

}
