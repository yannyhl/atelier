"""
Pip, the atelier study mascot, authored as code so it is reproducible and reviewable.

Run:  blender -b --python examples/001-atelier-study/blender/mascot.py -- <out.glb>
Then: npx gltf-transform optimize <out.glb> public/models/mascot.glb --compress meshopt --texture-compress false --palette false
      (--palette false keeps per-material roughness as factors, so the glossy eyes keep their glints)

Naming contract used by @atelier/stage Character:
  armature "Pip" with bones Root, Body, ArmL, ArmR, FootL, FootR, Sprout
  actions become glTF clips: idle, wave, hop, run, float
Blender is Z-up; the exporter converts to glTF +Y up.
"""
import math
import sys

import bpy

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "/tmp/mascot.glb"
FPS = 30

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS


def material(name, color, roughness, sheen=0.0, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    if sheen:
        bsdf.inputs["Sheen Weight"].default_value = sheen
    if coat:
        bsdf.inputs["Coat Weight"].default_value = coat
    return m


def srgb(hex_color):
    h = hex_color.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


MAT = {
    "Body": material("Body", srgb("#b4ec3a"), 0.75, sheen=1.0),
    "Belly": material("Belly", srgb("#eef8ff"), 0.8, sheen=1.0),
    "Eye": material("Eye", srgb("#0b0d10"), 0.06, coat=1.0),
    "Cheek": material("Cheek", srgb("#ff9fb5"), 0.7),
    "Leaf": material("Leaf", srgb("#4f9e1c"), 0.55),
}

parts = []


def part(obj, mat, group):
    obj.data.materials.append(MAT[mat])
    for poly in obj.data.polygons:
        poly.use_smooth = True
    vg = obj.vertex_groups.new(name=group)
    vg.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    parts.append(obj)
    return obj


def sphere(loc, scale, mat, group, segs=48, rings=24, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return part(o, mat, group)


# Body: a soft squashed ball with a frost belly patch.
sphere((0, 0, 0), (1.0, 0.92, 0.9), "Body", "Body", 64, 32)
sphere((0, -0.6, -0.38), (0.5, 0.3, 0.36), "Belly", "Body", 48, 24)
# Eyes and cheeks sit on the front (-Y is front in Blender; exported as +Z in glTF).
for side in (-1, 1):
    # Surface of the body ellipsoid at (x, z) sits at y = -0.92 * sqrt(1 - x^2 - (z / 0.9)^2); place parts just proud of it.
    sphere((0.3 * side, -0.83, 0.2), (0.12, 0.08, 0.17), "Eye", "Body", 32, 16)
    sphere((0.55 * side, -0.74, -0.06), (0.12, 0.045, 0.075), "Cheek", "Body", 24, 12)
    # Stubby arms and feet.
    sphere((0.98 * side, -0.05, -0.1), (0.2, 0.18, 0.3), "Body", "ArmL" if side > 0 else "ArmR", 24, 12)
    sphere((0.42 * side, -0.12, -0.86), (0.28, 0.34, 0.14), "Body", "FootL" if side > 0 else "FootR", 32, 16)
# Sprout: stem and two leaves.
bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.04, depth=0.34, location=(0, 0, 0.98))
part(bpy.context.active_object, "Leaf", "Sprout")
for side in (-1, 1):
    sphere((0.16 * side, 0, 1.17), (0.18, 0.07, 0.09), "Leaf", "Sprout", 24, 12, rot=(0, math.radians(-25 * side), 0))

# Join into one skinned mesh.
bpy.ops.object.select_all(action="DESELECT")
for p in parts:
    p.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
mesh = bpy.context.active_object
mesh.name = "PipMesh"
mesh.data.name = "Pip"

# Armature.
bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
arm = bpy.context.active_object
arm.name = "Pip"
eb = arm.data.edit_bones
root = eb[0]
root.name = "Root"
root.head, root.tail = (0, 0, -0.95), (0, 0, -0.7)


def bone(name, head, tail, parent):
    b = eb.new(name)
    b.head, b.tail, b.parent = head, tail, eb[parent]
    return b


bone("Body", (0, 0, -0.6), (0, 0, 0.8), "Root")
bone("ArmL", (0.85, -0.05, -0.05), (1.15, -0.05, -0.2), "Body")
bone("ArmR", (-0.85, -0.05, -0.05), (-1.15, -0.05, -0.2), "Body")
bone("FootL", (0.42, -0.05, -0.8), (0.42, -0.4, -0.86), "Root")
bone("FootR", (-0.42, -0.05, -0.8), (-0.42, -0.4, -0.86), "Root")
bone("Sprout", (0, 0, 0.82), (0, 0, 1.3), "Body")
bpy.ops.object.mode_set(mode="OBJECT")

mesh.parent = arm
mod = mesh.modifiers.new("Armature", "ARMATURE")
mod.object = arm

for pb in arm.pose.bones:
    pb.rotation_mode = "XYZ"

arm.animation_data_create()


def action(name, frames, keys):
    """keys: {bone: [(frame, prop, value tuple)]}"""
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data.action = act
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
        pb.scale = (1, 1, 1)
    for bone_name, items in keys.items():
        pb = arm.pose.bones[bone_name]
        for frame, prop, value in items:
            setattr(pb, prop, value)
            pb.keyframe_insert(data_path=prop, frame=frame)
    act.frame_range = (1, frames)
    return act


R = math.radians
# Bone local axes: Y runs along the bone. For Body (pointing up), local Y is world Z.
action("idle", 61, {
    "Body": [(1, "scale", (1, 1, 1)), (31, "scale", (1.03, 0.95, 1.03)), (61, "scale", (1, 1, 1)),
             (1, "location", (0, 0, 0)), (31, "location", (0, 0.03, 0)), (61, "location", (0, 0, 0))],
    "Sprout": [(1, "rotation_euler", (0, 0, R(-8))), (31, "rotation_euler", (0, 0, R(8))), (61, "rotation_euler", (0, 0, R(-8)))],
    "ArmL": [(1, "rotation_euler", (R(4), 0, 0)), (31, "rotation_euler", (R(-4), 0, 0)), (61, "rotation_euler", (R(4), 0, 0))],
    "ArmR": [(1, "rotation_euler", (R(-4), 0, 0)), (31, "rotation_euler", (R(4), 0, 0)), (61, "rotation_euler", (R(-4), 0, 0))],
})
action("wave", 61, {
    "ArmL": [(1, "rotation_euler", (0, 0, 0)), (10, "rotation_euler", (0, 0, R(115))), (20, "rotation_euler", (0, 0, R(85))),
             (30, "rotation_euler", (0, 0, R(120))), (40, "rotation_euler", (0, 0, R(85))), (50, "rotation_euler", (0, 0, R(115))),
             (61, "rotation_euler", (0, 0, 0))],
    "Body": [(1, "rotation_euler", (0, 0, 0)), (15, "rotation_euler", (0, R(-6), 0)), (46, "rotation_euler", (0, R(-6), 0)), (61, "rotation_euler", (0, 0, 0))],
    "Sprout": [(1, "rotation_euler", (0, 0, R(-10))), (20, "rotation_euler", (0, 0, R(12))), (40, "rotation_euler", (0, 0, R(-12))), (61, "rotation_euler", (0, 0, R(-10)))],
})
action("hop", 31, {
    "Root": [(1, "location", (0, 0, 0)), (6, "location", (0, -0.05, 0)), (15, "location", (0, 0.75, 0)), (25, "location", (0, 0, 0)), (31, "location", (0, 0, 0))],
    "Body": [(1, "scale", (1, 1, 1)), (6, "scale", (1.12, 0.84, 1.12)), (12, "scale", (0.92, 1.12, 0.92)), (25, "scale", (1.15, 0.82, 1.15)), (31, "scale", (1, 1, 1))],
    "ArmL": [(1, "rotation_euler", (0, 0, 0)), (15, "rotation_euler", (0, 0, R(70))), (31, "rotation_euler", (0, 0, 0))],
    "ArmR": [(1, "rotation_euler", (0, 0, 0)), (15, "rotation_euler", (0, 0, R(-70))), (31, "rotation_euler", (0, 0, 0))],
    "Sprout": [(1, "rotation_euler", (0, 0, 0)), (15, "rotation_euler", (R(-20), 0, 0)), (25, "rotation_euler", (R(18), 0, 0)), (31, "rotation_euler", (0, 0, 0))],
})
action("run", 21, {
    "FootL": [(1, "rotation_euler", (R(35), 0, 0)), (11, "rotation_euler", (R(-35), 0, 0)), (21, "rotation_euler", (R(35), 0, 0))],
    "FootR": [(1, "rotation_euler", (R(-35), 0, 0)), (11, "rotation_euler", (R(35), 0, 0)), (21, "rotation_euler", (R(-35), 0, 0))],
    "ArmL": [(1, "rotation_euler", (R(-40), 0, 0)), (11, "rotation_euler", (R(40), 0, 0)), (21, "rotation_euler", (R(-40), 0, 0))],
    "ArmR": [(1, "rotation_euler", (R(40), 0, 0)), (11, "rotation_euler", (R(-40), 0, 0)), (21, "rotation_euler", (R(40), 0, 0))],
    "Body": [(1, "location", (0, 0, 0)), (6, "location", (0, 0.08, 0)), (11, "location", (0, 0, 0)), (16, "location", (0, 0.08, 0)), (21, "location", (0, 0, 0)),
             (1, "rotation_euler", (R(8), 0, 0)), (21, "rotation_euler", (R(8), 0, 0))],
    "Sprout": [(1, "rotation_euler", (R(25), 0, 0)), (11, "rotation_euler", (R(15), 0, 0)), (21, "rotation_euler", (R(25), 0, 0))],
})
action("float", 91, {
    "Root": [(1, "location", (0, 0, 0)), (46, "location", (0, 0.18, 0)), (91, "location", (0, 0, 0))],
    "ArmL": [(1, "rotation_euler", (0, 0, R(60))), (46, "rotation_euler", (0, 0, R(80))), (91, "rotation_euler", (0, 0, R(60)))],
    "ArmR": [(1, "rotation_euler", (0, 0, R(-60))), (46, "rotation_euler", (0, 0, R(-80))), (91, "rotation_euler", (0, 0, R(-60)))],
    "FootL": [(1, "rotation_euler", (R(-15), 0, 0)), (46, "rotation_euler", (R(10), 0, 0)), (91, "rotation_euler", (R(-15), 0, 0))],
    "FootR": [(1, "rotation_euler", (R(10), 0, 0)), (46, "rotation_euler", (R(-15), 0, 0)), (91, "rotation_euler", (R(10), 0, 0))],
    "Sprout": [(1, "rotation_euler", (0, 0, R(-14))), (46, "rotation_euler", (0, 0, R(14))), (91, "rotation_euler", (0, 0, R(-14)))],
})
arm.animation_data.action = bpy.data.actions["idle"]

bpy.ops.object.select_all(action="DESELECT")
arm.select_set(True)
mesh.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_skins=True,
    export_def_bones=False,
    export_optimize_animation_size=True,
)
print("EXPORTED", OUT, [a.name for a in bpy.data.actions])
