# Tier-3 studio shadow and crease AO

## What the reference did and why the engine dropped it

The loanmeme character rendered two extra passes every frame (measured from the shipped bundle, technique only): a 1024 px studio shadow map with 5 x 5 PCF, and a 12-sample golden-angle hemisphere AO against a view-depth pass.
That is two extra depth renders of the character per frame plus about 37 texture taps per character pixel.
`Character` omits both by default and replaces them with one line, `lit *= mix( 0.55, 1.0, smoothstep( -0.9, 0.3, worldNormal.y ) )`, which darkens the underside for free.
On phones and mid-range laptops that trade is right; on a tier-3 desktop the real shadow adds depth to creases, arms against the body and a floor contact.

## The asset

[../assets/StudioShadow.ts](../assets/StudioShadow.ts) and [../assets/studio-shadow.glsl](../assets/studio-shadow.glsl), tested in a browser harness with the Pip GLB (self shadow of arms and eyes, crease AO, floor shadow; disabled at tier 2).

Per frame, `studio.render( scene )`:
1. Places an orthographic camera along the camera-relative key light (view direction (-0.5, 0.65, 0.6), the same as the Character key), framing the character's bounding sphere times `frame` (1.6).
2. Renders the character's depth into a 1024 px `DepthTexture` (the reference size; `mapSize` overrides it, `profile.shadowMapSize` caps it), using a dedicated layer (`STUDIO_CASTER_LAYER`, 5) and a color-less override material.
3. Renders the character's depth from the main camera into a half-resolution `DepthTexture` for AO.
4. Updates `uShadowFromView` (main-camera view space to shadow texture space) and `uShadowFromWorld` (for the catcher).

In the Character's normal look, `lit` is multiplied by `atStudioOcclusion( viewPos, n, screenUv )`:
- Shadow: 12 taps on a rotated spiral disk (radius growing as `pow( r, 0.75 )`, 11 turns spread over the taps), adapted from the MIT JUNNI `baku.fs`; the rotation is a screen-space hash without time, so frames are stable for capture.
  A normal offset of 1.5 shadow texels (world units, recomputed every frame) and a depth bias of 0.004 remove acne.
- AO: 12 golden-angle taps (2.39996 rad apart) in a disk of `aoRadius` world units projected to the screen; each tap reconstructs a view-space position from the depth pass and adds `max( n . d / |d| - 0.15, 0 )` with a range falloff.
  Only the character is in the AO depth pass, so this is crease occlusion of the character on itself.

Glass, line and dark looks are not affected (the multiplier touches only `lit`).

## Wiring

```ts
const studio = stage.add( new StudioShadow( { stage, character: hero, camera, sceneSize: post.sceneSize } ) );
const catcher = studio.createCatcher( 3 );   // size in world units, black at 0.55 opacity by default
catcher.position.y = floorY;
scene.add( catcher );
stage.render = () => {
	studio.render( scene );                  // after the stage updated the camera, before post
	post.render( scene, camera );
};
```

- `stage.add` matters: `setProfile` enables the pass only when `profile.tier >= minTier` (default 3) and `profile.shadows`, sizes the shadow map, and hides the catcher otherwise.
- Construct it after the Character; it patches the Character's shader source and throws a clear error if the patch point (`vec3 c = lit;` in the Character fragment shader) is gone.
- The catcher sits on layer 0, so glass and the glass look refract it like any floor.
- If the character is parented under a moving rig, nothing else is needed: bounds follow `character.root`.

## Tuning

| Uniform or option | Default | Effect |
|---|---|---|
| `shadowStrength` | 0.75 | how dark the self shadow gets on the normal look |
| `softness` | 2.5 | disk radius in shadow texels; higher is softer and noisier |
| `aoRadius` | 0.12 | crease search radius in world units (about 5% of Pip's height) |
| `aoStrength` | 1.6 | crease darkness |
| `frame` | 1.6 | shadow frustum half-size in bounding radii; raise it if the floor shadow is cut off |
| `keyDirection` | (-0.5, 0.65, 0.6) | view-space key; keep it equal to the Character key so light and shadow agree |
| catcher `opacity` | 0.55 | floor shadow darkness |

Noise: with 12 static-rotation taps the penumbra has a fine dither; it reads as texture on plush.
For a cleaner edge raise `STUDIO_SHADOW_SAMPLES` (a define in the GLSL) to 16 and lower `softness` to 1.5.

## Cost

Two depth renders of the character only (no fragment shading), 1024 px and half the screen.
Each depth target also carries an unused 8-bit color attachment (three always creates one), about 4 MB at 1024 px.
Per character pixel: 12 shadow taps and 12 AO taps.
Measure the frame time with `npm run audit -- --url ...?tier=3` before and after; keep it off below tier 3.

## Engine gap

The patch is a string replace on the Character's shader source, because `Character` has no hook for extra lighting terms.
If this pattern is needed in a second project, promote it into the engine: an optional `occlusion` chunk or uniform in `Character.ts`, with StudioShadow as an engine system.
