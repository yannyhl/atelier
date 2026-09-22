# Compression pipeline

`scripts/compress-glb.mjs` wraps @gltf-transform/cli 4.5.0 (a root devDependency, so `npx gltf-transform` works anywhere in the repo).
This page records why each flag is set and how to run the steps by hand.

## Evidence: what the default optimize does to a set

Test input: a Blender export with `CameraData > Camera, CameraTarget`, an `Anchor` empty, an animated `Hero` cube with a texture and a static `Ball`.

| Pipeline | Nodes after | What `shotFromScene` returned |
|---|---|---|
| Raw Blender export | `Anchor`, `Ball`, `CameraData > Camera, CameraTarget`, `Hero` | target (0, 1, 0), anchor present |
| `optimize` defaults | `Ball`, `Hero > (unnamed mesh)`, `Camera` | target (0, 0, 0), no anchor, only a console warning |
| `optimize --prune false` (or `--no-prune`) | `Ball`, `Hero > (unnamed mesh)`, `Camera` | same: flatten and join still remove the empties |
| `optimize --flatten false --prune false` | `Ball`, `CameraData > Camera`, `Hero > (unnamed mesh)` | target and anchor still lost (join step) |
| `optimize --flatten false --join false --palette false` | `Ball`, `CameraData > Camera`, `Hero > (unnamed mesh)` | target lost (empty leaves pruned) |
| `optimize --flatten false --join false --prune false` | all names kept | correct |
| `compress-glb.mjs` | all names kept | correct; 103 KB to 30 KB with WebP |

The source of the damage is in the CLI: `optimize` calls `prune({ keepLeaves: false })`, `flatten()` and `join({ keepNamed: false })` unless told otherwise.
Empty nodes (`CameraTarget`, `Anchor`, any group anchor) are leaves, so they go first, and disabling a single step does not save them.
`shotFromScene` warns in the console when `Camera` or `CameraTarget` is missing, which fails the capture matrix; fix the pipeline, not the warning.

Characters are different: a file whose code only needs a skeleton and clips survives the defaults.
`examples/001-atelier-study` ships its mascot through plain `optimize --compress meshopt --texture-compress false` (521 KB to about 105 KB); bones, clips and the skin were intact in a rerun, and only the skinned mesh moved to the root.

## The steps

```sh
G="npx gltf-transform"
$G optimize in.glb 1.glb --compress false --texture-compress false \
  --flatten false --join false --palette false --instance false --prune false
$G prune 1.glb 2.glb --keep-leaves true
$G resize 2.glb 3.glb --width 1024 --height 1024
# KTX2 (needs `ktx`):
$G resize 3.glb 4.glb --power-of-two nearest
$G uastc 4.glb 5.glb --slots "{normalTexture,occlusionTexture,metallicRoughnessTexture}" --level 4 --rdo --rdo-lambda 4 --zstd 18
$G etc1s 5.glb 6.glb --quality 255
# or WebP instead of the three lines above:
$G webp 3.glb 6.glb
$G meshopt 6.glb out.glb --level high
```

What stays on in `optimize`: `dedup`, `weld`, `simplify` (error 0.0001 of the mesh extent, visually lossless), `resample` (lossless key reduction), `sparse`.
What is off and why:

| Flag | Default | Why off |
|---|---|---|
| `--flatten` | true | Moves every node to the root; breaks `CameraData` rigs and group lookups. |
| `--join` | true | Merges meshes, including named ones; `getObjectByName( 'Slides' )` stops working. Join static decoration in Blender instead. |
| `--palette` | true | Merges materials into palette textures; material-name swaps stop working. |
| `--instance` | true (5+ copies) | Replaces copies with one `EXT_mesh_gpu_instancing` node; `Prop_0..Prop_5` were all lost in the test. Allow with `--instance` only for anonymous scatter. |
| `--prune` | true, keepLeaves false | Deletes empty leaves; replaced by `prune --keep-leaves true`. |
| `--compress` | meshopt | Run last as its own step so texture steps see plain buffers. |
| `--texture-compress` | auto | Chosen explicitly per slot below. |

## Textures

KTX2 stays compressed on the GPU (about a quarter of the memory of PNG or WebP) and uploads without a decode stall, which matters on phones.
- UASTC (level 4, RDO lambda 4, Zstandard 18) for data maps: normal, occlusion, metallic-roughness.
  These are the settings `optimize --texture-compress ktx2` uses internally.
- ETC1S (quality 255) for color and emissive: much smaller, acceptable quality for albedo.
- KTX2 requires the `ktx` command from KTX-Software 4.4 or newer.
  gltf-transform 4.x calls `ktx create`, not the older `toktx`.
  It is not in Homebrew; install from https://github.com/KhronosGroup/KTX-Software/releases (macOS `.pkg`, Windows installer, Linux packages) and check with `ktx --version`.
  Without it `uastc` and `etc1s` fail with `Command failed: command -v ktx`.
- WebP (`EXT_texture_webp`, supported by three r186) is the fallback when `ktx` is missing: smaller download, full-size in VRAM.
- `AssetLoader` wires `KTX2Loader` and resolves the Basis transcoder through `import.meta.url`, so Vite bundles it; no `basisPath` needed.

## Geometry

`meshopt --level high` quantizes positions to 14 bits, normals to 10 and UVs to 12 (CLI defaults) and compresses with `EXT_meshopt_compression`; `AssetLoader` sets `MeshoptDecoder`.
On an animated mesh node, quantization moves the mesh into a new unnamed child node so the animation keeps its own transform.
Code that expects a mesh at a named animated node should use `node.getObjectByProperty( 'isMesh', true )`.

Draco is never used: it compresses slightly better but `AssetLoader` has no `DRACOLoader`, and the decoder is a larger download than the savings on small sets.
`check-glb.mjs` fails any file that requires `KHR_draco_mesh_compression`.

## Inspecting

```sh
npx gltf-transform inspect public/scene/section_1.glb --format md   # tables: scenes, meshes, materials, textures, animations
node skills/dna-extraction/scripts/glb-info.mjs public/scene/section_1.glb   # node tree and contract at a glance
node skills/blender-gltf-stage/scripts/check-glb.mjs --must public/scene/section_1.glb   # budget and contract gate
```

Real numbers from the tests, WebP path (no `ktx` installed):

| File | Raw export | Compressed |
|---|---|---|
| Test set (2 meshes, 256 px texture, 2 clips) | 103 KB | 30 KB |
| JUNNI `section_2.glb` (MIT source, 9 meshes, 3 textures), `--max 512` | 385 KB | 103 KB |
| JUNNI `section_6.glb` (skinned crowd) | 238 KB | 65 KB |
