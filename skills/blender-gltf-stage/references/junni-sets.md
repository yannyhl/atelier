# How the JUNNI sets were built

JUNNI published every Blender file of "Junni is..." under MIT in `blend-files/` of https://github.com/junni-inc/next.junni.co.jp.
They were opened headless (`blender -b file.blend --python-expr ...`) on Blender 5.2 to list objects, cameras, modifiers and actions.
This page summarizes structure only; no geometry, texture or character from those files is in atelier.

## Common pattern in every section file

- Render 1920 x 1080 in every section file, so exported `yfov` matches the 16:9 design.
- An empty `CameraData` parents `Camera` and `CameraTarget`; the code reads the camera position, its FOV and the target position.
- An empty named after the mascot (`Baku`) marks where the character stands.
  Under it sits a render-disabled copy of the character rig and mesh, used only to judge framing in Blender; it never reaches the export.
  atelier names this empty `Anchor`.
- A render-disabled `bkup` collection keeps old versions inside the file.
- Top-level empties group what the code drives, one class per group (`Slides`, `Transparents`, `Title`, `Flexible` in section 2).
- A sun lamp for viewport shading; lighting in the site comes from code.
- Modifiers are left live (Array for dot grids, Screw and Geometry Nodes for ribbons, Decimate on a crowd copy) and applied at export.

## Per file

| File | Camera | What is in it | Worth copying as a pattern |
|---|---|---|---|
| `section_1.blend` | 30 mm (37.3 deg) | Logo split into `LogoPart_1..5`; `Dots_*` planes with two Array modifiers; `Crosses`, `Gradations`, `Lines`, `Slashes` groups | Split a logo into parts so code can shatter or stagger them. |
| `section_2.blend` | 30 mm | `Slides`, `Transparents` (cube, torus, cylinder for glass), `Title > TitleText > Text.*`, `Flexible` with text planes | Group by behavior, not by shape. |
| `section_4.blend` | 100 mm (11.6 deg) | `Ground` with `Avoids` (obstacle planes for the crowd) and `FallTexts`; `Making` with a Geometry Nodes circle and an arrayed cube; text objects whose fonts were not packed | Use empties and simple planes as data (obstacles) that code reads. Pack fonts or convert text to mesh before sharing a file. |
| `section_6.blend` | 18 mm (58.7 deg) | `Comrades` empty with `Comrade_1..6` empties, each holding a render-disabled rig copy; one visible `Comrades_Origin_Wrap` rig with `ComradeAction` | Mark instance positions with empties; ship one animated rig and clone it in code. |
| `common.blend` | 50 mm, no target | `CommonGround`, `Intro` group (primitives, curve logo, `Text1..3`), `TrailAssets > Rocket` | Shared file for the intro and props used in several sections. |
| `baku.blend` | none | `baku_amature` armature with the `Baku` mesh; actions `section_1`, `section_2`, `section_3`, `section_4`, `section_4_jump`, `section_5`, `section_6` kept in NLA stash tracks | One character file carrying one clip per section. |

## Exported results (from the MIT repository's `src/assets/scene/`)

| File | Size | Notes |
|---|---|---|
| `section_2.glb` | 385 KB | Blender I/O 3.2.40, 9 meshes, 3 textures, no compression; 103 KB after `compress-glb.mjs --max 512` |
| `baku.glb` | 2.1 MB | 18.4k triangles, 28 joints, 7 clips, one 25 KB JPEG |
| `common.glb` | 1.4 MB | 17 meshes, one camera, a 1K roughness map |

The Loan Meme reskin shipped a 1.2 KB `section_5.glb` that holds only `CameraData > Camera`: a rig-only file, the same idea as exporting `--collection Rig` for heavy sets.

## What atelier changes

- `Anchor` instead of a mascot name, so sets are reusable across characters.
- Compressed output (meshopt, KTX2 or WebP) and a budget gate; the reference shipped raw exports, including a 1 MB PNG inside its blocking `common.glb`.
- Frame rate fixed at 60 in every file before keying (the reference mixed 24, 25 and 60).
- A scripted, repeatable export instead of dialog clicks.
