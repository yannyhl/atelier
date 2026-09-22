/**
 * Seeded PRNG (mulberry32). Use this instead of Math.random anywhere that affects a rendered frame,
 * so live playback and video capture agree.
 */
export type Rng = {
	(): number;
	range( min: number, max: number ): number;
	pick<T>( list: readonly T[] ): T;
	seed: number;
	/** Restart the sequence from the seed. */
	reset(): void;
};

export function createRng( seed = 1 ): Rng {

	let s = seed >>> 0;

	const next = ( () => {

		s = ( s + 0x6d2b79f5 ) >>> 0;
		let t = s;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	} ) as Rng;

	next.range = ( min, max ) => min + ( max - min ) * next();
	next.pick = ( list ) => list[ Math.floor( next() * list.length ) % list.length ];
	next.seed = seed;
	next.reset = () => {

		s = seed >>> 0;

	};

	return next;

}
