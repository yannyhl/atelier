# Authoring a character in Blender (Pip, step by step)

`examples/001-atelier-study/blender/mascot.py` builds Pip headless, so the character is reproducible, reviewable in a diff and re-exportable in seconds.
Run it with `blender -b --python examples/001-atelier-study/blender/mascot.py -- /tmp/pip.glb`.

## 1. Clean scene and units

`bpy.ops.wm.read_factory_settings( use_empty=True )`, 30 fps.
Model around the origin at real proportions (Pip is about 2.3 units tall from feet to sprout); the section anchors scale him per set.

## 2. Materials by role

A helper creates Principled materials and sets inputs by socket name after finding the node by type (never by node name: Blender UIs can be localized).
Colors are typed as sRGB hex and converted to linear in the script (`srgb( "#b4ec3a" )`), because Principled inputs are linear.

| Material | Base color | Roughness | Extras | What Character does with it |
|---|---|---|---|---|
| Body | `#b4ec3a` lime | 0.75 | Sheen Weight 1 | wrapped diffuse, sheen rim, soft specular |
| Belly | `#eef8ff` frost | 0.8 | Sheen Weight 1 | same |
| Eye | `#0b0d10` near black | 0.06 | Coat Weight 1 | sharp GGX highlight and two softbox glints (coat itself is ignored) |
| Cheek | `#ff9fb5` pink | 0.7 | none | plain |
| Leaf | `#4f9e1c` green | 0.55 | none | plain |

Only base color, its texture, the roughness factor and "has sheen" survive into the Character shader.
Roughness and metallic textures, coat, transmission and emission are ignored, so bake the look into those four inputs.

## 3. Parts and rigid-part skinning

Each part is a primitive (UV spheres scaled into ellipsoids, a cylinder for the stem) with smooth shading and backface culling.
`part( obj, material, group )` adds one vertex group named after the bone that should carry it and assigns every vertex with weight 1.0.
Then all parts are joined into one mesh, parented to the armature with an Armature modifier.

Why rigid parts: a toy-like mascot has no deforming skin, so each part simply follows one bone.
The result is one skinned mesh (one draw per material), exact silhouettes and no weight painting.
For a soft character, paint smooth weights instead; everything downstream stays the same.

## 4. Armature

| Bone | Head to tail (Blender, Z up) | Parent | Drives |
|---|---|---|---|
| `Root` | (0, 0, -0.95) to (0, 0, -0.7) | none | whole body: hops, float bob |
| `Body` | (0, 0, -0.6) to (0, 0, 0.8) | Root | squash, lean, breathing |
| `ArmL` / `ArmR` | shoulder to hand, sideways | Body | wave, run swing |
| `FootL` / `FootR` | ankle forward | Root | run cycle |
| `Sprout` | (0, 0, 0.82) to (0, 0, 1.3) | Body | secondary wobble |

Local Y runs along each bone, so for `Body` (pointing up) local Y is world Z; the script keys `location = ( 0, 0.03, 0 )` to lift it.
Set `rotation_mode = "XYZ"` on every pose bone before keying Euler rotations.

## 5. One action per beat

`action( name, frames, keys )` creates an action with `use_fake_user`, resets every pose bone, then inserts keyframes per bone and property.
Rules that keep clips clean in three:
- The last frame equals the first for loops (`idle`, `run`, `float`), so `LoopRepeat` wraps without a pop.
- Keep every clip starting from the rest pose family; Character crossfades clips by weight for 1 s, and similar poses blend without the body sliding.
- Secondary motion (the sprout) runs on every clip, a little behind the main motion.
- Put vertical travel (hop height, float bob) on `Root`, squash and stretch on `Body` scale.

| Clip | Frames | Beat |
|---|---|---|
| `idle` | 61 | breathing squash 1.03 / 0.95, arm sway 4 degrees, sprout sway 8 degrees |
| `wave` | 61 | left arm up to 115 degrees and waving, body lean 6 degrees |
| `hop` | 31 | anticipation squash, 0.75 lift, stretch, landing squash |
| `run` | 21 | feet and arms plus or minus 35 to 40 degrees, body bob 0.08, forward lean 8 degrees |
| `float` | 91 | arms out 60 to 80 degrees, 0.18 bob, feet paddle |

## 6. Export

`export_scene.gltf` with `export_format="GLB"`, `use_selection=True` (armature and mesh), `export_yup=True`, `export_apply=True`, `export_animations=True`, `export_animation_mode="ACTIONS"`, `export_skins=True`, `export_def_bones=False`, `export_optimize_animation_size=True`.
`ACTIONS` mode exports every action as its own clip, named after the action.

Then compress, keeping per-part materials:

```sh
npx gltf-transform optimize /tmp/pip.glb public/models/mascot.glb --compress meshopt --texture-compress false --palette false
```

Pip goes from about 520 KB to about 104 KB; `glb-info` should list 5 clips, 7 joints and `EXT_meshopt_compression`.
Never commit a third-party character; author your own or use one the client owns (AGENTS.md rule 8).
