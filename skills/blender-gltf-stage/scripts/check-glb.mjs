#!/usr/bin/env node
/**
 * Budget and contract gate for the GLBs a stage ships. Reads only each file's JSON chunk.
 *
 * Fails (exit 1) when:
 *  - the `must` files (what AssetLoader blocks first render on) exceed --must-kb,
 *  - all files together exceed --total-kb,
 *  - a file requires a glTF extension AssetLoader cannot decode (Draco: no DRACOLoader is wired),
 *  - a set file (name matches --sets, default ^section_) lost `Camera` or `CameraTarget`
 *    (the default `gltf-transform optimize` prunes empty leaves and flattens, which does this).
 * Warns when geometry is not meshopt/quantized or textures are still PNG/JPEG.
 *
 * Usage:
 *   node check-glb.mjs --must public/scene/section_1.glb,public/scene/hero.glb \
 *     --sub public/scene/section_2.glb,public/scene/section_3.glb [--must-kb 600] [--total-kb 2500] \
 *     [--sets '^section_'] [--out work/NNN-slug/assets.json]
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

// three r186 GLTFLoader extensions, minus Draco (AssetLoader wires KTX2 and meshopt only).
const SUPPORTED = new Set( [
	'KHR_lights_punctual', 'KHR_materials_clearcoat', 'KHR_materials_dispersion', 'KHR_materials_ior', 'KHR_materials_sheen',
	'KHR_materials_specular', 'KHR_materials_transmission', 'KHR_materials_iridescence', 'KHR_materials_anisotropy',
	'KHR_materials_unlit', 'KHR_materials_volume', 'KHR_texture_basisu', 'KHR_texture_transform', 'KHR_mesh_quantization',
	'KHR_materials_emissive_strength', 'EXT_materials_bump', 'EXT_texture_webp', 'EXT_texture_avif',
	'EXT_meshopt_compression', 'KHR_meshopt_compression', 'EXT_mesh_gpu_instancing',
] );

const argv = process.argv.slice( 2 );
const opt = {};
for ( let i = 0; i < argv.length; i ++ ) if ( argv[ i ].startsWith( '--' ) ) opt[ argv[ i ].slice( 2 ) ] = argv[ ++ i ];
const list = ( s ) => ( s ? s.split( ',' ).map( ( x ) => x.trim() ).filter( Boolean ) : [] );
const must = list( opt.must );
const sub = list( opt.sub );
const mustKB = Number( opt[ 'must-kb' ] ?? 600 );
const totalKB = Number( opt[ 'total-kb' ] ?? 2500 );
const sets = new RegExp( opt.sets ?? '^section_' );

if ( ! must.length && ! sub.length ) {

	console.error( 'usage: node check-glb.mjs --must a.glb,b.glb --sub c.glb [--must-kb 600] [--total-kb 2500] [--sets ^section_] [--out file.json]' );
	process.exit( 2 );

}

const failures = [];
const warnings = [];

function readJson( file ) {

	const buf = readFileSync( file );
	if ( buf.readUInt32LE( 0 ) !== 0x46546c67 ) throw new Error( `${file}: not a GLB` );
	const len = buf.readUInt32LE( 12 );
	return JSON.parse( buf.subarray( 20, 20 + len ).toString( 'utf8' ).replace( /\0+$/, '' ) );

}

const rows = [ ...must.map( ( f ) => [ f, 'must' ] ), ...sub.map( ( f ) => [ f, 'sub' ] ) ].map( ( [ file, priority ] ) => {

	const bytes = statSync( file ).size;
	const gltf = readJson( file );
	const name = basename( file );
	const used = gltf.extensionsUsed ?? [];
	const required = gltf.extensionsRequired ?? [];
	const names = new Set( ( gltf.nodes ?? [] ).map( ( n ) => n.name ) );
	const images = ( gltf.images ?? [] ).map( ( img ) => img.mimeType ?? ( img.uri ?? '' ).split( '.' ).pop() );

	for ( const ext of required ) if ( ! SUPPORTED.has( ext ) ) failures.push( `${name}: requires ${ext}, which AssetLoader cannot decode` );
	for ( const ext of used ) if ( ! SUPPORTED.has( ext ) && ! required.includes( ext ) ) warnings.push( `${name}: uses ${ext}; three ignores it` );
	if ( sets.test( name ) ) for ( const n of [ 'Camera', 'CameraTarget' ] ) if ( ! names.has( n ) ) failures.push( `${name}: node "${n}" missing (shotFromScene contract)` );
	if ( ( gltf.meshes ?? [] ).length && ! used.some( ( e ) => /meshopt_compression|mesh_quantization/.test( e ) ) ) warnings.push( `${name}: geometry is not meshopt-compressed or quantized` );
	const raw = images.filter( ( m ) => /png|jpe?g/i.test( m ) ).length;
	if ( raw ) warnings.push( `${name}: ${raw} PNG/JPEG texture(s); compress to KTX2 (or WebP) before shipping` );

	return { file, priority, kb: Math.round( bytes / 1024 ), extensionsRequired: required, animations: ( gltf.animations ?? [] ).map( ( a ) => a.name ), images: images.length };

} );

const sum = ( p ) => rows.filter( ( r ) => ! p || r.priority === p ).reduce( ( s, r ) => s + r.kb, 0 );
const mustTotal = sum( 'must' );
const total = sum();
if ( mustTotal > mustKB ) failures.push( `must payload ${mustTotal} KB > ${mustKB} KB` );
if ( total > totalKB ) failures.push( `total payload ${total} KB > ${totalKB} KB` );

for ( const r of rows ) console.log( `${r.priority.padEnd( 5 )} ${String( r.kb ).padStart( 6 )} KB  ${r.file}${r.animations.length ? `  clips: ${r.animations.join( ' ' )}` : ''}` );
console.log( `must ${mustTotal}/${mustKB} KB, total ${total}/${totalKB} KB` );
warnings.forEach( ( w ) => console.log( `warn: ${w}` ) );
failures.forEach( ( f ) => console.error( `FAIL: ${f}` ) );

if ( opt.out ) writeFileSync( opt.out, JSON.stringify( { checkedAt: new Date().toISOString(), mustKB: mustTotal, totalKB: total, budgets: { mustKB, totalKB }, files: rows, warnings, failures }, null, 2 ) + '\n' );
process.exit( failures.length ? 1 : 0 );
