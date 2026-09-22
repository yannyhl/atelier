/**
 * Tracks a fine pointer in NDC (-1..1, y up). Coarse (touch) pointers are ignored, matching the
 * reference: hover effects and cursor trails are desktop-only, and phones save the work.
 */
export function trackPointer( onMove: ( x: number, y: number ) => void, target: HTMLElement | Window = window ): () => void {

	if ( ! matchMedia( '(hover: hover) and (pointer: fine)' ).matches ) return () => {};

	const handler = ( e: Event ) => {

		const ev = e as PointerEvent;
		if ( ev.pointerType === 'touch' ) return;
		onMove( ( ev.clientX / window.innerWidth ) * 2 - 1, - ( ( ev.clientY / window.innerHeight ) * 2 - 1 ) );

	};

	target.addEventListener( 'pointermove', handler, { passive: true } );
	return () => target.removeEventListener( 'pointermove', handler );

}
