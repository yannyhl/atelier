import type { Stage, StageSystem } from '../core/Stage';

export interface Cue {
	/** Seconds on the stage clock. */
	at: number;
	run( stage: Stage ): void;
	label?: string;
}

/**
 * A scripted timeline for video capture and attract loops.
 * Cues fire exactly once when the clock passes their time, including when seek() fast-forwards.
 * `pointer` scripts the cursor as a pure function of time, replacing live input.
 */
export class Choreography implements StageSystem {

	private fired = 0;
	private cuesSorted: Cue[];
	private t = 0;

	constructor( cues: Cue[], public pointer?: ( t: number ) => [ number, number ], private onPointer?: ( x: number, y: number ) => void ) {

		this.cuesSorted = cues.slice().sort( ( a, b ) => a.at - b.at );

	}

	cues() {

		return this.cuesSorted.map( ( c ) => ( { at: c.at, label: c.label } ) );

	}

	get duration() {

		return this.cuesSorted.length ? this.cuesSorted[ this.cuesSorted.length - 1 ].at : 0;

	}

	update( dt: number, stage: Stage ) {

		this.t += dt;
		while ( this.fired < this.cuesSorted.length && this.cuesSorted[ this.fired ].at <= this.t + 1e-9 ) {

			this.cuesSorted[ this.fired ++ ].run( stage );

		}

		if ( this.pointer && this.onPointer ) {

			const [ x, y ] = this.pointer( this.t );
			this.onPointer( x, y );

		}

	}

	reset() {

		this.fired = 0;
		this.t = 0;

	}

}

/** Reads `?capture=1&w=1920&h=1080&dpr=1` so the same page serves live and video modes. */
export function readCaptureParams( search = location.search ): { width: number; height: number; dpr: number } | undefined {

	const q = new URLSearchParams( search );
	if ( q.get( 'capture' ) !== '1' ) return undefined;
	return {
		width: Number( q.get( 'w' ) ?? 1920 ),
		height: Number( q.get( 'h' ) ?? 1080 ),
		dpr: Number( q.get( 'dpr' ) ?? 1 ),
	};

}
