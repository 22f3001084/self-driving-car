"""Render the vehicle on its own, from the angles that actually get looked at.

    blender --background --factory-startup --python blender/preview_car.py -- --out tmp/car

Writes <out>-<view>.png for each view below. This exists because the car is the
one asset a child stares at for the whole activity, and checking it by rebuilding
the kit, re-inlining 3 MB of base64 and reloading the game is a two-minute loop
for a change that takes ten seconds to make.
"""
import math
import pathlib
import sys

import bpy
import mathutils

sys.argv.append('--library')
_source = pathlib.Path(__file__).with_name('build_kit.py')
exec(compile(_source.read_text(encoding='utf8'), str(_source), 'exec'))

OUT = pathlib.Path(sys.argv[sys.argv.index('--out') + 1]) if '--out' in sys.argv else pathlib.Path('car')

# Azimuth (degrees round the car, 0 = dead ahead), elevation, distance, and the
# point being looked at.
VIEWS = {
    'threequarter': (34, 14, 9.2, (0.0, 0.85)),
    'side': (90, 6, 8.6, (0.0, 0.80)),
    'front': (2, 8, 8.4, (0.0, 0.80)),
    'rear': (178, 12, 8.6, (0.0, 0.85)),
    'chase': (208, 26, 9.6, (0.0, 0.75)),
    'wheel': (98, 8, 2.9, (1.33, 0.42)),
}

# The ambulance is 5.9 m and 3 m tall, so every shot has to stand further back
# and look at a point higher up the body.
AMB_VIEWS = {
    'threequarter': (38, 12, 15.0, (0.0, 1.50)),
    'side': (90, 6, 14.5, (0.0, 1.45)),
    'front': (2, 7, 14.0, (0.0, 1.45)),
    'rear': (178, 10, 14.5, (0.0, 1.55)),
    'chase': (200, 18, 15.5, (0.0, 1.40)),
    'mirror': (168, 4, 9.0, (0.0, 1.30)),
}


def lamp(name, location, energy, size=6.0):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.size = size
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    obj.rotation_euler = (-mathutils.Vector(location)).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.collection.objects.link(obj)
    return obj


# Which vehicle to render. The ambulance has to be checked the same way the car
# is, because the only view a child ever gets of it is from in front — it comes
# up BEHIND them — and that is the one angle nobody looks at while modelling.
SUBJECT = sys.argv[sys.argv.index('--subject') + 1] if '--subject' in sys.argv else 'car'
BUILDERS = {'car': 'make_be6_car', 'ambulance': 'make_ambulance'}


def main():
    clear_scene()
    globals()[BUILDERS.get(SUBJECT, 'make_be6_car')]()

    # A studio, not a street: a bright key, a cool fill and a rim, over a
    # neutral floor, so a change to the bodywork is not hidden by scenery.
    floor = box('floor', (60, 60, 0.2), (0, 0, -0.1),
                mat('studio_floor', srgb(0x9AA2AC), roughness=0.65))
    floor.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.6

    world = bpy.data.worlds.new('studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.42, 0.50, 0.60, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.1
    bpy.context.scene.world = world

    lamp('key', (6.5, -7.0, 7.5), 3000, size=9)
    lamp('fill', (-6.0, 5.5, 4.5), 900, size=10)
    lamp('rim', (-7.5, -3.0, 5.0), 1400, size=6)

    scene = bpy.context.scene
    engines = [e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items]
    scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 800
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Filmic' if 'Filmic' in [
        v.name for v in scene.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Standard'

    camera_data = bpy.data.cameras.new('cam')
    camera_data.lens = 62
    camera = bpy.data.objects.new('cam', camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera

    OUT.parent.mkdir(parents=True, exist_ok=True)
    shots = AMB_VIEWS if SUBJECT == 'ambulance' else VIEWS
    for name, (azimuth, elevation, distance, (target_x, target_z)) in shots.items():
        a = math.radians(azimuth)
        e = math.radians(elevation)
        camera.location = (
            target_x + math.cos(a) * math.cos(e) * distance,
            math.sin(a) * math.cos(e) * distance,
            target_z + math.sin(e) * distance,
        )
        target = mathutils.Vector((target_x, 0.0, target_z))
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera_data.lens = 70 if name == 'wheel' else 62
        scene.render.filepath = f'{OUT}-{name}.png'
        bpy.ops.render.render(write_still=True)
        print('PREVIEW', name, scene.render.filepath)

    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.name != 'floor']
    print('CAR_FACES', sum(len(o.data.polygons) for o in meshes))
    for obj in sorted(meshes, key=lambda o: -len(o.data.polygons)):
        print('  %6d  %s' % (len(obj.data.polygons), obj.name))


try:
    main()
    pathlib.Path(str(OUT) + '.log.txt').write_text('OK', encoding='utf8')
except Exception:
    import traceback
    pathlib.Path(str(OUT) + '.log.txt').write_text(traceback.format_exc(), encoding='utf8')
    raise
