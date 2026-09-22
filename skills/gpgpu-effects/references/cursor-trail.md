# Cursor trail

Source: `packages/stage/src/effects/CursorTrail.ts`.

## Model

- `points` (default 128) positions in a `Float32Array`, uploaded each step to a `points x 1` RGBA float `DataTexture` (nearest filtering).
- Point 0 is `trail.head`; each other point moves toward its predecessor by `k = 1 - ( 1 - follow )^( dt * 60 )`, iterating from the tail so a point follows where its predecessor was.
  `follow` 0.55 at 60 Hz means each link closes 55% of its gap per step; lower it for a lazier, longer trail.
- The mesh is one open cylinder with 9 radial segments and `points - 1` height segments; the vertex shader reads the chain at `t = 1 - uv.y`, builds a frame from the neighbours (tangent, side, binormal) and pushes the ring out by `sin( t * PI ) * radius * clamp( speed * 12, 0, 1 )`.
- The fragment writes a rainbow `hsv( fract( t * 0.8 - time * 0.3 ), 0.75, 1 ) * 1.6` (or white when `rainbow` is 0), mixed toward near-black 0.012 by `ink`, with alpha from speed; normal alpha blending, no depth write, render order 10.

Options: `time` (required), `points`, `radius` (0.05), `follow` (0.55), `rainbow` (tween, default 1), `ink` (tween, default 0).

## Where the head goes

The reference unprojects the pointer at NDC depth 0.97 (`section.trailDepth`), which puts the head a fixed distance in front of the camera whatever the set.
With a perspective camera, NDC depth z maps to view distance `d = 2 n f / ( ( f + n ) - z ( f - n ) )`:

| near / far | d at z = 0.97 |
|---|---|
| 0.1 / 220 (starter) | 6.5 |
| 0.1 / 100 | 3.2 |
| 0.5 / 220 | 26 |

If you change near or far, pick the z that lands the trail just in front of your hero, or unproject at a distance directly with `camera.position + direction * d`.

## View-space trail during camera travel

The chain lives in world space, so a camera move between sets would leave the trail behind and stretch it across the frame.
Call `trail.shift( delta )` every step with the camera's movement since the last step; it offsets every point and the head together (see SKILL.md).
Reset the remembered camera position in `reset()` so a rewind does not shift by the whole travel.

## Per-section looks

- `ink` 0 on dark sets (the glow blooms), 1 on light or paper sets (a glow saturates into a white smear there).
- `rainbow` 0 for a white trail, 1 for the rainbow.
- Glass sets: `makeTrailRefractive` from [glass-refraction](../../glass-refraction/SKILL.md).

## Rules

1. Fine pointers only (`(hover: hover) and (pointer: fine)`), tier 2 and up; in capture mode always create it so videos show it.
2. Update the head from the pointer callback or the `Choreography` pointer function; never read `performance.now()` for it.
3. One trail per page; it follows the camera, not a section.
4. `reset()` collapses the chain to the origin, so the first steps after a rewind draw a short streak from the origin toward the pointer; start capture choreography with the pointer near the frame center to keep it invisible.
