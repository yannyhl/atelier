# Scroller physics and input internals

Source: `packages/stage/src/scroll/SectionScroller.ts` and `bindInput.ts`, ported from the MIT JUNNI `Scroller`.
Units: `value` is in sections; `velocity` is sections per 60 Hz frame (the reference unit); `dt` is the fixed step (1/60 s by default).
Per-frame terms are rescaled by `k = dt * 60`, so the same constants give the same feel at any clock `hz`.

## One step of `SectionScroller.update`

1. If a programmatic `move` tween is running, `value` follows it and `target = round( value )`.
2. Else if a finger is down, `value = touchStartValue + touchMove`.
3. Else (inertia):
   - Right after a touch release: if the target is still the section the touch started on and the drag's `touchMoveDiff` exceeds 0.05, the target steps one section in the drag direction.
   - Otherwise `target = round( value + ( velocity > 0 ? 0.45 : -0.45 ) )`, clamped to `0..count-1`.
   - Spring: `vv += ( target - value ) * dt * 0.3`, `vv *= 0.86 ** k * ( 1 - dt * 2 )`, `velocity += vv * 10 * dt`, `velocity *= ( 1 - 8 / 60 ) ** k`, `value += velocity * k`.
4. When `round( value )` changes, `current` updates, `vv` is zeroed and `current` is emitted.
5. When `target` changed this step, `target` is emitted (this is what the director listens to).

Wheel input does not touch `value` or `velocity` directly; it adds to `vv`, the acceleration term.
That is why a single notch produces a smooth glide instead of a jump, and why zeroing `vv` at the midpoint stops a long trackpad swipe from carrying into a second section.

## Constants and how to change feel

| Want | Change | Notes |
|---|---|---|
| Less sensitive wheel | `wheelScale` 5e-5 to 3e-5 | Page option; no engine change. |
| More sensitive wheel | `wheelScale` to 8e-5 | Above 1e-4 a mouse notch can overshoot the midpoint and feel jumpy. |
| Harder commit (needs a bigger push) | bias 0.45 to 0.35 | Commit threshold becomes 0.15 of a section. |
| Faster arrival | stiffness 0.3 to 0.45 | Pair with a lower `0.86` if it starts to wobble. |
| Less overshoot | `0.86` to 0.8 | The reference barely overshoots; keep it subtle. |
| Longer glide | friction `8 / 60` to `6 / 60` | Makes long flicks feel floaty; rarely wanted. |
| Heavier touch | `0.0005` per px to 0.0003 | The value then follows the finger at about 3300 px per section. |
| Touch commits sooner | commit 0.05 to 0.03 | About 12 px of drag instead of 20 px. |
| Slower keyboard moves | `moveDuration` (1 s) | Keys only; the ring and dots pass their own duration to `scroller.move` (1 s and 2 s). |

Everything except `wheelScale` and `moveDuration` is a literal inside the class.
When a project needs a different value, add a constructor option with the reference value as the default and use it in both projects; do not copy the class into the project.
Keep new per-frame factors in the `** k` form so the feel stays independent of the clock rate.

Check feel with real devices: a notched mouse wheel, a Mac trackpad (long inertia tails), an iPhone and an Android phone.
One flick must move exactly one section, a tiny nudge must fall back, and a fast double flick may move two.

## Wheel details

- `deltaMode` 1 (lines) is multiplied by 16 and `deltaMode` 2 (pages) by the window height before scaling.
- Inertia-tail filter: a delta whose magnitude is smaller than the previous one, arriving within 100 ms, is dropped.
  The reference also ran Lethargy; the tail filter alone was enough.
- The listener is non-passive and calls `preventDefault`, so the page never scrolls or rubber-bands.
- Events with `ctrlKey` (trackpad pinch, ctrl+wheel browser zoom) return before `preventDefault`, so zoom keeps working and the stage does not move.

## Touch details

- Only `pointerType === 'touch'`, and only the first pointer; a second finger is ignored.
- `pointerdown` is bound on the `target` option (default `window`); `pointermove`, `pointerup` and `pointercancel` on `window`.
- The container must have `touch-action: none`; otherwise the browser claims the vertical pan and sends `pointercancel` after a few pixels, which ends the drag with a zero fling.
- Touch starts are ignored while a programmatic move runs, matching the reference.

## Keyboard details

| Key | Moves to |
|---|---|
| ArrowDown, PageDown, Space | `target + 1` |
| ArrowUp, PageUp, Shift+Space | `target - 1` |
| Home, End | first, last |

Keys with Alt, Meta or Ctrl are ignored so browser shortcuts keep working.
Space and Enter are left to the browser when focus is on a `button`, `a[href]`, `[role="button"]` or `summary`, so focused controls activate normally.
The handler listens on `window` in the bubble phase and skips events already `defaultPrevented`, so a page can claim a key by calling `preventDefault` in its own handler.

## Reduced motion

With `reducedMotion: true`, `bindScrollInput`:
- turns each wheel gesture into one `move( target +/- 1, 0.35 )` step: a gesture starts after 250 ms without wheel events, deltas under 4 px are ignored, and steps are at least 400 ms apart, so a long trackpad inertia stream never moves two sections;
- uses 0.35 s for keyboard moves.

`SectionTrack` reads `stage.reducedMotion` and drops parallax and shake.
Touch still follows the finger (it is direct manipulation, not animation).
Pass the same shortened duration to your own `scroller.move` calls from the dots and ring when `stage.reducedMotion` is true.

## Programmatic moves

`scroller.move( section, seconds )` tweens `value` with `easeInOutCubic`, zeroes velocity, and blocks wheel and touch until it finishes; it resolves `true` when it completes and `false` if superseded.
It ignores `enabled`.
`scroller.jump( section )` sets everything instantly and emits `target` if it changed, with `scroller.jumping` true during the emit; `SectionDirector` reads that flag and switches looks, post and state without tweening.
`scroller.progress` is `value / ( count - 1 )`, handy for a global progress bar or audio crossfade.
