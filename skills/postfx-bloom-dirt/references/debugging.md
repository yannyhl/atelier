# Debugging PostFX

Work top to bottom; each item names the check and the fix.
Expose the post object in development so you can poke it from the console:

```ts
if ( import.meta.env.DEV ) Object.assign( window, { post } );
```

Then this prints every size that matters:

```js
( () => {
	const r = __atelier.stage.renderer;
	console.table( {
		scene: [ post.sceneRT.width, post.sceneRT.height, post.sceneRT.texture.type ],
		sceneSize: [ post.sceneSize.x, post.sceneSize.y ],
		opaque: post.opaqueTexture.value && [ post.opaqueTexture.value.image.width, post.opaqueTexture.value.image.height ],
		halfFloatRender: [ r.extensions.has( 'EXT_color_buffer_half_float' ), r.extensions.has( 'EXT_color_buffer_float' ) ],
		tier: [ __atelier.stage.profile.tier ],
	} );
} )();
```

## Black screen

1. **No frames at all.** `stage.render` never assigned, `stage.start()` never called, or the page is in capture mode (`?capture=1`), where frames only come from `seek( t )`.
2. **One flat color, or a blurry smear.** `post.resize` was never called, so `sceneRT` is 1 x 1.
   Register `stage.add( { resize: ( v ) => post.resize( v ), setProfile: ( p ) => post.setProfile( p ) } )`.
3. **Black at tier 2 and 3 on one device, fine at `?tier=1`.** Half-float render targets are not renderable there (neither `EXT_color_buffer_half_float` nor `EXT_color_buffer_float`).
   PostFX picks half float from `profile.halfFloat` without checking; pin tier 1 on that device class and report it.
4. **Glass, the character or a refractive trail missing.** They live on `REFRACT_LAYER`; set `post.refraction = true`, or the camera only ever renders layer 0.
   After `renderer.compileAsync` with `camera.layers.enableAll()`, set `camera.layers.set( 0 )` again: with refraction off and every layer enabled, refractive materials draw in the main pass and sample an empty or stale `opaqueTexture`.
5. **Black squares that grow with bloom.** A shader wrote NaN or infinity (for example `normalize( vec3( 0 ) )` or `pow` of a negative); the 13-tap filter spreads it.
   Set `bloom` to 0 to confirm, then guard the shader.
6. **Black after a tier change.** A system cached `post.sceneRT` or `post.opaqueTexture.value`; `setProfile` rebuilds the targets.
   Share the stable objects (`post.opaqueTexture`, `post.sceneSize`) instead of their current values.
7. **Black or garbage from your own render target.** A custom target with `colorSpace: SRGBColorSpace` must be 8-bit (three stores sRGB only in `UnsignedByteType`); keep half-float and float targets at `NoColorSpace`, like every PostFX target.
   A `DataTexture` of GPGPU state flagged sRGB gets its values bent; keep data at `NoColorSpace`.

## Wrong look

| Symptom | Check | Fix |
|---|---|---|
| No bloom | `post.params.bloom.value` is 0 (it skips the chain), tier 0, or tier 1 with nothing above threshold | raise bloom per section; at tier 1 values clamp at 1 |
| Frame milky, everything glows | emissive far above 1; the quadratic threshold makes 6.0 hit the cap | keep emissive 1 to 2.5, lower `bloom` |
| Blocky bloom | you are not on the PostFX chain (a custom mip strip), or a pass reads bloom with nearest filtering | use PostFX; see [chain.md](chain.md) |
| Dirt looks like stretched ovals | the composite samples dirt at screen UV | swap a portrait dirt texture on resize (SKILL.md) |
| Dirt visible on black areas | the dirt texture is not black enough, or `exposure` lifts a dark scene | regenerate with lower `--strength`, check `mean` below 0.04 |
| Colors too dark and saturated, or pale | converted twice or never | [color-pipeline.md](color-pipeline.md) |
| Look resets after scrubbing to 0 | `stage.reset()` restored animator defaults | set looks in `SectionDef.post` and section `enter()`, not once at boot |
| Grain crawls and videos are huge | full grain in capture | `post.grainScale = 0.25` in capture mode |
| Banding in dark gradients | tier 1 stores linear in 8-bit | keep those sections at tier 2, add texture, or brighten the darks slightly |
