/**
 * Fixed-step simulation clock.
 *
 * Every time-dependent system in a stage advances in whole `step`s, never by the raw frame delta.
 * That makes motion identical at 30, 60 or 120 Hz, and it makes `seek(t)` exact:
 * the live loop and the video renderer run the same steps and produce the same frames.
 */
export class Clock {

	/** Simulation step in seconds. */
	readonly step: number;

	/** Largest real delta accepted per frame; longer stalls are dropped instead of fast-forwarded. */
	maxDelta = 0.1;

	/** Simulation time in seconds, always a whole number of steps. */
	time = 0;

	/** Number of steps taken since the last reset. */
	tick = 0;

	private accumulator = 0;

	constructor( hz = 60 ) {

		this.step = 1 / hz;

	}

	/** Consume a real frame delta and return how many fixed steps to run. */
	advance( realDelta: number ): number {

		this.accumulator += Math.min( Math.max( realDelta, 0 ), this.maxDelta );
		const steps = Math.floor( this.accumulator / this.step + 1e-9 );
		this.accumulator -= steps * this.step;
		return steps;

	}

	/** Number of steps needed to reach simulation time `t` from the current time. */
	stepsUntil( t: number ): number {

		return Math.max( 0, Math.round( ( t - this.time ) / this.step ) );

	}

	commitStep() {

		this.tick ++;
		this.time = this.tick * this.step;

	}

	reset() {

		this.time = 0;
		this.tick = 0;
		this.accumulator = 0;

	}

}
