/** Scripts that break between any two characters (no spaces needed). */
const BREAK_ANYWHERE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/**
 * Split an element's text into per-character spans with a `--i` index for CSS staggers.
 * Characters are grouped into no-wrap `.at-word` spans with real spaces between them, so lines
 * only break between words (CJK characters stay individually breakable).
 * Screen readers get one visually hidden copy of the real text (`.at-sr`); the character spans
 * are aria-hidden. (aria-label is not allowed on plain spans and paragraphs, so it is not used.)
 * Grapheme-aware (emoji and combining marks stay whole).
 */
export function splitChars( el: HTMLElement, startIndex = 0 ): number {

	const text = el.textContent ?? '';
	const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl
		? Array.from( new Intl.Segmenter( undefined, { granularity: 'grapheme' } ).segment( text ), ( s ) => s.segment )
		: Array.from( text );

	el.textContent = '';
	const sr = document.createElement( 'span' );
	sr.className = 'at-sr';
	sr.textContent = text;
	el.appendChild( sr );

	let word: HTMLElement | null = null;
	seg.forEach( ( ch, i ) => {

		if ( /^\s+$/.test( ch ) ) {

			word = null;
			el.appendChild( document.createTextNode( ' ' ) );
			return;

		}

		const span = document.createElement( 'span' );
		span.className = 'at-char';
		span.setAttribute( 'aria-hidden', 'true' );
		span.style.setProperty( '--i', String( startIndex + i ) );
		span.textContent = ch;

		if ( BREAK_ANYWHERE.test( ch ) ) {

			word = null;
			el.appendChild( span );
			return;

		}

		if ( ! word ) {

			word = document.createElement( 'span' );
			word.className = 'at-word';
			word.setAttribute( 'aria-hidden', 'true' );
			el.appendChild( word );

		}

		word.appendChild( span );

	} );

	return startIndex + seg.length;

}

/**
 * Prepare a reveal block: splits every `[data-reveal-line]` inside `root`, continuing the stagger
 * index across lines with `lineGap` extra steps between them.
 */
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

/**
 * Undo SectionDirector DOM state (inert, data-visible, data-state) so a runtime fallback to the
 * static page leaves every section readable and reachable.
 */
export function clearSectionDom( root: ParentNode = document ) {

	root.querySelectorAll<HTMLElement>( 'body [data-section]' ).forEach( ( el ) => {

		el.inert = false;
		el.removeAttribute( 'data-visible' );
		el.removeAttribute( 'data-state' );

	} );
	document.documentElement.removeAttribute( 'data-section' );

}
