#!/usr/bin/env node
/**
 * Tiles capture PNGs into one JPEG contact sheet for the work folder (raw PNGs stay in artifacts/).
 * Usage: node scripts/contact-sheet.mjs --out work/001-x/captures/laptop.jpg --width 2400 --cols 3 file1.png file2.png ...
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from './lib/args.mjs';

const a = parseArgs();
const files = a._;
const cols = Number( a.cols ?? Math.min( 3, files.length ) );
const width = Number( a.width ?? 2400 );
if ( ! a.out || files.length === 0 ) {

	console.error( 'contact-sheet: --out file.jpg and at least one image are required' );
	process.exit( 2 );

}

mkdirSync( dirname( a.out ), { recursive: true } );
const rows = Math.ceil( files.length / cols );
const cell = Math.floor( width / cols );
const inputs = files.flatMap( ( f ) => [ '-i', f ] );
// Scale every tile to the first image's aspect so rows line up; empty cells are black.
const probe = spawnSync( 'ffprobe', [ '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', files[ 0 ] ], { encoding: 'utf8' } );
const [ w0, h0 ] = probe.stdout.trim().split( ',' ).map( Number );
const cellH = Math.round( ( cell * h0 ) / w0 / 2 ) * 2;
const parts = files.map( ( _, i ) => `[${i}]scale=${cell}:${cellH}:force_original_aspect_ratio=decrease,pad=${cell}:${cellH}:(ow-iw)/2:(oh-ih)/2:black[s${i}]` );
const rowLabels = [];
for ( let r = 0; r < rows; r ++ ) {

	const tiles = [];
	for ( let c = 0; c < cols; c ++ ) {

		const i = r * cols + c;
		if ( i < files.length ) tiles.push( `[s${i}]` );
		else {

			parts.push( `color=black:s=${cell}x${cellH}:d=1[e${i}]` );
			tiles.push( `[e${i}]` );

		}

	}

	parts.push( cols > 1 ? `${tiles.join( '' )}hstack=inputs=${cols}[r${r}]` : `${tiles[ 0 ]}null[r${r}]` );
	rowLabels.push( `[r${r}]` );

}

parts.push( rows > 1 ? `${rowLabels.join( '' )}vstack=inputs=${rows}[out]` : `[r0]null[out]` );
const r = spawnSync( 'ffmpeg', [ '-loglevel', 'error', '-y', ...inputs, '-filter_complex', parts.join( ';' ), '-map', '[out]', '-frames:v', '1', '-q:v', '4', a.out ], { stdio: 'inherit' } );
if ( r.status !== 0 ) process.exit( r.status ?? 1 );
console.log( `wrote ${a.out} (${files.length} images, ${cols}x${rows})` );
