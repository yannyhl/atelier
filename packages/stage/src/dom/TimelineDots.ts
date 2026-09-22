/**
 * Footer section navigation: one dot per section. States follow the section lifecycle
 * (ready / viewing / passed). Each dot is a button with a label, so it doubles as a skip nav.
 */
export class TimelineDots {

	readonly el: HTMLOListElement;
	private dots: HTMLButtonElement[] = [];

	constructor( parent: HTMLElement, labels: string[], onSelect: ( index: number ) => void, listLabel = 'Sections' ) {

		this.el = document.createElement( 'ol' );
		this.el.className = 'at-dots';
		this.el.setAttribute( 'aria-label', listLabel );

		labels.forEach( ( label, i ) => {

			const li = document.createElement( 'li' );
			const b = document.createElement( 'button' );
			b.type = 'button';
			b.className = 'at-dots__dot';
			b.setAttribute( 'aria-label', label );
			b.addEventListener( 'click', () => onSelect( i ) );
			li.appendChild( b );
			this.el.appendChild( li );
			this.dots.push( b );

		} );

		parent.appendChild( this.el );
		this.set( 0 );

	}

	set( current: number ) {

		this.dots.forEach( ( d, i ) => {

			d.dataset.state = i < current ? 'passed' : i === current ? 'viewing' : 'ready';
			if ( i === current ) d.setAttribute( 'aria-current', 'step' );
			else d.removeAttribute( 'aria-current' );

		} );

	}

}
