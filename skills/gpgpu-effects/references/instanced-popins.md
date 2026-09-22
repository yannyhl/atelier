# Instanced pop-ins

The DNA: matcap props appear with `easeOutBack` staggered 0.15 s, and leave the same way; nothing just vanishes.

## CPU version (the starter)

In the section's `update( dt, stage )`:

```ts
const easeBack = Easings.easeOutBack( 1.6 );
for ( let i = 0; i < count; i ++ ) {
	const k = Math.min( 1, Math.max( 0, v * 1.5 - ( i / count ) * 0.5 ) );   // v = the section's reveal tween
	scale.set( 1, Math.max( 1e-3, easeBack( k ) ), 1 );
	panels.setMatrixAt( i, matrix.compose( position, quaternion, scale ) );
}
panels.instanceMatrix.needsUpdate = true;
```

- Never scale to exactly 0 (degenerate matrices break normals); clamp at 1e-3.
- Fine for tens of instances that also move every frame (the starter's panel wall bobs and turns anyway).

## GPU version ([../assets/popin-instances.ts](../assets/popin-instances.ts))

`addPopIn( material, { reveal, count, spread } )` patches any built-in material (tested with `MeshMatcapMaterial`) so its vertex shader does:

```glsl
float popT = atStagger( uPopReveal, float( gl_InstanceID ), uPopCount, uPopSpread );
transformed *= max( atEaseOutBack( popT ), 1e-4 );
```

- `atStagger( v, i, n, s ) = clamp( v * ( 1 + s ) - i / n * s, 0, 1 )`; `atEaseOutBack` overshoots by the standard 1.70158.
- Tween `reveal` with `Easings.linear`: the per-instance curve already eases, a second ease on the group would bunch the stagger.
- The instance matrices stay untouched, so set them once; zero CPU per frame and exact under `seek`.
- It chains any existing `onBeforeCompile` and extends the program cache key, so other patches keep working.

## Timing

With `n` instances, spread `s` and a reveal tween of `D` seconds:
- instance `i` starts at `i / n * s / ( 1 + s ) * D`,
- each instance's pop lasts `D / ( 1 + s )`,
- the step between neighbours is `s / ( 1 + s ) * D / n`.

For the reference 0.15 s step: `D = 0.15 * n * ( 1 + s ) / s`; with 8 props and s = 1.5 that is 2 s, each pop lasting 0.8 s.

## Exits

Tween `reveal` back to 0 in `leave()` (0.6 to 0.8 s); the highest index shrinks first, so the exit reads as the entrance played backwards.
For an exit that differs from the entrance (the reference animates exits to state 2), feed `SectionUniforms.state` into a second uniform and branch on it in the patch.
