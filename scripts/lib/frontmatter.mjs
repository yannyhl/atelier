/**
 * Minimal frontmatter reader for our own files: `key: value` lines between --- fences.
 * Values may be quoted; folded (`>`) blocks are joined into one line.
 */
export function readFrontmatter( text ) {

	const m = /^---\n([\s\S]*?)\n---\n?/.exec( text );
	if ( ! m ) return { data: null, body: text, raw: '' };

	const data = {};
	const lines = m[ 1 ].split( '\n' );
	for ( let i = 0; i < lines.length; i ++ ) {

		const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec( lines[ i ] );
		if ( ! kv ) continue;
		let [ , key, value ] = kv;
		if ( value === '>' || value === '|' ) {

			const parts = [];
			while ( i + 1 < lines.length && /^\s+/.test( lines[ i + 1 ] ) ) parts.push( lines[ ++ i ].trim() );
			value = parts.join( value === '>' ? ' ' : '\n' );

		}

		data[ key ] = value.replace( /^(['"])(.*)\1$/, '$2' );

	}

	return { data, body: text.slice( m[ 0 ].length ), raw: m[ 1 ] };

}
