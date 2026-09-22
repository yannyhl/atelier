import type { Stage, StageSystem } from '../core/Stage';

const NOISE = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ01#%&*+<>/\\';

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

	constructor( public el: HTMLElement, private noise = NOISE, private noiseLength = 3, private stepSeconds = 0.04 ) {}

	write( text: string, duration = Math.max( 0.4, text.length * 0.035 ) ) {

		this.text = text;
		this.duration = duration;
		this.elapsed = 0;
		this.tick = 0;
		this.active = true;
		this.el.setAttribute( 'aria-label', text );

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
		this.el.textContent = this.text.slice( 0, n ) + tail;
		if ( p >= 1 ) this.active = false;

	}

	reset() {

		this.active = false;
		this.el.textContent = '';

	}

}
