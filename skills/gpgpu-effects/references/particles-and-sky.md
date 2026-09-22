# Particles and sky

## createParticles

Source: `packages/stage/src/effects/Particles.ts`.

Each particle has a `vec4 aSeed` from `stage.rng`; the vertex shader computes its position from the seed and `uTime` only:

```glsl
p = ( seed.xyz - 0.5 ) * box;
// snow
p.y = ( fract( seed.y + time * speed * ( 0.6 + seed.w * 0.8 ) / box.y ) - 0.5 ) * box.y;
p.x += sin( time * ( 0.5 + seed.w ) + seed.x * 20.0 ) * 0.25;
// sparks
p.z = ( fract( seed.z + time * speed * ( 0.5 + seed.w ) / box.z ) - 0.5 ) * box.z;
gl_PointSize = pointSize * ( 0.4 + seed.w ) / max( -viewZ, 0.1 );
```

- Zero CPU per frame, exact under `seek`, no state to reset.
- Fade: `1 - smoothstep( 0.8, 1.0, max( |p| / ( box / 2 ) ) )` at the box faces, times `visibility`, times `0.5 + seed.w * 0.5`.
- Color: white only, additive; tint through bloom and the sky, or write a sibling material from the same seed pattern if a project needs color.
- Size on screen shrinks with DPR (drawing-buffer pixels); multiply `pointSize` by `stage.viewport.dpr` in a resize hook through `( points.material as ShaderMaterial ).uniforms.uPointSize`.

| Use | mode | count at effectScale 1 | box | speed | pointSize |
|---|---|---|---|---|---|
| Arrival snow (starter) | snow | 900 | 14 x 9 x 8 | -0.3 | 22 |
| Finale sparks (starter) | sparks | 1400 | 10 x 6 x 24 | 4 | 14 |

Scale counts as `Math.round( base * Math.max( stage.profile.effectScale, 0.2 ) )`: 0.35 at tier 1, 0.7 at tier 2, 1 at tier 3.
Points are cheap in the vertex stage but each is a quad of fill: large `pointSize` at high counts is what costs.

Other shapes of the same idea:
- A vortex (reference section 3): angle `seed.x * TAU + time * speed / radius`, radius from `seed.y`, height from `fract( seed.z + time * rise )`.
- Wind streaks (reference section 6): a line segment per particle stretched along its velocity, positions as in sparks.
Write them as new `ShaderMaterial`s on a `Points` or instanced geometry, keeping the rule: position is a pure function of seed and time.

## createSkyDome

Source: `packages/stage/src/effects/SkyDome.ts`.

Signature: `createSkyDome( looks: SkyLook[], weights: Tween<number[]>, time: Tween<number>, radius = 100 )`, returning the sky `Mesh`.

| Style | Look |
|---|---|
| 0 | vertical gradient bottom to top |
| 1 | the brand ice, frost and lime gradient (`atIceGradient`), phase animated at `time * 0.25`, mixed 0.85 over the gradient |
| 2 | gradient plus a horizon glow band `exp( -abs( dir.y ) * 9 )` in the accent color, varying slowly with heading |

- `weights` is normally `director.looks`, a one-hot array the `SectionDirector` tweens for 1 s on each snap; any tweened array of the same length works.
- The sphere follows the camera (`sky.position.copy( camera.position )` every step) and draws at the far plane, so its radius only matters for the near plane.
- Output is dithered by 1/255 before conversion to linear.
- Colors in `SkyLook` are design tokens (sRGB hex); verify a captured pixel of a flat sky area against the token after any engine change to color handling.

Picking styles from the style spec: ice and lime daylight for arrivals (style 1), deep black stages with a colored horizon for glass and neon sets (style 2), and a bright payoff for the finale.
