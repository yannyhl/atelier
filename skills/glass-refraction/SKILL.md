---
name: glass-refraction
description: Build the JUNNI / loanmeme glass look on @atelier/stage - screen-space refraction with RGB dispersion and iridescent Fresnel rims via createGlassMaterial, REFRACT_LAYER and post.refraction, post.opaqueTexture and post.sceneSize, dispersion tuning (power, spread, amount, taps per tier), what to put behind glass so it reads (the rainbow slide wall fix), cost and the half-resolution opaque copy below tier 3, plus variants - glass character look, a refractive cursor trail and CRT or raymarch display panels behind glass fronts (adapted MIT shader in assets). Use when someone says "make it glass", "refraction", "dispersion", "prism", "chromatic edges", "the glass looks dull or gray", "glass character", "glass trail", "CRT screens", "TV panels", "raymarched display", or when a refractive object renders black or is missing.
---

# Glass and screen-space refraction

The reference's section 2 turns the hero to glass and floats glass props in front of a ring of text slides; section 3 hangs CRT screens with raymarched tunnels.
The glass is not ray traced: it samples a copy of the opaque frame with per-channel offsets along the surface normal, which is cheap, stable and reads as real dispersion.
This skill sets it up, tunes it, fixes dull glass and covers the variants.
The math and the reference values are in [references/refraction-math.md](references/refraction-math.md).

## How it works

1. `PostFX.renderScene` with `post.refraction = true` renders layer 0, copies it to `post.opaqueTexture`, then renders `REFRACT_LAYER` (layer 1) on top without clearing.
2. A glass fragment finds its screen UV as `gl_FragCoord.xy / post.sceneSize`.
3. `atRefract` offsets that UV by `n.xy * ( 1 - n.z * 0.7 )` (the view normal, flattened where the surface faces the camera), with a larger offset for green and blue than for red, averaged over `REFRACT_TAPS` slides.
4. The material adds a Fresnel rim that turns rainbow at grazing angles and a GGX highlight from one key direction.

Consequences you design around: glass sees only the opaque layer (never other glass or itself), it shows what is behind it on screen (not in 3D), and it looks exactly as interesting as its backdrop.

## Set it up

```ts
import { Mesh, TorusKnotGeometry } from 'three';
import { PostFX, REFRACT_LAYER, type Stage } from '@atelier/stage';
import { createGlassMaterial } from '@atelier/stage/effects';

export function addGlassKnot( stage: Stage, post: PostFX ) {

	post.refraction = true;
	const glass = createGlassMaterial( {
		sceneTexture: post.opaqueTexture,
		time: stage.time,
		resolution: post.sceneSize,
		taps: stage.profile.refractionTaps,
		iridescence: 0.75,
	} );
	const knot = new Mesh( new TorusKnotGeometry( 1, 0.34, 260, 40 ), glass );
	knot.layers.set( REFRACT_LAYER );
	stage.add( { setProfile: ( p ) => {

		glass.defines.REFRACT_TAPS = Math.max( 1, p.refractionTaps );
		glass.needsUpdate = true;

	} } );
	return knot;

}
```

- Pass the stable objects `post.opaqueTexture` and `post.sceneSize`, never their current values; PostFX rebuilds targets on tier change.
- Taps come from `profile.refractionTaps` (4, 8, 16 for tiers 1 to 3); a define change recompiles once per tier change.
- `post.refraction` is off by default so scenes without glass pay nothing; the character also needs it (it lives on `REFRACT_LAYER`).
- The glass material ignores three lights; if you light other `REFRACT_LAYER` objects with three lights, enable the lights on both layers (`light.layers.enable( REFRACT_LAYER )`), because three only collects lights that pass the camera's current layer test.
- After `renderer.compileAsync` with all layers enabled, set `camera.layers.set( 0 )` again.

## Dispersion parameters

Uniforms on the material from `createGlassMaterial`; tween any of them by replacing the uniform with an animator value (`glass.uniforms.uAmount = stage.animator.add( 'glass.amount', 1 )`).

| Uniform | Default | Meaning | Range |
|---|---|---|---|
| `uPower` | 0.12 | base offset in screen UV at a fully tilted normal | 0.02 thin panes, 0.12 solid objects, 0.3 the glass character |
| `uSpread` | 0.03 | extra slide per tap; separates the channels (the rainbow width) | 0.02 to 0.1 |
| `uAmount` | 1 | master multiplier on the offset; tween to 0 to "unglass" | 0 to 1.5 |
| `uIridescence` | 0.6 | 0 white rim, 1 full rainbow rim | 0.5 to 0.8 |
| `uTint` | white | multiplies the refracted color (linear) | pale tints only |
| `uLightDir` | (-1, 2, 1) | world direction of the GGX highlight | match the key light |
| `uOpacity` | 1 | written to alpha; the material is opaque, so this only matters if you enable blending | 1 |
| `REFRACT_TAPS` | per tier | samples per channel | 4, 8, 16 |

Reference values: the section-2 props used power 0.02 and spread 0.03 with channel multipliers 1, 2, 3; the glass character used power 0.3 and spread 0.1.
Wider spreads need more taps; when you raise `uSpread`, check `?tier=1`, where 4 taps start to show the individual offsets.

## What to put behind glass

Glass has no color of its own, so a glass object in front of a dark or flat backdrop reads as a dull gray blob.
That happened in the starter: its first glass section put the knot in front of the dark horizon sky alone, and the section looked empty.
The fix was a curved wall of 22 thin glossy panels in a hue ramp behind the knot (matcap material plus instance colors, turning slowly); the knot now bends saturated stripes and every edge splits into RGB.
The same knot without the wall still reads only through its highlights and rims, which is the before picture to avoid.

Rules for backdrops:
1. Put saturated, high-contrast, mid-to-bright content directly behind the glass on screen: stripes, text, panels, gradients with edges.
2. Edges show dispersion and flat fields do not; stripes perpendicular to the dominant normal direction split best.
3. Keep the backdrop moving slowly (turn, scroll, parallax) so the refraction animates even when the glass is still.
4. Keep the backdrop on layer 0 and opaque or additive; anything on `REFRACT_LAYER` is invisible to glass.
5. Leave room: glass near the frame edge samples outside the frame and smears the border pixels.

The reference used a ring of scrolling text slides; the starter uses the panel wall ([references/backdrops.md](references/backdrops.md) has both recipes and the before and after reasoning).

## Iridescent rims

The rim is `F = 0.04 + 0.96 * ( 1 - n.v )^5` times `mix( white, rainbow, uIridescence )`, times 0.9, plus the GGX highlight (roughness 0.18) times 0.35.
The rainbow hue is `fract( dot( worldNormal, ( 0.3, 0.6, 0.2 ) ) + time * 0.05 )`, so it is locked to the object and drifts slowly.
Rims and highlights exceed 1 at grazing angles; a section bloom of 0.35 or more makes them glint.

## Performance

- Cost per glass pixel: `REFRACT_TAPS * 3` texture reads plus the rim; screen coverage matters more than triangle count.
- Below tier 3 the opaque copy is half resolution per side, which softens the refraction slightly and cuts the copy to a quarter of the pixels; tier 3 copies at full resolution.
- Refraction adds one copy pass and splits the scene render into two passes; turn `post.refraction` off in sections where nothing on `REFRACT_LAYER` is visible (and nothing on it should draw).
- The glass character look uses a fixed 8 taps inside the Character shader.
- Budget glass at under about 40% of the screen at tier 2; a close-up glass hero is the most expensive thing in the DNA.

## Variants

1. **Glass character**: `character.setLook( 'glass' )` tweens the Character shader to refraction (power 0.3, spread 0.1, tinted by the albedo, Fresnel 0.8); see [character-studio-shading](../character-studio-shading/SKILL.md).
2. **Refractive cursor trail**: `makeTrailRefractive( trail, options )` from [assets/refractive-trail.ts](assets/refractive-trail.ts) swaps the glowing rainbow tube for a glass tube with a rainbow Fresnel rim, reusing the trail's chain texture.
3. **CRT and raymarch panels**: `createCrtDisplayMaterial` from [assets/crt-display.ts](assets/crt-display.ts) (the reference section-3 display shader, MIT, adapted) shows an image, a box tunnel or metaballs under noise bursts, flicker, inversion and scanlines; a bulged glass front on `REFRACT_LAYER` bends it.

```ts
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, type ShaderMaterial, type Texture } from 'three';
import { REFRACT_LAYER, type Stage } from '@atelier/stage';
import { createCrtDisplayMaterial } from './crt-display';

export function crtPanel( stage: Stage, glass: ShaderMaterial, logo: Texture, index: number ) {

	const panel = new Group();
	const visibility = stage.animator.add( `crt.${index}`, 0 );
	const content = ( [ 'image', 'tunnel', 'blobs' ] as const )[ index % 3 ];
	const screen = new Mesh( new PlaneGeometry( 1.4, 1 ), createCrtDisplayMaterial( { time: stage.time, visibility, content, map: logo, seed: index + 1 } ) );
	const front = new Mesh( new BoxGeometry( 1.5, 1.1, 0.12, 8, 8, 1 ), glass );
	front.position.z = 0.08;
	front.layers.set( REFRACT_LAYER );
	const body = new Mesh( new BoxGeometry( 1.6, 1.2, 0.5 ), new MeshBasicMaterial( { color: '#141820' } ) );
	body.position.z = - 0.27;
	panel.add( screen, front, body );
	return panel;

}
```

Bulge the front's +Z vertices a little (0.08 at the center) so the edges bend the picture; [references/variants.md](references/variants.md) has the helper, the trail wiring and the display tuning.

## Verify

1. Capture the glass section at all four viewports: the glass must show color from its backdrop at every size, including portrait where the layout shifts.
2. Compare `?tier=1` and `?tier=3`: dispersion still visible, no ghosted edges.
3. Scrub with `seek`: refraction is a pure function of the frame, so any flicker comes from the backdrop.
4. Check the frame edges for smears where glass samples outside the screen.

## References

- [references/refraction-math.md](references/refraction-math.md): `atRefract` line by line, reference parameter sets, limits.
- [references/backdrops.md](references/backdrops.md): the panel wall and text-ring recipes, before and after.
- [references/variants.md](references/variants.md): glass character, refractive trail, CRT panels, glass props.
- [assets/crt-display.glsl](assets/crt-display.glsl) and [assets/crt-display.ts](assets/crt-display.ts): CRT and raymarch display (MIT, adapted).
- [assets/refractive-trail.ts](assets/refractive-trail.ts): glass cursor trail.
- Related: [postfx-bloom-dirt](../postfx-bloom-dirt/SKILL.md), [gpgpu-effects](../gpgpu-effects/SKILL.md), [perf-tiering](../perf-tiering/SKILL.md).
