/**
 * Deterministic timers driven by the stage clock. Use `after` instead of setTimeout for any
 * stagger or choreography that affects a frame, so capture renders match live playback.
 */
export class Scheduler {

	private time = 0;
	private queue: Array<{ at: number; fn: () => void; id: number }> = [];
	private nextId = 1;

	after( seconds: number, fn: () => void ): number {

		const id = this.nextId ++;
		this.queue.push( { at: this.time + Math.max( 0, seconds ), fn, id } );
		this.queue.sort( ( a, b ) => a.at - b.at || a.id - b.id );
		return id;

	}

	wait( seconds: number ): Promise<void> {

		return new Promise( ( resolve ) => this.after( seconds, resolve ) );

	}

	cancel( id: number ) {

		this.queue = this.queue.filter( ( q ) => q.id !== id );

	}

	update( dt: number ) {

		this.time += dt;
		while ( this.queue.length && this.queue[ 0 ].at <= this.time + 1e-9 ) {

			this.queue.shift()!.fn();

		}

	}

	reset() {

		this.time = 0;
		this.queue = [];

	}

}
