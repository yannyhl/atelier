import type { SectionScroller } from './SectionScroller';

export interface InputOptions {
	/** Element that receives wheel and touch. Defaults to window. */
	target?: HTMLElement | Window;
	/** Wheel sensitivity in section units per deltaY pixel. Reference value 5e-5. */
	wheelScale?: number;
	/** Duration for keyboard and button moves. */
	moveDuration?: number;
	/** Reduced motion: moves become short and wheel inertia is replaced by discrete steps. */
	reducedMotion?: boolean;
}

/**
 * Wires wheel, touch and keyboard to a SectionScroller. Returns an unbind function.
 * Keyboard support (arrows, PageUp/PageDown, Space, Home/End) is part of the house style:
 * the reference had none, we always ship it.
 */
export function bindScrollInput( scroller: SectionScroller, options: InputOptions = {} ): () => void {

	const target = options.target ?? window;
	const wheelScale = options.wheelScale ?? 5e-5;
	const reduced = options.reducedMotion ?? false;
	const moveDuration = reduced ? 0.35 : ( options.moveDuration ?? 1 );
	let lastStep = - Infinity;
	let lastWheel = - Infinity;

	const onWheel = ( e: Event ) => {

		const ev = e as WheelEvent;
		// Ctrl+wheel is pinch-zoom on trackpads and browser zoom on mice: never hijack it.
		if ( ev.ctrlKey ) return;
		ev.preventDefault();
		if ( ! scroller.enabled ) return;

		const pixels = ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaMode === 2 ? ev.deltaY * window.innerHeight : ev.deltaY;

		if ( reduced ) {

			// One step per gesture: a new gesture starts after 250 ms without wheel events,
			// so a long trackpad inertia stream can never move two sections.
			const newGesture = ev.timeStamp - lastWheel > 250;
			lastWheel = ev.timeStamp;
			if ( ! newGesture || Math.abs( pixels ) < 4 || ev.timeStamp - lastStep < 400 ) return;
			lastStep = ev.timeStamp;
			void scroller.move( scroller.target + Math.sign( pixels ), moveDuration );
			return;

		}

		scroller.addVelocity( pixels * wheelScale, ev.timeStamp );

	};

	let lastY = 0;
	let lastDelta = 0;
	let activeId: number | null = null;

	const onPointerDown = ( e: Event ) => {

		const ev = e as PointerEvent;
		if ( ev.pointerType !== 'touch' || activeId !== null ) return;
		activeId = ev.pointerId;
		lastY = ev.clientY;
		lastDelta = 0;
		scroller.touchStart();

	};

	const onPointerMove = ( e: Event ) => {

		const ev = e as PointerEvent;
		if ( ev.pointerId !== activeId ) return;
		lastDelta = ev.clientY - lastY;
		lastY = ev.clientY;
		scroller.touchMoveBy( lastDelta );

	};

	const onPointerUp = ( e: Event ) => {

		const ev = e as PointerEvent;
		if ( ev.pointerId !== activeId ) return;
		activeId = null;
		scroller.touchEnd( lastDelta );

	};

	const onKey = ( e: KeyboardEvent ) => {

		if ( ! scroller.enabled || e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey ) return;
		const el = e.target as HTMLElement | null;
		if ( el && ( el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test( el.tagName ) ) ) return;
		// Space and Enter on a focused control press it; they must not scroll the stage.
		if ( el && ( e.key === ' ' || e.key === 'Enter' ) && el.closest( 'button, a[href], [role="button"], summary' ) ) return;

		let next: number | null = null;
		if ( e.key === 'ArrowDown' || e.key === 'PageDown' || ( e.key === ' ' && ! e.shiftKey ) ) next = scroller.target + 1;
		else if ( e.key === 'ArrowUp' || e.key === 'PageUp' || ( e.key === ' ' && e.shiftKey ) ) next = scroller.target - 1;
		else if ( e.key === 'Home' ) next = 0;
		else if ( e.key === 'End' ) next = scroller.count - 1;
		if ( next === null ) return;

		e.preventDefault();
		void scroller.move( next, moveDuration );

	};

	target.addEventListener( 'wheel', onWheel, { passive: false } );
	target.addEventListener( 'pointerdown', onPointerDown );
	window.addEventListener( 'pointermove', onPointerMove );
	window.addEventListener( 'pointerup', onPointerUp );
	window.addEventListener( 'pointercancel', onPointerUp );
	window.addEventListener( 'keydown', onKey );

	return () => {

		target.removeEventListener( 'wheel', onWheel );
		target.removeEventListener( 'pointerdown', onPointerDown );
		window.removeEventListener( 'pointermove', onPointerMove );
		window.removeEventListener( 'pointerup', onPointerUp );
		window.removeEventListener( 'pointercancel', onPointerUp );
		window.removeEventListener( 'keydown', onKey );

	};

}
