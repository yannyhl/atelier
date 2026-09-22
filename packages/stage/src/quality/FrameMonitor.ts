/**
 * Watches real frame times and recommends tier changes with hysteresis.
 * Steps down fast (two slow windows), steps up slowly (five fast windows) and at most once,
 * so quality never oscillates. The budget is 60 fps; faster displays simply have more headroom.
 */
export class FrameMonitor {

	private samples: number[] = [];
	private slowWindows = 0;
	private fastWindows = 0;
	private upgrades = 0;
	private warmup: number;

	constructor( private windowSize = 90, warmupSeconds = 2, private budgetMs = 1000 / 60 ) {

		this.warmup = warmupSeconds;

	}

	/** Returns -1 to step down, +1 to step up, 0 to hold. */
	sample( frameMs: number ): -1 | 0 | 1 {

		if ( this.warmup > 0 ) {

			this.warmup -= frameMs / 1000;
			return 0;

		}

		this.samples.push( frameMs );
		if ( this.samples.length < this.windowSize ) return 0;

		const sorted = this.samples.slice().sort( ( a, b ) => a - b );
		const p50 = sorted[ Math.floor( sorted.length * 0.5 ) ];
		const p90 = sorted[ Math.floor( sorted.length * 0.9 ) ];
		this.samples.length = 0;

		// A steady frame time well above budget is a refresh cap (iOS Low Power Mode runs rAF at 30 Hz),
		// not overload: lowering quality would not make it faster, so hold.
		const steady = p90 - p50 < 1.5;

		if ( p90 > this.budgetMs * 1.35 && ! steady ) {

			this.fastWindows = 0;
			if ( ++ this.slowWindows >= 2 ) {

				this.slowWindows = 0;
				return - 1;

			}

		} else if ( p90 < this.budgetMs * 0.75 ) {

			this.slowWindows = 0;
			if ( ++ this.fastWindows >= 5 && this.upgrades < 1 ) {

				this.fastWindows = 0;
				this.upgrades ++;
				return 1;

			}

		} else {

			this.slowWindows = 0;
			this.fastWindows = 0;

		}

		return 0;

	}

	/** Call after a tier change so the new tier is judged on its own frames. */
	reset( warmupSeconds = 1 ) {

		this.samples.length = 0;
		this.slowWindows = 0;
		this.fastWindows = 0;
		this.warmup = warmupSeconds;

	}

}
