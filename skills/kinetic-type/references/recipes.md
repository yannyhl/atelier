# Kinetic type recipes

Each recipe uses only `@atelier/stage` APIs and the tokens in `@atelier/stage/dom/tokens.css`.
The TypeScript typechecks against the engine; the CSS assumes `tokens.css` and `chrome.css` are imported.

## Visually hidden text and reveal lines

`chrome.css` ships `.at-sr`, the visually hidden utility; use it for any extra screen-reader-only text.
Reveal lines need no extra markup: `splitChars` inserts an `.at-sr` copy of each line and hides the character spans, and the static page (never split) reads the plain text.

```html
<p class="section__lede" data-reveal>
	<span data-reveal-line>Somewhere between a page and a film,</span>
	<span data-reveal-line>a stage is waiting for its first scene.</span>
</p>
```

## Vertical CJK manifesto

The reference's section 5: vertical columns right to left, each character sliding in with the 60 ms stagger, and a 40% black bar wiping down behind each column over 1.5 s, columns 0.2 s apart.

```html
<div class="manifesto at-reveal--vertical" data-reveal lang="ja">
	<p class="manifesto__col" data-reveal-line>理想をトコトン突き詰めるために</p>
	<p class="manifesto__col" data-reveal-line>いつも柔軟な発想を</p>
</div>
```

```css
.manifesto {
	height: 50vh;
	font-family: 'Noto Sans JP', system-ui, sans-serif;
	font-size: 17px;
	letter-spacing: 0.35em;
}

.manifesto__col {
	position: relative;
	z-index: 0;
	margin: 0;
	padding: 10px 0;
}

.manifesto__col + .manifesto__col {
	margin-block-start: 0.6em;
}

.manifesto__col::before {
	content: '';
	position: absolute;
	inset: 0;
	z-index: -1;
	background: rgb(0 0 0 / 0.4);
	transform: scaleY(0);
	transform-origin: top;
	transition: transform 1.5s var(--at-ease-out) calc(var(--line, 0) * 0.2s);
}

.manifesto[data-visible='true'] .manifesto__col::before {
	transform: scaleY(1);
}

@media (max-width: 800px) {
	.manifesto {
		font-size: 16px;
		letter-spacing: 0.2em;
	}
}
```

```ts
const manifesto = document.querySelector<HTMLElement>( '.manifesto' )!;
prepareReveal( manifesto );
manifesto.querySelectorAll<HTMLElement>( '[data-reveal-line]' ).forEach( ( line, j ) => line.style.setProperty( '--line', String( j ) ) );
setRevealed( manifesto, true );
```

`.at-reveal--vertical` sets `writing-mode: vertical-rl` on the root, so its block children become columns that flow right to left as Japanese reads; `margin-block-start` spaces them (block-start is the right side in `vertical-rl`).
Do not make the root a flex row: in vertical writing modes the row axis is vertical, so the columns would stack.
Load the CJK face with its `unicode-range` slices or a subset (see `SKILL.md`), and pass the manifesto text to `document.fonts.load` if anything draws it to canvas.

## Scramble subtitles

```html
<div class="subtitle" data-visible="false">
	<p class="subtitle__text" aria-live="polite"></p>
</div>
```

```css
.subtitle {
	position: absolute;
	left: 0;
	right: 0;
	bottom: calc(60px + env(safe-area-inset-bottom));
	display: flex;
	justify-content: center;
	pointer-events: none;
	opacity: 0;
	transition: opacity 0.5s var(--at-ease-out);
}

.subtitle[data-visible='true'] {
	opacity: 1;
}

.subtitle__text {
	margin: 0;
	padding: 5px 10px;
	background: rgb(0 0 0 / 0.9);
	box-decoration-break: clone;
	-webkit-box-decoration-break: clone;
	font-size: min(15px, 2vw);
	line-height: 2;
}

@media (max-width: 800px) {
	.subtitle {
		bottom: calc(80px + env(safe-area-inset-bottom));
	}

	.subtitle__text {
		font-size: 2.8vw;
	}
}
```

```ts
const scramble = new ScrambleText( document.querySelector<HTMLElement>( '.subtitle__text' )! );
stage.add( scramble );
const box = document.querySelector<HTMLElement>( '.subtitle' )!;

function say( text: string ) {

	const duration = Math.max( 0.4, text.length * 0.035 );
	box.dataset.visible = 'true';
	scramble.write( text, duration ); // the .at-sr copy is set once, so the live region announces it once
	stage.scheduler.after( duration + 3.5, () => ( box.dataset.visible = 'false' ) );

}
```

Call `say( subtitles[ i ] )` from `director.onChange`.
`ScrambleText` puts an `.at-sr` copy and an `aria-hidden` animated span inside the element; the noise ticks never reach the live region.
The default noise is ASCII so a Latin-only subset renders it; pass katakana noise (second argument) only when a Japanese face is loaded.
The reference typed at 40 ms ticks over 1 s and held each subtitle 3.5 s.

## Rainbow word, CSS version

```html
<h2 class="section__title section__title--cta">Early will be <span class="rainbow-chars">rewarded</span></h2>
```

```css
@property --at-hue {
	syntax: '<number>';
	inherits: false;
	initial-value: 0;
}

@keyframes at-hue-cycle {
	to {
		--at-hue: 360;
	}
}

.rainbow-chars .at-char {
	display: inline-block;
	color: hsl(calc(var(--at-hue) * 1deg) 80% 50%);
	animation: at-hue-cycle 5s linear infinite;
	/* -60s is a whole number of 5 s cycles, so each letter lags the previous by 0.25 s (18 degrees) from the first frame */
	animation-delay: calc(-60s + var(--i) * 0.25s);
}

@media (prefers-reduced-motion: reduce) {
	.rainbow-chars .at-char {
		animation: none;
		color: hsl(calc(var(--i) * -18deg) 80% 50%);
	}
}
```

```ts
splitChars( document.querySelector<HTMLElement>( '.rainbow-chars' )! );
```

Split it inside the experience chunk; the `.at-sr` copy keeps the heading's accessible name ("Early will be rewarded").
The static page never runs the split, so keep a fallback on the unsplit word, for example the starter's gradient text: `html:not(.is-webgl) .rainbow-chars { background: linear-gradient(90deg, #ff4d6d, #ffb84d, #d9ff4d, #4dffb8, #4db8ff, #b84dff); -webkit-background-clip: text; background-clip: text; color: transparent; }`.
In capture mode `lockDocumentAnimations( stage )` drives these animations from the stage clock, so video frames match.

## Rainbow word, stage-clock version

Use this when the hue should respond to the scene (speed up with the finale's bloom, freeze on a beat):

```ts
import type { Stage, StageSystem } from '@atelier/stage';
import { splitChars } from '@atelier/stage/dom';

/** Per-character rainbow on the stage clock (reference: hsl((0.2 t % 1 - 0.05 i) * 360deg, 80%, 50%)). */
export class RainbowText implements StageSystem {

	private chars: HTMLElement[];

	constructor( el: HTMLElement ) {

		splitChars( el );
		this.chars = Array.from( el.querySelectorAll<HTMLElement>( '.at-char' ) );

	}

	update( _dt: number, stage: Stage ) {

		const t = stage.time.value;
		this.chars.forEach( ( c, i ) => c.style.setProperty( 'color', `hsl(${( ( ( t * 0.2 ) % 1 ) - 0.05 * i ) * 360}deg 80% 50%)` ) );

	}

}

stage.add( new RainbowText( document.querySelector<HTMLElement>( '.rainbow-chars' )! ) );
```

It writes styles every fixed step; keep it to one short word.

## Two-line 3D title

```ts
const lineA = new BitmapText( { atlas, reveal: a.add( 'hero.lineA', 0, Easings.linear ), time: stage.time } );
const lineB = new BitmapText( { atlas, reveal: a.add( 'hero.lineB', 0, Easings.linear ), time: stage.time } );
lineA.setText( 'meme' );
lineB.setText( 'bank' );
lineA.position.y = 0.6;
lineB.position.y = - 0.6;
void a.animate( 'hero.lineA', 1, 1 );
void a.animate( 'hero.lineB', 1, 1, { delay: 0.35 } );
```

Build the atlas from both lines' characters, fit the group by the wider line, and exit both to 2 together (or the second first, for a stack that unwinds).
