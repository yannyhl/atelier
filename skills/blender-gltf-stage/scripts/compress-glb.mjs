#!/usr/bin/env node
/**
 * Compresses a Blender-exported GLB for the stage with @gltf-transform/cli 4.5 (repo devDependency),
 * using a flag set that keeps every named node the code looks up.
 *
 * Why not plain `gltf-transform optimize`: its defaults flatten the hierarchy, join named meshes,
 * build palettes and prune empty leaf nodes, which silently deletes `CameraTarget` and `Anchor`
 * (shotFromScene then falls back to a target at the origin without any error).
 *
 * Steps: optimize (dedup, weld, simplify, resample; no flatten/join/palette/instance/prune)
 *  -> prune --keep-leaves true -> resize -> textures (KTX2: UASTC for normal/occlusion/metalRough,
 *  ETC1S for the rest; or WebP) -> meshopt. Then verifies no named node was lost.
 *
 * KTX2 needs the `ktx` binary from KTX-Software 4.4+ (https://github.com/KhronosGroup/KTX-Software/releases).
 *
 * Usage:
 *   node compress-glb.mjs in.glb out.glb [--textures auto|ktx2|webp|none] [--max 1024] [--instance]
 *   --textures auto  KTX2 when `ktx` is installed, otherwise WebP with a warning (default)
 *   --max            largest texture edge in pixels (default 1024; 2048 only for a hero seen close up)
 *   --instance       allow GPU instancing of 5+ copies (merges their nodes; only for anonymous props)
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice( 2 );
const pos = [];
const opt = {};
for ( let i = 0; i < argv.length; i ++ ) {

	if ( argv[ i ] === '--instance' ) opt.instance = true;
	else if ( argv[ i ].startsWith( '--' ) ) opt[ argv[ i ].slice( 2 ) ] = argv[ ++ i ];
	else pos.push( argv[ i ] );

}

const [ input, output ] = pos;
if ( ! input || ! output || ! output.endsWith( '.glb' ) ) {

	console.error( 'usage: node compress-glb.mjs in.glb out.glb [--textures auto|ktx2|webp|none] [--max 1024] [--instance]' );
	process.exit( 2 );

}

const here = dirname( fileURLToPath( import.meta.url ) );
const local = resolve( here, '../../../node_modules/.bin/gltf-transform' );
const bin = existsSync( local ) ? [ local ] : [ 'npx', '--yes', '@gltf-transform/cli@4.5.0' ];
const max = String( Number( opt.max ?? 1024 ) );
const hasKtx = spawnSync( 'ktx', [ '--version' ], { encoding: 'utf8' } ).status === 0;
let textures = opt.textures ?? 'auto';
if ( textures === 'auto' ) {

	textures = hasKtx ? 'ktx2' : 'webp';
	if ( ! hasKtx ) console.warn( 'compress-glb: `ktx` not found, using WebP (small download, full-size in VRAM). Install KTX-Software 4.4+ for KTX2.' );

}

if ( textures === 'ktx2' && ! hasKtx ) {

	console.error( 'compress-glb: --textures ktx2 needs `ktx` from KTX-Software 4.4+: https://github.com/KhronosGroup/KTX-Software/releases' );
	process.exit( 1 );

}

const work = mkdtempSync( join( tmpdir(), 'compress-glb-' ) );
let step = 0;
let current = input;
const run = ( command, ...args ) => {

	const next = join( work, `${++ step}-${command}.glb` );
	const r = spawnSync( bin[ 0 ], [ ...bin.slice( 1 ), command, current, next, ...args ], { encoding: 'utf8' } );
	if ( r.status !== 0 ) {

		console.error( `compress-glb: ${command} failed\n${r.stdout}\n${r.stderr}` );
		rmSync( work, { recursive: true, force: true } );
		process.exit( 1 );

	}

	console.log( `${command.padEnd( 9 )} ${( statSync( next ).size / 1024 ).toFixed( 1 ).padStart( 8 )} KB` );
	current = next;

};

const nodeNames = ( file ) => {

	const b = readFileSync( file );
	const json = JSON.parse( b.subarray( 20, 20 + b.readUInt32LE( 12 ) ).toString( 'utf8' ).replace( /\0+$/, '' ) );
	return new Set( ( json.nodes ?? [] ).map( ( n ) => n.name ).filter( Boolean ) );

};

console.log( `input     ${( statSync( input ).size / 1024 ).toFixed( 1 ).padStart( 8 )} KB  ${input}` );
run( 'optimize',
	'--compress', 'false', '--texture-compress', 'false',
	'--flatten', 'false', '--join', 'false', '--palette', 'false', '--prune', 'false',
	'--instance', opt.instance ? 'true' : 'false' );
run( 'prune', '--keep-leaves', 'true' );
if ( textures !== 'none' ) run( 'resize', '--width', max, '--height', max );
if ( textures === 'ktx2' ) {

	run( 'resize', '--power-of-two', 'nearest' );
	run( 'uastc', '--slots', '{normalTexture,occlusionTexture,metallicRoughnessTexture}', '--level', '4', '--rdo', '--rdo-lambda', '4', '--zstd', '18' );
	run( 'etc1s', '--quality', '255' );

} else if ( textures === 'webp' ) {

	run( 'webp' );

}

run( 'meshopt', '--level', 'high' );

const before = nodeNames( input );
const after = nodeNames( current );
const lost = [ ...before ].filter( ( n ) => ! after.has( n ) );

copyFileSync( current, output );
rmSync( work, { recursive: true, force: true } );
console.log( `output    ${( statSync( output ).size / 1024 ).toFixed( 1 ).padStart( 8 )} KB  ${output} (textures: ${textures})` );

if ( lost.length ) {

	console.error( `compress-glb: named nodes lost: ${lost.join( ', ' )}` );
	process.exit( 1 );

}
