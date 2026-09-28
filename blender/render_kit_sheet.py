"""Render every object in the kit to its own thumbnail.

A contact sheet is the only honest way to judge a kit: on the street each prop
is small and half-occluded, so a tyre that is really an octagon or a dog that is
really three boxes goes unnoticed until a child looks closely.

    blender-launcher.exe --background --factory-startup \
        --python blender/render_kit_sheet.py -- --out <dir>
"""
import math
import pathlib
import sys

import bpy
import mathutils

SIZE = 360


def out_dir():
    if '--out' in sys.argv:
        return pathlib.Path(sys.argv[sys.argv.index('--out') + 1])
    return pathlib.Path('kit-sheet')


def main():
    base = out_dir()
    base.mkdir(parents=True, exist_ok=True)
    log = base / 'sheet.log.txt'

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.gltf(filepath='blender/out/kit.glb')

    meshes = [o for o in bpy.data.objects if o.type == 'MESH']

    # Group parts back into the assets they belong to: everything the runtime
    # assembles by prefix is one subject here too.
    groups = {}
    for obj in meshes:
        name = obj.name
        key = name
        for prefix in ('van_', 'gate_', 'cyclist_', 'dog_', 'person_', 'child_',
                       'scooter_', 'lamp_', 'ambulance_', 'road_', 'building_'):
            if name.startswith(prefix):
                key = prefix.rstrip('_')
                break
        groups.setdefault(key, []).append(obj)

    scene = bpy.context.scene
    scene.render.resolution_x = SIZE
    scene.render.resolution_y = SIZE
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = 'PNG'
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE'

    world = bpy.data.worlds.new('sheetworld')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.62, 0.72, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    scene.world = world

    def lamp(name, energy, location, rotation):
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = energy
        data.size = 8
        obj = bpy.data.objects.new(name, data)
        obj.location = location
        obj.rotation_euler = rotation
        bpy.context.collection.objects.link(obj)

    lamp('key', 1400, (-6, -8, 9), (math.radians(46), 0, math.radians(-36)))
    lamp('fill', 420, (7, -7, 3), (math.radians(76), 0, math.radians(42)))

    cam_data = bpy.data.cameras.new('sheetcam')
    cam_data.type = 'ORTHO'
    cam = bpy.data.objects.new('sheetcam', cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam

    made = []
    for key, objs in sorted(groups.items()):
        lo = mathutils.Vector((1e9, 1e9, 1e9))
        hi = mathutils.Vector((-1e9, -1e9, -1e9))
        for obj in objs:
            for corner in obj.bound_box:
                point = obj.matrix_world @ mathutils.Vector(corner)
                for i in range(3):
                    lo[i] = min(lo[i], point[i])
                    hi[i] = max(hi[i], point[i])
        centre = (lo + hi) / 2
        span = max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 0.4)

        # Three-quarter view, framed on the subject.
        cam_data.ortho_scale = span * 1.5
        direction = mathutils.Vector((-0.8, -1.0, 0.55)).normalized()
        cam.location = centre + direction * (span * 3)
        cam.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()

        # Show only this group.
        for obj in bpy.data.objects:
            if obj.type == 'MESH':
                obj.hide_render = obj not in objs

        path = base / f'{key}.png'
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        made.append(f'{key} span={span:.2f} parts={len(objs)}')

    log.write_text('OK\n' + '\n'.join(made), encoding='utf8')


try:
    main()
except Exception:  # noqa: BLE001 - the launcher detaches, so log the failure
    import traceback
    (out_dir() / 'sheet.log.txt').write_text('FAILED\n' + traceback.format_exc(), encoding='utf8')
    raise
