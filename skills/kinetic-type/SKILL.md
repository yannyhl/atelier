---
name: kinetic-type
description: Typography in motion for @atelier/stage pages - 3D BitmapText titles from runtime glyph atlases (createGlyphAtlas from any loaded web font, charset and capacity, the 0/1/2 spin-in hop reveal, fitting text to the viewport width), DOM per-character reveals (splitChars, prepareReveal, setRevealed, vertical CJK columns), deterministic ScrambleText subtitles, the rainbow per-character CTA, heavy tracking, self-hosted font strategy and screen-reader handling. Use when the user asks for animated titles or wordmarks, letters that spin, hop, type or scramble in, text drawn in WebGL, a manifesto or subtitle reveal, vertical Japanese text, a rainbow call to action, choosing or loading fonts, letter-spacing and type scale in the JUNNI / loanmeme style, or text that is invisible to screen readers.
---

# Kinetic type

Type in this DNA is a performer: titles spin in glyph by glyph in 3D, statements reveal character by character in the DOM, subtitles type themselves out through noise, and the final call to action cycles through the rainbow.
Heavy letter-spacing and a rounded display face carry the identity; every animated word still exists as real, readable text.
This skill covers the 3D path (`BitmapText`, `createGlyphAtlas`), the DOM path (`splitChars`, `prepareReveal`, `setRevealed`, `ScrambleText`) and the font and accessibility rules around both.

## Choose the path

| Need | Use | Why |
|---|---|---|
| A short title that lives in the 3D set, moves with the camera, gets bloom | `BitmapText` | One draw call, shader-driven reveal, depth and post like any mesh. |
| Paragraphs, statements, CTAs, anything selectable or long | DOM with `prepareReveal` | Crisp at any size, translatable, accessible for free. |
| Subtitles and captions that "type" in | `ScrambleText` | Deterministic noise on the stage clock. |
| A word that must shimmer | per-character hue (recipe below) | Matches the reference `REWARDED!`. |

Rule: never put long copy in WebGL; and when a title is drawn in 3D, keep its DOM twin visually hidden, not deleted.

## 3D titles with BitmapText

```ts
import { Color } from 'three';
import { Easings } from '@atelier/stage';
import { BitmapText, createGlyphAtlas } from '@atelier/stage/effects';

const font = '700 96px Comfortaa';
const copy = 'atelier';
await document.fonts.load( font, copy );

const atlas = createGlyphAtlas( copy, font );
const reveal = stage.animator.add( 'intro.title', 0, Easings.linear );
const ink = new Color( '#35566b' ); // sRGB token -> linear working space
const title = new BitmapText( { atlas, reveal, time: stage.time, size: 1.15, capacity: 16, color: [ ink.r, ink.g, ink.b ] } );
title.setText( copy, 0.08 );
```

- **Font loading**: `createGlyphAtlas` draws with Canvas2D immediately, so the face must already be loaded; it warns in the console (`document.fonts.check`) when it is not, but still bakes the fallback face.
  Always `await document.fonts.load( font, copy )` first; passing the copy matters for fonts split by `unicode-range` (CJK).
- **Charset**: pass exactly the characters the copy uses (duplicates are removed).
  Characters missing from the atlas render as blank spaces, silently.
  The atlas is a square-ish grid of `tile` px cells (default 128, font 96 px); past about 1000 glyphs the tile shrinks automatically so the atlas fits 4096 px, and the font size must shrink with it (for example `700 48px` at a 64 px tile), so large CJK charsets are better as DOM text.
- **Capacity**: the maximum number of characters, spaces included (default 48); `setText` truncates beyond it.
- **Color**: `color` is written straight to the linear scene buffer, so convert hex tokens with `new Color( hex )` first.
- **Tracking**: `setText( text, tracking )` adds `tracking` em per glyph (default 0.08); wordmarks use about 0.04 to 0.1 in 3D, which reads like the DOM's heavier tracking once bloom softens the edges.
- **Layout**: one centered line; `title.width` is the unscaled width in world units.
  For two lines, use two `BitmapText` meshes sharing the atlas, each with its own reveal value, and delay the second.

### The reveal

`reveal` runs 0 (hidden) to 1 (shown) to 2 (dismissed).
Each glyph spins a full turn around Y, hops, and scales up, staggered left to right with a fixed spread of 1.2; the exit spins another turn and shrinks, in the same order.
Tween it with `Easings.linear` (the shader eases per glyph), and re-arm before entering again:

```ts
enter() {

	if ( reveal.value >= 1.5 ) a.set( 'intro.title', 0 );
	void a.animate( 'intro.title', 1, 1.6, { delay: 0.2 } );

},
leave() {

	void a.animate( 'intro.title', 2, 0.9 );

},
```

Timing: for `n` visible glyphs and group duration `D`, each glyph animates `D / 2.2` s and glyphs start `D * 1.2 / ( 2.2 * n )` s apart.
The DNA's 70 ms per glyph therefore means `D = 0.07 * n * 2.2 / 1.2`, about `0.128 * n` seconds (0.9 s for 7 letters).
The starter's 1.6 s on 7 letters is a slower, 125 ms stagger; pick deliberately.

### Fit to the viewport

Titles must fit on phones without a breakpoint.
Every step, scale the mesh so it spans at most 84% of the visible width at its depth, and never beyond its designed size.
`visibleSizeAt( camera, point )` from `@atelier/stage` returns the world width and height the camera sees at a point:

```ts
const at = new Vector3();
stage.add( {
	update() {

		const visibleW = visibleSizeAt( camera, title.getWorldPosition( at ) ).width;
		title.scale.setScalar( Math.min( 1, ( visibleW * 0.84 ) / Math.max( title.width, 1e-3 ) ) );

	},
} );
```

It reads `camera.fov` after `SectionTrack` has widened it by `portraitWeight`, so it composes with the portrait FOV instead of fighting it.
Use the section's `def.update` instead of a separate system when the title belongs to one section (the starter does).

## DOM reveals

```html
<p class="section__lede" data-reveal>
	<span data-reveal-line>Somewhere between a page and a film,</span>
	<span data-reveal-line>a stage is waiting for its first scene.</span>
</p>
```

```ts
document.querySelectorAll<HTMLElement>( '[data-reveal]' ).forEach( ( el ) => prepareReveal( el ) );
director.onChange = ( i, def ) => {

	document.querySelectorAll<HTMLElement>( '[data-reveal]' ).forEach( ( el ) => setRevealed( el, el.closest<HTMLElement>( '[data-section]' )?.dataset.section === def.name ) );

};
```

- `prepareReveal( root, lineGap = 4 )` adds `.at-reveal` and splits every `[data-reveal-line]` inside with `splitChars`, continuing a running `--i` with a 4-character pause between lines.
- `splitChars( el, startIndex )` inserts one visually hidden `.at-sr` copy of the text for screen readers, then `aria-hidden` `.at-char` spans grouped into no-wrap `.at-word` spans with real spaces between them, so lines break only between words; Han, kana and Hangul characters stay individually breakable.
- `chrome.css` animates each character from transparent and 15 px right to `var(--at-reveal-color, var(--at-white))` in place: color over 2 s, movement over 1 s, delayed `0.2s + i * 60ms`, all `--at-ease-out`.
- `setRevealed( root, visible )` toggles `data-visible`; hiding runs the same staggered transition back to transparent, first character first.
- Reduced motion collapses it to a 0.3 s color fade with no movement or stagger.
- Split inside the experience chunk; the hidden reveal state only applies under `.is-webgl`, so after a runtime fallback the split text simply shows.
- Splitting breaks ligatures and kerning pairs between characters; avoid it for scripts that need shaping (Arabic, Devanagari) and reveal whole lines there.

Vertical CJK columns: add `at-reveal--vertical` (sets `writing-mode: vertical-rl` and slides from above) and `lang="ja"`.
The reference also wipes a 40% black bar down each column over 1.5 s, 0.2 s apart; the CSS is in [references/recipes.md](references/recipes.md).

## Scramble subtitles

`ScrambleText( el, noise, noiseLength = 3, stepSeconds = 0.04 )` is a stage system: it types the text in over `duration` (default `max( 0.4, length * 0.035 )` s) with up to three trailing noise glyphs, re-rolled every 40 ms from `stage.rng`, so captures are identical.
Add it with `stage.add( scramble )` and call `scramble.write( text, duration )`; hide the container with the scheduler, not `setTimeout` (the reference held subtitles 3.5 s).
It renders into an `aria-hidden` span next to a visually hidden `.at-sr` copy of the final text, so screen readers never hear the noise.
The default noise is ASCII, which every Latin subset renders; pass katakana (the reference's look) only when a Japanese face is loaded, or it falls back to a system face and jumps in width.
The full subtitle recipe with its live region is in [references/recipes.md](references/recipes.md).

## Rainbow call to action

The reference colors each character of the final word with `hsl( ( ( 0.2 * t ) % 1 - 0.05 * i ) * 360deg, 80%, 50% )`: a 5 s hue cycle with each letter 18 degrees behind the previous.
Prefer the CSS version (a registered `--at-hue` property animated per character, with a negative delay per `--i`) so it costs no JavaScript and `lockDocumentAnimations` freezes it for video; use the stage-clock class when the hue must react to the scene.
Both are in [references/recipes.md](references/recipes.md).
Do not put the rainbow word inside an `.at-reveal` root: both drive `color` on `.at-char`.

## Tracking and scale

- UI and body: 0.2em minimum (`--at-track-ui`); statements: 0.3em (`--at-track-wide`) up to 0.4em; CJK manifesto: 0.35em.
- Display wordmarks stay lowercase with tight tracking (about 0.04em); statements go uppercase with wide tracking.
- Size with `clamp( min, vw, max )`, not raw `vw` as the reference did, so text stops growing on wide screens and stays legible on phones.
- Letter-spacing also adds space after the last character, which pushes centered text left by half the tracking; compensate with `margin-right: calc( -1 * var(--at-track-wide) )` on centered statements.
- Keep at least 11 px for any text a user must read; the reference's 8 px copyright is below that.

The complete type scale with every measured size and tracking is in [references/type-scale.md](references/type-scale.md).

## Fonts

1. Self-host with `@fontsource` and import only the subsets and weights you use: `@import '@fontsource/comfortaa/latin-700.css';` and `@import '@fontsource/jura/latin-500.css';` (the starter).
2. Two families, three at most (display plus UI, optionally an accent serif); the reference loaded eight from Google Fonts and never used two of them.
3. `font-display: swap` (the @fontsource default) keeps the static page readable while fonts load; the 3D atlas waits for `document.fonts.load` instead.
4. CJK: subset to the exact text with `python3 scripts/subset-font.py --font NotoSansJP[wght].ttf --weight 500 --html index.html --lang ja --out public/fonts/noto-sans-jp-500-subset.woff2` (collects every character inside `lang="ja"` elements, pins the weight, writes WOFF2; needs `pip install fonttools brotli`), ship the font's license next to it, and re-run it whenever the copy changes.
   In example 001 this turned a 113 KB render-blocking `@font-face` list plus 57 to 64 KB chunks into one 8.9 KB file.
   The @fontsource `unicode-range` split CSS is the fallback for copy that changes at runtime.
5. Only fonts with a license that allows web embedding (OFL for everything on @fontsource); never commit a font file without its license.
6. Name fallbacks with similar metrics in the stack (`'Comfortaa', ui-rounded, system-ui, sans-serif`) to limit the swap shift.

## Screen readers

- Text drawn in 3D: keep the real heading in the section, visually hidden in stage mode (the starter clips `.section__title` under `.is-webgl`); the canvas stays `aria-hidden="true"`.
- `splitChars` and `ScrambleText` already give assistive tech one `.at-sr` copy of the real text and hide the animated characters; do not add `aria-label` to split elements (ARIA does not allow names on plain `span` and `p`).
- For extra visually hidden text, use the `.at-sr` class from `chrome.css`.
- Put `aria-live="polite"` on a subtitle element so each new line is announced once when written.
- Rainbow and reveal colors must still meet contrast at rest (white on the black stage passes; check the lime and slate on the ice sky).

## Done when

- The atlas shows the intended face (compare against DOM text in the same font) at phone and desktop captures, with no missing glyphs.
- Titles fit within the viewport from 390 px wide portrait to 1920 px landscape.
- Every reveal has an exit (state 2 or a reverse) and replays correctly when scrolling back.
- VoiceOver or NVDA reads every heading and statement once, in order, with no letter-by-letter spelling and no scramble noise.
- `?static` shows the same copy, unsplit, in the right fonts.
