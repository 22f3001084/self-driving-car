"""Render the game's key art in Blender, with the car the game actually drives.

    blender --background --factory-startup --python blender/render_art.py -- --out src/assets/img

Produces:
    bg-title-depot.png   the title screen: the BE 6 in the depot yard at dusk
    delivered.png        the mission report: the BE 6 at the clinic bay

Both were previously flat illustrations of a white delivery van. The 3D street
now drives a red Mahindra BE 6, so the title screen and the report were showing
the child a different vehicle from the one they had just spent twenty minutes
commanding. Rendering them from the same kit is the only way the two can never
drift apart again — change the car and rerun this, and every screen agrees.

The depot art has to leave its middle clear: the title, the tagline and the
START button all sit over the centre of the frame, so the car is composed to the
right and the lit shutters to the left.
"""
import math
import pathlib
import sys

import bpy
import mathutils

sys.argv.append('--library')
_source = pathlib.Path(__file__).with_name('build_kit.py')
exec(compile(_source.read_text(encoding='utf8'), str(_source), 'exec'))

OUT = (pathlib.Path(sys.argv[sys.argv.index('--out') + 1]) if '--out' in sys.argv else pathlib.Path('.')).resolve()


def rng(seed):
    """A deterministic scatter, so the art rebuilds identically every time."""
    state = seed & 0xFFFFFFFF

    def step():
        nonlocal state
        state = (state * 1664525 + 1013904223) & 0xFFFFFFFF
        return state / 0x100000000
    return step


def area(name, location, target, energy, size=6.0, colour=(1, 1, 1)):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.size = size
    data.color = colour
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    obj.rotation_euler = (mathutils.Vector(target) - mathutils.Vector(location)).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.collection.objects.link(obj)
    return obj


def point(name, location, energy, colour=(1, 1, 1), radius=0.3):
    data = bpy.data.lights.new(name, 'POINT')
    data.energy = energy
    data.color = colour
    data.shadow_soft_size = radius
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    bpy.context.collection.objects.link(obj)
    return obj


def sky(top, bottom, strength=1.0):
    """A two-stop vertical gradient world, so the backdrop is a sky and not a
    flat fill. The horizon colour is the one the eye reads as time of day."""
    world = bpy.data.worlds.new('sky')
    world.use_nodes = True
    tree = world.node_tree
    tree.nodes.clear()
    out = tree.nodes.new('ShaderNodeOutputWorld')
    bg = tree.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = strength
    ramp = tree.nodes.new('ShaderNodeValToRGB')
    # Fac is the view direction's Z, so 0 is the horizon and 1 is straight up.
    # The warm stop has to finish inside the first third or the "band at the
    # horizon" becomes the entire sky, which is how the first dusk render came
    # out looking like a furnace.
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (*bottom, 1)
    ramp.color_ramp.elements[1].position = 0.30
    ramp.color_ramp.elements[1].color = (*top, 1)
    sep = tree.nodes.new('ShaderNodeSeparateXYZ')
    tex = tree.nodes.new('ShaderNodeTexCoord')
    tree.links.new(tex.outputs['Generated'], sep.inputs['Vector'])
    tree.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    tree.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    tree.links.new(bg.outputs['Background'], out.inputs['Surface'])
    bpy.context.scene.world = world
    return world


def camera(location, target, lens=50.0):
    data = bpy.data.cameras.new('cam')
    data.lens = lens
    obj = bpy.data.objects.new('cam', data)
    obj.location = location
    obj.rotation_euler = (mathutils.Vector(target) - mathutils.Vector(location)).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.collection.objects.link(obj)
    bpy.context.scene.camera = obj
    return obj


def render(path, width, height, samples=48, transparent=False, exposure=1.0):
    scene = bpy.context.scene
    engines = [e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items]
    scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = transparent
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA' if transparent else 'RGB'
    scene.view_settings.exposure = exposure
    scene.view_settings.view_transform = 'AgX'
    for attr, value in (('taa_render_samples', samples), ('use_raytracing', True)):
        if hasattr(scene, 'eevee') and hasattr(scene.eevee, attr):
            setattr(scene.eevee, attr, value)
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print('ART', path)


def skyline(name, count, x_from, x_to, z_depth, colour, seed=7):
    """A silhouette row for the far background. Flat, unlit, deliberately dark:
    it is the shape of a city, not a city."""
    random = rng(seed)
    parts = []
    x = x_from
    i = 0
    while x < x_to:
        w = 4 + random() * 9
        h = 7 + random() * 22
        parts.append(box(f'{name}_{i}', (w, 6, h), (x + w / 2, z_depth, h / 2 - 1.0),
                         mat('skylinemat', colour, roughness=1.0)))
        # A scatter of lit windows. A pure silhouette reads as a cut-out; a
        # handful of warm squares reads as a city at the end of the day.
        lit = mat('skylinelit', srgb(0xFFC978), roughness=0.4,
                  emission=srgb(0xFFC46B), strength=3.4)
        for k in range(int(2 + random() * 5)):
            parts.append(box(
                f'{name}_{i}_win{k}', (0.55, 0.2, 0.75),
                (x + 1.2 + random() * max(0.5, w - 2.4), z_depth - 3.05,
                 2.0 + random() * (h - 3.0)),
                lit))
        x += w + 1.0 + random() * 3
        i += 1
    return join(name, parts, origin=(0, 0, 0))


# ============================================================ TITLE: THE DEPOT

def build_depot():
    clear_scene()

    tarmac = mat('yardtar', srgb(0x2A3038), roughness=0.28, metallic=0.05)
    kerb = mat('yardkerb', srgb(0x707880), roughness=0.7)
    wall = mat('yardwall', srgb(0x6E3728), roughness=0.85)
    band = mat('yardband', srgb(0x8F959E), roughness=0.7)
    shutter = mat('yardshut', srgb(0x7C848E), roughness=0.45, metallic=0.35)
    frame = mat('yardframe', srgb(0x2B3038), roughness=0.6)
    card = mat('yardcard', srgb(0xC49A62), roughness=0.9)
    cardDark = mat('yardcardd', srgb(0xA97F4C), roughness=0.9)
    steel = mat('yardsteel', srgb(0x3A4048), roughness=0.5, metallic=0.6)

    # Wet yard. Low roughness plus the lamps above it is what gives the ground
    # the long reflected streaks the original art had.
    box('yard', (140, 140, 0.4), (0, 0, -0.2), tarmac)

    # The warehouse runs down the left of the frame, angled away from camera.
    bay_w, bay_h, bay_d = 7.4, 5.2, 9.0
    for i in range(4):
        x = -27.0 + i * (bay_w + 0.9)
        box(f'depot_pier{i}', (0.9, bay_d, bay_h + 0.5), (x - 0.45, 5.0, (bay_h + 0.5) / 2), wall)
        box(f'depot_back{i}', (bay_w, 0.6, bay_h), (x + bay_w / 2, 9.2, bay_h / 2), wall)
        box(f'depot_shut{i}', (bay_w - 0.5, 0.25, bay_h - 1.5),
            (x + bay_w / 2, 0.75, (bay_h - 1.5) / 2 + 0.05), shutter)
        for r in range(9):
            box(f'depot_rib{i}_{r}', (bay_w - 0.5, 0.10, 0.06),
                (x + bay_w / 2, 0.60, 0.35 + r * 0.42), frame)
        box(f'depot_lintel{i}', (bay_w + 0.2, 0.9, 0.55),
            (x + bay_w / 2, 0.9, bay_h - 1.25), band)
    box('depot_parapet', (34.0, 9.6, 0.7), (-10.0, 5.0, bay_h + 0.6), band)
    box('depot_dock', (34.0, 3.2, 0.9), (-10.0, -0.9, 0.45), kerb)
    box('depot_dock_lip', (34.0, 0.22, 0.10), (-10.0, -2.5, 0.94), band)

    # Two shop lamps on brackets, which are the picture's only warm light.
    for i, x in enumerate((-20.5, -9.7)):
        box(f'depot_bracket{i}', (0.14, 1.6, 0.14), (x, -0.4, 5.0), steel)
        box(f'depot_stem{i}', (0.14, 0.14, 0.8), (x, -1.1, 4.7), steel)
        cone(f'depot_shade{i}', 0.62, 0.5, (x, -1.1, 4.28),
             mat('yardshade', srgb(0x6E2F1E), roughness=0.5), verts=20)
        sphere(f'depot_bulb{i}', 0.17, (x, -1.1, 4.10),
               mat('yardbulb', srgb(0xFFD9A0), roughness=0.2,
                   emission=srgb(0xFFC46B), strength=26.0), segments=12, rings=8)
        point(f'depot_lamp{i}', (x, -1.1, 4.0), 16000, colour=(1.0, 0.68, 0.36), radius=0.8)

    # Parcels waiting on the dock, in two loose stacks.
    random = rng(11)
    for i, (px, py, n) in enumerate(((-24.7, -1.2, 3), (-18.9, -1.4, 4), (-14.1, -1.0, 2))):
        z = 0.9
        for k in range(n):
            s = 0.55 + random() * 0.45
            box(f'depot_box{i}_{k}', (s, s * 0.9, s * 0.8),
                (px + (random() - 0.5) * 0.7, py + (random() - 0.5) * 0.5, z + s * 0.4),
                card if (i + k) % 2 else cardDark, bevel=0.02)
            z += s * 0.8
    for obj in list(bpy.data.objects):
        if obj.name.startswith('depot_box') and obj.modifiers:
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=obj.modifiers[0].name)

    # City behind, and the sky it stands against.
    silhouette = skyline('depot_skyline', 26, -2.0, 120.0, 78.0, srgb(0x14213A), seed=23)
    silhouette.location = (0, 0, 0)
    skyline('depot_skyline_b', 20, -70.0, 20.0, 104.0, srgb(0x0E1730), seed=41)

    # A dusk gradient: deep navy overhead falling to a warm band at the horizon.
    # Two blues read as an overcast afternoon however dark you make them; it is
    # the warm strip low down that says evening.
    sky(srgb(0x081130), srgb(0x9A5330), strength=0.75)

    # The car, three-quarter front, composed right of centre with its nose
    # toward the camera so the light signature is the thing that reads.
    make_be6_car()
    for obj in bpy.data.objects:
        if obj.name.startswith('van_'):
            obj.rotation_euler = (0, 0, math.radians(-118))
            obj.location = (
                obj.location[0] * math.cos(math.radians(-118)) - obj.location[1] * math.sin(math.radians(-118)) + 6.4,
                obj.location[0] * math.sin(math.radians(-118)) + obj.location[1] * math.cos(math.radians(-118)) - 6.6,
                obj.location[2],
            )

    # Dusk, not daylight: the title, the tagline and the button are all white
    # over this, so the picture has to stay dark and let the two shop lamps and
    # the car's own signature carry it.
    area('key', (13.0, -14.0, 10.0), (5.0, -5.0, 1.0), 1500, size=12, colour=(1.0, 0.74, 0.52))
    area('fill', (-16.0, -14.0, 8.0), (-9.0, 0.0, 2.4), 420, size=18, colour=(0.40, 0.56, 1.0))
    area('rim', (17.0, 8.0, 6.0), (6.0, -4.0, 1.2), 2000, size=8, colour=(0.62, 0.80, 1.0))
    area('sky', (0.0, -8.0, 24.0), (0.0, -3.0, 0.0), 460, size=48, colour=(0.34, 0.50, 1.0))

    camera((15.2, -18.6, 5.2), (-1.6, -2.4, 2.4), lens=34)
    render(OUT / 'bg-title-depot.png', 1376, 768, samples=96, exposure=0.85)


# ====================================================== REPORT: THE CLINIC BAY

def build_delivered():
    clear_scene()

    # The street runs along X and the NEAR pavement is at negative Y (see the
    # coordinate note at the top of build_kit). The camera therefore has to
    # stand out on the carriageway at positive Y looking back at the kerb —
    # putting it at negative Y buries it inside the clinic, which renders as a
    # frame of flat grey wall.
    make_road_bay()
    bpy.data.objects['road_bay'].location = (0, 0, 0)
    make_road_straight()
    straight = bpy.data.objects['road_straight']
    straight.location = (-12, 0, 0)
    for i, x in enumerate((12, 24, -24)):
        copy = straight.copy()
        copy.data = straight.data
        copy.location = (x, 0, 0)
        bpy.context.collection.objects.link(copy)
        copy.name = f'road_straight_{i}'

    make_clinic()
    clinic = bpy.data.objects['clinic']
    # Kit buildings are modelled extending along +Y, so a near-side frontage has
    # to be turned about or it grows across the carriageway — which is a blank
    # cream wall filling the whole frame.
    clinic.rotation_euler = (0, 0, math.pi)
    clinic.location = (1.4, -13.2, 0)

    make_be6_car()
    for obj in bpy.data.objects:
        if obj.name.startswith('van_'):
            obj.rotation_euler = (0, 0, math.radians(-9))
            obj.location = (obj.location[0] + 0.6, obj.location[1] - 7.4, obj.location[2])

    # Parcels out on the pavement, and the person who takes them in.
    card = mat('delcard', srgb(0xC49A62), roughness=0.9)
    cardDark = mat('delcardd', srgb(0xA97F4C), roughness=0.9)
    random = rng(5)
    stack = 0.0
    for i in range(4):
        s = 0.42 + random() * 0.26
        box(f'del_box{i}', (s, s * 0.9, s * 0.8),
            (-3.4 + (random() - 0.5) * 0.5, -11.3 + (random() - 0.5) * 0.4, stack + s * 0.4 + 0.16),
            card if i % 2 else cardDark)
        stack += s * 0.8
    for i, (px, py) in enumerate(((-4.6, -11.6), (-2.0, -11.8))):
        box(f'del_box_side{i}', (0.6, 0.5, 0.45), (px, py, 0.39), cardDark)

    figure('person', PAL['mint'], PAL['navy'])
    for obj in bpy.data.objects:
        if obj.name.startswith('person'):
            obj.rotation_euler = (0, 0, math.radians(96))
            obj.location = (obj.location[0] - 5.4, obj.location[1] - 11.9, obj.location[2] + 0.16)

    sky(srgb(0x4E90CE), srgb(0xD6E8F4), strength=2.2)
    area('key', (7.0, 16.0, 13.0), (-1.0, -6.0, 1.4), 9000, size=16, colour=(1.0, 0.95, 0.86))
    area('fill', (-14.0, 10.0, 7.0), (-2.0, -7.0, 1.4), 3000, size=18, colour=(0.78, 0.86, 1.0))
    area('bounce', (2.0, -2.0, 4.0), (-2.0, -9.0, 1.0), 1800, size=14)

    camera((10.2, 9.6, 4.4), (-1.4, -8.4, 1.35), lens=40)
    render(OUT / 'delivered.png', 1022, 618, samples=64, transparent=False, exposure=0.35)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    build_depot()
    build_delivered()


try:
    main()
    pathlib.Path(OUT / 'art.log.txt').write_text('OK', encoding='utf8')
except Exception:
    import traceback
    pathlib.Path(OUT / 'art.log.txt').write_text(traceback.format_exc(), encoding='utf8')
    raise
