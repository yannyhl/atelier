#!/usr/bin/env node
/**
 * Validates every skill against the Agent Skills spec and atelier's house rules.
 * Exit 1 with a list of problems if anything fails.
 */
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFrontmatter } from './lib/frontmatter.mjs';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '..' );
const skillsDir = join( root, 'skills' );
const problems = [];
const bad = ( file, msg ) => problems.push( `${relative( root, file )}: ${msg}` );
const EM_DASH = '\u2014';

function walk( dir ) {

	return readdirSync( dir, { withFileTypes: true } ).flatMap( ( d ) => ( d.isDirectory() ? walk( join( dir, d.name ) ) : [ join( dir, d.name ) ] ) );

}

const names = readdirSync( skillsDir, { withFileTypes: true } ).filter( ( d ) => d.isDirectory() ).map( ( d ) => d.name );

for ( const name of names ) {

	const dir = join( skillsDir, name );
	const file = join( dir, 'SKILL.md' );
	if ( ! existsSync( file ) ) {

		bad( dir, 'missing SKILL.md' );
		continue;

	}

	const text = readFileSync( file, 'utf8' );
	const { data, body } = readFrontmatter( text );
	if ( ! data ) {

		bad( file, 'missing frontmatter' );
		continue;

	}

	const keys = Object.keys( data );
	const extra = keys.filter( ( k ) => ! [ 'name', 'description' ].includes( k ) );
	if ( extra.length ) bad( file, `only name and description are allowed in frontmatter (found ${extra.join( ', ' )})` );
	if ( data.name !== name ) bad( file, `name "${data.name}" must match folder "${name}"` );
	if ( ! /^[a-z0-9]+(-[a-z0-9]+)*$/.test( name ) || name.length > 64 ) bad( file, 'name must be lowercase kebab-case, at most 64 characters' );
	if ( ! data.description || data.description.length < 40 ) bad( file, 'description is missing or too short to trigger reliably' );
	if ( data.description && data.description.length > 1024 ) bad( file, `description is ${data.description.length} characters (max 1024)` );
	const lines = body.split( '\n' ).length;
	if ( lines > 500 ) bad( file, `body is ${lines} lines (max 500); move depth into references/` );

	const yaml = join( dir, 'agents', 'openai.yaml' );
	if ( ! existsSync( yaml ) ) bad( dir, 'missing agents/openai.yaml (Codex UI metadata)' );
	else {

		const y = readFileSync( yaml, 'utf8' );
		for ( const key of [ 'display_name', 'short_description', 'default_prompt' ] ) if ( ! y.includes( key + ':' ) ) bad( yaml, `missing interface.${key}` );
		if ( ! y.includes( `$${name}` ) ) bad( yaml, `default_prompt should mention $${name}` );

	}

	for ( const f of walk( dir ) ) {

		const size = statSync( f ).size;
		if ( size > 1024 * 1024 ) bad( f, `file is ${( size / 1e6 ).toFixed( 1 )} MB; keep skills light` );
		if ( ! /\.(md|txt|ya?ml|json|mjs|js|ts|glsl|frag|vert|css|html|py|sh|toml)$/.test( f ) ) continue;
		const content = readFileSync( f, 'utf8' );
		if ( content.includes( EM_DASH ) ) bad( f, 'contains an em dash' );

		if ( f.endsWith( '.md' ) ) {

			for ( const [ , target ] of content.matchAll( /\]\(([^)#\s]+)(?:#[^)]*)?\)/g ) ) {

				if ( /^[a-z]+:/.test( target ) ) continue;
				if ( ! existsSync( resolve( dirname( f ), target ) ) ) bad( f, `broken link ${target}` );

			}

		}

	}

}

for ( const link of [ '.claude/skills', '.agents/skills' ] ) {

	const p = join( root, link );
	if ( ! existsSync( p ) || ! lstatSync( p ).isSymbolicLink() || readlinkSync( p ) !== '../skills' ) bad( p, 'must be a symlink to ../skills' );

}

if ( problems.length ) {

	console.error( `skills: ${problems.length} problem(s)\n  ` + problems.join( '\n  ' ) );
	process.exit( 1 );

}

console.log( `skills: ${names.length} valid` );
