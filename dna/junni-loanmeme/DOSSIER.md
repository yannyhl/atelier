# DNA dossier: JUNNI / loanmeme.io

Studied 2026-09-22.
Reference: https://loanmeme.io and its launch post https://x.com/loanmeme/status/2102412618539446670.
Status: research complete; techniques encoded in `packages/stage` and `skills/`.

## Provenance

loanmeme.io is a reskin of JUNNI's award-winning "Junni is..." corporate site (Awwwards Site of the Day, FWA of the Day, CSSDA), engineered by ukonpower.
Evidence in the shipped page:
- `index.html` still carries commented-out links to `twitter.com/junni_jp`, `instagram.com/junni_jp` and `junni.co.jp`.
- The bundle contains Japanese Junni subtitle copy and the noise string "このサイト作るの意外と大変なんですよこれが".
- The mascot is still called `Baku` throughout the code (`baku_amature`, `bakuTransform`, `baku_0..5.webp`).
- The character shader carries new English comments ("camera-relative studio rig keeps the plush readable") added for the Loan Meme character.

JUNNI published the full source under MIT at https://github.com/junni-inc/next.junni.co.jp, including every Blender file in `blend-files/`.
ukonpower's framework `ore-three` is MIT too: https://github.com/ukonpower/ore-three.
Technical write-up by the author: https://zenn.dev/junni/articles/bb71f44c89cb77.
Loan Meme's own assets (character GLB, logo, copy) carry no license; atelier extracts techniques and parameters only and ships none of them.

## Stack

| Layer | Reference | atelier |
|---|---|---|
| Renderer | three.js r145 `WebGLRenderer` | three.js r186 `WebGLRenderer`, WebGL2 |
| Framework | ore-three (Controller, BaseLayer, Animator, PostProcessing) | `@atelier/stage` (patterns adapted, no dependency) |
| Physics | cannon.js 0.6.2 (shatter wall, character collider) | none by default; add cannon-es per project |
| Wheel filter | Lethargy + a 100 ms inertia-tail filter | inertia-tail filter only (Lethargy was redundant) |
| Debug UI | Tweakpane 3.1, hidden | `window.__atelier.stats()` plus scripts |
| Build | webpack, gulp, glslify | Vite 8, `?raw` GLSL imports |
| Hosting | static HTML on Cloudflare | static output, any CDN |

## Architecture

1. One fixed full-screen canvas; the document never scrolls (`overflow: hidden`).
2. A controller runs `requestAnimationFrame`, then `pointer.update()`, then `layer.tick(dt)` for each layer, with `dt = min(0.1, dt)`.
3. Scenes are authored in Blender: one `section_N.glb` per section carries `Camera`, `CameraTarget` and a character anchor node (`Baku`); code looks nodes up by name and gives each object its own class.
4. WebGL was built before the visual design (stated in the author's write-up).
5. Frame order: scroller, animator, camera controller, world transform from scroll value, world update, camera transform, render.

### Section model

Each section declares `cameraTransform` (from glTF), `bakuTransform`, `ppParam {bloomBrightness, vignet}`, `bakuParam {materialType, rotateSpeed}`, `cameraSPFovWeight` (default 30) and `cameraRange` (cursor parallax, default 0.1).
Each owns two tweened uniforms: `sectionViewing` (0 ready, 1 viewing, 2 passed) and `sectionVisibility` (0..1).
Transitions fire when the scroller's snap target changes, not when the value crosses a boundary.
Section configs observed:

| Section | FOV | Look |
|---|---|---|
| 1 | 37.3 | vignette 0.7, cannon.js shatter wall textured with the intro render |
| 2 | 37.3 | vignette 1.5, character becomes glass, ring of scrolling text slides |
| 3 | 37.0 | bloom 1.5, CRT displays with raymarched tunnels, neon, particle vortex |
| 4 | 11.6 | telephoto, line-art character, 676-agent GPGPU crowd, bitmap type "meme bank" |
| 5 | 58.7 | dark character, bloom 1, vertical CJK manifesto revealed per character |
| 6 | 58.7 | bloom 2, road, wind streaks, running comrades, rainbow "REWARDED!" |

### Virtual scroller

`value` is a float in section units.
Between inputs a spring pulls it toward `round(value +/- 0.45)`, biased by velocity sign:

```js
target = round( value + ( velocity > 0 ? 0.45 : -0.45 ) );
vv += ( target - value ) * dt * 0.3;  vv *= 0.86 * ( 1 - dt * 2 );
v  += vv * 10 * dt;                   v  *= 1 - dt * 8;
value += v;
```

Wheel adds `deltaY * 5e-5`; a smaller delta within 100 ms of the previous one is dropped (trackpad inertia tail).
Touch drag moves `value` by `-deltaPx * 5e-4`; release adds `-2 * delta * 5e-4`; a drag beyond 0.05 commits to the next section.
Programmatic moves tween with `easeInOutCubic` (buttons 1 s, timeline dots 2 s).
Input is ignored until the intro finishes.

### Animator

Every tweened value is a `{ value }` object that is also a three.js uniform, so tweening needs no glue code.
Default easing `sigmoid(6)`, default duration 1 s.
One-hot section arrays (`[0,0,1,0,0,0]`) are tweened as a whole; shaders `mix` per-section looks by those weights.
Staggers were done with `setTimeout` (not deterministic; atelier uses a clock-driven scheduler instead).

### Responsive scalar

`portraitWeight = clamp(1 - (aspect - 0.5) / (16/9 - 0.5), 0, 1)`.
FOV becomes `fov + cameraSPFovWeight * portraitWeight`; object layouts blend toward portrait positions by the same weight.
One CSS breakpoint at 800 px handles DOM chrome only.

## Rendering

### Post chain (reference)

1. Scene into `rt1` (8-bit, depth + stencil).
2. Bright pass `c * max(0, c - 0.5)` drawn through a geometry of 7 quads, each half the previous, packing a whole mip chain into one render target.
3. Separable 5-weight Gaussian, 4 passes, `blurRange 2.28`, weights `exp(-0.5 r^2 / 100)`.
4. SMAA (edge detection threshold 0.1, 8 search steps).
5. Composite: bicubic sample of each mip weighted by `i / 7 * brightness`, plus `bloom * lensDirt * weight`, then vignette `mix(1, smoothstep(2.0, 0.8, length(cuv)), vignet)`.

No tone mapping, no chromatic aberration pass; dispersion lives in materials.
atelier keeps the look but replaces the mip strip with a thresholded 13-tap down chain and a tent up chain: the strip aliases into visible blocks on large bright areas (reproduced during this study).

### Signature shading

- **Screen-space refraction with RGB dispersion**: the character's `onBeforeRender` copies the current render target to `uSceneTex`; glass samples it 16 times with per-channel offsets along the view normal (`refractNormal = normal.xy * (1 - normal.z * 0.7)`, channel multipliers 1, 2, 3).
- **Custom PBR**: GGX D, Smith-Schlick G, Schlick F with f0 0.04, PMREM env.
- **Studio rig on the character**: three camera-relative lights, a 1024 px 5x5 PCF studio shadow, 12-sample golden-angle hemisphere AO against a view-depth pass, eye softbox glints `pow(., 100)` and `pow(., 180)`, inverted-hull outline (`normal * 0.02`, back faces, black).
- **Matcap props** with staggered `easeOutBack` pop-ins.
- **Sky sphere** (radius 100, back faces) with per-section procedural gradients chosen by one-hot weights and dithered by `(rand - 0.5) / 255`.
- **Brand gradient** (section 1 sky): frost `(.84,.93,.98)`, ice `(.56,.79,.91)` to `(.40,.68,.84)`, lime `(.85,.93,.70)` to `(.76,.88,.53)`, phase animated.

### Motion systems

- **Cursor trail**: 128 x 1 float texture chain (pixel 0 = cursor, each pixel eases toward the previous), drawn as one cylinder of 9 x 128 segments oriented per segment, thickness `sin(t * PI) * speed`, rainbow emission, refraction in glass sections. Desktop only.
- **Crowd**: 26 x 26 GPGPU agents with 4D simplex flow, avoidance circles, cursor repulsion and a 16 x 2 walk-cycle sprite atlas.
- **Particles**: snowfall points in clip space, sparks streaking toward camera, instanced line grids with depth fade.
- **Character**: one skinned glTF (13 joints) with a clip per section, 1 s weight crossfades, clip reuse at different time scales.

### Typography

- Bitmap font: an 8 x 8 atlas (a-z only), one quad per glyph, spin-in `rotate(-v * TAU)` plus hop `sin(fract(v) * PI)`, 70 ms stagger, exit by animating to 2.
- Scramble subtitles: text types in with up to 3 trailing noise glyphs, 40 ms ticks.
- DOM reveal: per-character spans, 60 ms stagger from 0.2 s, color over 2 s, 15 px slide over 1 s, vertical CJK columns with a 40% black bar wiping in.
- Rainbow CTA: per-character `hsl(360 * ((0.2 t % 1) - 0.05 i), 80%, 50%)`.

## Tokens

See `STYLE-SPEC.md` for the approved token table.

## Performance of the reference

| Measure | loanmeme.io | atelier template |
|---|---|---|
| Total transfer | about 11.6 MB (assets 9.9 MB + 1.2 MB JS + fonts) | 221 KB |
| JS | 1.2 MB raw, 292 KB compressed, served `no-cache` | 189 KB, hashed and immutable |
| Mesh compression | none | meshopt via gltf-transform |
| Texture compression | WebP only, one 1 MB PNG inside the blocking GLB | KTX2 (UASTC normals, ETC1S color) |
| First render blocked on | 3.3 MB `common.glb` | nothing (static document paints first) |
| Resolution | fixed `max(1, 0.5 * DPR)` | tier DPR cap with runtime adaptation |
| Hidden tab | keeps rendering | paused (visibility and intersection) |
| Reduced motion | ignored | no inertia or shake, short moves |
| No WebGL | blank | full static page |
| Fonts | 8 families from Google, 2 unused | 2 self-hosted Latin subsets |
| Device detection | UA sniffing (dead `macintosh` check) | GPU probe plus frame-time monitor |

## Launch video

The X post ("Hi world, I'm $LOAN") carries a 24.7 s 1920 x 1080 H.264 clip that is a screen capture of the site's own scenes.
atelier reproduces this with `scripts/render-video.mjs`: scenes expose `seek(t)` on a fixed-step clock, so a scripted camera path renders frame-exact, repeatable MP4s.

## What atelier deliberately changed

1. Fixed-step clock and seeded RNG everywhere, so every frame is reproducible for video.
2. Dual-filter bloom instead of the mip strip (no blocking artifacts, cheaper).
3. Linear half-float scene targets, sRGB encode in the composite, dithering and optional grain.
4. Static HTML first paint with an inline pre-paint opt-in: zero layout shift, full fallback.
5. Quality tiers and a frame monitor instead of UA sniffing and a fixed half DPR.
6. Keyboard navigation, real buttons, aria labels and reduced-motion handling.
7. Glyph atlases generated from any web font at runtime instead of a hand-painted a-z sheet.
8. CPU cursor-trail chain instead of GPGPU at 128 points (cheaper, universal, deterministic).

## Sources

- Site bundle and CSS dissected from https://loanmeme.io (not redistributed).
- https://github.com/junni-inc/next.junni.co.jp (MIT), https://github.com/ukonpower/ore-three (MIT).
- https://zenn.dev/junni/articles/bb71f44c89cb77 (technical write-up).
- https://www.awwwards.com/sites/junni-is, https://www.cssdesignawards.com/sites/junni-is/42217.
- X post data via https://api.fxtwitter.com/loanmeme/status/2102412618539446670.
