---
name: blender-gltf-stage
description: Author 3D sets in Blender for the @atelier/stage scroll experience and ship them as small glTF files - the Camera / CameraTarget / Anchor naming contract read by shotFromScene, one GLB per section versus shared files, per-section animation clips (section_1, section_2...), materials that survive glTF export, baking, a tested headless export script, a gltf-transform 4.5 compression pipeline that keeps named nodes (meshopt, KTX2 UASTC/ETC1S or WebP, resize), a budget gate, and AssetLoader must/sub loading. Use when the user says "model the set in Blender", "export the scene to glTF", "the camera from Blender is wrong", "compress the GLB", "KTX2", "meshopt", "the model is too heavy", "add a character with clips per section", or wires any .blend or .glb into a stage page.
---

# Blender glTF stage

Sets for a scroll stage are authored in Blender, one small file per section, and read by name in code.
This skill covers the path from `.blend` to a compressed `.glb` that `AssetLoader` streams and `shotFromScene` turns into a camera shot.
Every command and flag here was run on Blender 5.2 LTS, three r186 and @gltf-transform/cli 4.5.0; the scripts in `scripts/` encode the settings so they cannot drift.
The JUNNI source (MIT) published its `.blend` files; [references/junni-sets.md](references/junni-sets.md) summarizes how they were structured.

## The contract code reads

`shotFromScene( root, anchorName = 'Anchor' )` in `packages/stage/src/scroll/SectionTrack.ts` looks up three names and reads their world transforms:

| Node | Blender object | Becomes |
|---|---|---|
| `Camera` | Camera object, or an empty whose child is a camera | `shot.position` and `shot.fov` (glTF `yfov` in degrees) |
| `CameraTarget` | Empty the camera looks at | `shot.target` |
| `Anchor` (optional) | Empty where the hero stands | `shot.anchor` (position, quaternion, scale) for `track.anchorAt()` |

Missing nodes do not throw: without `Camera` the shot falls back to (0, 0, 5) and FOV 40, without `CameraTarget` it aims at the origin, and without `Anchor` the hero keeps its previous pose.
`shotFromScene` logs a `console.warn` for a missing `Camera` or `CameraTarget`, and the capture matrix fails on console warnings, so the gate catches it; the export and compression scripts below stop it earlier.
It reads true world poses, parents included (`updateWorldMatrix( true, true )`), so call it wherever the set already sits in the scene.
Everything else the section code needs (`Slides`, `Title`, `Comrade_3`) is looked up with `root.getObjectByName()`, so name those objects deliberately and never rename them casually.

Phone framing and cursor parallax are code-side `Shot` fields; set them when building the def, not in Blender:

| Field | Default | Use |
|---|---|---|
| `portraitFov` | 30 | Degrees added to the FOV at full `portraitWeight`. |
| `portraitOffset` | none | `Vector3` added to both camera position and target at full `portraitWeight`, blended between sections: recenters a hero that sits beside the copy on desktop. |
| `parallax` | (0.1, 0.1) | Cursor parallax range in world units (off on touch and reduced motion). |

`visibleSizeAt( camera, point )` from `@atelier/stage` returns the world width and height visible at a point, for fitting type or props to the frame on any aspect (in `examples/001-atelier-study/src/sections/`, `night.ts` recenters with `portraitOffset` and `arrival.ts` and `paper.ts` fit type with `visibleSizeAt`).

## Set up a section file

1. Units metric, scale 1 (1 unit = 1 m); +Z up in Blender becomes +Y up in glTF.
2. Render resolution 1920 x 1080.
   The exporter derives `yfov` from the render aspect and sensor fit, so a 1:1 render silently changes every FOV.
   With sensor fit Auto and a 36 mm sensor: 18 mm lens gives 58.7 deg, 30 mm gives 37.3 deg, 100 mm gives 11.6 deg (JUNNI's wide, standard and telephoto sets).
3. Build the camera rig: an empty `CameraData` parenting `Camera` and `CameraTarget`, with a Track To constraint on the camera (target `CameraTarget`, track -Z, up Y).
   Move the rig as one; move the target to reframe.
4. Add an empty `Anchor` where the hero stands, and parent a render-disabled placeholder of the hero under it for layout.
   Render-disabled objects (camera icon off in the outliner) are not exported.
5. Keep backups and experiments in a collection excluded from render.
6. Model each set around its own origin; the code places `gltf.scene` at the section's world offset (the starter uses `(0, -24, 0)`, `(0, -48, 0)`).
7. Name every object the code touches in PascalCase; leave pure decoration unnamed and joined (Ctrl+J) to save draw calls.
8. Custom properties on objects export as glTF extras and arrive as `object.userData`; use them for per-object tuning instead of hard-coded tables.

## One file per section, shared files, hero file

| File | Holds | Priority |
|---|---|---|
| `section_1.glb` | First section's rig and set | `must`, keep it tiny |
| `section_N.glb` | Rig and set for section N | `sub` |
| `hero.glb` | The character or hero object with every clip | `must` if section 1 shows it, else `sub` |
| `common.glb` | Geometry used by two or more sections | `sub` unless section 1 needs it |

The reference blocked first render on a 3.3 MB `common.glb`; atelier never does.
When later sets are heavy but every shot must exist at boot, export the rig alone as well (`--collection Rig`, about 1 KB like JUNNI's `section_5.glb`) and load it as `must`.

## Materials that survive export

Only Principled BSDF, Emission, and an Add Shader of the two map to glTF.
Tested in 5.2: Diffuse and Glossy BSDF export as a blank default material and Mix with Transparent loses its alpha, so use Principled's own Alpha.

| Principled input | glTF result |
|---|---|
| Base Color, Metallic, Roughness, Normal Map node, Alpha | core PBR (Alpha below 1 gives `alphaMode BLEND`) |
| Emission Color with Strength above 1 | `KHR_materials_emissive_strength` |
| Transmission Weight | `KHR_materials_transmission` |
| Coat Weight | `KHR_materials_clearcoat` |
| Sheen Weight | `KHR_materials_sheen` |
| Specular Tint | `KHR_materials_specular` |
| Anisotropic | `KHR_materials_anisotropy` |
| IOR alone, Thin Film | nothing exported |

Procedural textures, Color Ramps between shaders, Shader to RGB and light setups do not export; bake them to images or rebuild the look in code.
Most stage looks are code materials anyway (matcaps, glass, the character studio shader): keep the Blender material as a named placeholder and swap it by name in code.
Baking steps and a tested headless bake script are in [references/materials-and-baking.md](references/materials-and-baking.md).

## Animation clips

- One action per section, named `section_1`, `section_2`, `section_4_jump`: lowercase, digits and underscores.
- Keep every clip on the object: the active action plus the others stashed or on muted NLA tracks.
  The exporter's Actions mode writes each action as its own glTF animation named after the action (JUNNI's `baku.blend` stashes `section_1`, `section_3`, `section_6` in the NLA).
- A worked character in this repo: [examples/001-atelier-study/blender/mascot.py](../../examples/001-atelier-study/blender/mascot.py) builds the mascot Pip headless from code (armature `Pip` with bones `Root`, `Body`, `ArmL`, `ArmR`, `FootL`, `FootR`, `Sprout`, rigid-part skinning, clips `idle`, `wave`, `hop`, `run`, `float`), 521 KB raw and about 105 KB after meshopt.
  It has no empty contract nodes, so its plain `optimize` is safe (tested: bones and clips survive; only the skinned mesh moves from under the armature to the root); section sets are not.
- Set the scene frame rate once (60) before keying; clip durations are converted to seconds.
- Play clips with an `AnimationMixer` advanced in a stage system, never by wall-clock time (snippet under "Load on the stage").

## Export

```sh
blender -b sets/section_1.blend --python skills/blender-gltf-stage/scripts/export_glb.py -- --out build/scene/section_1.glb
blender -b sets/hero.blend --python skills/blender-gltf-stage/scripts/export_glb.py -- --out build/scene/hero.glb --no-contract
```

The script checks the naming contract, warns about unexportable shaders, negative scale, non 16:9 renders and odd clip names, exports, then re-reads the GLB and fails if `Camera`, `CameraTarget` or `Anchor` was dropped.
Flags: `--collection <name>` exports one collection, `--no-contract` for character and prop files, `--no-animations`, `--strict` turns warnings into failures.
It exports +Y up, modifiers applied, render-visible objects only, cameras on, lights off, extras on, Actions animation mode, no Draco (AssetLoader has no Draco decoder).
The full settings table and the matching UI checkboxes are in [references/export-settings.md](references/export-settings.md).

## Compress

```sh
node skills/blender-gltf-stage/scripts/compress-glb.mjs build/scene/section_1.glb public/scene/section_1.glb --max 1024
```

**Never run plain `gltf-transform optimize` on a set.**
Its defaults flatten the hierarchy, join named meshes, build palettes and prune empty leaves: in the test scene it deleted `CameraTarget` and `Anchor`, and the stage then aimed at the origin.
Turning off one step is not enough: with `--prune false` alone, or `--flatten false --prune false`, both empties were still gone; only `--flatten false --join false --prune false` together kept them.
`compress-glb.mjs` runs optimize with `--flatten false --join false --palette false --instance false --prune false`, then `prune --keep-leaves true`, `resize`, texture compression, `meshopt --level high`, and fails if any named node disappeared.

Textures: KTX2 by default (UASTC level 4 with RDO for normal, occlusion and metallic-roughness; ETC1S quality 255 for color and emissive), which needs the `ktx` binary from KTX-Software 4.4+ (installers at https://github.com/KhronosGroup/KTX-Software/releases; not in Homebrew).
Without `ktx` the script falls back to WebP and says so: smaller downloads but full-size in GPU memory, fine for a few small maps.
Default maximum edge 1024 px; use `--max 2048` only for a hero seen full screen.
After meshopt, an animated mesh node gains an unnamed child that holds the mesh, so `getObjectByName( 'Hero' )` returns a group: find the mesh with `hero.getObjectByProperty( 'isMesh', true )`.
Flag evidence and manual commands are in [references/compression-pipeline.md](references/compression-pipeline.md).

## Budget gate

```sh
node skills/blender-gltf-stage/scripts/check-glb.mjs --must public/scene/section_1.glb,public/scene/hero.glb \
  --sub public/scene/section_2.glb,public/scene/section_3.glb --out work/NNN-slug/assets.json
```

| Budget | Target | Enforced by |
|---|---|---|
| `must` payload (what blocks the first WebGL frame) | 600 KB or less at tier 2 | `check-glb.mjs --must-kb 600` |
| All 3D files | 2,500 KB or less, leaving room for JS and fonts inside the page's 3,000 KB | `check-glb.mjs --total-kb 2500`, then `npm run audit` |
| Visible triangles per section | 150k at tier 2, 400k at tier 3 | `window.__atelier.stats()` in the capture matrix |
| Draw calls per section | 80 at tier 2, 150 at tier 3 | same |
| Texture edge | 1024 px (2048 for a close-up hero) | `compress-glb.mjs --max` |

The gate also fails on Draco (no decoder is wired) and on section files that lost their camera contract, and warns on uncompressed geometry or PNG/JPEG textures.
For a human view of one file, `npx gltf-transform inspect public/scene/section_1.glb --format md`.

## Load on the stage

Import GLBs with `?url` so Vite fingerprints them (tested with Vite 8, no config needed), load through `AssetLoader`, and start as soon as the `must` group is in:

```ts
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { Vector3 } from 'three';
import { AssetLoader, shotFromScene } from '@atelier/stage';
import section1Url from './scene/section_1.glb?url';
import section2Url from './scene/section_2.glb?url';

const assets = new AssetLoader( stage.renderer );
const must = new Promise<void>( ( resolve ) => assets.on( 'must', () => resolve() ) );
assets.on( 'error', ( e ) => console.error( `[atelier] ${e.name} failed to load`, e.error ) );
void assets.load( [
	{ name: 'section_1', url: section1Url, kind: 'gltf', priority: 'must' },
	{ name: 'section_2', url: section2Url, kind: 'gltf', priority: 'sub', onLoad: ( a ) => attachSection2( a as GLTF ) },
] );
await must;

const set1 = assets.gltf( 'section_1' ).scene;
scene.add( set1 );
const shot1 = { ...shotFromScene( set1 ), portraitFov: 26, portraitOffset: new Vector3( - 0.6, 0, 0 ) };
```

`load()` resolves only after the `sub` group too (see its JSDoc), so listen for `'must'` and never `await` it before first render.
Place the set first (`set1.position.copy( ORIGIN )`), then read the shot; world poses include every parent.
When a `sub` set arrives, replace its placeholder in `track.shots[ i ]` (the array is public) and warm its shaders with `stage.renderer.compileAsync( set, camera )`.

Clips play on the stage clock; add this system before the `SectionDirector` so the director's reset (which re-enters section 0) runs after it:

```ts
import { AnimationMixer, type AnimationAction } from 'three';

const mixer = new AnimationMixer( hero.scene );
const actions = new Map( hero.animations.map( ( c ) => [ c.name, mixer.clipAction( c ) ] ) );
let current: AnimationAction | undefined;
const play = ( clip: string, fade = 1 ) => {

	const next = actions.get( clip );
	if ( ! next || next === current ) return;
	next.reset().play();
	if ( current ) next.crossFadeFrom( current, fade, false );
	current = next;

};

stage.add( { update: ( dt ) => mixer.update( dt ), reset: () => { mixer.stopAllAction(); current = undefined; } } );
// In each SectionDef: enter() { play( 'section_2' ); }
```

Slow a reused clip with `action.timeScale` (JUNNI plays `section_2` at 0.2).
The hero's pose between sections comes from `track.anchorAt( scroller.value, out )` each update.

## Done when

- Every section GLB passes `check-glb.mjs` and its `Camera`, `CameraTarget`, `Anchor` survive (the scripts fail otherwise).
- Shots look right at 16:9 and portrait in `npm run capture` (portrait FOV comes from `portraitFov`).
- The `must` group is under 600 KB and the production `npm run audit` meets `scripts/budgets.json`.
- `.blend` sources live in the project (for example `sets/`), the compressed GLBs are the only 3D files the page loads, and no third-party model or texture is committed without a license.
