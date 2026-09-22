# Materials and baking

## Decide where the look lives

| Look | Author in | Ship as |
|---|---|---|
| Plain PBR props (paint, plastic, metal) | Principled BSDF | glTF material, lit by the stage's lights and environment |
| Toy-like props in the house style | a named placeholder material | code swaps in a matcap (`createMatcap` from `@atelier/stage/effects`) by material or object name |
| Glass, refraction, dispersion | a named placeholder | code material on `REFRACT_LAYER` (see [glass-refraction](../../glass-refraction/SKILL.md)) |
| Character with studio lighting | Principled with base color and roughness maps | code shader that reads those maps (see [character-studio-shading](../../character-studio-shading/SKILL.md)) |
| Static set with rich light (AO, bounce, soft shadows) | Cycles | baked into the base color texture, drawn unlit in code |
| Emissive screens and neon | Emission, strength above 1 for bloom | `KHR_materials_emissive_strength`; the bloom threshold is 0.5 |

Swapping by name keeps Blender files readable and the export light:

```ts
import { MeshBasicMaterial, type Mesh, type MeshStandardMaterial } from 'three';

set.traverse( ( o ) => {

	const mesh = o as Mesh;
	if ( ! mesh.isMesh ) return;
	const source = mesh.material as MeshStandardMaterial;
	if ( source.name.endsWith( '_baked' ) ) mesh.material = new MeshBasicMaterial( { map: source.map } );

} );
```

## Principled inputs and their glTF result (Blender 5.2, tested)

| Input | Result |
|---|---|
| Base Color (color or Image Texture) | `baseColorFactor` / `baseColorTexture` |
| Metallic, Roughness (values or a packed image through Separate Color) | factors / `metallicRoughnessTexture` (G roughness, B metallic) |
| Normal Map node | `normalTexture` |
| Alpha below 1 | `alphaMode: BLEND` |
| Emission Color, Strength 1 | `emissiveFactor` |
| Emission Strength above 1 | plus `KHR_materials_emissive_strength` |
| Transmission Weight | `KHR_materials_transmission` |
| Coat Weight | `KHR_materials_clearcoat` |
| Sheen Weight | `KHR_materials_sheen` |
| Specular Tint | `KHR_materials_specular` |
| Anisotropic | `KHR_materials_anisotropy` |
| IOR on its own, Thin Film | not exported |

Other surfaces tested: Emission alone exports (black base, emissive color), Add Shader of Principled and Emission exports both, Diffuse and Glossy BSDF export as a blank default material, Mix with Transparent drops the alpha.
`export_glb.py` warns on any surface outside Principled, Emission, Add Shader and node groups.

## UVs and texture sizes

- One UV map for color work; a second (`UVMap.001`) only if a baked lightmap needs non-overlapping islands.
- Texel density: about 512 px per meter for set dressing seen at mid distance, 1024 to 2048 for the hero.
- Power-of-two sizes (512, 1024, 2048) compress best; KTX2 needs multiples of 4 and `compress-glb.mjs` resizes to the nearest power of two for KTX2.
- Pack ORM (occlusion, roughness, metallic) into one image when a material needs more than one of them.

## Baking light into a texture

Use it for static sets whose lighting never changes; the result is drawn with `MeshBasicMaterial`, which costs almost nothing on phones.
This script was run headless on Blender 5.2 (Cycles on CPU, 32 samples, 512 px) against a test set with a sun lamp:

```python
# blender -b sets/section_3.blend --python bake_diffuse.py
import bpy

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 32
obj = bpy.data.objects['Set']              # the mesh to bake, already UV-unwrapped
mat = obj.active_material
img = bpy.data.images.new(f'{obj.name}_bake', 1024, 1024)
node = mat.node_tree.nodes.new('ShaderNodeTexImage')
node.image = img
mat.node_tree.nodes.active = node          # the bake writes into the active image node
for o in scene.objects:
    o.select_set(False)
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT', 'COLOR'}, margin=4)
img.filepath_raw = bpy.path.abspath(f'//textures/{img.name}.png')
img.file_format = 'PNG'
img.save()
bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
mat.node_tree.links.new(node.outputs['Color'], bsdf.inputs['Base Color'])
mat.name += '_baked'                       # code draws *_baked materials unlit
bpy.ops.wm.save_mainfile()
```

Notes:
- Look nodes up by type (`BSDF_PRINCIPLED`), never by display name; names are localized.
- Raise samples to 128 to 256 for the final bake; 32 is for checking layout and UVs.
- Bake after modifiers are final: the bake uses the evaluated mesh and the exporter applies the same modifiers, so UVs match.
- The lights used for baking are not exported (`export_lights` is off), so nothing double-lights the set.
- Bake ambient occlusion alone (`type='AO'`) when the set stays lit in code but needs contact shadows; multiply it into base color or pack it into the ORM red channel.

## Vertex colors

The exporter writes a color attribute only when the material uses it (Color Attribute node into the shader).
If a code shader needs `COLOR_0` but the Blender material does not read it, wire the Color Attribute node into Base Color before exporting.
