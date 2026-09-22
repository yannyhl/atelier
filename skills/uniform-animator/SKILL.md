---
name: uniform-animator
description: Animate anything on an @atelier/stage page the house way - Animator values that are also shader uniforms, sigmoid(6) default easing, HouseCurves and cubicBezier twins of CSS curves, deterministic staggers with delay and Scheduler instead of setTimeout, Spring and Spring2 follow, one-hot section looks, 0/1/2 enter-exit states and the mod(v, 2) never-play-backwards trick in GLSL, atStagger reveals, and portraitWeight layout blending. Use when the user asks to tween, ease, stagger, pop in, reveal, fade between section looks, make exits differ from entrances, match a CSS curve in WebGL, replace setTimeout or Math.random in motion, fix jitter or non-deterministic video frames, or make a layout adapt between landscape and portrait without breakpoints.
---

# Uniform animator

In the JUNNI / loanmeme DNA every animated look is a named value that is also a three.js uniform, so tweening needs no glue code between JavaScript and the GPU.
`@atelier/stage` keeps that pattern and runs it on the fixed-step stage clock, which makes live playback, `seek(t)` and rendered video show identical frames.
This skill covers the JS side (Animator, easings, Scheduler, springs) and the GLSL side (0/1/2 states, staggers, one-hot looks, portrait blending).

## Rules

1. Every value that changes a rendered frame advances on the stage clock: `stage.animator`, `stage.scheduler`, `update( dt )`, `stage.time`, `stage.rng`.
   Never `setTimeout`, `setInterval`, `requestAnimationFrame`, `Date.now()`, `performance.now()` or `Math.random` in a render path.
2. Tween the uniform, not a copy: pass the object `animator.add` returns straight into `ShaderMaterial.uniforms`.
3. Everything that appears also leaves: exits animate to state 2; they never just vanish or play the entrance backwards.
4. Use `sigmoid(6)` over 1 s unless there is a reason; overshoot curves only on small things.
5. Name values `<section>.<thing>` so the owner is obvious in `window.__atelier` debugging.

## Animator

```ts
import { Color, ShaderMaterial } from 'three';
import { Easings, HouseCurves } from '@atelier/stage';

const a = stage.animator;
const glow = a.add( 'hero.glow', 0 ); // sigmoid(6) by default
const tint = a.add( 'hero.tint', new Color( '#8fc9e8' ), Easings.easeOutCubic );
const material = new ShaderMaterial( { uniforms: { uGlow: glow, uTint: tint, uTime: stage.time } } );

void a.animate( 'hero.glow', 1, 0.7, { easing: HouseCurves.enter } );
void a.animate( 'hero.tint', new Color( '#b7f516' ), 1.2 );
```

| Call | Does |
|---|---|
| `add( name, init, easing = sigmoid(6) )` | Creates the track and returns its `{ value }` uniform; if the name exists it returns the existing uniform unchanged (the first easing wins and becomes the track's base easing). |
| `animate( name, goal, seconds = 1, { easing, delay } )` | Tweens from the current value; returns `Promise<boolean>`: `true` when it finishes, `false` as soon as another `animate`, `set` or `reset` interrupts it. |
| `set( name, value )` | Jumps and cancels the running tween. |
| `get( name )`, `uniform( name )` | Read the value or the uniform object; both throw for unknown names. |
| `isAnimating( name? )` | One track or any. |
| `reset()` | Every track back to its initial value; `stage.reset()` calls it for `seek(0)`. |

Values can be `number`, `number[]`, `Vector2`, `Vector3`, `Vector4`, `Color` (lerped in linear space) and `Quaternion` (slerped).
Object values are mutated in place, so the uniform reference stays valid.

Pitfalls:
- An `easing` passed to `animate` applies to that call only; calls without one use the easing given to `add`.
  So a track can enter with `HouseCurves.enter` and exit with `HouseCurves.exit` while everything else keeps the base curve.
- During `delay` the value holds where it was; the tween starts from the value at call time, not at the end of the delay.
- Chain on the result: `if ( await a.animate( ... ) ) nextStep()` only continues when the tween really finished, so an interrupted sequence stops cleanly.
- `duration <= 0` without a delay applies instantly (useful for instant section changes).

## Easings

`Easings` holds `linear`, `sigmoid( weight )`, the quad, cubic, quart, quint and expo families, `easeOutBack( overshoot )` and `cubicBezier( x1, y1, x2, y2 )`, which evaluates exactly like CSS `cubic-bezier()`.
`HouseCurves` holds the DNA's named curves, mirrored in `@atelier/stage/dom/tokens.css`:

| JS | CSS token | Duration | Use |
|---|---|---|---|
| `Easings.sigmoid( 6 )` | `--at-ease-sigmoid` = `cubic-bezier(0.67, -0.07, 0.33, 1.07)` | 1 s | Default for every animator value. |
| `HouseCurves.enter` | `--at-ease-enter` | 0.7 s | Overshooting entrances (ring, chips). |
| `HouseCurves.exit` | `--at-ease-exit` | 0.5 s | Anticipating exits. |
| `HouseCurves.pop` | `--at-ease-pop` | 0.5 s | Small pops. |
| `Easings.easeOutCubic` | `--at-ease-out` | 1 to 2 s | Fades, section visibility, post looks. |
| `Easings.easeInOutCubic` | `cubic-bezier(0.645, 0.045, 0.355, 1)` | 1 s, 2 s | Programmatic section moves. |
| `Easings.linear` | `linear` | any | Group reveals whose shader eases per item. |

Every curve, its CSS twin with measured error and when to reach for it: [references/easing-catalog.md](references/easing-catalog.md).
When a DOM element and a mesh must move together, use the same curve on both sides: `HouseCurves.enter` in JS and `var(--at-ease-enter)` in CSS.

## Staggers and choreography

For per-item tweens, stagger with `delay`; it runs on the stage clock, unlike the reference's `setTimeout` staggers:

```ts
chips.forEach( ( id, i ) => void a.animate( `chip.${id}`, 1, 0.5, { delay: 0.2 + i * 0.07 } ) );
```

For many items, prefer one value and stagger in the shader with `atStagger` (below): one uniform, one draw call, no per-item JS.
For sequencing that is not a tween (class toggles, text writes, cues), use the scheduler:

```ts
stage.scheduler.after( 0.6, () => html.classList.add( 'is-splashed' ) );

async function sequence() {

	await a.animate( 'hero.glow', 1, 0.6 );
	await stage.scheduler.wait( 0.4 );
	await a.animate( 'hero.glow', 0, 0.6, { easing: HouseCurves.exit } );

}
```

`after` returns an id for `cancel( id )`; `stage.reset()` clears the queue.
DOM timings from the DNA: 60 ms per character from 0.2 s (CSS reveals), 70 ms per glyph (3D type), 0.15 s between prop pop-ins, 2 s chrome fade.

## Springs and smoothing

`Spring( initial, frequency = 1.6, damping = 1 )` is a critically damped spring stepped with the fixed `dt`; `Spring2( frequency, damping )` pairs two for 2D.
Set `target` (or `setTarget( x, y )`), call `update( dt )` from a system, read `value`; `snap()` in `reset()`.

```ts
const follow = new Spring2( 1.6, 1 );
stage.add( {
	update( dt ) {

		follow.setTarget( target.x, target.y );
		follow.update( dt );
		mesh.position.set( follow.x.value, follow.y.value, 0 );

	},
	reset() {

		follow.snap( 0, 0 );

	},
} );
```

`frequency` is in Hz: 0.9 is the camera parallax (lazy), 1.6 a hover follow, 3 or more a snappy cursor.
Damping below 1 overshoots (bouncy chips), above 1 is heavy.
For one-off smoothing without velocity, `value += ( goal - value ) * damp( halfLife, dt )` is frame-rate independent.

## One-hot looks

A one-hot array (`oneHot( 4, 2 )` is `[0,0,1,0]`) tweened as a whole cross-fades per-section looks on the GPU.
`SectionDirector.looks` is exactly that for the current section; `createSkyDome( looks, director.looks, stage.time )` consumes it, and your materials can too:

```ts
const lookMaterial = new ShaderMaterial( { defines: { LOOKS: 4 }, uniforms: { uLooks: director.looks } } );
```

For values outside the director, add your own: `a.add( 'hero.looks', oneHot( 4, 0 ) )` then `a.animate( 'hero.looks', oneHot( 4, 2 ), 1 )`.
In GLSL, skip looks whose weight is near zero so only the one or two blending looks cost anything.

## States 0, 1, 2 in shaders

`director.uniformsOf( name ).state` tweens 0 (ready) to 1 (viewing) to 2 (passed), and back to 0 when the user scrolls up past it.
The shader decides what each leg means, which is how exits differ from entrances:

```glsl
float enter = clamp( uState, 0.0, 1.0 );
float exit = clamp( uState - 1.0, 0.0, 1.0 );
p.yz = atRotate( ( 1.0 - uState ) * 5.0 ) * p.yz; // spins in from one side, out the other
p *= atEaseOutCubic( enter ) * ( 1.0 - exit * exit );
```

Two variants from the reference:
- **Re-armed reveal**: a local value that goes 0 to 1 to 2; before entering again, `set` it to 0 if it sits at 2 (the starter's intro title and the section template do this).
- **Never play backwards**: a counter that only grows, odd meaning shown and even meaning hidden, read as `mod( v, 2.0 )`; lines grow on 0 to 1, retract from the other end on 1 to 2, grow again on 2 to 3.

```ts
/** Next counter value: odd = shown, even = hidden. Always ahead of the current value. */
export function nextPhase( current: number, show: boolean ): number {

	const f = Math.ceil( current );
	return show ? ( f % 2 === 1 ? f : f + 1 ) : ( f % 2 === 0 ? f : f + 1 );

}

a.add( 'lines.phase', 0 );
const showLines = ( visible: boolean ) => void a.animate( 'lines.phase', nextPhase( a.get<number>( 'lines.phase' ), visible ), 1 );
```

Full GLSL for both, the stagger math and the one-hot mixer: [references/shader-state-patterns.md](references/shader-state-patterns.md).

## Staggered reveals in GLSL

`GLSL.common` from `@atelier/stage/effects` provides `atStagger( v, index, count, spread )`, `atEaseOutCubic`, `atEaseOutBack`, `atRotate`, `AT_PI` and `AT_TPI`.
Prepend it: `vertexShader: GLSL.common + src`.

```glsl
float inT = atStagger( clamp( uReveal, 0.0, 1.0 ), aIndex, uCount, 1.4 );
float outT = atStagger( clamp( uReveal - 1.0, 0.0, 1.0 ), aIndex, uCount, 1.4 );
float scale = atEaseOutBack( inT ) * ( 1.0 - atEaseOutCubic( outT ) );
```

Tween `uReveal` with `Easings.linear`, since the shader eases each item.
With a group duration `D`, `spread` s and `count` n, each item animates for `D / ( 1 + s )` and items start `D * s / ( n * ( 1 + s ) )` apart.
To hit a per-item duration `d` and stagger `g`: `s = g * n / d` and `D = d + g * n`.

When writing your own curves in GLSL, multiply instead of calling `pow` on a value that can be negative: `pow` is undefined for negative bases (the `common.glsl` curves already do this).

## Portrait layout blending

`stage.viewport.portraitWeight` is 0 at 16:9 or wider and 1 at 1:2 or taller: `clamp( 1 - ( aspect - 0.5 ) / ( 16/9 - 0.5 ), 0, 1 )`.
Author two poses and blend by it instead of adding breakpoints:

```ts
stage.add( { update: ( _dt, s ) => mesh.position.lerpVectors( landscape, portrait, s.viewport.portraitWeight ) } );
const uPortrait = { value: stage.viewport.portraitWeight };
stage.add( { resize: ( v ) => ( uPortrait.value = v.portraitWeight ) } );
```

The starter's intro props do this per shape (`place.lerpVectors( sh.at, sh.portrait, pw )`), cameras do it through `Shot.portraitFov`, and shaders read `uPortrait` for radii and spacing.
Pass `uPortrait` into materials for GPU-placed layouts; blend on the CPU for a handful of objects.
Check both ends and the middle: capture at 390 x 844, 820 x 1180, 1440 x 900 and 1920 x 1080.

## Debugging motion

- `window.__atelier.seek( t )` renders any moment; a value that differs between two seeks to the same `t` is reading wall-clock time or `Math.random`.
- `window.__atelier.stage.animator.get( 'post.bloom' )` in the console reads any track.
- Jitter at high refresh rates usually means something advances in `stage.render` instead of `update( dt )`.
