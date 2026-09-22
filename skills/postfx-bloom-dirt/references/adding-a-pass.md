# Adding a pass

Decide first which space the effect lives in; that decides where it goes.
The DNA has no chromatic-aberration or distortion pass: dispersion lives in materials (see [glass-refraction](../../glass-refraction/SKILL.md)), so reach for a material before a post pass.

## 1. Light added to the scene (no engine change)

Glows, light sweeps, fog veils and god-ray overlays add light and should bloom, get dirt and vignette like everything else.
Draw them additively into `post.sceneRT` between `renderScene` and `finish` with [../assets/scene-pass.ts](../assets/scene-pass.ts):

```ts
stage.render = () => {
	post.renderScene( scene, camera );
	sweep.render( stage.renderer, post );
	post.finish();
};
```

Rules:
- Write linear values; values above 1 bloom (the `LIGHT_SWEEP` example peaks at `uStrength`).
- Never sample `post.sceneRT` in the pass; a target cannot be read while it is bound.
- Drive the pass from animator values and `stage.time` only, so capture is exact.
- The pass costs one full-screen fill at scene resolution; skip it with `enabled = false` when its strength is 0.

## 2. Effects that read the scene (engine change)

Distortion, heat haze, chromatic aberration and color grading need the finished linear scene as input.
Put them in `packages/stage/src/post/glsl/composite.frag`, where `uSceneTex` is already bound, before the vignette:

```glsl
// composite.frag: replace the scene fetch. uAberration in UV units at the frame corner (0.002 is subtle).
vec2 dir = cuv * uAberration;
vec3 color = vec3(
	texture2D( uSceneTex, vUv - dir ).r,
	texture2D( uSceneTex, vUv ).g,
	texture2D( uSceneTex, vUv + dir ).b ) * uExposure;
```

To make the new value tween per section like the others:
1. Add the key to `PostParams` and `DEFAULTS` in `PostFX.ts` (for example `aberration?: number`, default 0).
2. Add it to the `params` object in the constructor, `p( 'aberration' )`, which registers the animator value `post.aberration`.
3. Pass `uAberration: this.params.aberration` into the composite uniforms in `setProfile`.
4. Add a row to the tuning table in this skill and to the DNA style spec if it becomes part of the house look.

AGENTS.md rule 2 applies: extend the engine when the pattern repeats in two projects; for a one-off, use the escape hatch below.

## 3. Display-referred effects (engine change)

Scanlines, halftone and LUTs authored on sRGB images go after `toSRGB` and before the grain and dither lines in `composite.frag`.
Keep them cheap: they run on every pixel of the frame at full resolution.

## Escape hatch for one project

`post.finish( myTarget )` renders the composite into your own 8-bit target and skips AA.
Then draw your pass from `myTarget.texture` to the screen and run AA yourself, the way `PostFX.finish` does: create `new FXAAPass()`, set `renderToScreen = true`, call `setSize` on resize and `render( renderer, null, sourceTarget, 0, false )`.
This costs an extra full-screen pass and an extra target, so move the effect into the engine once it proves itself.

## Order is fixed

scene, refraction layer, scene passes (1), bloom, composite (2 then 3), grain and dither, AA.
Nothing may come after the dither except AA, and nothing may encode sRGB a second time.
