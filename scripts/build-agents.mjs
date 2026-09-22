#!/usr/bin/env node
/**
 * One subagent source, two harnesses.
 * agents-src/<name>.md (frontmatter: name, description, claude-tools, claude-model, codex-model, codex-reasoning)
 *   -> .claude/agents/<name>.md   (Claude Code subagent)
 *   -> .codex/agents/<name>.toml  (Codex subagent: name, description, developer_instructions)
 * --check fails if the generated files are stale.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFrontmatter } from './lib/frontmatter.mjs';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '..' );
const src = join( root, 'agents-src' );
const check = process.argv.includes( '--check' );
const header = 'Generated from agents-src by scripts/build-agents.mjs. Edit the source, not this file.';
const stale = [];

const tomlString = ( s ) => JSON.stringify( s );
const tomlMultiline = ( s ) => {

	if ( ! s.includes( "'''" ) ) return `'''\n${s}'''`;
	return `"""\n${s.replace( /\\/g, '\\\\' ).replace( /"""/g, '\\"""' )}"""`;

};

const emit = ( file, content ) => {

	if ( check ) {

		if ( ! existsSync( file ) || readFileSync( file, 'utf8' ) !== content ) stale.push( file );
		return;

	}

	mkdirSync( dirname( file ), { recursive: true } );
	writeFileSync( file, content );

};

const files = existsSync( src ) ? readdirSync( src ).filter( ( f ) => f.endsWith( '.md' ) ) : [];
for ( const f of files ) {

	const { data, body } = readFrontmatter( readFileSync( join( src, f ), 'utf8' ) );
	if ( ! data?.name || ! data.description ) throw new Error( `${f}: name and description are required` );

	const claude = [ '---', `name: ${data.name}`, `description: ${data.description}` ];
	if ( data[ 'claude-tools' ] ) claude.push( `tools: ${data[ 'claude-tools' ]}` );
	if ( data[ 'claude-model' ] ) claude.push( `model: ${data[ 'claude-model' ]}` );
	claude.push( '---', '', `<!-- ${header} -->`, '', body.trim(), '' );
	emit( join( root, '.claude/agents', `${data.name}.md` ), claude.join( '\n' ) );

	const codex = [ `# ${header}`, `name = ${tomlString( data.name )}`, `description = ${tomlString( data.description )}` ];
	if ( data[ 'codex-model' ] ) codex.push( `model = ${tomlString( data[ 'codex-model' ] )}` );
	if ( data[ 'codex-reasoning' ] ) codex.push( `model_reasoning_effort = ${tomlString( data[ 'codex-reasoning' ] )}` );
	codex.push( `developer_instructions = ${tomlMultiline( body.trim() + '\n' )}`, '' );
	emit( join( root, '.codex/agents', `${data.name}.toml` ), codex.join( '\n' ) );

}

if ( check && stale.length ) {

	console.error( 'agents: generated files are stale, run `npm run agents`:\n  ' + stale.join( '\n  ' ) );
	process.exit( 1 );

}

console.log( `agents: ${files.length} ${check ? 'up to date' : 'generated'}` );
