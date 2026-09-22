#!/usr/bin/env node
/**
 * Procedural lens-dirt texture for PostFX (`new PostFX( ..., dirt )` or `post.setDirt( tex )`).
 * Seeded bokeh blobs (round and hexagonal, with onion-ring rims), wipe streaks and arcs, dust specks
 * and a faint edge haze, weighted toward the frame edges like real lens grime.
 * Uses only Node built-ins (zlib PNG encoder); the same seed always writes the same bytes.
 *
 * Usage:
 *   node skills/postfx-bloom-dirt/scripts/make-lens-dirt.mjs --out public/textures/lens-dirt.png
 *     [--width 1024] [--height 576] [--seed 7] [--blobs 90] [--streaks 12] [--specks 500]
 *     [--strength 1] [--tint 0.12] [--gray]
 *
 * The texture is data, not color: load it with the default NoColorSpace, the composite multiplies
 * the bloom by its raw values (`color += bloom + bloom * dirt * params.dirt`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const args = parseArgs( process.argv.slice( 2 ) );
if ( args.help ) {

	console.log( 'make-lens-dirt --out <file.png> [--width 1024] [--height 576] [--seed 7] [--blobs 90] [--streaks 12] [--specks 500] [--strength 1] [--tint 0.12] [--gray]' );
	process.exit( 0 );

}

const W = int( args.width, 1024 );
const H = int( args.height, 576 );
const SEED = int( args.seed, 7 );
const BLOBS = int( args.blobs, 90 );
const STREAKS = int( args.streaks, 12 );
const SPECKS = int( args.specks, 500 );
const STRENGTH = num( args.strength, 1 );
const TINT = args.gray ? 0 : num( args.tint, 0.12 );
const OUT = resolve( args.out ?? 'lens-dirt.png' );

const rng = mulberry32( SEED );
const range = ( a, b ) => a + ( b - a ) * rng();
const img = new Float32Array( W * H * 3 );
const S = Math.min( W, H );

/* ---------- edge haze: low-frequency value noise, stronger toward the corners ---------- */

const grid = 6;
const lattice = Array.from( { length: ( grid + 2 ) * ( grid + 2 ) }, () => rng() );
const lat = ( x, y ) => lattice[ y * ( grid + 2 ) + x ];
for ( let y = 0; y < H; y ++ ) {

	for ( let x = 0; x < W; x ++ ) {

		const gx = ( x / W ) * grid, gy = ( y / H ) * grid;
		const ix = Math.floor( gx ), iy = Math.floor( gy );
		const fx = smooth( gx - ix ), fy = smooth( gy - iy );
		const n = mix( mix( lat( ix, iy ), lat( ix + 1, iy ), fx ), mix( lat( ix, iy + 1 ), lat( ix + 1, iy + 1 ), fx ), fy );
		const r = Math.hypot( x / W - 0.5, ( y / H - 0.5 ) * ( H / W ) ) * 2;
		const v = n * n * 0.05 * smoothstep( 0.25, 1.1, r );
		add( x, y, v, v, v );

	}

}

/* ---------- bokeh blobs ---------- */

for ( let i = 0; i < BLOBS; i ++ ) {

	const [ cx, cy ] = edgePoint();
	// Log-uniform radius: many small blobs, a few large soft ones.
	const radius = S * Math.exp( range( Math.log( 0.008 ), Math.log( 0.085 ) ) );
	const big = radius / S;
	const intensity = range( 0.08, 0.4 ) * ( big > 0.05 ? 0.55 : 1 );
	const hex = rng() < 0.35;
	const rot = range( 0, Math.PI / 3 );
	const soft = range( 0.08, 0.35 );
	const ring = range( 0.1, 0.45 );
	const tint = tintColor();
	const ext = Math.ceil( radius * 1.1 );

	for ( let y = Math.max( 0, Math.floor( cy - ext ) ); y < Math.min( H, Math.ceil( cy + ext ) ); y ++ ) {

		for ( let x = Math.max( 0, Math.floor( cx - ext ) ); x < Math.min( W, Math.ceil( cx + ext ) ); x ++ ) {

			const dx = x - cx, dy = y - cy;
			let d = Math.hypot( dx, dy ) / radius;
			if ( hex ) d *= hexScale( Math.atan2( dy, dx ) - rot );
			if ( d >= 1 ) continue;
			// At least 1.5 px of edge softness so small hexagons do not alias.
			const edge = Math.max( soft, 1.5 / radius );
			const body = 1 - smoothstep( 1 - edge, 1, d );
			const rim = Math.exp( - ( ( d - 0.9 ) ** 2 ) / 0.004 ) * ring * body;
			// Smooth smudge inside the blob instead of per-pixel sparkle (also compresses far better).
			const smudge = 0.78 + 0.22 * vnoise( ( x + i * 97 ) / ( radius * 0.5 + 2 ), ( y + i * 57 ) / ( radius * 0.5 + 2 ) );
			const v = ( body * 0.75 + rim ) * intensity * smudge;
			add( x, y, v * tint[ 0 ], v * tint[ 1 ], v * tint[ 2 ] );

		}

	}

}

/* ---------- wipe streaks (straight smears) and arcs (circular wipe marks) ---------- */

for ( let i = 0; i < STREAKS; i ++ ) {

	const [ x0, y0 ] = edgePoint();
	const arc = rng() < 0.4;
	const len = S * range( 0.15, 0.6 );
	const width = range( 1.2, 5 );
	const angle = range( 0, Math.PI * 2 );
	const bend = arc ? range( 0.6, 1.6 ) * ( rng() < 0.5 ? - 1 : 1 ) / len : 0;
	const intensity = range( 0.04, 0.14 );
	const tint = tintColor();
	const steps = Math.ceil( len / 0.75 );
	let x = x0, y = y0, a = angle;

	for ( let s = 0; s < steps; s ++ ) {

		const t = s / steps;
		// Thick in the middle, thin at the ends, with a little wobble in pressure.
		const taper = Math.sin( t * Math.PI ) * ( 0.7 + 0.3 * Math.sin( t * 23 + i ) );
		stamp( x, y, width * ( 0.4 + 0.6 * taper ), intensity * taper, tint );
		x += Math.cos( a ) * 0.75;
		y += Math.sin( a ) * 0.75;
		a += bend * 0.75;

	}

}

/* ---------- dust specks ---------- */

for ( let i = 0; i < SPECKS; i ++ ) {

	const [ x, y ] = edgePoint( 0.6 );
	stamp( x, y, range( 0.6, 2.2 ), range( 0.15, 0.7 ), tintColor() );

}

/* ---------- encode: strength, clamp, dither, PNG ---------- */

const channels = TINT > 0 ? 3 : 1;
const raw = Buffer.alloc( ( W * channels + 1 ) * H );
const dither = mulberry32( SEED ^ 0x9e3779b9 );
for ( let y = 0; y < H; y ++ ) {

	for ( let x = 0; x < W; x ++ ) {

		const o = ( y * W + x ) * 3;
		const d = ( dither() - 0.5 ) / 255;
		const px = [ img[ o ], img[ o + 1 ], img[ o + 2 ] ].map( ( v ) => Math.round( clamp01( v * STRENGTH + d ) * 255 ) );
		const row = y * ( W * channels + 1 ) + 1;
		if ( channels === 1 ) raw[ row + x ] = Math.round( ( px[ 0 ] + px[ 1 ] + px[ 2 ] ) / 3 );
		else for ( let c = 0; c < 3; c ++ ) raw[ row + x * 3 + c ] = px[ c ];

	}

}

const png = encodePng( raw, W, H, channels );
mkdirSync( dirname( OUT ), { recursive: true } );
writeFileSync( OUT, png );

let sum = 0, lit = 0;
for ( let i = 0; i < img.length; i += 3 ) {

	const v = ( img[ i ] + img[ i + 1 ] + img[ i + 2 ] ) / 3 * STRENGTH;
	sum += v;
	if ( v > 0.05 ) lit ++;

}

console.log( JSON.stringify( {
	out: OUT, width: W, height: H, seed: SEED, blobs: BLOBS, streaks: STREAKS, specks: SPECKS,
	channels, bytes: png.length, mean: +( sum / ( W * H ) ).toFixed( 4 ), coverage: +( lit / ( W * H ) ).toFixed( 4 ),
} ) );

/* ---------- helpers ---------- */

function add( x, y, r, g, b ) {

	const o = ( y * W + x ) * 3;
	img[ o ] += r;
	img[ o + 1 ] += g;
	img[ o + 2 ] += b;

}

/** Soft round dab used by streaks and specks. */
function stamp( cx, cy, radius, intensity, tint ) {

	const ext = Math.ceil( radius * 2 );
	for ( let y = Math.max( 0, Math.floor( cy - ext ) ); y < Math.min( H, Math.ceil( cy + ext ) ); y ++ ) {

		for ( let x = Math.max( 0, Math.floor( cx - ext ) ); x < Math.min( W, Math.ceil( cx + ext ) ); x ++ ) {

			const d = Math.hypot( x - cx, y - cy ) / radius;
			if ( d > 2 ) continue;
			const v = Math.exp( - d * d * 1.5 ) * intensity * 0.35;
			add( x, y, v * tint[ 0 ], v * tint[ 1 ], v * tint[ 2 ] );

		}

	}

}

/** A random point biased toward the frame edges (bias 1 = strong, 0 = uniform). */
function edgePoint( bias = 1 ) {

	for ( let tries = 0; tries < 16; tries ++ ) {

		const x = rng() * W, y = rng() * H;
		const r = Math.hypot( x / W - 0.5, ( y / H - 0.5 ) * ( H / W ) ) * 2;
		if ( rng() < mix( 1, 0.15 + 0.85 * smoothstep( 0.1, 0.95, r ), bias ) ) return [ x, y ];

	}

	return [ rng() * W, rng() * H ];

}

/** Slightly warm or cool white; TINT 0 gives neutral gray. */
function tintColor() {

	const t = ( rng() * 2 - 1 ) * TINT;
	return [ 1 + t * 0.6, 1 + t * 0.1, 1 - t * 0.7 ];

}

/** Distance scale that turns a circle into a hexagonal aperture. */
function hexScale( a ) {

	const seg = Math.PI / 3;
	const local = ( ( a % seg ) + seg ) % seg - seg / 2;
	return Math.cos( local ) / Math.cos( seg / 2 );

}

/** Smooth value noise in 0..1 with a unit lattice. */
function vnoise( x, y ) {

	const ix = Math.floor( x ), iy = Math.floor( y );
	const fx = smooth( x - ix ), fy = smooth( y - iy );
	return mix( mix( hash( ix, iy ), hash( ix + 1, iy ), fx ), mix( hash( ix, iy + 1 ), hash( ix + 1, iy + 1 ), fx ), fy );

}

function hash( x, y ) {

	const s = Math.sin( x * 12.9898 + y * 78.233 ) * 43758.5453;
	return s - Math.floor( s );

}

function mulberry32( seed ) {

	let s = seed >>> 0;
	return () => {

		s = ( s + 0x6d2b79f5 ) >>> 0;
		let t = s;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

function smooth( t ) {

	return t * t * ( 3 - 2 * t );

}

function smoothstep( a, b, x ) {

	const t = clamp01( ( x - a ) / ( b - a ) );
	return t * t * ( 3 - 2 * t );

}

function mix( a, b, t ) {

	return a + ( b - a ) * t;

}

function clamp01( v ) {

	return v < 0 ? 0 : v > 1 ? 1 : v;

}

/** Minimal PNG writer: 8-bit gray or RGB, Paeth-filtered rows, zlib level 9. */
function encodePng( raw, width, height, channels ) {

	const stride = width * channels;
	const out = Buffer.alloc( raw.length );
	for ( let y = 0; y < height; y ++ ) {

		const r = y * ( stride + 1 );
		out[ r ] = 4;
		for ( let i = 0; i < stride; i ++ ) {

			const cur = raw[ r + 1 + i ];
			const a = i >= channels ? raw[ r + 1 + i - channels ] : 0;
			const b = y > 0 ? raw[ r - stride - 1 + 1 + i ] : 0;
			const c = y > 0 && i >= channels ? raw[ r - stride - 1 + 1 + i - channels ] : 0;
			out[ r + 1 + i ] = ( cur - paeth( a, b, c ) ) & 0xff;

		}

	}

	const ihdr = Buffer.alloc( 13 );
	ihdr.writeUInt32BE( width, 0 );
	ihdr.writeUInt32BE( height, 4 );
	ihdr[ 8 ] = 8;
	ihdr[ 9 ] = channels === 1 ? 0 : 2;
	return Buffer.concat( [
		Buffer.from( [ 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a ] ),
		chunk( 'IHDR', ihdr ),
		chunk( 'IDAT', deflateSync( out, { level: 9 } ) ),
		chunk( 'IEND', Buffer.alloc( 0 ) ),
	] );

}

function paeth( a, b, c ) {

	const p = a + b - c;
	const pa = Math.abs( p - a ), pb = Math.abs( p - b ), pc = Math.abs( p - c );
	return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;

}

function chunk( type, data ) {

	const len = Buffer.alloc( 4 );
	len.writeUInt32BE( data.length );
	const body = Buffer.concat( [ Buffer.from( type, 'ascii' ), data ] );
	const crc = Buffer.alloc( 4 );
	crc.writeUInt32BE( crc32( body ) );
	return Buffer.concat( [ len, body, crc ] );

}

function crc32( buf ) {

	let c = 0xffffffff;
	for ( let i = 0; i < buf.length; i ++ ) {

		c ^= buf[ i ];
		for ( let k = 0; k < 8; k ++ ) c = c & 1 ? 0xedb88320 ^ ( c >>> 1 ) : c >>> 1;

	}

	return ( c ^ 0xffffffff ) >>> 0;

}

function parseArgs( list ) {

	const o = {};
	for ( let i = 0; i < list.length; i ++ ) {

		const a = list[ i ];
		if ( ! a.startsWith( '--' ) ) continue;
		const key = a.slice( 2 );
		const next = list[ i + 1 ];
		if ( next === undefined || next.startsWith( '--' ) ) o[ key ] = true;
		else {

			o[ key ] = next;
			i ++;

		}

	}

	return o;

}

function int( v, d ) {

	const n = Number.parseInt( v, 10 );
	return Number.isFinite( n ) && n > 0 ? n : d;

}

function num( v, d ) {

	const n = Number( v );
	return v !== undefined && v !== true && Number.isFinite( n ) ? n : d;

}
