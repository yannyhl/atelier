/**
 * Split an element's text into per-character spans with a `--i` index for CSS staggers.
 * Keeps the original text in aria-label so screen readers read words, not letters.
 * Grapheme-aware (emoji and combining marks stay whole) and works for CJK.
 */
export function splitChars( el: HTMLElement, startIndex = 0 ): number {

	const text = el.textContent ?? '';
	el.setAttribute( 'aria-label', text );
	const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl
		? Array.from( new Intl.Segmenter( undefined, { granularity: 'grapheme' } ).segment( text ), ( s ) => s.segment )
		: Array.from( text );

	el.textContent = '';
	seg.forEach( ( ch, i ) => {

		const span = document.createElement( 'span' );
		span.className = 'at-char';
		span.setAttribute( 'aria-hidden', 'true' );
		span.style.setProperty( '--i', String( startIndex + i ) );
		span.textContent = ch;
		el.appendChild( span );

	} );

	return startIndex + seg.length;

}

/** Split every `[data-reveal]` line inside `root`, continuing the index across lines. */
export function prepareReveal( root: HTMLElement, lineGap = 4 ): void {

	root.classList.add( 'at-reveal' );
	let i = 0;
	root.querySelectorAll<HTMLElement>( '[data-reveal-line]' ).forEach( ( line ) => {

		i = splitChars( line, i ) + lineGap;

	} );

}

export function setRevealed( root: HTMLElement, visible: boolean ) {

	root.dataset.visible = String( visible );

}
