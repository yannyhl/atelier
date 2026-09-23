#!/usr/bin/env node
/**
 * Batch image generation through Codex's built-in image tool (uses the ChatGPT login; no API key).
 * Each prompt file becomes one image: prompts/<name>.txt -> assets/<name>.png. Runs N jobs in parallel,
 * never overwrites an existing image (delete or bump the name to regenerate), and records a manifest.
 *
 * Usage: node scripts/imagegen-batch.mjs --dir work/002-test-launch/concepts [--parallel 3] [--only name1,name2]
 * Optional per prompt: prompts/<name>.ref (a path to a reference image, one per line) for identity-preserving edits.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from './lib/args.mjs';

const a = parseArgs();
if ( ! a.dir ) {

	console.error( 'imagegen-batch: --dir is required' );
	process.exit( 2 );

}

const dir = resolve( a.dir );
const only = a.only ? String( a.only ).split( ',' ) : null;
const parallel = Number( a.parallel ?? 3 );
const jobs = readdirSync( join( dir, 'prompts' ) )
	.filter( ( f ) => f.endsWith( '.txt' ) )
	.map( ( f ) => f.replace( /\.txt$/, '' ) )
	.filter( ( n ) => ! only || only.includes( n ) )
	.filter( ( n ) => ! existsSync( join( dir, 'assets', `${n}.png` ) ) );

const run = ( name ) => new Promise( ( done ) => {

	const prompt = readFileSync( join( dir, 'prompts', `${name}.txt` ), 'utf8' ).trim();
	const refFile = join( dir, 'prompts', `${name}.ref` );
	const refs = existsSync( refFile ) ? readFileSync( refFile, 'utf8' ).split( '\n' ).map( ( s ) => s.trim() ).filter( Boolean ) : [];
	const out = join( dir, 'assets', `${name}.png` );
	const task = [
		'Generate exactly one image with your built-in image generation tool from the prompt below.',
		refs.length ? `Use these reference images for identity: ${refs.join( ', ' )}.` : '',
		`Save the final image as ${out} (copy it there from wherever the tool saves it). Do not create any other files.`,
		'Reply with only the saved path.',
		'',
		'PROMPT:',
		prompt,
	].filter( Boolean ).join( '\n' );
	const child = spawn( 'codex', [ 'exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-C', dir, task ], { stdio: [ 'ignore', 'pipe', 'pipe' ] } );
	let log = '';
	child.stdout.on( 'data', ( d ) => ( log += d ) );
	child.stderr.on( 'data', ( d ) => ( log += d ) );
	child.on( 'close', () => {

		const ok = existsSync( out );
		console.log( `${ok ? 'ok  ' : 'FAIL'} ${name}` );
		if ( ! ok ) console.log( log.split( '\n' ).slice( - 8 ).join( '\n' ) );
		done( ok );

	} );

} );

const queue = jobs.slice();
await Promise.all( Array.from( { length: Math.min( parallel, queue.length ) }, async () => {

	while ( queue.length ) await run( queue.shift() );

} ) );

// Manifest in the lurk convention: file, size, bytes, sha256, tool, prompt.
const manifest = readdirSync( join( dir, 'assets' ) ).filter( ( f ) => f.endsWith( '.png' ) ).map( ( f ) => {

	const buf = readFileSync( join( dir, 'assets', f ) );
	const name = f.replace( /\.png$/, '' );
	return {
		file: f,
		width: buf.readUInt32BE( 16 ),
		height: buf.readUInt32BE( 20 ),
		bytes: statSync( join( dir, 'assets', f ) ).size,
		sha256: createHash( 'sha256' ).update( buf ).digest( 'hex' ),
		tool: 'codex built-in image generation',
		prompt: `prompts/${name}.txt`,
	};

} );
writeFileSync( join( dir, 'asset-manifest.json' ), JSON.stringify( manifest, null, 2 ) + '\n' );
console.log( `manifest: ${manifest.length} images` );
