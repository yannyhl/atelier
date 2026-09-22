---
name: postfx-bloom-dirt
description: Use, tune and extend the @atelier/stage PostFX chain (linear half-float scene, thresholded 13-tap down and tent up dual-filter bloom, bicubic composite with lens dirt, vignette, sRGB encode, grain and dither, SMAA or FXAA by tier). Covers per-section PostParams through SectionDirector and post.apply, quality tiers, generating a seeded procedural lens-dirt PNG with the bundled script, grain for web versus video capture, the linear color pipeline and hex conversion rules, where a new pass goes, and black-screen debugging. Use when someone says "add bloom", "tune the glow", "lens dirt", "the frame is washed out / too dark / black", "grain is too strong in the video", "colors look wrong", "add a post effect", "chromatic aberration", "vignette", or asks why the bloom is blocky.
---

# PostFX: bloom, lens dirt and grain

`PostFX` is the house post chain from the JUNNI / loanmeme DNA: a wide, soft bloom that carries a lens-dirt texture, a strong vignette and fine grain.
It lives in `@atelier/stage` and every section tunes it through `PostParams`, so the look travels with the camera.
This skill covers setup, tuning, the dirt texture, color rules, extension points and debugging.
Pass order and render-target sizes are in [references/chain.md](references/chain.md).

## The chain

1. Scene into `post.sceneRT`: linear color, half float at tier 2 and up, 8-bit at tier 1.
2. Optional refraction split: layer 0, copy to `post.opaqueTexture`, then `REFRACT_LAYER` on top (see [glass-refraction](../glass-refraction/SKILL.md)).
3. Bloom down chain: a prefilter pass (13-tap downsample plus soft-knee threshold `c * max( soft, c - threshold )`, capped at 32), then plain 13-tap downsamples, each level half the previous.
4. Bloom up chain: 9-tap tent upsample of the coarser level plus the finer level weighted `( i + 1 ) / n`, so wide halos dominate like the reference `i / count` weights.
5. Composite: scene times `exposure`, plus bicubic-sampled bloom times `bloom`, plus `bloom * dirt * params.dirt`, then vignette `mix( 1, smoothstep( 2.0, 0.8, length( cuv ) ), vignette )`, sRGB encode, grain times `grainScale`, and a 1/255 dither.
6. SMAA (tier 3) or FXAA (tiers 1 and 2) to the screen.

The reference packed all mips into one render target (a "mip strip") and blurred it; atelier tried that first and it aliased into visible blocks on large bright areas at phone resolution, so the dual-filter chain replaced it.
The history and the measurements are in [references/chain.md](references/chain.md).

## Set it up

```ts
import { AssetLoader, PostFX, type Stage } from '@atelier/stage';
import type { Camera, Scene } from 'three';

export async function setupPost( stage: Stage, scene: Scene, camera: Camera ) {

	const loader = new AssetLoader( stage.renderer );
	await loader.load( [ { name: 'dirt', url: '/textures/lens-dirt.png', kind: 'texture', priority: 'sub' } ] );
	const post = new PostFX( stage.renderer, stage.animator, stage.profile, stage.time, loader.texture( 'dirt' ) );
	stage.add( { resize: ( v ) => post.resize( v ), setProfile: ( p ) => post.setProfile( p ) } );
	stage.render = () => post.render( scene, camera );
	return post;

}
```

- Register `resize` and `setProfile` through `stage.add`; without them `sceneRT` stays 1 x 1 and tier changes never rebuild the targets.
- The dirt texture is data: keep the loader's default `NoColorSpace`.
- Dirt can arrive later: construct with `null` and call `post.setDirt( texture )` when a `sub` load finishes.
- `post.render( scene, camera )` is `renderScene` plus `finish`; split them when you add a pass (see below).

## Per-section looks

Give every `SectionDef` a `post` block; `SectionDirector` calls `post.apply( animator, def.post, 1 )` on each snap change, so looks tween for 1 s with `easeOutCubic`.

| Param | Default | What it does | House range |
|---|---|---|---|
| `bloom` | 0 | bloom strength; 0 skips the whole bloom chain (`uHasBloom` false) | 0.25 arrival, 0.35 glass, 1.0 to 2.0 finale |
| `vignette` | 1 | blend toward `smoothstep( 2.0, 0.8, r )` | 0.7 light sets, 1.4 to 1.5 dark sets |
| `dirt` | 1 | multiplier on bloom times the dirt texture | 0.6 to 1.5 |
| `grain` | 0.035 | display-space film grain amplitude | 0.03 to 0.05 |
| `exposure` | 1 | linear scene multiplier before bloom is added | 0.8 to 1.3 |
| `threshold` | 0.5 | bloom threshold in linear units | 0.5 house, 0.8 for bright daylight sets |
| `blurRange` | 1 | tent radius of the upsample in coarse texels | 1 crisp, 1.5 to 2 dreamy |

Reference values per section: vignette 0.7 (1), vignette 1.5 (2), bloom 1.5 (3), bloom 1 (5), bloom 2 (6); the approved table is in `dna/junni-loanmeme/STYLE-SPEC.md`.
A post look is complete: `apply()` returns every parameter the section does not set to its default (threshold 0.5, vignette 1, dirt 1, grain 0.035, exposure 1, blurRange 1), so no section inherits the previous one's look.
For a one-off change to a single parameter, animate it directly with `stage.animator.animate( 'post.bloom', 2, 0.6 )`, set it instantly with `stage.animator.set( 'post.bloom', 2 )`, and read `post.params.bloom.value`.
Light sets (bright skies) raise `threshold` to about 0.85: in linear space a correct daylight sky exceeds 0.5 and the whole frame blooms.
`stage.reset()` (every `seek` backwards) restores the defaults above; `SectionDirector.reset()` re-applies section 0, so looks set once at boot outside the director are lost on rewind.

## Tuning the bloom

- The threshold is quadratic: a linear value `c` contributes about `c * ( c - 0.5 )`, so 1.0 gives 0.5, 2.0 gives 3 and 6.0 hits the cap of 32.
  Keep emissive surfaces between 1 and 2.5 linear; in testing, emissive 6 with bloom 1.5 whited out the whole frame.
- Wide halos dominate by design and tint the frame around bright objects; lower `bloom`, not `threshold`, when the frame gets milky.
- Tier 1 renders 8-bit targets, so values clamp at 1 and each pixel contributes at most 0.5: halos are smaller and dimmer.
  Check `?tier=1` and raise `bloom` for that tier only if the section depends on the glow.
- Levels: 4 at tier 1, 6 at tier 2 (both starting at quarter resolution), 7 at tier 3 (starting at half resolution).
- More `blurRange` widens every level at no cost; past 2.5 the tent leaves gaps and halos ring.

## Lens dirt

Generate a texture with the bundled, dependency-free script (seeded, byte-identical per seed):

```sh
node skills/postfx-bloom-dirt/scripts/make-lens-dirt.mjs --out public/textures/lens-dirt.png --seed 7
node skills/postfx-bloom-dirt/scripts/make-lens-dirt.mjs --out public/textures/lens-dirt-portrait.png --width 576 --height 1024 --seed 7
```

| Flag | Default | Effect |
|---|---|---|
| `--width` / `--height` | 1024 / 576 | match the dominant canvas aspect |
| `--seed` | 7 | layout; same seed, same bytes |
| `--blobs` | 90 | bokeh discs, 35% hexagonal, log-uniform sizes, edge-weighted |
| `--streaks` | 12 | wipe smears and circular wipe arcs |
| `--specks` | 500 | dust points |
| `--strength` | 1 | global multiplier before clamping |
| `--tint` / `--gray` | 0.12 | warm and cool variation; `--gray` writes a 1-channel PNG about 35% smaller |

It prints JSON with `bytes`, `mean` and `coverage`; the defaults give a mean near 0.025 and 15% coverage, which reads as dirt without a visible pattern.
Encode to WebP for shipping (the reference dirt was a 30 KB WebP); the PNG is lossless and larger.
Dirt only shows where there is bloom: black stays clean, bright sections light up the smudges.
The composite samples dirt at screen UV, so a 16:9 texture stretches on portrait phones; swap a portrait variant on resize:

```ts
import type { PostFX, Stage } from '@atelier/stage';
import type { Texture } from 'three';

export function dirtByAspect( stage: Stage, post: PostFX, landscape: Texture, portrait: Texture ) {

	const pick = ( aspect: number ) => post.setDirt( aspect < 1 ? portrait : landscape );
	pick( stage.viewport.aspect );
	stage.on( 'resize', ( v ) => pick( v.aspect ) );

}
```

## Grain for web and video

- Grain is added after the sRGB encode, from a hash of UV and `stage.time`, so it moves every frame and is deterministic in capture.
- Web: 0.03 to 0.05 per section keeps flat gradients alive on OLED phones.
- Video: set `post.grainScale = 0.25` in capture mode (the starter does); per-frame grain is incompressible for H.264, and a 16 s 1080p capture shrank from about 130 MB to a fraction of that.
- Stills and posters: leave `grainScale` at 1.
- The 1/255 dither is always on and independent of grain; it is what prevents banding in dark skies.

## Color pipeline rules

1. Everything before the composite is linear; the composite encodes sRGB once, and nothing after it encodes again.
2. Every `ShaderMaterial` writes linear color; never add `pow( c, 1.0 / 2.2 )` or `colorspace_fragment` to scene materials.
3. `new Color( '#hex' )` converts sRGB to linear (three r152+ color management); in GLSL use `atSrgbToLinear` for colors typed as hex; never both.
4. `color.setHSL( h, s, l )` treats the values as linear; pass `SRGBColorSpace` as the fourth argument to match a design tool.
5. Color textures use `SRGBColorSpace` (the glTF loader and `createMatcap` do it); data textures (dirt, noise, normals, roughness, GPGPU state) keep `NoColorSpace`.
6. Built-in materials write linear into `sceneRT` automatically, and `renderer.toneMapping` does not apply to render targets: use `exposure`.

Details and a conversion table are in [references/color-pipeline.md](references/color-pipeline.md).

## Adding a pass

| Pass | Space | Where it goes |
|---|---|---|
| Adds light that should bloom (sweeps, glows, fog veils) | linear | between `post.renderScene` and `post.finish`, drawn additively into `post.sceneRT` ([assets/scene-pass.ts](assets/scene-pass.ts)) |
| Reads the scene (distortion, aberration, grading) | linear | the composite in `packages/stage/src/post/glsl/composite.frag`, before the vignette (an engine change) |
| Display-referred (scanlines, halftone) | sRGB | the composite, after `toSRGB`, before grain and dither |
| One object only | linear | its material, not post |

```ts
import type { PostFX, Stage } from '@atelier/stage';
import { Color, type Camera, type Scene } from 'three';
import { LIGHT_SWEEP, ScenePass } from './scene-pass';

export function withSweep( stage: Stage, post: PostFX, scene: Scene, camera: Camera ) {

	const sweep = new ScenePass( LIGHT_SWEEP, {
		uSweep: stage.animator.add( 'sweep', 0 ), uStrength: { value: 1.5 }, uColor: { value: new Color( 1, 0.95, 0.85 ) },
	} );
	stage.render = () => {

		post.renderScene( scene, camera );
		sweep.render( stage.renderer, post );
		post.finish();

	};
	return sweep;

}
```

The full procedure, including how to add a tweened `PostParams` key, is in [references/adding-a-pass.md](references/adding-a-pass.md).

## Debugging

Black or broken frames, in order of likelihood: `resize` never registered (1 x 1 targets), objects on `REFRACT_LAYER` without `post.refraction`, half-float targets unsupported on the device (compare with `?tier=1`), NaN from a shader spreading through the bloom as black squares, or a color converted twice.
Work through [references/debugging.md](references/debugging.md); it has a console snippet that prints every target size.

## Verify

1. `npm run capture` and look at phone, tablet, laptop and desktop: bloom halos smooth (no blocks), dirt round (not stretched), vignette not crushing text areas.
2. Load with `?tier=1` and `?tier=3`: the section still reads at tier 1.
3. Render a few seconds with `scripts/render-video.mjs` and check file size and grain at `grainScale` 0.25.
4. Regenerate dirt with the same seed and confirm the bytes match when a build must be reproducible.

## References

- [references/chain.md](references/chain.md): pass order, target sizes per tier, cost, why the mip strip was dropped.
- [references/color-pipeline.md](references/color-pipeline.md): linear rules, conversions, common mistakes.
- [references/adding-a-pass.md](references/adding-a-pass.md): insertion points and engine changes.
- [references/debugging.md](references/debugging.md): black-screen and wrong-look checklists.
- [assets/scene-pass.ts](assets/scene-pass.ts): additive scene-space pass plus the `LIGHT_SWEEP` example.
- [scripts/make-lens-dirt.mjs](scripts/make-lens-dirt.mjs): procedural lens dirt.
- Related: [perf-tiering](../perf-tiering/SKILL.md), [deterministic-render](../deterministic-render/SKILL.md), [uniform-animator](../uniform-animator/SKILL.md).
