# Refraction math

Source: `packages/stage/src/effects/glsl/refraction.glsl` (`atRefract`, `atFresnel`, `atGGX`) and `GlassMaterial.ts`.

## atRefract

```glsl
vec3 atRefract( sampler2D sceneTex, vec2 screenUv, vec3 viewNormal, float power, float spread, float amount ) {
	vec2 n = viewNormal.xy * ( 1.0 - viewNormal.z * 0.7 );
	float jitter = atHash( screenUv * 997.0 ) * 0.007;
	for ( int i = 0; i < REFRACT_TAPS; i ++ ) {
		float slide = float( i ) / float( REFRACT_TAPS ) * spread + jitter;
		col.r += texture2D( sceneTex, screenUv - n * ( power + slide * 1.0 ) * amount ).r;
		col.g += texture2D( sceneTex, screenUv - n * ( power + slide * 2.0 ) * amount ).g;
		col.b += texture2D( sceneTex, screenUv - n * ( power + slide * 3.0 ) * amount ).b;
	}
	return col / float( REFRACT_TAPS );
}
```

- `n.xy * ( 1 - n.z * 0.7 )`: the view normal's screen component, damped where the surface faces the camera (n.z near 1), so the middle of an object refracts gently and the silhouette strongly.
- `power`: the constant part of the offset, in screen UV (0.1 is a tenth of the screen).
- `slide`: grows from 0 to `spread` across the taps; each channel travels 1x, 2x or 3x that slide, so blue lands furthest out.
  Averaging the taps smears each channel along its own path: that smear is the dispersion.
- `jitter`: a per-pixel hash of the screen UV (no time), so neighbouring pixels start at different slides; it hides tap banding and is stable frame to frame, which keeps `seek` captures exact.
- `amount`: multiplies the whole offset; 0 shows the undistorted backdrop (the glass disappears except for its rim).

Cost: `REFRACT_TAPS * 3` dependent texture reads per pixel.

## Fresnel and highlight

- `atFresnel( dNV, 0.04 ) = 0.04 + 0.96 * ( 1 - dNV )^5` (Schlick, dielectric f0 0.04).
- `atGGX( dNH, roughness )` uses `a2 = roughness^4`, the same remapping as the reference's `ggx`.
- Glass: `col += rim * F * 0.9 + spec * 0.35`, spec with roughness 0.18 and `max( dot( n, l ), 0 )`.

## Parameter sets

| Where | power | spread | channel multipliers | taps | Notes |
|---|---|---|---|---|---|
| Reference section-2 props (`transparent.fs`) | 0.02 | 0.03 | 1, 2, 3 | 16 | plus a 0.007 jitter and a hue rim `hsv( dNV * 2 + sin( t ) * 0.1 + 0.2 )` |
| Reference glass character (`baku.fs`) | 0.3 | 0.1 | 1, 1.5, 2 | 16 | normal damping 0.85, tint `mix( 0.8, albedo, length( albedo ) )` |
| atelier `createGlassMaterial` default | 0.12 | 0.03 | 1, 2, 3 | 4 / 8 / 16 | damping 0.7 |
| atelier Character glass look | 0.3 | 0.1 | 1, 2, 3 | 8 | tint `mix( 0.8, albedo, 0.5 )`, Fresnel 0.8 added |
| `makeTrailRefractive` default | 0.06 | 0.04 | 1, 2, 3 | per tier | thin tube, needs a stronger push than a big object |

## Limits

- Single capture: glass cannot refract other glass or itself; overlapping glass shows only the opaque scene through both.
- Screen space: content off screen or hidden behind the glass cannot appear in it; a strong power near the frame edge samples clamped border pixels.
- No thickness: a thin pane and a solid ball differ only by `power`; use a smaller power for panes.
- No depth test against the backdrop: objects in front of the glass but on layer 0 still appear inside it, shifted.
  Keep such objects out of the glass silhouette, or accept it as part of the stylized look (the reference does).
