# Export settings

What `scripts/export_glb.py` passes to `bpy.ops.export_scene.gltf`, why, and where the same option lives in the File > Export > glTF 2.0 dialog.
Operator property names were read from Blender 5.2 LTS (`bpy.ops.export_scene.gltf.get_rna_type().properties`); they have been stable since 4.2.

| Property | Value | Dialog | Why |
|---|---|---|---|
| `export_format` | `GLB` | Format: glTF Binary | One file per set; AssetLoader loads `.glb`. |
| `export_yup` | `True` | Transform: +Y Up | three.js is Y-up; Blender (0, -6, 1.5) arrives as (0, 1.5, 6). |
| `export_apply` | `True` | Data > Mesh: Apply Modifiers | Bevels, arrays, mirrors and geometry nodes must be real geometry. The exporter cannot keep shape keys on a mesh whose modifiers it applies: apply those modifiers by hand first. |
| `use_renderable` | `True` | Include: Renderable Objects | Render-disabled placeholders (the hidden hero under `Anchor`) and backup collections stay out. |
| `use_active_scene` | `True` | Include: Active Scene | Multi-scene files export only the scene you opened. |
| `collection` | optional | Collection exporters, or Include: Active Collection | `--collection Rig` exports one collection. |
| `export_cameras` | `True` | Data: Cameras | The section camera is the contract. |
| `export_lights` | `False` | Data: Punctual Lights | Stage lighting lives in code (studio rigs, matcaps); Blender watts do not map to three.js intensities. |
| `export_extras` | `True` | Data: Custom Properties | Custom properties become `object.userData` (tested: `Hero["section"] = "intro"` arrives as `userData.section`). |
| `export_materials` | `EXPORT` | Material: Export | Names survive even when code swaps the material. |
| `export_image_format` | `AUTO` | Material > Images: Automatic | Keeps PNG/JPEG so gltf-transform can re-encode to KTX2 or WebP once, from the best source. |
| `export_tangents` | `False` | Data > Mesh: Tangents | three computes what it needs; tangents cost 16 bytes per vertex. |
| `export_animations` | `True` | Animation | Section clips. |
| `export_animation_mode` | `ACTIONS` | Animation > Mode: Actions | Every action assigned to an object (active, NLA track or stash) exports as its own clip named after the action. |
| `export_force_sampling` | `True` | Animation > Sampling Animations | Constraints and drivers bake into keys. |
| `export_optimize_animation_size` | `True` | Animation > Optimize Animation Size | Drops redundant keys. |
| `export_skins`, `export_morph` | `True` | Data: Skinning, Shape Keys | Characters. |
| `export_draco_mesh_compression_enable` | `False` | Data > Compression | AssetLoader wires no DRACOLoader; meshopt is applied later by `compress-glb.mjs`. |

## Camera field of view

glTF stores a vertical field of view.
The exporter computes it from the camera lens, the sensor fit and the scene's render resolution, so the render size is part of the camera.
Keep every set at 1920 x 1080 with sensor fit Auto, then:

| Lens (36 mm sensor) | Horizontal | glTF yfov | JUNNI use |
|---|---|---|---|
| 18 mm | 90.0 deg | 58.7 deg | sections 5 and 6 |
| 30 mm | 61.9 deg | 37.3 deg | sections 1 to 3 |
| 50 mm | 39.6 deg | 22.9 deg | common scene camera |
| 100 mm | 20.4 deg | 11.6 deg | section 4 telephoto |

`export_glb.py` prints the expected `yfovDegrees` and warns when the render aspect is not 16:9.
On phones `SectionTrack` adds `portraitFov` degrees (default 30) at full `portraitWeight`; decide that per shot in code.

## Verifying an export

1. The script's final JSON line lists nodes, materials, animations and extensions; it exits 1 if a contract node is missing.
2. `node skills/dna-extraction/scripts/glb-info.mjs build/scene/section_1.glb` prints the node tree with camera `yfov`, clip durations and texture sizes.
3. Load it in the page and check the capture matrix; a wrong camera almost always means a render-disabled `Camera`, a render size that is not 16:9, or a missing `CameraTarget`.

## Test that backs this page

A scene built headless (camera rig under `CameraData`, `Anchor` rotated 30 deg, a beveled cube with a packed texture and two actions, a render-disabled placeholder, a Shader to RGB material) was exported with the script and loaded with three r186 `GLTFLoader` plus `MeshoptDecoder` into the real `shotFromScene`:
position (0, 1.5, 6), target (0, 1, 0), fov 37.3, anchor quaternion (0, 0.259, 0, 0.966), clips `section_1` 2 s and `section_2` 1 s, placeholder absent, bevel applied (188 triangles), a warning for the Shader to RGB material.
