"""Render the kit's car as the 2D edition's side-view sprite strip.

The flat edition used retired art of a delivery van while the 3D street now
drives a car, so the two editions showed different vehicles and the copy could
only be right about one of them. This renders the SAME car the 3D game uses,
in orthographic side view, four frames with the wheels turned a quarter step
each — which is exactly the strip format the 2D CSS already animates.

    blender-launcher.exe --background --factory-startup \
        --python blender/render_car_sprite.py -- --out src/assets/img/car-drive
"""
import math
import pathlib
import sys

import bpy

FRAMES = 4
W, H = 900, 451


def out_base():
    if '--out' in sys.argv:
        return pathlib.Path(sys.argv[sys.argv.index('--out') + 1])
    return pathlib.Path('car-drive')


def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def main():
    base = out_base()
    base.parent.mkdir(parents=True, exist_ok=True)
    log = pathlib.Path(str(base) + '.log.txt')
    clear()

    kit = pathlib.Path('blender/out/kit.glb')
    bpy.ops.import_scene.gltf(filepath=str(kit))

    # Keep only the vehicle; everything else in the kit is street furniture.
    car = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('van_')]
    keep = set()
    for obj in car:
        node = obj
        while node is not None:
            keep.add(node)
            node = node.parent
    for obj in list(bpy.data.objects):
        if obj not in keep and obj.type in {'MESH', 'EMPTY'}:
            bpy.data.objects.remove(obj, do_unlink=True)

    # By node, not by type: the importer may hand back the wheel as a parent
    # with its meshes underneath, and rotating the parent carries both.
    wheels = [o for o in bpy.data.objects if 'wheel' in o.name and o.parent is None or
              ('wheel' in o.name and o.type == 'MESH')]
    wheels = list(dict.fromkeys(wheels))

    # ---- camera: orthographic, dead side-on, forward pointing right --------
    cam_data = bpy.data.cameras.new('spritecam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 5.4
    cam = bpy.data.objects.new('spritecam', cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (0.05, -14.0, 0.95)
    cam.rotation_euler = (math.radians(90), 0, 0)
    bpy.context.scene.camera = cam

    # ---- light: a key, a fill and a rim, so the car reads as solid ---------
    def lamp(name, kind, energy, location, rotation, size=6.0):
        data = bpy.data.lights.new(name, kind)
        data.energy = energy
        if kind == 'AREA':
            data.size = size
        obj = bpy.data.objects.new(name, data)
        obj.location = location
        obj.rotation_euler = rotation
        bpy.context.collection.objects.link(obj)

    lamp('key', 'AREA', 900, (-3.2, -7.0, 6.2), (math.radians(52), 0, math.radians(-24)))
    lamp('fill', 'AREA', 320, (5.0, -6.0, 2.4), (math.radians(78), 0, math.radians(38)))
    lamp('rim', 'AREA', 420, (2.0, 7.0, 4.0), (math.radians(122), 0, math.radians(196)))

    world = bpy.data.worlds.new('spriteworld')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.62, 0.72, 0.86, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.55
    bpy.context.scene.world = world

    scene = bpy.context.scene
    scene.render.resolution_x = W
    scene.render.resolution_y = H
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE'

    import mathutils

    # Turn the MESH, not the object. Setting rotation_euler on the imported
    # wheels changed nothing in the render — the glTF importer parents them
    # under its own axis-conversion empties — so all four frames came out
    # byte-identical. Rotating vertex data about the hub cannot be bypassed.
    # The axle is whichever local axis the wheel is widest along.
    axes = {}
    for wheel in wheels:
        spans = [max(v.co[i] for v in wheel.data.vertices) - min(v.co[i] for v in wheel.data.vertices)
                 for i in range(3)]
        axes[wheel.name] = 'XYZ'[spans.index(min(spans))]

    made = []
    turned = []
    # The alloy has FIVE twin-spokes, so it repeats every 72 degrees and the
    # whole strip has to fit inside one of those sectors. (It was 45 for the old
    # four-spoke wheel; leaving it there would have made frames 0 and 4 identical
    # and the sprite would look like it was skipping.)
    step = math.radians(72.0 / FRAMES)
    for frame in range(FRAMES):
        turned.append('%d@%.1f%s' % (len(wheels), math.degrees(step * frame),
                                     ''.join(sorted(set(axes.values())))))
        if frame:
            for wheel in wheels:
                spin = mathutils.Matrix.Rotation(step, 4, axes[wheel.name])
                wheel.data.transform(spin)
                wheel.data.update()
        path = pathlib.Path(f'{base}-{frame}.png')
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        made.append(str(path))

    log.write_text('OK turned=' + ','.join(turned) + ' names=' +
                   ','.join(w.name for w in wheels) + '\n' + '\n'.join(made),
                   encoding='utf8')


try:
    main()
except Exception:  # noqa: BLE001 - the launcher detaches, so log the failure
    import traceback
    pathlib.Path(str(out_base()) + '.log.txt').write_text(
        'FAILED\n' + traceback.format_exc(), encoding='utf8')
    raise
