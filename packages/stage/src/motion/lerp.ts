import type { Color, Quaternion, Vector2, Vector3, Vector4 } from 'three';

export type Animatable = number | number[] | Vector2 | Vector3 | Vector4 | Color | Quaternion;

export const lerp = ( a: number, b: number, t: number ) => a + ( b - a ) * t;
export const clamp = ( v: number, min = 0, max = 1 ) => Math.min( max, Math.max( min, v ) );
export const smoothstep = ( e0: number, e1: number, x: number ) => {

	const t = clamp( ( x - e0 ) / ( e1 - e0 ) );
	return t * t * ( 3 - 2 * t );

};

/** Frame-rate independent exponential smoothing factor for a given half-life. */
export const damp = ( halfLife: number, dt: number ) => 1 - Math.pow( 0.5, dt / Math.max( halfLife, 1e-6 ) );

export function cloneValue<T extends Animatable>( v: T ): T {

	if ( typeof v === 'number' ) return v;
	if ( Array.isArray( v ) ) return v.slice() as T;
	return ( v as Vector3 ).clone() as T;

}

/** Writes `from -> to` at `t` into `out` (mutating objects) and returns the result. */
export function lerpInto<T extends Animatable>( out: T, from: T, to: T, t: number ): T {

	if ( typeof out === 'number' ) return lerp( from as number, to as number, t ) as T;

	if ( Array.isArray( out ) ) {

		const a = from as number[], b = to as number[];
		for ( let i = 0; i < out.length; i ++ ) out[ i ] = lerp( a[ i ], b[ i ], t );
		return out;

	}

	if ( ( out as Quaternion ).isQuaternion ) {

		( out as Quaternion ).slerpQuaternions( from as Quaternion, to as Quaternion, t );
		return out;

	}

	( out as Vector3 ).copy( from as Vector3 ).lerp( to as Vector3, t );
	return out;

}

export function copyInto<T extends Animatable>( out: T, v: T ): T {

	if ( typeof out === 'number' ) return v;
	if ( Array.isArray( out ) ) {

		( v as number[] ).forEach( ( x, i ) => ( ( out as number[] )[ i ] = x ) );
		return out;

	}

	( out as Vector3 ).copy( v as Vector3 );
	return out;

}
