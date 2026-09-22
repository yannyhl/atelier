/** Tiny `--key value` / `--flag` parser shared by the scripts. */
export function parseArgs( argv = process.argv.slice( 2 ) ) {

	const out = { _: [] };
	for ( let i = 0; i < argv.length; i ++ ) {

		const a = argv[ i ];
		if ( ! a.startsWith( '--' ) ) {

			out._.push( a );
			continue;

		}

		const key = a.slice( 2 );
		const next = argv[ i + 1 ];
		if ( next === undefined || next.startsWith( '--' ) ) out[ key ] = true;
		else {

			out[ key ] = next;
			i ++;

		}

	}

	return out;

}
