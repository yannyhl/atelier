import { Emitter } from '../core/Emitter';
import { Animator } from '../motion/Animator';
import { Easings } from '../motion/Easings';

export interface ScrollerEvents extends Record<string, unknown> {
	/** The section the scroller is heading to changed. Drive section transitions from this. */
	target: number;
	/** The nearest section to the current value changed. */
	current: number;
}

/**
 * Virtual section scroller (the JUNNI scroller, ported to the fixed-step clock).
 *
 * `value` is a float in section units, 0..count-1. The page never scrolls natively.
 * Between inputs a spring pulls `value` toward `round(value +/- 0.45)`, biased by the direction
 * of travel, so a small flick commits to the next section and a tiny nudge falls back.
 * Constants are the reference values tuned at 60 Hz; per-step factors are scaled by dt, so the feel is
 * the same at any clock rate and any display refresh rate.
 */
export class SectionScroller extends Emitter<ScrollerEvents> {

	count = 1;
	value = 0;
	/** Snap target; transitions fire when this changes, not when value crosses a boundary. */
	target = 0;
	current = 0;

	/** Freeze all input (for example until an intro finishes). */
	enabled = true;

	private velocity = 0;
	private velocityVelocity = 0;
	private touching = false;
	private touchStartValue = 0;
	private touchStartSection: number | null = null;
	private touchMove = 0;
	private touchMoveDiff = 0;
	private wheelTime = - 1;
	private wheelDeltaMem = 0;

	private tween = new Animator();
	private tweenValue = this.tween.add( 'value', 0, Easings.easeInOutCubic );

	constructor( count = 1 ) {

		super();
		this.setCount( count );

	}

	setCount( count: number ) {

		this.count = Math.max( 1, count );
		this.reset();

	}

	reset() {

		this.value = 0;
		this.target = 0;
		this.current = 0;
		this.velocity = 0;
		this.velocityVelocity = 0;
		this.touching = false;
		this.touchStartSection = null;
		this.touchMove = 0;
		this.touchMoveDiff = 0;
		this.tween.reset();

	}

	get progress() {

		return this.count > 1 ? this.value / ( this.count - 1 ) : 0;

	}

	update( dt: number ) {

		this.tween.update( dt );
		const prevTarget = this.target;

		if ( this.tween.isAnimating( 'value' ) ) {

			this.value = this.tweenValue.value as number;
			this.target = Math.round( this.value );

		} else if ( this.touching ) {

			this.value = this.touchStartValue + this.touchMove;

		} else {

			if ( this.touchStartSection !== null ) {

				if ( this.target === this.touchStartSection && Math.abs( this.touchMoveDiff ) > 0.05 ) {

					this.target += Math.sign( this.touchMoveDiff );
					this.touchMoveDiff = 0;

				}

				this.touchStartSection = null;

			} else {

				this.target = Math.round( this.value + ( this.velocity > 0 ? 0.45 : - 0.45 ) );

			}

			this.target = Math.max( 0, Math.min( this.count - 1, this.target ) );

			// Reference constants per 60 Hz frame; `k` rescales the per-frame terms to this step.
			const k = dt * 60;
			const gravity = this.target - this.value;
			this.velocityVelocity += gravity * dt * 0.3;
			this.velocityVelocity *= Math.pow( 0.86, k ) * ( 1 - dt * 2 );
			this.velocity += this.velocityVelocity * 10 * dt;
			this.velocity *= Math.pow( 1 - ( 1 / 60 ) * 8, k );
			this.value += this.velocity * k;

		}

		const nearest = Math.round( this.value );
		if ( nearest !== this.current ) {

			this.current = nearest;
			this.velocityVelocity = 0;
			this.emit( 'current', nearest );

		}

		if ( this.target !== prevTarget ) this.emit( 'target', this.target );

	}

	/**
	 * Wheel input in section units (reference: deltaY * 5e-5).
	 * Drops the decaying tail of trackpad inertia: a smaller delta within 100 ms of the last one is ignored.
	 */
	addVelocity( delta: number, timeStampMs: number ) {

		if ( ! this.enabled || this.tween.isAnimating( 'value' ) ) return;

		const dtMs = timeStampMs - this.wheelTime;
		const shrinking = Math.abs( delta ) - Math.abs( this.wheelDeltaMem ) < 0;
		this.wheelTime = timeStampMs;
		this.wheelDeltaMem = delta;
		if ( dtMs < 100 && shrinking ) return;

		this.velocityVelocity += delta;

	}

	touchStart() {

		if ( ! this.enabled || this.tween.isAnimating( 'value' ) ) return;
		this.touching = true;
		this.touchStartValue = this.value;
		this.touchStartSection = Math.round( this.value );
		this.touchMove = 0;
		this.touchMoveDiff = 0;

	}

	/** Pointer delta in CSS pixels since the last move (positive = finger moving down). */
	touchMoveBy( deltaPx: number ) {

		if ( ! this.touching ) return;
		const d = deltaPx * 0.0005;
		this.touchMove -= d;
		this.touchMoveDiff -= d * 5;

	}

	touchEnd( releaseDeltaPx: number ) {

		if ( ! this.touching ) return;
		this.touching = false;
		this.velocity -= releaseDeltaPx * 2 * 0.0005;

	}

	/** Programmatic move (buttons, keyboard, timeline dots, choreography). */
	move( section: number, duration = 1 ): Promise<boolean> {

		const to = Math.max( 0, Math.min( this.count - 1, section ) );
		this.tween.set( 'value', this.value );
		this.velocity = 0;
		this.velocityVelocity = 0;
		return this.tween.animate( 'value', to, duration );

	}

	/** True only while `jump()` emits, so listeners (the director) can apply the change instantly. */
	jumping = false;

	/** Jump without animation (seek, deep links). Section looks switch instantly too. */
	jump( section: number ) {

		this.tween.set( 'value', section );
		this.value = section;
		this.velocity = 0;
		this.velocityVelocity = 0;
		const prev = this.target;
		this.target = this.current = Math.round( section );
		this.jumping = true;
		if ( prev !== this.target ) this.emit( 'target', this.target );
		this.jumping = false;

	}

}
