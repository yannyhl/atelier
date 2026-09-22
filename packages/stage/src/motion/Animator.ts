import { Easings, type Easing } from './Easings';
import { cloneValue, copyInto, lerpInto, type Animatable } from './lerp';

/** A tweened value. The object is shaped like a three.js uniform, so pass it straight into `uniforms`. */
export interface Tween<T extends Animatable = Animatable> {
	value: T;
}

interface Track<T extends Animatable> {
	uniform: Tween<T>;
	init: T;
	from: T;
	to: T;
	/** Easing given to add(); used when animate() passes none. */
	baseEasing: Easing;
	easing: Easing;
	elapsed: number;
	delay: number;
	duration: number;
	active: boolean;
	/** Settles the pending animate() promise: true when it finished, false when interrupted. */
	done?: ( finished: boolean ) => void;
}

export interface AnimateOptions {
	easing?: Easing;
	/** Seconds to wait before starting. Replaces setTimeout-based staggers and stays deterministic. */
	delay?: number;
}

/**
 * Named tweened values advanced by the stage clock.
 *
 * The house pattern: every animated look (visibility, bloom, a one-hot section array) is an
 * Animator value that is also a shader uniform, so there is no glue code between tweening and GPU.
 * Default easing is sigmoid(6), default duration 1 s.
 */
export class Animator {

	private tracks = new Map<string, Track<Animatable>>();

	add<T extends Animatable>( name: string, initValue: T, easing: Easing = Easings.sigmoid( 6 ) ): Tween<T> {

		const existing = this.tracks.get( name );
		if ( existing ) return existing.uniform as Tween<T>;

		const track: Track<T> = {
			uniform: { value: cloneValue( initValue ) },
			init: cloneValue( initValue ),
			from: cloneValue( initValue ),
			to: cloneValue( initValue ),
			baseEasing: easing,
			easing,
			elapsed: 0,
			delay: 0,
			duration: 0,
			active: false,
		};

		this.tracks.set( name, track as unknown as Track<Animatable> );
		return track.uniform;

	}

	uniform<T extends Animatable>( name: string ): Tween<T> {

		const track = this.tracks.get( name );
		if ( ! track ) throw new Error( `Animator: "${name}" was never added` );
		return track.uniform as Tween<T>;

	}

	get<T extends Animatable>( name: string ): T {

		return this.uniform<T>( name ).value;

	}

	/** Set instantly and cancel any running tween. */
	set<T extends Animatable>( name: string, value: T ) {

		const track = this.require( name );
		this.interrupt( track );
		track.uniform.value = copyInto( track.uniform.value, value );

	}

	/**
	 * Tween to `goal`. Resolves `true` when it finishes, or `false` as soon as it is interrupted
	 * by another animate(), set() or reset(). `options.easing` applies to this call only.
	 */
	animate<T extends Animatable>( name: string, goal: T, duration = 1, options: AnimateOptions = {} ): Promise<boolean> {

		const track = this.require( name );
		this.interrupt( track );

		return new Promise( ( resolve ) => {

			if ( duration <= 0 && ! options.delay ) {

				track.uniform.value = copyInto( track.uniform.value, goal );
				resolve( true );
				return;

			}

			track.from = cloneValue( track.uniform.value );
			track.to = cloneValue( goal );
			track.easing = options.easing ?? track.baseEasing;
			track.elapsed = 0;
			track.delay = options.delay ?? 0;
			track.duration = Math.max( duration, 1e-6 );
			track.active = true;

			track.done = resolve;

		} );

	}

	isAnimating( name?: string ): boolean {

		if ( name !== undefined ) return this.tracks.get( name )?.active ?? false;
		for ( const t of this.tracks.values() ) if ( t.active ) return true;
		return false;

	}

	update( dt: number ) {

		const finished: Array<( ok: boolean ) => void> = [];

		for ( const track of this.tracks.values() ) {

			if ( ! track.active ) continue;

			track.elapsed += dt;
			const local = track.elapsed - track.delay;
			if ( local < 0 ) continue;

			const t = Math.min( 1, local / track.duration );
			track.uniform.value = lerpInto( track.uniform.value, track.from, track.to, track.easing( t ) );

			if ( t >= 1 ) {

				track.uniform.value = copyInto( track.uniform.value, track.to );
				track.active = false;
				if ( track.done ) finished.push( track.done );
				track.done = undefined;

			}

		}

		finished.forEach( ( f ) => f( true ) );

	}

	/** Restore every value to its initial state (used by seek-to-zero). */
	reset() {

		for ( const track of this.tracks.values() ) {

			this.interrupt( track );
			track.uniform.value = copyInto( track.uniform.value, track.init );

		}

	}

	private interrupt( track: Track<Animatable> ) {

		const done = track.done;
		track.active = false;
		track.done = undefined;
		done?.( false );

	}

	private require( name: string ) {

		const track = this.tracks.get( name );
		if ( ! track ) throw new Error( `Animator: "${name}" was never added` );
		return track;

	}

}

/** A one-hot array for N sections, e.g. [0,0,1,0]. Tween it whole and `mix` looks per section in GLSL. */
export function oneHot( count: number, index: number ): number[] {

	return Array.from( { length: count }, ( _, i ) => ( i === index ? 1 : 0 ) );

}
