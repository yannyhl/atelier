# Class map (minified bundle to role)

From `script.js` of loanmeme.io, cross-checked against the MIT source of `junni-inc/next.junni.co.jp`.

| Minified | Source name | Role |
|---|---|---|
| `Ma` | `ORE.Controller` | rAF loop, pointer, layers |
| `ba` | `ORE.BaseLayer` | renderer, size info, `portraitWeight`, `animate(dt)` |
| `Sa` | `ORE.Animator` | named tweened uniforms |
| `ya` | `ORE.Easings` | sigmoid, cubic families, bezier |
| `Aa` | `ORE.GPUComputationController` | ping-pong float targets (HalfFloat on iOS) |
| `La` | `ORE.LayoutController` | portrait layout blending |
| `bl` / `Sl` | `AssetManager` / `GlobalManager` | pre, must, sub load tiers |
| `El` | `RenderPipeline` | bloom mip strip, SMAA, composite |
| `Tl` | `MipmapGeometry` | 7 halving quads |
| `Pl` | `CameraController` | cursor spring, range, shake |
| `Cl` | `Section` | base: camera and anchor from glTF, pp params |
| `Fl` `Xl` `nc` `pc` `Tc` `Gc` | `Section1..6` | the six sets |
| `wc` | `StudioShadow` | character shadow and view-depth AO |
| `bc` | `Baku` | skinned character, material types, clip crossfades |
| `th` | `DrawTrail` | 128 x 1 cursor chain tube |
| `oc` | `Peoples` | GPGPU crowd |
| `hc` / `dc` | `TileText` | bitmap-font glyph meshes |
| `jc` | `BG` | per-section sky sphere |
| `nh` | `Scroller` | virtual scroll physics |
| `rh` / `ih` | `Subtitle` / `NoiseText` | scramble subtitles |
| `oh`, `lh`, `sh` | `Footer`, `Scroll`, `Loading` | DOM chrome |
