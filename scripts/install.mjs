#!/usr/bin/env node
/**
 * Installs atelier skills for both harnesses by symlinking each skill folder into:
 *   ~/.claude/skills/<name>   (Claude Code)
 *   ~/.agents/skills/<name>   (Codex and other Agent Skills readers)
 * Never overwrites a same-named skill that is not ours. --dry-run shows the plan, --uninstall removes our links.
 * Pass --codex-legacy to also link into ~/.codex/skills for older Codex builds.
 */
import { lstatSync, mkdirSync, readdirSync, readlinkSync, symlinkSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '..' );
const skills = join( root, 'skills' );
const args = new Set( process.argv.slice( 2 ) );
const dry = args.has( '--dry-run' );
const targets = [ join( homedir(), '.claude/skills' ), join( homedir(), '.agents/skills' ) ];
if ( args.has( '--codex-legacy' ) ) targets.push( join( homedir(), '.codex/skills' ) );

const names = readdirSync( skills, { withFileTypes: true } ).filter( ( d ) => d.isDirectory() ).map( ( d ) => d.name );

for ( const target of targets ) {

	if ( ! dry ) mkdirSync( target, { recursive: true } );
	for ( const name of names ) {

		const link = join( target, name );
		const source = join( skills, name );
		const ours = lstatExists( link ) && lstatSync( link ).isSymbolicLink() && resolve( dirname( link ), readlinkSync( link ) ) === source;

		if ( args.has( '--uninstall' ) ) {

			if ( ours ) {

				if ( ! dry ) unlinkSync( link );
				console.log( `removed ${link}` );

			}

			continue;

		}

		if ( ours ) {

			console.log( `ok      ${link}` );

		} else if ( lstatExists( link ) ) {

			console.log( `skip    ${link} (exists and is not ours; left untouched)` );

		} else {

			if ( ! dry ) symlinkSync( source, link );
			console.log( `linked  ${link} -> ${source}` );

		}

	}

}

function lstatExists( p ) {

	try {

		lstatSync( p );
		return true;

	} catch {

		return false;

	}

}
