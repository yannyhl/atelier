# Glass variants

All variants need `post.refraction = true` and a backdrop on layer 0 (see [backdrops.md](backdrops.md)).

## Glass character

`Character` already contains the glass look; switch per section:

```ts
character.setLook( 'glass' );        // 1 s tween of the glass weight, the other looks go to 0
character.setLook( 'normal', 0.6 );  // back
```

Inside the Character shader the glass look is `atRefract( uSceneTex, suv, n, 0.3, 0.1, 1.0 ) * mix( vec3( 0.8 ), albedo, 0.5 ) + F * 0.8` with 8 taps.
The look is a weight, so a half-way tween (0.5) gives a milky, half-lit character that works as a transition beat.
The reference paired it with lower roughness and a bright environment rim; in atelier the rim comes from the Fresnel term.
Character setup, looks and choreography are in [character-studio-shading](../../character-studio-shading/SKILL.md).

## Refractive cursor trail

The reference trail refracts in its glass sections.
`makeTrailRefractive` from [../assets/refractive-trail.ts](../assets/refractive-trail.ts) swaps the trail's material for a glass tube and moves it to `REFRACT_LAYER`:

```ts
const glow = trail.mesh.material;
const glassTrail = makeTrailRefractive( trail, {
	sceneTexture: post.opaqueTexture, sceneSize: post.sceneSize, time: stage.time, taps: stage.profile.refractionTaps,
} );

// Per section: glass in the glass section, the glowing rainbow (or ink) tube elsewhere.
function trailLook( glassy: boolean ) {
	trail.mesh.material = glassy ? glassTrail : glow;
	trail.mesh.layers.set( glassy ? REFRACT_LAYER : 0 );
}
```

- The new material shares the trail's `uChain`, `uRadius` and `uRainbow` uniforms, so `trail.update()`, `trail.shift()` and `trail.reset()` keep driving it.
- It is opaque and writes depth, unlike the alpha-blended glow tube; it ignores the trail's `ink` value.
- Defaults: power 0.06, spread 0.04, rim 0.8 (rainbow Fresnel scaled by the trail's `uRainbow`).
- Update `glassTrail.defines.REFRACT_TAPS` and set `needsUpdate` on tier change, like any glass.
- The trail rules still apply: fine pointers only, tier 2 and up, head unprojected at NDC depth 0.97 (see [gpgpu-effects](../../gpgpu-effects/SKILL.md)).

## CRT and raymarch display panels

The reference section 3 hung TV-like displays showing a logo, a box tunnel or metaballs, glitching between noise, inverted frames and a rolling scanline.
[../assets/crt-display.glsl](../assets/crt-display.glsl) is that display shader adapted from the MIT JUNNI source into the `at*` chunk conventions:

| Function | Does |
|---|---|
| `atCrtState( time, seed )` | per-panel burst brightness, inversion flag and glitch fade, from value noise plus a per-frame hash (deterministic) |
| `atCrtEffect( time, seed, period )` | eased random steps every `period` seconds, replacing the reference's `Math.random()` tween |
| `atCrtRaymarch( uv, time, effect, scene, jitter, invert )` | 40-step raymarch of scene 1 (spinning box tunnel) or 2 (five smooth-min metaballs) |
| `atCrtSignal( color, uv, time, state )` | noise bursts, 80 Hz flicker, inversion, rolling scanlines, edge falloff |
| `atCrtTear( uv, time, fade )` | per-scanline chroma tear offsets for image content |

`createCrtDisplayMaterial( { time, visibility, content, map, seed, intensity } )` wraps it: `content` is `'image'`, `'tunnel'` or `'blobs'`, `intensity` (default 1.4) pushes whites over the bloom threshold, and `seed` must differ per panel so they glitch out of sync.
Burst frequency is set by the `0.64` to `0.74` smoothstep in `atCrtState`; raise the edges for calmer screens.

Glass front: a thin box on `REFRACT_LAYER` in front of the screen, its front face bulged so the edges bend the picture.

```ts
function bulge( geo: BoxGeometry, amount: number, halfW: number, halfH: number ) {
	const p = geo.getAttribute( 'position' );
	for ( let i = 0; i < p.count; i ++ ) {
		if ( p.getZ( i ) <= 0 ) continue;
		const x = p.getX( i ) / halfW, y = p.getY( i ) / halfH;
		p.setZ( i, p.getZ( i ) + amount * Math.max( 0, 1 - x * x ) * Math.max( 0, 1 - y * y ) );
	}
	geo.computeVertexNormals();
}
// new BoxGeometry( 1.5, 1.1, 0.12, 8, 8, 1 ) then bulge( geo, 0.08, 0.75, 0.55 )
```

Raymarching costs 40 steps plus 6 extra SDF calls for the normal on hit, per pixel of the panel; keep panels small on screen, or render them into a low-resolution render target once per frame and show that texture when a panel fills more than a fifth of the screen.

## Glass props

The reference's section-2 props (a cube, a torus and a cylinder) were thin glass with a weak push and a hue rim.
Use `createGlassMaterial` with `uPower` 0.02 to 0.05 and `uSpread` 0.03, turn them slowly, and let pointer velocity nudge their rotation (the reference damped a velocity by 0.98 per frame and applied it as a small Euler rotation).
Keep that velocity inside a `StageSystem.update( dt )` so capture replays it.
