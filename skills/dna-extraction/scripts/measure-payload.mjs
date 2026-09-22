#!/usr/bin/env node
/**
 * Measures what a reference really ships by streaming every byte of each URL and counting it.
 * CDNs often omit Content-Length (or answer HEAD differently), so headers are not evidence; bytes are.
 * Each URL is fetched twice with a browser user agent: once with `accept-encoding: identity`
 * (decoded size) and once with `br, gzip` (transfer size, counted before decompression).
 * Nothing is written to disk except the optional JSON report.
 *
 * Flags `htmlFallback` when a non-HTML path answers with text/html: single-page-app hosts return
 * index.html with status 200 for missing files (for example a `.map` that does not exist).
 *
 * Usage:
 *   node measure-payload.mjs <url> [url...] [--list urls.txt] [--out payload.json] [--base https://site/]
 *   --list  one URL or site-relative path per line (# comments allowed)
 *   --base  resolves relative paths from --list or arguments
 */
import { readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

const argv = process.argv.slice( 2 );
const options = {};
let inputs = [];
for ( let i = 0; i < argv.length; i ++ ) {

	if ( argv[ i ].startsWith( '--' ) ) options[ argv[ i ].slice( 2 ) ] = argv[ ++ i ];
	else inputs.push( argv[ i ] );

}

const opt = ( name ) => options[ name ];
if ( opt( 'list' ) ) inputs.push( ...readFileSync( opt( 'list' ), 'utf8' ).split( '\n' ).map( ( l ) => l.replace( /#.*/, '' ).trim() ).filter( Boolean ) );
const base = opt( 'base' );
inputs = inputs.map( ( u ) => ( base ? new URL( u, base ).toString() : u ) );

if ( ! inputs.length ) {

	console.error( 'usage: node measure-payload.mjs <url> [url...] [--list file] [--base url] [--out file.json]' );
	process.exit( 2 );

}

/** Streams a URL, following redirects, and counts raw body bytes as they arrive on the wire. */
function count( url, encoding, redirects = 5 ) {

	return new Promise( ( resolve ) => {

		const lib = url.startsWith( 'https:' ) ? https : http;
		const req = lib.get( url, { headers: { 'user-agent': UA, 'accept-encoding': encoding, accept: '*/*' } }, ( res ) => {

			if ( res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0 ) {

				res.resume();
				resolve( count( new URL( res.headers.location, url ).toString(), encoding, redirects - 1 ) );
				return;

			}

			let bytes = 0;
			res.on( 'data', ( chunk ) => ( bytes += chunk.length ) );
			res.on( 'end', () => resolve( {
				url,
				status: res.statusCode,
				bytes,
				contentType: res.headers[ 'content-type' ] ?? null,
				contentEncoding: res.headers[ 'content-encoding' ] ?? null,
				contentLength: res.headers[ 'content-length' ] ? Number( res.headers[ 'content-length' ] ) : null,
				cacheControl: res.headers[ 'cache-control' ] ?? null,
			} ) );
			res.on( 'error', ( e ) => resolve( { url, error: e.message } ) );

		} );
		req.on( 'error', ( e ) => resolve( { url, error: e.message } ) );
		req.setTimeout( 60000, () => req.destroy( new Error( 'timeout' ) ) );

	} );

}

const rows = [];
for ( const url of inputs ) {

	const plain = await count( url, 'identity' );
	const packed = await count( url, 'br, gzip' );
	const path = new URL( url ).pathname;
	const htmlFallback = !! plain.contentType?.includes( 'text/html' ) && ! /(\.html?|\/)$/.test( path );
	const row = {
		url,
		status: plain.status ?? null,
		bytes: plain.bytes ?? null,
		transferBytes: packed.bytes ?? null,
		transferEncoding: packed.contentEncoding ?? null,
		contentType: plain.contentType ?? null,
		headerContentLength: plain.contentLength ?? null,
		cacheControl: plain.cacheControl ?? null,
		htmlFallback,
		error: plain.error ?? packed.error ?? undefined,
	};
	rows.push( row );
	const kb = ( b ) => ( b === null || b === undefined ? '?' : ( b / 1024 ).toFixed( 1 ).padStart( 9 ) );
	console.log( `${kb( row.bytes )} KB ${kb( row.transferBytes )} KB ${String( row.status ).padEnd( 4 )}${row.htmlFallback ? 'HTML-FALLBACK ' : ''}${row.error ? `ERROR ${row.error} ` : ''}${url}` );

}

const ok = rows.filter( ( r ) => ! r.error && ! r.htmlFallback && r.status < 400 );
const total = ok.reduce( ( s, r ) => s + r.bytes, 0 );
const transfer = ok.reduce( ( s, r ) => s + r.transferBytes, 0 );
console.log( `total ${( total / 1024 ).toFixed( 1 )} KB decoded, ${( transfer / 1024 ).toFixed( 1 )} KB transferred over ${ok.length} of ${rows.length} URLs` );

if ( opt( 'out' ) ) {

	const report = {
		measuredAt: new Date().toISOString().slice( 0, 10 ),
		note: 'Bytes streamed per URL. bytes = identity encoding, transferBytes = br/gzip as served. HTML fallbacks and errors are excluded from totals.',
		totalBytes: total,
		totalTransferBytes: transfer,
		assets: rows,
	};
	writeFileSync( opt( 'out' ), JSON.stringify( report, null, 2 ) + '\n' );
	console.log( `wrote ${opt( 'out' )}` );

}
