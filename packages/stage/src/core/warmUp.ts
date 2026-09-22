import type { Object3D } from 'three';

const nextTask = () => new Promise<void>( ( r ) => setTimeout( r, 0 ) );

/**
 * First draws upload geometry and textures (canvas textures are the slow ones) and finish shader
 * setup. Drawing every section at once made one 200 ms+ task on a throttled phone; this draws each
 * group alone, one task per group, so no single task blocks input for long.
 * Call after `renderer.compileAsync`, with every group's descendants made visible.
 */
export async function warmUp( groups: Object3D[], draw: () => void, yieldToMain: () => Promise<void> = nextTask ) {

	const visible = groups.map( ( g ) => g.visible );
	for ( const group of groups ) {

		groups.forEach( ( g ) => ( g.visible = g === group ) );
		draw();
		await yieldToMain();

	}

	groups.forEach( ( g, i ) => ( g.visible = visible[ i ] ) );

}
