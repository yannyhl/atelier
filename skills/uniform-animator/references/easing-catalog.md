# Easing catalog

Every curve available in `@atelier/stage` (`Easings`, `HouseCurves`), its CSS twin and when to use it.
"Max error" is the largest difference in output between the JS curve and its CSS twin over 1001 samples, measured with the engine's own `Easings.cubicBezier` (which evaluates exactly like CSS).
Values below 0.01 are invisible; up to 0.05 is fine for a DOM element that accompanies a mesh; above that, drive both from the same curve.

## House curves

These are the DNA's named curves.
The JS and CSS versions are the same bezier, so they match exactly.

| JS | CSS | Duration | Shape | Use |
|---|---|---|---|---|
| `HouseCurves.enter` | `var(--at-ease-enter)` = `cubic-bezier(0, 1.33, 0.37, 0.99)` | 0.7 s | Fast start, 3% overshoot peaking near 46% of the time, settles. | Entrances of UI and small props: ring button, chips, badges. |
| `HouseCurves.exit` | `var(--at-ease-exit)` = `cubic-bezier(0.74, -0.02, 0.94, -0.32)` | 0.5 s | Dips 4% below the start (anticipation), then accelerates out. | Exits that should feel intentional: ring button, dismissals. |
| `HouseCurves.pop` | `var(--at-ease-pop)` = `cubic-bezier(0.4, 1.44, 0.74, 1)` | 0.5 s | Quick start, 6% overshoot near 67%, settles. | Small pops: bubbles, tags, counters. |
| `HouseCurves.settle` | `cubic-bezier(0, 0.85, 0.25, 1.01)` (no token) | 0.3 to 0.6 s | Very fast start, long tail, no visible overshoot. | Glitch bursts and random effect hits snapping back. |
| `Easings.easeOutCubic` | `var(--at-ease-out)` = `cubic-bezier(0.215, 0.61, 0.355, 1)` (max error 0.022) | 1 to 2 s | Classic ease-out. | Fades, section visibility and state, post looks, chrome, reveals. |

## The default

| JS | CSS twin | Max error | Use |
|---|---|---|---|
| `Easings.sigmoid( 6 )` | `var(--at-ease-sigmoid)` = `cubic-bezier(0.67, -0.07, 0.33, 1.07)` | 0.0075 | Default for every Animator value (1 s). A symmetric S-curve, softer than cubic at both ends: 4.5% done at a quarter of the time, 95.5% at three quarters. |
| `Easings.sigmoid( 6 )` | `cubic-bezier(0.71, 0, 0.29, 1)` | 0.016 | Same, when a CSS curve must not dip below 0 at all (the twin above dips 0.3%). |
| `Easings.sigmoid( 4 )` | `cubic-bezier(0.55, 0.05, 0.45, 0.95)` | 0.002 | Gentler S for long, slow moves. |
| `Easings.sigmoid( 8 )` | `cubic-bezier(0.75, -0.14, 0.25, 1.14)` | 0.013 | Snappier S; most of the move happens in the middle third. |
| `Easings.sigmoid( 10 )` | `cubic-bezier(0.8, -0.19, 0.2, 1.19)` | 0.019 | Near a hard cut with soft edges. |

Higher `weight` concentrates the motion in the middle; `weight` near 0 approaches linear.
The reference used `sigmoid(6)` for everything it did not name, which is why its motion reads soft and cinematic rather than snappy.

## Standard families

| JS | CSS twin | Max error | Use |
|---|---|---|---|
| `Easings.linear` | `linear` | 0 | Time uniforms, scroll-locked progress, group values whose shader eases per item (BitmapText reveal, `atStagger`). |
| `Easings.easeInQuad` | `cubic-bezier(0.55, 0.085, 0.68, 0.53)` | 0.042 | Rarely; things falling away. |
| `Easings.easeOutQuad` | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | 0.025 | Short UI moves under 0.3 s. |
| `Easings.easeInOutQuad` | `cubic-bezier(0.455, 0.03, 0.515, 0.955)` | 0.019 | Gentle loops and ping-pong idles. |
| `Easings.easeInCubic` | `cubic-bezier(0.55, 0.055, 0.675, 0.19)` | 0.032 | Exits that accelerate off screen without anticipation. |
| `Easings.easeOutCubic` | `cubic-bezier(0.215, 0.61, 0.355, 1)` | 0.022 | See house curves. |
| `Easings.easeInOutCubic` | `cubic-bezier(0.645, 0.045, 0.355, 1)` | 0.025 | Programmatic section moves (`SectionScroller.move`), camera cuts between marks. |
| `Easings.easeOutQuart` | `cubic-bezier(0.165, 0.84, 0.44, 1)` | 0.044 | Stronger ease-out for large objects arriving. |
| `Easings.easeInOutQuart` | `cubic-bezier(0.77, 0, 0.175, 1)` | 0.097 | Punchy transitions; the CSS twin is loose, so do not pair them for synced motion. |
| `Easings.easeOutQuint` | `cubic-bezier(0.23, 1, 0.32, 1)` | 0.017 | Very fast arrival, long settle (counters, big numbers). |
| `Easings.easeOutExpo` | `cubic-bezier(0.19, 1, 0.22, 1)` | 0.037 | Snappy UI; feels mechanical if used on characters. |
| `Easings.easeOutBack()` (1.70158) | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | 0.046 | Prop pop-ins; peaks at 1.10 near 58% of the time. |
| `Easings.easeOutBack( 1.6 )` | none | - | Starter glass panels; peaks at 1.09. |
| `Easings.easeOutBack( 2.2 )` | none | - | Starter intro props; peaks at 1.15, reads toy-like. |
| `Easings.cubicBezier( x1, y1, x2, y2 )` | `cubic-bezier(x1, y1, x2, y2)` | 0 | Any designer-supplied curve; copy the four numbers from CSS or the design tool. |

## GLSL side

| GLSL (`GLSL.common`) | Equals | Notes |
|---|---|---|
| `atEaseOutCubic( t )` | `Easings.easeOutCubic` | For `t` in 0..1. |
| `atEaseOutBack( t )` | `Easings.easeOutBack()` (overshoot 1.70158) | Peaks at 1.10; write a local copy for other overshoots. |
| `smoothstep( 0.0, 1.0, t )` | `3t^2 - 2t^3` | A cheap S-curve within 0.015 of `sigmoid( 3 )`; softer than the house `sigmoid( 6 )`. |

Both chunks multiply instead of calling `pow`, which is undefined in GLSL for negative bases; do the same in your own curves.
For other curves in a shader, bake the JS curve into a small lookup texture or pass the eased value as a uniform; a uniform eased on the CPU is almost always enough, because the per-item variation comes from `atStagger`, not from the curve.

## Choosing quickly

- A value the user watches for a second or more: `sigmoid( 6 )`.
- Something arriving: `easeOutCubic`; something small arriving with personality: `HouseCurves.enter` or `easeOutBack`.
- Something leaving on purpose: `HouseCurves.exit`; leaving quietly: `easeOutCubic` back to 0 over half the entrance time.
- Moving between two marks the user asked for (button, dot, key): `easeInOutCubic`.
- A group of many items: `linear` on the group value, easing per item in the shader or CSS.
- Durations from the DNA: 0.5 s exits and pops, 0.7 s entrances, 1 s default and section moves, 2 s chrome fades and timeline jumps.
