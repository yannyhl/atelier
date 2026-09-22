import type { Stage, StageSystem } from '../core/Stage';

/** ASCII noise renders in any Latin font subset; pass katakana only when a CJK font is loaded. */
const NOISE = '01#%&*+<>/\\=?[]{}_^~';

/**
 * Types text in with a trailing burst of noise glyphs (the reference subtitle writer),
 * driven by the stage clock and rng so captures are deterministic.
 */
export class ScrambleText implements StageSystem {

	private text = '';
	private elapsed = 0;
	private duration = 1;
	private tick = 0;
	private active = false;

	private visible: HTMLElement;
	private sr: HTMLElement;

	constructor( public el: HTMLElement, private noise = NOISE, private noiseLength = 3, private stepSeconds = 0.04 ) {

		// Screen readers get the final text once; the animated glyphs are hidden from them.
		this.sr = document.createElement( 'span' );
		this.sr.className = 'at-sr';
		this.visible = document.createElement( 'span' );
		this.visible.setAttribute( 'aria-hidden', 'true' );
		el.replaceChildren( this.sr, this.visible );

	}

	write( text: string, duration = Math.max( 0.4, text.length * 0.035 ) ) {

		this.text = text;
		this.duration = duration;
		this.elapsed = 0;
		this.tick = 0;
		this.active = true;
		this.sr.textContent = text;

	}

	update( dt: number, stage: Stage ) {

		if ( ! this.active ) return;
		this.elapsed += dt;
		this.tick += dt;
		if ( this.tick < this.stepSeconds && this.elapsed < this.duration ) return;
		this.tick = 0;

		const p = Math.min( 1, this.elapsed / this.duration );
		const n = Math.floor( this.text.length * p );
		let tail = '';
		if ( p < 1 ) for ( let i = 0; i < this.noiseLength; i ++ ) tail += this.noise[ Math.floor( stage.rng() * this.noise.length ) ];
		this.visible.textContent = this.text.slice( 0, n ) + tail;
		if ( p >= 1 ) this.active = false;

	}

	reset() {

		this.active = false;
		this.visible.textContent = '';
		this.sr.textContent = '';

	}

}
