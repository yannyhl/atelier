/**
 * The circular "SCROLL" button: a rotating gradient ring, a fill that follows the cursor,
 * overshoot entrance, anticipation exit. It is a real <button>, so it is keyboard reachable.
 */
export class ScrollRing {

	readonly el: HTMLButtonElement;
	private fill: HTMLElement;

	constructor( parent: HTMLElement, label = 'SCROLL', onClick?: () => void ) {

		const el = document.createElement( 'button' );
		el.type = 'button';
		el.className = 'at-ring';
		el.dataset.visible = 'false';
		el.setAttribute( 'aria-label', 'Next section' );
		el.innerHTML = `
			<span class="at-ring__fill"></span>
			<svg class="at-ring__spin" viewBox="0 0 200 200" fill="none" aria-hidden="true">
				<defs><linearGradient id="at-ring-g"><stop offset="0%" stop-color="currentColor" stop-opacity="0"/><stop offset="100%" stop-color="currentColor"/></linearGradient></defs>
				<circle cx="100" cy="100" r="98" stroke="url(#at-ring-g)" stroke-width="2"/>
			</svg>
			<span class="at-ring__label"></span>`;
		( el.querySelector( '.at-ring__label' ) as HTMLElement ).textContent = label;
		this.fill = el.querySelector( '.at-ring__fill' ) as HTMLElement;

		el.addEventListener( 'pointermove', ( e ) => {

			const r = el.getBoundingClientRect();
			this.fill.style.left = `${e.clientX - r.left}px`;
			this.fill.style.top = `${e.clientY - r.top}px`;

		} );

		if ( onClick ) el.addEventListener( 'click', onClick );
		parent.appendChild( el );
		this.el = el;

	}

	setVisible( visible: boolean ) {

		this.el.dataset.visible = String( visible );
		this.el.tabIndex = visible ? 0 : - 1;

	}

}
