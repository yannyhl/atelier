# Page, CSS modes and chrome

The page is a complete static document first and a stage second.
Everything here mirrors `templates/experience-starter`; keep the class names so shared scripts (`npm run capture`, `npm run audit`) keep working.

## Document skeleton

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
		<meta name="theme-color" content="#000000" />
		<title>Project</title>
		<script>
			try {
				if ( ! /[?&]static\b/.test( location.search ) && document.createElement( 'canvas' ).getContext( 'webgl2' ) ) document.documentElement.classList.add( 'is-webgl' );
			} catch ( e ) {}
		</script>
	</head>
	<body>
		<div class="app" id="app">
			<canvas class="stage" id="stage" aria-hidden="true"></canvas>
			<div class="loader" aria-hidden="true"><span class="loader__mark">project</span></div>
			<main class="sections">
				<section class="section section--intro" data-section="intro" id="intro" aria-labelledby="intro-title">
					<h1 class="section__title" id="intro-title">project</h1>
					<p class="section__lede" data-reveal><span data-reveal-line>First line of real copy.</span></p>
				</section>
				<!-- one <section> per stage section, in scroll order -->
			</main>
			<footer class="footer">
				<div class="footer__dots" id="dots"></div>
				<p class="footer__copy">&copy; 2026 Project</p>
			</footer>
			<div class="ring-slot" id="ring"></div>
		</div>
		<script type="module" src="/src/main.ts"></script>
	</body>
</html>
```

Why the inline script: the class must exist before first paint, so the first frame already has the stage layout (black app, loader) and nothing moves when WebGL arrives.
A module script runs after parsing, too late for that.
The probe's throwaway context on a detached canvas is the only WebGL work before first paint; keep anything else out of the head script.

## Boot sequence

1. `main.ts` imports CSS, then `import( './experience' )` only under `is-webgl`, so three.js is a separate chunk that never delays the static paint.
2. `boot()` creates the `Stage`, subscribes to `fallback`, and returns to the static page on tier 0.
3. Sections are built with `await yieldToMain()` between heavy steps, so no single task blocks input.
4. Warm up: make everything visible, enable all camera layers, `await renderer.compileAsync( scene, camera )`, restore layers.
5. `director.reset()`, `stage.reset()`, `stage.seek( 0 )`: the first frame is rendered deterministically before anything shows.
6. Add `is-ready`, call `stage.markReady()` (capture and audit scripts wait on `window.__atelier.ready`), `stage.start()`.
7. After the intro (`stage.scheduler.after( 0.6, splash )`), add `is-splashed`, unlock input, show the ring and run the first reveal.

## CSS modes

Static mode is the default and the fallback; stage mode is layered on with `.is-webgl`.

```css
/* static: sections are normal full-height blocks with painted backgrounds */
.stage { position: fixed; inset: 0; width: 100%; height: 100%; opacity: 0; pointer-events: none; transition: opacity 1s var(--at-ease-out); }
.section { min-height: 100svh; display: grid; place-content: center; padding: 6rem var(--at-gutter); }

/* stage: the document stops scrolling, the app becomes a fixed viewport */
.is-webgl, .is-webgl body { height: 100%; overflow: hidden; overscroll-behavior: none; }
.is-webgl .app { position: fixed; inset: 0; height: 100dvh; touch-action: none; user-select: none; -webkit-user-select: none; }
.is-ready .stage { opacity: 1; }

/* stage: sections stack and only the current one shows and takes pointer input */
.is-webgl .sections { position: absolute; inset: 0; pointer-events: none; }
.is-webgl .section { position: absolute; inset: 0; min-height: 0; background: none; opacity: 0; transition: opacity var(--at-dur-fade) var(--at-ease-out); }
.is-webgl .section[data-visible='true'] { opacity: 1; pointer-events: auto; transition-delay: 0.3s; }

/* chrome fades in after the splash */
.is-webgl .footer { position: absolute; left: 0; right: 0; bottom: env(safe-area-inset-bottom); height: 60px; opacity: 0; transition: opacity var(--at-dur-chrome) var(--at-ease-out); }
.is-webgl.is-splashed .footer { opacity: 1; }
```

The loader is `display: none` in static mode, a full black layer under `.is-webgl`, and fades out (`0.5s`) under `.is-ready`.
The 0.3 s delay on the incoming section lets the outgoing one fade first, as in the reference.
Keep the one breakpoint at 800 px for chrome only (footer 50 px, ring 72 px); the 3D layout adapts through `portraitWeight`, not breakpoints.

Per-section chrome color comes from `data-section` on `<html>`, for example the slate UI on the light intro sky:

```css
.is-webgl[data-section='intro'] .footer,
.is-webgl[data-section='intro'] .at-ring { color: var(--at-slate); }
```

## Fallback matrix

| Trigger | Caught by | Result |
|---|---|---|
| No WebGL2, or `?static` | inline head script | `is-webgl` never set; the 3D chunk never loads. |
| Chunk import throws | `main.ts` catch | Classes removed. |
| Probe says tier 0 (software GL, `?tier=0`) | `boot()` check and the `fallback` event | Classes removed, stage disposed. |
| Frame monitor downgrades to tier 0 | `fallback` event | Same. |
| `webglcontextlost` | `fallback` event | Same. |

In every case the handler also calls `clearSectionDom()` (from `@atelier/stage/dom`), which removes `inert`, `data-visible` and `data-state` from the sections and `data-section` from `<html>`, so the static page is fully reachable and scrolls natively again.
Split reveal text stays visible because the hidden `.at-reveal` state only applies under `.is-webgl`.
Test each row: `?static`, `?tier=0`, and in DevTools `WEBGL_lose_context.loseContext()` on the stage canvas.

## Chrome

`ScrollRing( parent, label = 'SCROLL', onClick )` builds a `<button class="at-ring">` with `aria-label="Next section"`, a rotating gradient ring (2 s linear, stopped under reduced motion), a cursor-following fill that scales to 2 on hover, the overshooting `--at-ease-enter` entrance and the anticipating `--at-ease-exit` exit.
`setVisible( false )` also removes it from the tab order.
A fourth argument sets the accessible name (default `'Next section'`).
Its CSS positions it at the bottom center of the nearest positioned ancestor (`.app`); on phones lift it above the footer with `bottom: calc(56px + env(safe-area-inset-bottom))`.

`TimelineDots( parent, labels, onSelect )` builds an `<ol class="at-dots" aria-label="Sections">` of labelled 20 px buttons; `set( i )` writes `data-state` (ready, viewing, passed) and `aria-current="step"`.
Use the section's human label (`def.label`), not "Section 3".
A fourth argument names the list (default `'Sections'`); pass translated names to both components on non-English pages.

Import the styles once, tokens first:

```css
@import '@atelier/stage/dom/tokens.css';
@import '@atelier/stage/dom/chrome.css';
```

## Accessibility checklist

- Every section is a `<section>` with a heading and `aria-labelledby`; content drawn in 3D keeps a visually hidden DOM twin (`.at-sr` from `chrome.css` is the visually hidden utility).
- The canvas and loader are `aria-hidden="true"`.
- Hidden sections are `inert` (the director does it), so focus cannot land in invisible content.
- All controls are `<button>` or `<a href>`, with visible `:focus-visible` outlines.
- Keyboard: arrows, Page keys, Space, Home and End move sections; Space and Enter on a focused control press it instead.
- `prefers-reduced-motion`: discrete moves, no parallax, no shake, no ring spin, reveals shortened to a 0.3 s fade.
- Browser zoom and pinch zoom keep working (`bindScrollInput` ignores ctrl+wheel).
- Optional: a visually hidden `aria-live="polite"` element updated in `director.onChange` with `def.label` announces section changes to screen-reader users who navigate with the keys.

## iOS and mobile

- `viewport-fit=cover` plus `env(safe-area-inset-*)` on anything pinned to an edge.
- `100dvh` on the fixed app follows the collapsing toolbar; `100svh` for static sections avoids jumps while scrolling.
- `overscroll-behavior: none` on `html` and `body` stops pull-to-refresh and rubber-banding; `touch-action: none` on `.app` keeps pointer events flowing during vertical drags.
- `-webkit-text-size-adjust: 100%` stops landscape font inflation; `-webkit-tap-highlight-color: transparent` on custom buttons.
- Coarse pointers get no cursor parallax or trail (`trackPointer` returns a no-op), which also saves battery.
- Test on a real iPhone: Safari's toolbar, the home indicator and low-power mode (rAF at 30 Hz, handled by the fixed-step clock) all show up only there.
