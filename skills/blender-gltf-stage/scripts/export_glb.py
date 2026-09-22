"""
Headless .blend -> .glb export with the settings @atelier/stage expects, plus a contract check.

Usage (Blender 4.2+; tested on 5.2 LTS):
  blender -b set.blend --python skills/blender-gltf-stage/scripts/export_glb.py -- \
    --out public/scene/section_1.glb [--collection Export] [--anchor Anchor] [--no-contract] [--no-animations] [--strict]

What it does:
  1. Checks the naming contract read by shotFromScene (packages/stage/src/scroll/SectionTrack.ts):
     `Camera` (a camera object, or an empty holding one), `CameraTarget` (empty), optional `Anchor`.
  2. Warns about things that do not survive glTF export: non-Principled surface shaders,
     negative scale, render aspect other than 16:9 (yfov is derived from it), odd action names.
  3. Exports GLB: +Y up, modifiers applied, render-visible objects only, cameras on,
     punctual lights off, custom properties as extras (three.js userData), one clip per action.
  4. Re-reads the written GLB and fails if a contract node was dropped.
--no-contract skips the camera checks, for files that are not a section set (character, shared props).
With --strict, any warning fails the run (exit code 1). Use it in build scripts.
"""
import json
import math
import re
import struct
import sys

import bpy

# Tested on Blender 5.2: Diffuse and Glossy BSDF export as a blank default material, Mix with Transparent loses alpha.
SURFACE_OK = { 'BSDF_PRINCIPLED', 'EMISSION', 'ADD_SHADER', 'GROUP' }


def parse_args():

	argv = sys.argv[ sys.argv.index( '--' ) + 1: ] if '--' in sys.argv else []
	opts = { 'out': None, 'collection': None, 'anchor': 'Anchor', 'contract': True, 'animations': True, 'strict': False }
	i = 0
	while i < len( argv ):
		a = argv[ i ]
		if a == '--out':
			opts[ 'out' ] = argv[ i + 1 ]; i += 1
		elif a == '--collection':
			opts[ 'collection' ] = argv[ i + 1 ]; i += 1
		elif a == '--anchor':
			opts[ 'anchor' ] = argv[ i + 1 ]; i += 1
		elif a == '--no-contract':
			opts[ 'contract' ] = False
		elif a == '--no-animations':
			opts[ 'animations' ] = False
		elif a == '--strict':
			opts[ 'strict' ] = True
		else:
			raise SystemExit( f'export_glb: unknown argument {a}' )
		i += 1
	if not opts[ 'out' ] or not opts[ 'out' ].endswith( '.glb' ):
		raise SystemExit( 'export_glb: --out path/to/file.glb is required' )
	return opts


def find_camera( scene ):

	node = scene.objects.get( 'Camera' )
	if node is None:
		return None, None
	if node.type == 'CAMERA':
		return node, node
	cams = [ c for c in node.children_recursive if c.type == 'CAMERA' ]
	return node, ( cams[ 0 ] if cams else None )


def surface_source( mat ):

	if not mat.node_tree:
		return 'NO_NODES'
	outs = [ n for n in mat.node_tree.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output ]
	if not outs or not outs[ 0 ].inputs[ 'Surface' ].is_linked:
		return 'UNLINKED'
	return outs[ 0 ].inputs[ 'Surface' ].links[ 0 ].from_node.type


def expected_yfov( scene, cam ):

	r = scene.render
	w = r.resolution_x * r.pixel_aspect_x
	h = r.resolution_y * r.pixel_aspect_y
	aspect = w / h
	fit = cam.data.sensor_fit
	horizontal = fit == 'HORIZONTAL' or ( fit == 'AUTO' and aspect >= 1 )
	if horizontal:
		return math.degrees( 2 * math.atan( math.tan( cam.data.angle_x / 2 ) / aspect ) ), aspect
	return math.degrees( cam.data.angle_y ), aspect


def read_glb_json( path ):

	with open( path, 'rb' ) as f:
		magic, _version, _length, json_len, chunk = struct.unpack( '<IIIII', f.read( 20 ) )
		if magic != 0x46546C67 or chunk != 0x4E4F534A:
			raise SystemExit( f'export_glb: {path} is not a valid GLB' )
		return json.loads( f.read( json_len ).rstrip( b'\x00 ' ) )


def main():

	opts = parse_args()
	scene = bpy.context.scene
	warnings = []
	errors = []

	# ---------- naming contract ----------

	cam_node, cam = find_camera( scene ) if opts[ 'contract' ] else ( None, None )
	if not opts[ 'contract' ]:
		pass
	elif cam_node is None:
		errors.append( 'no object named "Camera" (camera, or an empty holding one)' )
	elif cam is None:
		errors.append( '"Camera" is an empty but has no camera child' )
	elif cam.hide_render or cam_node.hide_render:
		errors.append( '"Camera" is disabled for render and would not be exported' )

	target = scene.objects.get( 'CameraTarget' )
	if not opts[ 'contract' ]:
		pass
	elif target is None:
		errors.append( 'no object named "CameraTarget" (use an empty the camera looks at)' )
	elif target.hide_render:
		errors.append( '"CameraTarget" is disabled for render and would not be exported' )

	anchor = scene.objects.get( opts[ 'anchor' ] )
	if opts[ 'contract' ] and anchor is None:
		warnings.append( f'no "{opts["anchor"]}" empty: the hero object will keep its previous pose in this section' )

	yfov = None
	if cam is not None:
		yfov, aspect = expected_yfov( scene, cam )
		if abs( aspect - 16 / 9 ) > 0.01:
			warnings.append( f'render aspect is {aspect:.3f}; glTF yfov is derived from it, design sets at 1920x1080' )
		if cam.data.type != 'PERSP':
			warnings.append( 'camera is not perspective; SectionTrack expects a PerspectiveCamera' )

	# ---------- things that do not survive export ----------

	objects = [ o for o in scene.objects if not o.hide_render ]
	if opts[ 'collection' ]:
		coll = bpy.data.collections.get( opts[ 'collection' ] )
		if coll is None:
			raise SystemExit( f'export_glb: no collection "{opts["collection"]}"' )
		objects = [ o for o in coll.all_objects if not o.hide_render ]

	for o in objects:
		if o.type == 'MESH' and any( s < 0 for s in o.scale ):
			warnings.append( f'{o.name}: negative scale flips normals after export; apply scale' )
		for slot in getattr( o, 'material_slots', [] ):
			m = slot.material
			if m is None:
				continue
			src = surface_source( m )
			if src not in SURFACE_OK:
				warnings.append( f'material {m.name}: surface comes from {src}; only Principled BSDF and Emission export (use Alpha on Principled, bake the rest)' )

	actions = sorted( { a.name for a in bpy.data.actions if a.users > 0 } )
	for name in actions:
		if not re.match( r'^[a-z0-9_]+$', name ):
			warnings.append( f'action "{name}": name clips like section_1, section_2_jump (lowercase, digits, underscore)' )

	for e in errors:
		print( f'export_glb: ERROR {e}' )
	for w in warnings:
		print( f'export_glb: WARN  {w}' )
	if errors or ( opts[ 'strict' ] and warnings ):
		raise SystemExit( 1 )

	# ---------- export ----------

	kwargs = dict(
		filepath=opts[ 'out' ],
		export_format='GLB',
		export_yup=True,
		export_apply=True,
		use_renderable=True,
		use_active_scene=True,
		export_cameras=True,
		export_lights=False,
		export_extras=True,
		export_materials='EXPORT',
		export_image_format='AUTO',
		export_texcoords=True,
		export_normals=True,
		export_tangents=False,
		export_animations=opts[ 'animations' ],
		export_animation_mode='ACTIONS',
		export_force_sampling=True,
		export_optimize_animation_size=True,
		export_skins=True,
		export_morph=True,
		export_draco_mesh_compression_enable=False,
	)
	if opts[ 'collection' ]:
		kwargs[ 'collection' ] = opts[ 'collection' ]
	bpy.ops.export_scene.gltf( **kwargs )

	# ---------- verify what was written ----------

	gltf = read_glb_json( opts[ 'out' ] )
	names = { n.get( 'name' ) for n in gltf.get( 'nodes', [] ) }
	missing = [ n for n in ( 'Camera', 'CameraTarget' ) if opts[ 'contract' ] and n not in names ]
	if opts[ 'contract' ] and anchor is not None and opts[ 'anchor' ] not in names:
		missing.append( opts[ 'anchor' ] )
	report = {
		'out': opts[ 'out' ],
		'generator': gltf.get( 'asset', {} ).get( 'generator' ),
		'yfovDegrees': round( yfov, 2 ) if yfov is not None else None,
		'nodes': len( gltf.get( 'nodes', [] ) ),
		'meshes': len( gltf.get( 'meshes', [] ) ),
		'materials': [ m.get( 'name' ) for m in gltf.get( 'materials', [] ) ],
		'animations': [ a.get( 'name' ) for a in gltf.get( 'animations', [] ) ],
		'extensionsUsed': gltf.get( 'extensionsUsed', [] ),
		'warnings': warnings,
	}
	print( 'export_glb: ' + json.dumps( report ) )
	if missing:
		print( f'export_glb: ERROR contract nodes missing from output: {missing}' )
		raise SystemExit( 1 )


main()
