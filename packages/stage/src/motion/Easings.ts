export type Easing = ( t: number ) => number;

/**
 * Easing library. `sigmoid(6)` is the house default (the JUNNI / ore-three default):
 * a symmetric S-curve that is softer than cubic at both ends.
 */
export const Easings = {

	linear: ( t: number ) => t,

	sigmoid( weight = 6 ): Easing {

		const e2 = Math.exp( - weight );
		return ( x ) => {

			const e1 = Math.exp( - weight * ( 2 * x - 1 ) );
			return ( 1 + ( ( 1 - e1 ) / ( 1 + e1 ) ) * ( ( 1 + e2 ) / ( 1 - e2 ) ) ) / 2;

		};

	},

	easeInQuad: ( t: number ) => t * t,
	easeOutQuad: ( t: number ) => t * ( 2 - t ),
	easeInOutQuad: ( t: number ) => ( t < 0.5 ? 2 * t * t : - 1 + ( 4 - 2 * t ) * t ),
	easeInCubic: ( t: number ) => t * t * t,
	easeOutCubic: ( t: number ) => ( t - 1 ) ** 3 + 1,
	easeInOutCubic: ( t: number ) => ( t < 0.5 ? 4 * t * t * t : ( t - 1 ) * ( 2 * t - 2 ) * ( 2 * t - 2 ) + 1 ),
	easeOutQuart: ( t: number ) => 1 - ( t - 1 ) ** 4,
	easeInOutQuart: ( t: number ) => ( t < 0.5 ? 8 * t ** 4 : 1 - 8 * ( t - 1 ) ** 4 ),
	easeOutQuint: ( t: number ) => 1 + ( t - 1 ) ** 5,
	easeOutExpo: ( t: number ) => ( t >= 1 ? 1 : 1 - Math.pow( 2, - 10 * t ) ),

	easeOutBack( overshoot = 1.70158 ): Easing {

		return ( t ) => 1 + ( overshoot + 1 ) * ( t - 1 ) ** 3 + overshoot * ( t - 1 ) ** 2;

	},

	/** Same curve as CSS `cubic-bezier(x1, y1, x2, y2)`. */
	cubicBezier( x1: number, y1: number, x2: number, y2: number ): Easing {

		const cx = 3 * x1, bx = 3 * ( x2 - x1 ) - cx, ax = 1 - cx - bx;
		const cy = 3 * y1, by = 3 * ( y2 - y1 ) - cy, ay = 1 - cy - by;
		const sx = ( t: number ) => ( ( ax * t + bx ) * t + cx ) * t;
		const sy = ( t: number ) => ( ( ay * t + by ) * t + cy ) * t;
		const dx = ( t: number ) => ( 3 * ax * t + 2 * bx ) * t + cx;

		const solve = ( x: number ) => {

			let t = x;
			for ( let i = 0; i < 8; i ++ ) {

				const err = sx( t ) - x;
				if ( Math.abs( err ) < 1e-6 ) return t;
				const d = dx( t );
				if ( Math.abs( d ) < 1e-6 ) break;
				t -= err / d;

			}

			let lo = 0, hi = 1;
			t = x;
			for ( let i = 0; i < 32; i ++ ) {

				const v = sx( t );
				if ( Math.abs( v - x ) < 1e-6 ) break;
				if ( v < x ) lo = t; else hi = t;
				t = ( lo + hi ) / 2;

			}

			return t;

		};

		return ( x ) => ( x <= 0 ? 0 : x >= 1 ? 1 : sy( solve( x ) ) );

	},

};

/**
 * Named curves from the reference DNA, shared with CSS through `dom/tokens.css`.
 * Keep the two in sync.
 */
export const HouseCurves = {
	/** Overshooting entrance, 0.7 s. CSS: cubic-bezier(0, 1.33, 0.37, 0.99). */
	enter: Easings.cubicBezier( 0, 1.33, 0.37, 0.99 ),
	/** Anticipating exit, 0.5 s. CSS: cubic-bezier(0.74, -0.02, 0.94, -0.32). */
	exit: Easings.cubicBezier( 0.74, - 0.02, 0.94, - 0.32 ),
	/** Small pop for chips and bubbles. CSS: cubic-bezier(0.4, 1.44, 0.74, 1). */
	pop: Easings.cubicBezier( 0.4, 1.44, 0.74, 1 ),
	/** Snappy glitch settle used for random effect bursts. */
	settle: Easings.cubicBezier( 0, 0.85, 0.25, 1.01 ),
};
