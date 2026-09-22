# Color pipeline

atelier renders in linear light and encodes sRGB exactly once, in the PostFX composite.
Every wrong-color bug so far came from a value converted zero times or twice.

## The rules

| Stage | Space | Who handles it |
|---|---|---|
| Hex tokens (`--at-ice`, `SkyLook.top`) | sRGB | you, when you type them |
| `THREE.Color` values | linear | `new Color( '#hex' )`, `setStyle` and `setHex` convert sRGB to linear |
| Color textures (albedo, matcaps, sprite atlases, canvas text) | stored sRGB, sampled linear | `texture.colorSpace = SRGBColorSpace` |
| Data textures (dirt, noise, normals, roughness, GPGPU state, DataTextures) | raw | leave `NoColorSpace` |
| Scene materials, built-in or `ShaderMaterial` | write linear | built-ins do it automatically into render targets; custom shaders must not encode |
| `sceneRT`, bloom levels, `opaqueRT` | linear (half float or 8-bit) | PostFX |
| Composite output | sRGB | `toSRGB` in `composite.frag` |
| SMAA and FXAA | pass-through | three addons (they do not re-encode) |

## Conversions

- In TypeScript: `new Color( '#8fc9e8' )` gives linear (0.275, 0.584, 0.807); pass it straight into a `vec3` uniform.
- In GLSL: `atSrgbToLinear( vec3( 0.56, 0.79, 0.91 ) )` for constants copied from a design tool.
- HSL: `new Color().setHSL( h, s, l, SRGBColorSpace )` matches a color picker; without the fourth argument the numbers are treated as linear and the result is much lighter on screen (0.6 lightness at hue 0.5 becomes (0.26, 0.94, 0.94) instead of (0.06, 0.87, 0.87)).
- Linear to display, for checking a value by eye: `srgb = 1.055 * pow( linear, 1 / 2.4 ) - 0.055` above 0.0031308.

## Symptoms

| Symptom | Likely cause | Fix |
|---|---|---|
| Colors darker and more saturated than the token | converted twice (for example `new Color( hex )` into a shader that also calls `atSrgbToLinear`) | convert once |
| Colors pale and washed out | a custom shader encodes (`pow( 1/2.2 )`), or a color texture is flagged `NoColorSpace` | remove the encode, set `SRGBColorSpace` |
| Dark gradients band at tier 1 | 8-bit linear storage loses precision in the darks | keep dark skies at tier 2, add texture, or rely on the composite dither |
| Bloom tints everything | bright values far above 1 plus wide halos | lower emissive or `bloom`; the threshold response is quadratic |
| A glTF looks flat and too bright | material maps missing, or its roughness lives in a palette texture the shader ignores | see [character-studio-shading](../../character-studio-shading/SKILL.md) for the `--palette false` rule |

## Tone mapping and exposure

`renderer.toneMapping` only applies when three renders straight to the screen, which the stage never does.
Use `PostParams.exposure` for brightness and keep scene values in a sensible range (most surfaces 0 to 1, emissive 1 to 2.5).
If a project needs a filmic curve, add it to the composite before `toSRGB` (see [adding-a-pass.md](adding-a-pass.md)) and apply it to scene plus bloom together.
