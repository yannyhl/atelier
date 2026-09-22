# The studio rig and the looks

Source: the `FRAG` shader in `packages/stage/src/effects/Character.ts`.
All vectors are in view space: `n` is the view normal (flipped on back faces), `v = normalize( -viewPos )`.
Colors are linear.

## Inputs from the glTF material

| Uniform | From | Notes |
|---|---|---|
| `uColor` | `material.color` | linear factor, multiplies the map |
| `uMap`, `uHasMap` | `material.map` | sRGB texture, sampled as linear |
| `uRoughness` | `material.roughness`, clamped to 0.08..1 | factor only; roughness maps are ignored |
| `uSheen` | 1 if `material.sheen > 0` (KHR_materials_sheen), else 0 | a flag, not an amount |
| `uTint` | `character.uniforms.tint` | shared by all meshes |

`albedo = map * uColor * uTint`.

## One light

```glsl
vec3 shade( n, v, l, lightColor, albedo, rough ) {
	h = normalize( v + l );
	nl = max( dot( n, l ), 0 );
	wrap = max( ( dot( n, l ) + 0.25 * uSheen ) / ( 1 + 0.25 * uSheen ), 0 );   // wrapped diffuse for plush
	F = 0.04 + 0.96 * ( 1 - max( dot( h, v ), 0 ) )^5;
	spec = GGX( max( dot( n, h ), 0 ), rough ) * F * nl;                     // a2 = rough^4
	return lightColor * ( albedo / PI * wrap * ( 1 - F ) + spec * mix( 1, 0.35, uSheen ) );
}
```

## The rig

| Term | Formula |
|---|---|
| ambient | `albedo * 0.08` |
| key | `shade( n, v, normalize( -0.5, 0.65, 0.6 ), ( 3.0, 2.94, 2.85 ) )`, warm, upper left, toward the camera |
| fill | `shade( n, v, normalize( 0.8, 0.2, 0.8 ), ( 0.55, 0.62, 0.72 ) )`, cool, right |
| bounce | `shade( n, v, normalize( 0.0, -1.0, 0.45 ), ( 0.2, 0.24, 0.3 ) )`, blue, from the floor |
| sheen rim | `+= albedo * ( 1 - n.v )^3 * 0.35 * uSheen` |
| underside occlusion | `*= mix( 0.55, 1.0, smoothstep( -0.9, 0.3, worldNormal.y ) )` |
| glints | `r = reflect( -v, n )`; `+= ( pow( max( r . normalize( -0.5, 0.65, 1 ), 0 ), 100 ) * 0.85 + pow( max( r . normalize( 0.7, 0.25, 1 ), 0 ), 180 ) * 0.3 ) * ( 1 - rough )` |

Energy: a white albedo facing the key gets about 3 / PI = 0.95 from the key, 0.17 from the fill and 0.08 ambient, so lit plush peaks near 1.2 linear.
That crosses the 0.5 bloom threshold on purpose: the character carries a soft glow at section bloom 0.25 to 0.35.
Keep base colors below about 0.8 linear (0.9 sRGB) or the key face blooms into a flat patch.

Camera-relative lighting is the point: however the camera travels between sets, the key stays upper left of the frame, so the character reads the same on a daylight set and a black stage.
The reference JUNNI shader used the scene's directional lights; the loanmeme reskin moved to this camera-relative rig, and atelier keeps that.

## Looks

```glsl
dark  = vec3( F * 1.4 );                                   // F = fresnel( n.v, 0.04 )
line  = mix( vec3( 0.96 ), albedo, 0.08 );                 // the outline mesh draws the ink
glass = atRefract( uSceneTex, gl_FragCoord.xy / uResolution, n, 0.3, 0.1, 1.0 ) * mix( vec3( 0.8 ), albedo, 0.5 ) + F * 0.8;
c = lit;
c = mix( c, line, uLine );
c = mix( c, dark, uDark );
c = mix( c, glass, uGlass );
```

Outline mesh (line look): same geometry and skeleton, `BackSide`, transparent, no depth write, vertices pushed out along the normal by `uOutline` (the `lineWidth`), black with alpha `uLine * uOpacity`, drawn one render order earlier.
It discards entirely when `uLine < 0.01`, so it costs almost nothing outside the line look.

## Retuning

The rig constants live in the engine shader; change them there (an engine change, AGENTS.md rule 2) when a DNA needs different light, and keep this table in sync.
Per project, prefer the knobs that exist: `tint`, material roughness and sheen in Blender, section bloom and exposure.
To match a set lit by three lights (for example a product next to the character), mirror the key direction in world space each frame from `camera.quaternion`.
