#!/usr/bin/env node
/**
 * Verify a rendered MP4 against delivery expectations with ffprobe and print a JSON report.
 *
 * Usage:
 *   node verify-video.mjs --file teaser.mp4 --preset x-landscape --duration 24 --fps 30
 *   node verify-video.mjs --file teaser-vertical.mp4 --w 1080 --h 1920 --fps 30 --duration 24 --audio aac
 *
 * Presets (conservative X/Twitter delivery that is safe for every account type and for DMs):
 *   x-landscape 1920x1080, x-vertical 1080x1920, x-square 1080x1080;
 *   all: h264 High, yuv420p, bt709 primaries/transfer/matrix, limited range, progressive, 1:1 SAR,
 *   fps <= 60, 0.5 to 140 s, <= 512 MB, moov atom before mdat (faststart), audio optional AAC-LC.
 *
 * Options (each overrides the preset):
 *   --w --h            exact frame size        --fps          exact frame rate (tolerance 0.01)
 *   --duration <s>     expected duration (tolerance: --tolerance seconds, default one frame + 0.02)
 *   --codec h264       --profile High          --pix-fmt yuv420p      --color bt709 (or "any")
 *   --max-mb <n>       file size cap           --max-duration / --min-duration <s>
 *   --audio none|aac|any   none: no audio stream; aac: exactly one AAC-LC stream, <= 2 channels,
 *                          44.1 or 48 kHz, >= 128 kb/s
 *   --faststart / --no-faststart
 *
 * Exits 0 when every check passes, 1 when any fails, 2 on usage errors. Needs ffprobe on PATH.
 * Self-contained: only Node built-ins and ffprobe, so it runs from anywhere.
 */
import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readSync, statSync } from 'node:fs';

const argv = process.argv.slice( 2 );
const a = {};
for ( let i = 0; i < argv.length; i ++ ) {

	const key = argv[ i ].replace( /^--/, '' );
	const next = argv[ i + 1 ];
	if ( next === undefined || next.startsWith( '--' ) ) a[ key ] = true;
	else {

		a[ key ] = next;
		i ++;

	}

}

const X_BASE = { codec: 'h264', profile: 'High', pixFmt: 'yuv420p', color: 'bt709', maxFps: 60, minDuration: 0.5, maxDuration: 140, maxMB: 512, audio: 'any', faststart: true };
const PRESETS = {
	'x-landscape': { ...X_BASE, w: 1920, h: 1080 },
	'x-vertical': { ...X_BASE, w: 1080, h: 1920 },
	'x-square': { ...X_BASE, w: 1080, h: 1080 },
};

const usage = ( msg ) => {

	console.error( `verify-video: ${msg}` );
	process.exit( 2 );

};

if ( ! a.file || a.file === true ) usage( '--file path/to/video.mp4 is required' );
if ( a.preset && ! PRESETS[ a.preset ] ) usage( `unknown --preset ${a.preset} (use ${Object.keys( PRESETS ).join( ', ' )})` );

const base = a.preset ? PRESETS[ a.preset ] : { codec: 'h264', pixFmt: 'yuv420p', color: 'bt709', audio: 'any', faststart: true };
const num = ( v ) => ( v === undefined ? undefined : Number( v ) );
const exp = {
	w: num( a.w ) ?? base.w,
	h: num( a.h ) ?? base.h,
	fps: num( a.fps ),
	maxFps: base.maxFps,
	duration: num( a.duration ),
	tolerance: num( a.tolerance ),
	minDuration: num( a[ 'min-duration' ] ) ?? base.minDuration,
	maxDuration: num( a[ 'max-duration' ] ) ?? base.maxDuration,
	codec: a.codec ?? base.codec,
	profile: a.profile ?? base.profile,
	pixFmt: a[ 'pix-fmt' ] ?? base.pixFmt,
	color: a.color ?? base.color,
	maxMB: num( a[ 'max-mb' ] ) ?? base.maxMB,
	audio: a.audio ?? base.audio,
	faststart: a[ 'no-faststart' ] ? false : ( a.faststart ? true : base.faststart ),
};

let probe;
try {

	probe = JSON.parse( execFileSync( 'ffprobe', [ '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', a.file ], { encoding: 'utf8' } ) );

} catch ( error ) {

	console.log( JSON.stringify( { file: a.file, ok: false, error: `ffprobe failed: ${error.message.split( '\n' )[ 0 ]}` }, null, 2 ) );
	process.exit( 1 );

}

const video = probe.streams.filter( ( s ) => s.codec_type === 'video' && ! s.disposition?.attached_pic );
const audio = probe.streams.filter( ( s ) => s.codec_type === 'audio' );
const v = video[ 0 ] ?? {};
const rate = ( r ) => {

	const [ n, d ] = String( r ?? '0/1' ).split( '/' ).map( Number );
	return d ? n / d : 0;

};

const fps = rate( v.avg_frame_rate );
const duration = Number( probe.format?.duration ?? v.duration ?? 0 );
const bytes = statSync( a.file ).size;
const checks = [];
const check = ( name, expected, actual, ok ) => checks.push( { name, expected, actual, ok: !! ok } );

check( 'one video stream', 1, video.length, video.length === 1 );
if ( exp.codec ) check( 'video codec', exp.codec, v.codec_name, v.codec_name === exp.codec );
if ( exp.profile ) check( 'h264 profile', exp.profile, v.profile, v.profile === exp.profile );
if ( exp.pixFmt ) check( 'pixel format', exp.pixFmt, v.pix_fmt, v.pix_fmt === exp.pixFmt );
if ( exp.color && exp.color !== 'any' ) {

	const c = { matrix: v.color_space, primaries: v.color_primaries, transfer: v.color_transfer };
	check( 'color (matrix, primaries, transfer)', exp.color, c, c.matrix === exp.color && c.primaries === exp.color && c.transfer === exp.color );
	check( 'color range', 'tv', v.color_range, v.color_range === 'tv' );

}

if ( exp.w ) check( 'width', exp.w, v.width, v.width === exp.w );
if ( exp.h ) check( 'height', exp.h, v.height, v.height === exp.h );
check( 'square pixels', '1:1', v.sample_aspect_ratio ?? '1:1', [ undefined, '1:1', '0:1' ].includes( v.sample_aspect_ratio ) );
check( 'progressive', 'progressive', v.field_order ?? 'progressive', [ undefined, 'progressive', 'unknown' ].includes( v.field_order ) );
check( 'constant frame rate', v.r_frame_rate, v.avg_frame_rate, Math.abs( rate( v.r_frame_rate ) - fps ) < 0.01 );
if ( exp.fps ) check( 'fps', exp.fps, Math.round( fps * 1000 ) / 1000, Math.abs( fps - exp.fps ) < 0.01 );
if ( exp.maxFps ) check( 'fps cap', `<= ${exp.maxFps}`, Math.round( fps * 1000 ) / 1000, fps <= exp.maxFps + 1e-6 );

if ( exp.duration !== undefined ) {

	const tol = exp.tolerance ?? ( fps ? 1 / fps : 0.05 ) + 0.02;
	check( 'duration', `${exp.duration} +/- ${Math.round( tol * 1000 ) / 1000} s`, duration, Math.abs( duration - exp.duration ) <= tol );

}

if ( exp.minDuration !== undefined || exp.maxDuration !== undefined ) {

	const lo = exp.minDuration ?? 0, hi = exp.maxDuration ?? Infinity;
	check( 'duration range', `${lo} to ${hi} s`, duration, duration >= lo && duration <= hi );

}

if ( v.width && v.height ) {

	const r = v.width / v.height;
	check( 'aspect within 1:3 to 3:1', '0.333 to 3', Math.round( r * 1000 ) / 1000, r >= 1 / 3 - 1e-6 && r <= 3 + 1e-6 );

}

if ( exp.maxMB ) check( 'file size', `<= ${exp.maxMB} MB`, Math.round( bytes / 1e4 ) / 100, bytes <= exp.maxMB * 1e6 );

if ( exp.audio === 'none' ) check( 'no audio', 0, audio.length, audio.length === 0 );
if ( exp.audio === 'aac' || ( exp.audio === 'any' && audio.length ) ) {

	const s = audio[ 0 ] ?? {};
	check( 'one audio stream', 1, audio.length, audio.length === 1 );
	check( 'audio codec', 'aac LC', `${s.codec_name} ${s.profile}`, s.codec_name === 'aac' && s.profile === 'LC' );
	check( 'audio channels', '<= 2', s.channels, s.channels >= 1 && s.channels <= 2 );
	check( 'audio sample rate', '44100 or 48000', Number( s.sample_rate ), [ 44100, 48000 ].includes( Number( s.sample_rate ) ) );
	const br = Number( s.bit_rate ?? 0 );
	check( 'audio bitrate', '>= 128 kb/s', Math.round( br / 1000 ), br >= 127000 );

}

if ( exp.faststart ) {

	const order = topLevelAtoms( a.file );
	const moov = order.indexOf( 'moov' ), mdat = order.indexOf( 'mdat' );
	check( 'faststart (moov before mdat)', 'moov < mdat', order.join( ',' ), moov >= 0 && mdat >= 0 && moov < mdat );

}

const ok = checks.every( ( c ) => c.ok );
console.log( JSON.stringify( {
	file: a.file,
	ok,
	preset: a.preset ?? null,
	summary: {
		width: v.width, height: v.height, fps: Math.round( fps * 1000 ) / 1000, duration, frames: Number( v.nb_frames ?? 0 ),
		codec: v.codec_name, profile: v.profile, pixFmt: v.pix_fmt, videoKbps: Math.round( Number( v.bit_rate ?? 0 ) / 1000 ),
		audio: audio.map( ( s ) => `${s.codec_name} ${s.profile ?? ''} ${s.channels}ch ${s.sample_rate}Hz`.replace( /\s+/g, ' ' ) ),
		bytes,
	},
	failed: checks.filter( ( c ) => ! c.ok ).map( ( c ) => c.name ),
	checks,
}, null, 2 ) );
process.exit( ok ? 0 : 1 );

/** Top-level MP4 box types in file order (reads only the box headers). */
function topLevelAtoms( file ) {

	const fd = openSync( file, 'r' );
	const size = statSync( file ).size;
	const head = Buffer.alloc( 16 );
	const types = [];
	try {

		for ( let o = 0; o < size && types.length < 64; ) {

			if ( readSync( fd, head, 0, 16, o ) < 8 ) break;
			let len = head.readUInt32BE( 0 );
			const type = head.toString( 'latin1', 4, 8 );
			if ( len === 1 ) len = Number( head.readBigUInt64BE( 8 ) );
			else if ( len === 0 ) len = size - o;
			if ( len < 8 ) break;
			types.push( type );
			o += len;

		}

	} finally {

		closeSync( fd );

	}

	return types;

}
