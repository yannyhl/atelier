# The PostFX chain in detail

Source: `packages/stage/src/post/PostFX.ts` and `packages/stage/src/post/glsl/*`.
Read this when a frame looks wrong, when you budget a tier, or before changing the engine.

## Passes per frame

| # | Pass | Reads | Writes | Shader |
|---|---|---|---|---|
| 1 | scene (layer 0 only when `refraction` is on) | scene | `sceneRT` (color + depth) | scene materials |
| 2 | opaque copy (refraction only) | `sceneRT` | `opaqueRT` | `copy.frag` |
| 3 | refractive layer (refraction only) | scene, `opaqueTexture` | `sceneRT`, no clear | materials on `REFRACT_LAYER` |
| 4 | prefilter + first downsample | `sceneRT` | `down[0]` | `bright.frag` with `PREFILTER` |
| 5 | downsample x (n - 1) | `down[i - 1]` | `down[i]` | `bright.frag` |
| 6 | tent upsample x (n - 1) | `down[n - 1]` or `up[i + 1]`, plus `down[i]` | `up[i]` | `up.frag` |
| 7 | composite | `sceneRT`, `up[0]`, dirt | `compositeRT`, or the screen or a target when AA is off or a target is given | `composite.frag` |
| 8 | SMAA (3 internal passes) or FXAA | `compositeRT` | screen | three addons |

Passes 4 to 6 are skipped when `params.bloom` is below 0.001 or the profile has no bloom levels.
`finish( target )` with a target skips AA; that is how stills render into their own target.

## Render targets

All targets use `LinearFilter`, no mipmaps and `NoColorSpace`.
`sceneRT`, the bloom levels and `opaqueRT` are `HalfFloatType` when `profile.halfFloat` is true, otherwise `UnsignedByteType`; `compositeRT` is always 8-bit because it already holds sRGB.

| Tier | DPR cap | Levels | First level (per side) | Half float | AA | Opaque copy (per side) |
|---|---|---|---|---|---|---|
| 0 | 1 | 0 | none | no | none | none (static page) |
| 1 | 1 | 4 | 1/4 of scene | no | FXAA | 1/2 of scene |
| 2 | 1.5 | 6 | 1/4 of scene | yes | FXAA | 1/2 of scene |
| 3 | 2 | 7 | 1/2 of scene | yes | SMAA | full |

Example, a 1280 x 720 canvas at DPR 1 and tier 3: `sceneRT` 1280 x 720, bloom levels 640 x 360, 320 x 180, 160 x 90, 80 x 45, 40 x 23, 20 x 11, 10 x 6.
At tier 2 the same canvas gives 320 x 180 down to 10 x 6 (six levels).
Sizes are rounded per level from an unrounded running size, so odd dimensions do not drift.
`post.sceneSize` holds the scene target size in pixels; screen-space materials divide `gl_FragCoord.xy` by it.

## Shader notes

- `bright.frag` 13-tap downsample (Jimenez 2014): center 0.125, inner diamond 4 x 0.125, outer corners 4 x 0.03125, outer edges 4 x 0.0625.
  It filters thin highlights so they do not flicker or alias into squares when the camera moves.
- Prefilter knee: `knee = threshold * 0.5`, `soft = clamp( c - threshold + knee, 0, 2 knee )^2 / ( 4 knee )`, output `min( c * max( soft, c - threshold ), 32 )`.
  The multiplication by `c` keeps the reference's `c * max( 0, c - threshold )` response, which is why bright emissives explode fast.
- `up.frag` tent: center weight 4, edges 2, corners 1, divided by 16, radius `blurRange` coarse texels; the finer level is added with weight `( i + 1 ) / n`.
- `composite.frag` bicubic: four bilinear taps reconstruct a cubic B-spline, which hides the texel grid of the small first level.
- Grain: `hash( vUv * 1024 + fract( time ) * 17 ) - 0.5`, times `grain * grainScale`, added after sRGB.
- Dither: `( hash( gl_FragCoord.xy + fract( time * 7 ) ) - 0.5 ) / 255`, always on.

## Why not the reference mip strip

The reference (`RenderPipeline` in the MIT JUNNI source) bright-passed the scene through a geometry of 7 quads, each half the previous, into one half-resolution target, then ran a separable 5-weight Gaussian 4 times over that whole atlas (`blurRange` 2.28, weights `exp( -0.5 r^2 / 100 )`), and the composite read each tile with a bicubic tap weighted `i / 7`.
atelier implemented that first and captured it at phone resolution.
The capture showed the defect that decided it, and the design has a second, structural one:

1. Observed: large bright areas (a sky, a white wall, the finale bloom of 2) aliased into visible blocks, because the small tiles are a few pixels wide on a phone and the plain bright pass does no filtering before shrinking.
2. Structural: the Gaussian runs over the whole atlas, across tile borders, so tiles bleed into their neighbours and the frame edges pick up glow from the wrong mip.

The dual-filter chain fixes both: every level is its own target, the 13-tap downsample filters before shrinking, and the tent upsample accumulates levels progressively.
It is also cheaper: 2n - 1 small passes instead of 1 bright pass plus 4 full-atlas blur passes.
The look parameters survived: threshold 0.5, wide-halo weighting, bicubic composite, dirt multiplying the bloom, the same vignette curve.

## Cost

At 1920 x 1080, tier 3, the bloom chain writes under one megapixel in total across 13 passes (the first level alone is 960 x 540), less than half of the scene pass.
The expensive parts of a frame are the scene itself, the refraction taps of glass on `REFRACT_LAYER` and SMAA.
Measure with `npm run audit` and read [perf-tiering](../../perf-tiering/SKILL.md) before lowering bloom quality: DPR is the first knob, bloom levels come later.
