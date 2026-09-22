#!/usr/bin/env node
/**
 * work/catalog.json -> work/CATALOG.md. --check fails if CATALOG.md is stale.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '..' );
const catalog = JSON.parse( readFileSync( join( root, 'work/catalog.json' ), 'utf8' ) );
const out = join( root, 'work/CATALOG.md' );

const link = ( e ) => ( e.path ? `[${e.title}](${e.path.replace( /^work\//, '' )})` : e.url ? `[${e.title}](${e.url})` : e.title );
const rows = ( list ) => list.map( ( e ) => `| ${e.id} | ${link( e )} | ${e.date} | ${e.kind} | ${e.status} | ${( e.dna ?? [] ).join( ', ' ) || '-'} | ${( e.skills ?? [] ).map( ( s ) => '`' + s + '`' ).join( ' ' ) || '-'} | ${e.summary} |` ).join( '\n' );

const own = catalog.entries.filter( ( e ) => e.origin === 'atelier' );
const prior = catalog.entries.filter( ( e ) => e.origin !== 'atelier' );
const head = '| ID | Work | Date | Kind | Status | DNA | Skills | Summary |\n|---|---|---|---|---|---|---|---|';

const md = `# Catalog

<!-- Generated from work/catalog.json by scripts/build-catalog.mjs. Edit the JSON, then run \`npm run catalog\`. -->

Everything we make, newest first.
Each atelier entry has a folder with its README, decisions, captures, performance report and renders.
Status follows the decision states in \`AGENTS.md\`.

## Made with atelier

${head}
${rows( own )}

## Earlier work (examples, not defaults)

Projects made before atelier that informed its conventions.

${head}
${rows( prior )}
`;

if ( process.argv.includes( '--check' ) ) {

	if ( ! existsSync( out ) || readFileSync( out, 'utf8' ) !== md ) {

		console.error( 'catalog: work/CATALOG.md is stale, run `npm run catalog`' );
		process.exit( 1 );

	}

	console.log( 'catalog: up to date' );

} else {

	writeFileSync( out, md );
	console.log( `catalog: ${catalog.entries.length} entries` );

}
