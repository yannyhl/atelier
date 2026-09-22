---
name: scroll-stage
description: Build a scroll-driven, section-snapping WebGL page on @atelier/stage - static-first HTML with real section content, the pre-paint is-webgl opt-in, SectionScroller snap physics, bindScrollInput (wheel inertia filter, touch, keyboard, reduced motion), SectionDirector lifecycle and one-hot looks, SectionTrack camera travel between spatially separated sets, ScrollRing and TimelineDots chrome, deep links and fallbacks. Use when the user asks for a scrollytelling or JUNNI / loanmeme style site, a full-screen section snapper, "scroll moves the camera", "each section is its own 3D scene", adding or reordering a section, tuning scroll feel or snapping, fixing trackpad, touch or iOS scrolling, or making a WebGL page accessible, crawlable and safe to fall back.
---

# Scroll stage

A scroll stage is one fixed full-screen canvas over a document that never scrolls natively.
Wheel, touch and keys push a virtual `value` measured in sections, a spring snaps it to whole sections, and a camera travels between 3D sets placed apart in one world.
This skill wires that with `@atelier/stage` exactly the way `templates/experience-starter` does, and keeps the page complete and readable when WebGL never arrives.
Copy the starter instead of starting from nothing, and keep its `src/experience.ts` open while you work.

## The pieces

| Piece | Import | Job |
|---|---|---|
| `SectionScroller` | `@atelier/stage` | Virtual `value` (0..count-1), snap physics, emits `target` and `current`. |
| `bindScrollInput` | `@atelier/stage` | Wheel, touch and keyboard into the scroller; returns an unbind function. |
| `SectionDirector` | `@atelier/stage` | Per-section lifecycle on snap-target change: state and visibility tweens, one-hot looks, post look, DOM attributes, `enter` and `leave`. |
| `SectionTrack`, `Shot`, `shotFromScene` | `@atelier/stage` | Camera between section shots with portrait FOV, cursor parallax and shake. |
| `trackPointer` | `@atelier/stage` | Fine-pointer position in NDC; does nothing on touch devices. |
| `ScrollRing`, `TimelineDots` | `@atelier/stage/dom` | The circular "SCROLL" button and the footer section dots. |

Every system advances in the stage's fixed 60 Hz step, in `stage.add` order, after the scheduler and animator.
Add the scroller first so the director and camera read this step's value.

## Page contract (static-first)

1. Put every section in `index.html` as real content: `<section class="section" data-section="glass" id="glass" aria-labelledby="glass-title">` with its heading and copy.
   The `id` makes `#glass` work in static mode too.
2. Mark decoration `aria-hidden="true"`: the canvas, the loader and any 3D-only ornaments.
3. Opt in before first paint with the inline head script, so the upgrade never shifts layout:

```html
<script>
	try {
		if ( ! /[?&]static\b/.test( location.search ) && document.createElement( 'canvas' ).getContext( 'webgl2' ) ) document.documentElement.classList.add( 'is-webgl' );
	} catch ( e ) {}
</script>
```

4. In `main.ts`, `import( './experience' )` only when `is-webgl` is set, and remove the classes if the import throws.
5. Let the classes on `<html>` drive every CSS mode:

| State | Set by | Means |
|---|---|---|
| `is-webgl` | inline head script | Stage layout: fixed app, no native scroll, loader visible, sections stacked absolutely. |
| `is-ready` | `boot()` after `compileAsync` and the first `seek(0)` | Canvas fades in, loader fades out. |
| `is-splashed` | the intro (starter: `stage.scheduler.after( 0.6, splash )`) | Footer and ring appear, input unlocks, first reveal plays. |
| `data-section="name"` | `SectionDirector.go` | Per-section chrome color (for example slate on the light intro sky). |
| `data-visible`, `data-state`, `inert` on each section element | `SectionDirector.go` | Only the current section is visible and focusable. |

6. Keep every fallback path returning to the static page: no WebGL2, `?static`, tier 0 at probe, tier 0 after a runtime downgrade, `webglcontextlost`, and a failed chunk import.
   The fallback handler removes `is-webgl is-ready is-splashed`, calls `clearSectionDom()` from `@atelier/stage/dom` (it undoes the `inert`, `data-visible` and `data-state` the director wrote, and the `data-section` on `<html>`), then `stage.dispose()`:

```ts
const fallback = ( reason: string ) => {

	console.warn( `[atelier] static fallback: ${reason}` );
	html.classList.remove( 'is-webgl', 'is-ready', 'is-splashed' );
	clearSectionDom();
	stage.dispose();

};
stage.on( 'fallback', fallback );
```

Reveal text stays readable after a fallback too: the hidden `.at-reveal` state only applies under `.is-webgl`.
The full CSS for both modes, the iOS details and the chrome markup are in [references/page-and-chrome.md](references/page-and-chrome.md).

## Wiring

Each section module returns a `SectionBundle` (`def`, `sky`, `root`, optional `setProfile`); the experience owns the order.
Build them with [references/section-module.md](references/section-module.md).

```ts
const scroller = stage.add( new SectionScroller() );
const director = new SectionDirector( stage, scroller, bundles.map( ( b ) => b.def ), post );
const track = new SectionTrack( camera, scroller, bundles.map( ( b ) => b.def.shot ) );
stage.add( director );
stage.add( track );

scroller.enabled = false; // the reference ignores input until the intro finishes
bindScrollInput( scroller, { reducedMotion: stage.reducedMotion } );
trackPointer( ( x, y ) => track.setPointer( x, y ) );
```

Rules:
- Create the director after the scroller and before any `jump`: its constructor calls `scroller.setCount`, which resets the scroller.
- Set `def.element` on every def before constructing the director, so the first `go( 0, true )` already marks the DOM.
- In `splash()`, set `scroller.enabled = true` together with `is-splashed`.
  `enabled` blocks wheel, touch and keys, but `scroller.move()` still works, so buttons and choreography can move while input is locked.
- Transitions fire when the snap target changes (`scroller.on( 'target', ... )`), not when the value crosses a boundary: the next set starts arriving as soon as the gesture commits.

## Snap physics

`SectionScroller.update` is the JUNNI scroller ported to the fixed step.
Its constants are literals in `packages/stage/src/scroll/SectionScroller.ts`:

| Constant | Where | Effect |
|---|---|---|
| `+/- 0.45` bias | `round( value +/- 0.45 )` by velocity sign | Any travel beyond 0.05 of a section commits to the next one; smaller nudges fall back. |
| `0.3` | `vv += ( target - value ) * dt * 0.3` | Spring stiffness toward the target: higher arrives sooner. |
| `0.86` per frame, `( 1 - dt * 2 )` | damping of `vv` | Lower settles harder with less overshoot. |
| `10` | `velocity += vv * 10 * dt` | Gain from spring force into velocity. |
| `1 - 8 / 60` per frame | velocity friction | Lower glides less. |
| `vv = 0` on `current` change | crossing a section midpoint | A single flick settles on the next section instead of carrying past it. |
| `0.0005` per px, `x5`, `0.05` | touch follow, commit amplifier, commit threshold | The value follows the finger at 2000 px per section; about 20 px of drag commits. |
| `x2` on release | `touchEnd` | Fling from the last move delta. |
| `100 ms` | wheel filter | Drops trackpad inertia tails. |

Tune in this order:
1. `bindScrollInput( scroller, { wheelScale } )`: 5e-5 is the reference; 3e-5 feels heavier, 8e-5 lighter.
2. `moveDuration` for keyboard moves (1 s), and the durations you pass to `scroller.move` from the ring (1 s) and the dots (2 s).
3. Only then the literals above; promote them to constructor options in the engine rather than forking the class.

The reference constants are per 60 Hz frame; the scroller rescales its per-frame terms by `k = dt * 60` (`0.86 ** k`, `value += velocity * k`), so the feel is identical at any clock `hz`.
Recipes, a feel checklist and the input internals are in [references/physics-and-input.md](references/physics-and-input.md).

## Input

- **Wheel**: `deltaMode` is normalized to pixels, then scaled by `wheelScale`; a smaller delta within 100 ms of the previous one is ignored, which stops a trackpad from dragging the page into a second section.
- **Touch**: pointer events with `pointerType === 'touch'`; the app container must have `touch-action: none` or the browser takes the gesture and sends `pointercancel`.
- **Keyboard**: arrows, PageUp and PageDown, Space and Shift+Space, Home and End; ignored inside inputs, textareas, selects and contenteditable.
  Space and Enter on a focused button, link, `[role="button"]` or `summary` are left to the browser, so they press the control instead of scrolling.
- **Zoom**: ctrl+wheel (trackpad pinch, browser zoom) is ignored and not prevented, so zoom keeps working.
- **Reduced motion**: pass `stage.reducedMotion`; the wheel steps once per gesture (a gesture ends after 250 ms without wheel events, steps are at least 400 ms apart, so trackpad inertia never moves two sections), moves take 0.35 s, and `SectionTrack` drops parallax and shake on its own.
- **Programmatic**: `scroller.move( i, seconds )` eases with `easeInOutCubic` and blocks wheel and touch while it runs.

## Section lifecycle

`SectionDirector.go( index )` runs on every snap-target change:
- `uniforms[ i ].state` tweens to 0 (ready, after the current one), 1 (viewing) or 2 (passed, before it); `visibility` tweens to 1 only for the current section.
  Both are 1 s `easeOutCubic` tweens named `section.<name>.state` and `section.<name>.visibility`; get them with `director.uniformsOf( name )` and pass them straight into shader `uniforms`.
- `director.looks` is a one-hot array (`[0,1,0]`) tweened as a whole; `createSkyDome` and any per-section look `mix` by it.
  Set `def.look` to share a look between sections.
- `post.apply` tweens the section's `PostParams` (bloom, vignette, grain, threshold, dirt, exposure, blurRange).
- `leave()` on the previous section, then `enter()` on the new one; `def.update( dt, stage, visibility )` runs while `visibility > 0.001` or the section is current.
- Each step, `def.root.visible` is set to `visibility > 0.001 || current`, so fully faded sets cost no draw calls.
- `director.onChange( index, def )` is the hook for dots, ring, reveals, hash and analytics.

State 2 lets exits differ from entrances (lines retract instead of shrinking back); the motion patterns are in `uniform-animator`.

## Camera between sets

Place each set far apart in one world (the starter uses `y = 0`, `-24`, `-48`) and give each a `Shot`:

| Field | Default | Use |
|---|---|---|
| `position`, `target` | required | Camera and look-at in world space. |
| `fov` | required | Vertical FOV at landscape (reference 37.3, telephoto 11.6, wide 58.7). |
| `portraitFov` | 30 | Degrees added at full `portraitWeight`; lower it for sets that already fit tall screens. |
| `parallax` | `(0.1, 0.1)` | Cursor parallax range in world units along camera right and up; `new Vector2( 0, 0 )` to disable per set. |
| `portraitOffset` | none | `Vector3` that shifts camera position and target together at full `portraitWeight`, blended; reframes a set for phones (for example centering a hero that sits beside text on desktop). |
| `anchor` | none | Hero pose; read the interpolated pose with `track.anchorAt( scroller.value, out )`. |

- The camera lerps position, target, FOV and parallax range linearly between the two nearest shots by the scroller value, so the transit is a straight line: keep other sets off that line and at least three set-radii away.
- For Blender scenes, position the section root first, then call `shotFromScene( gltf.scene )` (it reads world transforms of `Camera`, `CameraTarget`, `Anchor`, and warns when `Camera` or `CameraTarget` is missing) and spread extra fields: `{ ...shotFromScene( root ), portraitFov: 20 }`.
- `visibleSizeAt( camera, point )` returns the world width and height the camera sees at a point; use it to fit titles and props to the frame (see `kinetic-type`).
- Parallax runs through a critically damped `Spring2` at 0.9 Hz; `trackPointer` ignores coarse pointers, so phones get none.
- `track.shake( amount, seconds, speed = 7 )` adds a decaying rotational shake (`amount` 1 is about 0.1 rad); the reference used 0.15 for impacts.
- Move the sky dome with the camera each step (`sky.position.copy( camera.position )`), and keep the camera far plane beyond the sky radius (starter: far 220, radius 100).
- A `CursorTrail` lives in world space, so camera travel between sets would stretch it across the frame; shift it by the camera's per-step movement to keep it in view space, and tween its `ink` option (0 glow for dark sets, 1 dark ink for light ones) per section:

```ts
const trailInk = stage.animator.add( 'trail.ink', 0 );
const trail = new CursorTrail( { time: stage.time, ink: trailInk } );
scene.add( trail.mesh );
stage.add( trail );

const lastCamera = new Vector3();
const cameraDelta = new Vector3();
stage.add( {
	update: () => {

		cameraDelta.subVectors( camera.position, lastCamera );
		if ( lastCamera.lengthSq() > 0 ) trail.shift( cameraDelta );
		lastCamera.copy( camera.position );

	},
	reset: () => lastCamera.set( 0, 0, 0 ),
} );
```

  Add the trail only for fine pointers at tier 2 or higher, as the starter does.

## Chrome, accessibility and deep links

- `new ScrollRing( slot, 'SCROLL', () => void scroller.move( scroller.target + 1 ), 'Next section' )`, shown only on the first section after the splash via `ring.setVisible()`; the fourth argument is the localized accessible name.
- `new TimelineDots( dotsEl, labels, ( i ) => void scroller.move( i, 2 ), 'Sections' )` and `dots.set( i )` in `onChange`; each dot is a labelled button with `aria-current="step"`, and the fourth argument names the list.
- Both are real buttons with focus-visible outlines; never replace them with divs.
- Section overlays stay in the DOM with real headings; titles drawn in 3D become visually hidden, not removed (see `kinetic-type`).
- The director sets `inert` on hidden sections, so tab order only reaches the visible one.
- Deep links: read the hash first thing in `boot()`, because once `onChange` writes the hash, the boot-time `director.reset()` replaces it with the first section's.
  After the boot-time `stage.reset()` and `stage.seek( 0 )`, jump:

```ts
const initialHash = location.hash; // first line of boot()
// ... build, wire, warm up, director.reset(), stage.reset(), stage.seek( 0 ) ...
const start = bundles.findIndex( ( b ) => `#${b.def.name}` === initialHash );
if ( start > 0 ) scroller.jump( start );
```

`scroller.jump` sets `scroller.jumping` while it emits `target`, and the director applies that change instantly (no 1 s tween), so the page opens on the section without a fly-in.
In `onChange`, write `history.replaceState( null, '', '#' + def.name )`, and on `hashchange` call `scroller.move( index, 2 )`.

## Pitfalls

- `touch-action: none` and `overscroll-behavior: none` on the stage container, or iOS pulls to refresh and Android cancels the drag.
- Use `100dvh` for the fixed app and `100svh` for static sections; `100vh` jumps with the iOS toolbar.
- `viewport-fit=cover` plus `env(safe-area-inset-bottom)` on the footer and ring.
- Never listen to `scroll` events or use `scrollTo`: the document does not scroll in stage mode.
- Don't read `Date.now()` or `performance.now()` for motion; everything reads the stage clock so `seek(t)` and video renders match.
- Programmatic moves ignore `enabled`; guard buttons yourself if they must wait for the intro.
- A section with its own `pointer-events: auto` UI (forms, links) must still let wheel events bubble to `window`.

## Done when

- `?static` and a WebGL2-less browser show every section's content with no errors, and nothing in it is `inert`.
- Wheel, trackpad, touch, keyboard, dots and ring each move exactly one section per gesture on phone, tablet, laptop and desktop captures (`npm run capture`).
- Reduced motion shows no parallax, shake or inertia.
- Space and Enter activate focused buttons; ctrl+wheel zooms the page.
- A `#name` link opens on that section without a fly-in.
