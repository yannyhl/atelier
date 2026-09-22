#!/usr/bin/env node
/**
 * Prints what a .glb contains without loading it into three.js or writing it to disk:
 * generator, extensions, node tree (cameras, meshes, skins), meshes with triangle counts,
 * materials with their extensions and texture slots, images with sizes, skins and animations.
 *
 * Only the GLB header and JSON chunk are read, so a URL is fetched just far enough to parse
 * the JSON (the stream is then cancelled) and a local file is never copied anywhere.
 * Use it to study a reference's scenes as evidence; never commit the reference file itself.
 *
 * Usage:
 *   node glb-info.mjs <file.glb | https://host/scene.glb> [--json] [--full]
 *   --json  print one JSON object (for evidence/payload.json)
 *   --full  also stream the rest of a URL to report its exact byte size
 */
import { open, stat } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const MAGIC = 0x46546c67; // 'glTF'
const JSON_CHUNK = 0x4e4f534a; // 'JSON'

const args = process.argv.slice( 2 );
const source = args.find( ( a ) => ! a.startsWith( '--' ) );
const asJson = args.includes( '--json' );
const full = args.includes( '--full' );

if ( ! source ) {

	console.error( 'usage: node glb-info.mjs <file.glb | url> [--json] [--full]' );
	process.exit( 2 );

}

/** Reads the first `n` bytes of a file or URL. Returns { head, totalBytes }. */
async function readHead( src, need ) {

	if ( /^https?:\/\//.test( src ) ) {

		const res = await fetch( src, { headers: { 'user-agent': UA, 'accept-encoding': 'identity' } } );
		if ( ! res.ok ) throw new Error( `HTTP ${res.status} for ${src}` );
		const type = res.headers.get( 'content-type' ) ?? '';
		if ( type.includes( 'text/html' ) ) throw new Error( `${src} returned HTML (SPA fallback or error page), not a GLB` );

		const reader = res.body.getReader();
		const parts = [];
		let got = 0;
		let want = need( null );
		while ( got < want ) {

			const { done, value } = await reader.read();
			if ( done ) break;
			parts.push( value );
			got += value.length;
			if ( got >= 20 && want === Infinity ) want = need( Buffer.concat( parts ) );

		}

		let total = Number( res.headers.get( 'content-length' ) ) || null;
		if ( full ) {

			let rest = got;
			for ( ;; ) {

				const { done, value } = await reader.read();
				if ( done ) break;
				rest += value.length;

			}

			total = rest;

		} else {

			await reader.cancel();

		}

		return { head: Buffer.concat( parts ), totalBytes: total };

	}

	const fh = await open( src, 'r' );
	try {

		const size = ( await stat( src ) ).size;
		const first = Buffer.alloc( Math.min( 20, size ) );
		await fh.read( first, 0, first.length, 0 );
		const want = Math.min( size, need( first ) );
		const head = Buffer.alloc( want );
		await fh.read( head, 0, want, 0 );
		return { head, totalBytes: size };

	} finally {

		await fh.close();

	}

}

/** Given at least 20 bytes, how many bytes cover header + JSON chunk. */
const needed = ( buf ) => {

	if ( ! buf || buf.length < 20 ) return Infinity;
	if ( buf.readUInt32LE( 0 ) !== MAGIC ) throw new Error( 'not a binary glTF (bad magic)' );
	return 20 + buf.readUInt32LE( 12 );

};

let head, totalBytes;
try {

	( { head, totalBytes } = await readHead( source, needed ) );

} catch ( error ) {

	console.error( `glb-info: ${error.message}` );
	process.exit( 1 );

}

if ( head.readUInt32LE( 0 ) !== MAGIC ) throw new Error( 'not a binary glTF (bad magic)' );
const version = head.readUInt32LE( 4 );
const declaredLength = head.readUInt32LE( 8 );
const jsonLength = head.readUInt32LE( 12 );
if ( head.readUInt32LE( 16 ) !== JSON_CHUNK ) throw new Error( 'first chunk is not JSON' );
const gltf = JSON.parse( head.subarray( 20, 20 + jsonLength ).toString( 'utf8' ).replace( /\0+$/, '' ) );

/* ---------- derive a compact report ---------- */

const acc = gltf.accessors ?? [];
const views = gltf.bufferViews ?? [];
const nodes = gltf.nodes ?? [];

const triangles = ( prim ) => {

	const mode = prim.mode ?? 4;
	const count = prim.indices !== undefined ? acc[ prim.indices ]?.count : acc[ prim.attributes?.POSITION ]?.count;
	if ( count === undefined ) return 0;
	if ( mode === 4 ) return Math.floor( count / 3 );
	if ( mode === 5 || mode === 6 ) return Math.max( 0, count - 2 );
	return 0;

};

const texSlots = ( m ) => {

	const slots = [];
	const pbr = m.pbrMetallicRoughness ?? {};
	if ( pbr.baseColorTexture ) slots.push( 'baseColor' );
	if ( pbr.metallicRoughnessTexture ) slots.push( 'metallicRoughness' );
	if ( m.normalTexture ) slots.push( 'normal' );
	if ( m.occlusionTexture ) slots.push( 'occlusion' );
	if ( m.emissiveTexture ) slots.push( 'emissive' );
	for ( const [ ext, v ] of Object.entries( m.extensions ?? {} ) ) {

		for ( const key of Object.keys( v ) ) if ( /Texture$/.test( key ) ) slots.push( `${ext}.${key}` );

	}

	return slots;

};

const duration = ( anim ) => {

	let max = 0;
	for ( const s of anim.samplers ?? [] ) {

		const a = acc[ s.input ];
		if ( a?.max?.[ 0 ] !== undefined ) max = Math.max( max, a.max[ 0 ] );

	}

	return Math.round( max * 1000 ) / 1000;

};

const parents = new Map();
nodes.forEach( ( n, i ) => ( n.children ?? [] ).forEach( ( c ) => parents.set( c, i ) ) );

const describeNode = ( i ) => {

	const n = nodes[ i ];
	const tags = [];
	if ( n.mesh !== undefined ) tags.push( `mesh:${gltf.meshes[ n.mesh ]?.name ?? n.mesh}` );
	if ( n.camera !== undefined ) {

		const c = gltf.cameras[ n.camera ];
		tags.push( c.type === 'perspective' ? `camera yfov ${( c.perspective.yfov * 180 / Math.PI ).toFixed( 1 )}deg` : `camera ${c.type}` );

	}

	if ( n.skin !== undefined ) tags.push( `skin:${n.skin}` );
	if ( n.extensions ) tags.push( ...Object.keys( n.extensions ) );
	if ( n.extras && Object.keys( n.extras ).length ) tags.push( `extras:${Object.keys( n.extras ).join( ',' )}` );
	return { index: i, name: n.name ?? `(node ${i})`, tags };

};

const tree = [];
const walk = ( i, depth ) => {

	tree.push( { depth, ...describeNode( i ) } );
	( nodes[ i ].children ?? [] ).forEach( ( c ) => walk( c, depth + 1 ) );

};

const sceneRoots = ( gltf.scenes?.[ gltf.scene ?? 0 ]?.nodes ) ?? nodes.map( ( _, i ) => i ).filter( ( i ) => ! parents.has( i ) );
sceneRoots.forEach( ( i ) => walk( i, 0 ) );

const report = {
	source,
	bytes: totalBytes,
	glbVersion: version,
	declaredLength,
	jsonBytes: jsonLength,
	generator: gltf.asset?.generator ?? null,
	extensionsUsed: gltf.extensionsUsed ?? [],
	extensionsRequired: gltf.extensionsRequired ?? [],
	counts: {
		nodes: nodes.length, meshes: gltf.meshes?.length ?? 0, materials: gltf.materials?.length ?? 0,
		textures: gltf.textures?.length ?? 0, images: gltf.images?.length ?? 0, skins: gltf.skins?.length ?? 0,
		animations: gltf.animations?.length ?? 0, cameras: gltf.cameras?.length ?? 0,
	},
	triangles: ( gltf.meshes ?? [] ).reduce( ( s, m ) => s + m.primitives.reduce( ( t, p ) => t + triangles( p ), 0 ), 0 ),
	meshes: ( gltf.meshes ?? [] ).map( ( m ) => ( {
		name: m.name ?? null,
		primitives: m.primitives.length,
		triangles: m.primitives.reduce( ( t, p ) => t + triangles( p ), 0 ),
		attributes: [ ...new Set( m.primitives.flatMap( ( p ) => Object.keys( p.attributes ) ) ) ],
		morphTargets: m.primitives[ 0 ]?.targets?.length ?? 0,
		compressed: [ ...new Set( m.primitives.flatMap( ( p ) => Object.keys( p.extensions ?? {} ) ) ) ],
	} ) ),
	materials: ( gltf.materials ?? [] ).map( ( m ) => ( {
		name: m.name ?? null,
		extensions: Object.keys( m.extensions ?? {} ),
		textures: texSlots( m ),
		alphaMode: m.alphaMode ?? 'OPAQUE',
		doubleSided: !! m.doubleSided,
	} ) ),
	images: ( gltf.images ?? [] ).map( ( img ) => ( {
		name: img.name ?? null,
		mimeType: img.mimeType ?? ( img.uri?.startsWith( 'data:' ) ? img.uri.slice( 5, img.uri.indexOf( ';' ) ) : null ),
		uri: img.uri && ! img.uri.startsWith( 'data:' ) ? img.uri : undefined,
		bytes: img.bufferView !== undefined ? views[ img.bufferView ]?.byteLength ?? null : null,
	} ) ),
	skins: ( gltf.skins ?? [] ).map( ( s ) => ( { name: s.name ?? null, joints: s.joints.length } ) ),
	animations: ( gltf.animations ?? [] ).map( ( a ) => ( { name: a.name ?? null, channels: a.channels.length, seconds: duration( a ) } ) ),
	nodeTree: tree,
};

if ( asJson ) {

	console.log( JSON.stringify( report, null, 2 ) );
	process.exit( 0 );

}

const kb = ( b ) => ( b === null || b === undefined ? '?' : `${( b / 1024 ).toFixed( 1 )} KB` );
console.log( `${source}` );
console.log( `  size ${kb( report.bytes )}, JSON ${kb( jsonLength )}, generator ${report.generator}` );
console.log( `  extensionsUsed ${report.extensionsUsed.join( ', ' ) || '-'}${report.extensionsRequired.length ? `; required ${report.extensionsRequired.join( ', ' )}` : ''}` );
console.log( `  ${Object.entries( report.counts ).map( ( [ k, v ] ) => `${k} ${v}` ).join( ', ' )}, triangles ${report.triangles}` );
console.log( '\nnodes' );
for ( const n of tree ) console.log( `  ${'  '.repeat( n.depth )}${n.name}${n.tags.length ? `  [${n.tags.join( '; ' )}]` : ''}` );
if ( report.meshes.length ) {

	console.log( '\nmeshes' );
	for ( const m of report.meshes ) console.log( `  ${m.name}: ${m.triangles} tris, ${m.primitives} prim, ${m.attributes.join( ' ' )}${m.morphTargets ? `, ${m.morphTargets} morphs` : ''}${m.compressed.length ? `, ${m.compressed.join( ' ' )}` : ''}` );

}

if ( report.materials.length ) {

	console.log( '\nmaterials' );
	for ( const m of report.materials ) console.log( `  ${m.name}: ${m.textures.join( ' ' ) || 'no textures'}${m.extensions.length ? ` | ${m.extensions.join( ' ' )}` : ''}${m.alphaMode !== 'OPAQUE' ? ` | ${m.alphaMode}` : ''}` );

}

if ( report.images.length ) {

	console.log( '\nimages' );
	for ( const i of report.images ) console.log( `  ${i.name ?? '-'}: ${i.mimeType ?? '?'} ${i.uri ?? ''} ${kb( i.bytes )}` );

}

if ( report.skins.length ) console.log( '\nskins\n' + report.skins.map( ( s ) => `  ${s.name}: ${s.joints} joints` ).join( '\n' ) );
if ( report.animations.length ) console.log( '\nanimations\n' + report.animations.map( ( a ) => `  ${a.name}: ${a.seconds}s, ${a.channels} channels` ).join( '\n' ) );
