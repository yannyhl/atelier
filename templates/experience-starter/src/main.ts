import './style.css';

/**
 * Boot: the page is a complete static document. The inline script in index.html has already set
 * `is-webgl` when WebGL2 is available (stage layout, loader visible, no layout shift later).
 * The 3D bundle is a separate chunk, so first paint never waits for it.
 * `?static` forces the fallback, which is how audits check it.
 */
if ( document.documentElement.classList.contains( 'is-webgl' ) ) {

	import( './experience' )
		.then( ( m ) => m.boot() )
		.catch( ( error ) => {

			console.error( '[atelier] falling back to static page', error );
			document.documentElement.classList.remove( 'is-webgl', 'is-ready', 'is-splashed' );

		} );

}
