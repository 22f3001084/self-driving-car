"""Assemble the exported STLs and prove the wheels can actually turn.

    "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" --background \
        --enable-autoexec --python blender/verify_print_car.py

A part being watertight only means it will slice. Whether it WORKS is a
question about the assembly, and the only honest way to answer it is to put the
parts where they will physically be and measure what overlaps what:

    wheel  vs body     must be 0 mm3 — any overlap is a wheel that grinds
    axle   vs body     must be 0 mm3 — the rod has to spin inside its bore
    axle   vs wheel    must be > 0   — that overlap IS the press fit
    wheel  vs wheel    must be 0 mm3

Then it renders the thing, assembled and exploded, so the shape can be checked
by eye as well.
"""

import bpy
import bmesh
import math
import os

MM = 1.0
MODEL_MM, CAR_L = 150.0, 4.20
S = MODEL_MM / CAR_L
AXLE_X = 1.3335 * S
WHEEL_R = 0.361 * S
WHEEL_Y = (0.9165 - 0.150) * S
WHEEL_W = 0.235 * S
BORE_DEPTH = 6.50
AXLE_D, BORE_WHEEL, BORE_CHASSIS = 4.00, 3.90, 4.70

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, '..', '..', '..', 'NV-1-3D-Print'))


def wipe():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def load(name):
    before = set(bpy.data.objects)
    bpy.ops.wm.stl_import(filepath=os.path.join(OUT, name), global_scale=1.0)
    obj = (set(bpy.data.objects) - before).pop()
    return obj


def dup(obj, name, loc=(0, 0, 0), rot=(0, 0, 0)):
    copy = obj.copy()
    copy.data = obj.data.copy()
    copy.name = name
    copy.location, copy.rotation_euler = loc, rot
    bpy.context.collection.objects.link(copy)
    return copy


def volume(obj):
    """Signed volume of an object AS PLACED, in mm3."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    v = bm.calc_volume(signed=True)
    bm.free()
    return abs(v)


def overlap(a, b):
    """How much of a and b occupy the same space, in mm3."""
    probe = dup(a, 'probe', a.location, a.rotation_euler)
    tool = dup(b, 'tool', b.location, b.rotation_euler)
    bpy.context.view_layer.objects.active = probe
    mod = probe.modifiers.new('x', 'BOOLEAN')
    mod.operation, mod.object, mod.solver = 'INTERSECT', tool, 'EXACT'
    bpy.ops.object.modifier_apply(modifier=mod.name)
    vol = volume(probe) if len(probe.data.polygons) else 0.0
    bpy.data.objects.remove(probe, do_unlink=True)
    bpy.data.objects.remove(tool, do_unlink=True)
    return vol


def assemble():
    """The four wheels and two rods where they will really sit."""
    body = load('NV-1-body.stl')
    body.name = 'body'
    wheel_src, axle_src = load('NV-1-wheel-x4.stl'), load('NV-1-axle-x2.stl')
    wheel_src.name, axle_src.name = 'wheel_src', 'axle_src'

    wheels = {}
    for tag, sx, sy in (('fl', 1, 1), ('fr', 1, -1), ('rl', -1, 1), ('rr', -1, -1)):
        # The bore opens along -Z as built; +/-90 degrees about X points it
        # INWARD on each side, so the rod goes in from the chassis.
        wheels[tag] = dup(wheel_src, f'wheel_{tag}',
                          (sx * AXLE_X, sy * WHEEL_Y, WHEEL_R),
                          (math.radians(-90 * sy), 0, 0))
    axles = {}
    for tag, sx in (('front', 1), ('rear', -1)):
        # The rod is modelled along its OWN Z, from 0 to its length, and
        # rotating +90 about X lays it along -Y. `dimensions` is the LOCAL
        # bounding box (rotation does not enter into it), so the length to
        # centre on is the Z one — reading .y here, as this check first did,
        # left every rod 26 mm short of the far wheel and reported the press
        # fit on that side as missing.
        rod = dup(axle_src, f'axle_{tag}', (0, 0, 0), (math.radians(90), 0, 0))
        # Its LENGTH, read off the mesh. `Object.dimensions` is the world-axis
        # bounding box — it takes the rotation into account — so after laying
        # the rod along Y it reports the 4 mm diameter on Z, and centring on
        # that left every rod 26 mm short of the far wheel.
        zs = [v.co.z for v in rod.data.vertices]
        rod.location = (sx * AXLE_X, (max(zs) - min(zs)) / 2.0, WHEEL_R)
        axles[tag] = rod

    bpy.data.objects.remove(wheel_src, do_unlink=True)
    bpy.data.objects.remove(axle_src, do_unlink=True)
    return body, wheels, axles


def check(body, wheels, axles):
    print('\n-- assembly clearances (0 mm3 = free to turn) --')
    ok = True
    for tag, wheel in wheels.items():
        v = overlap(wheel, body)
        good = v < 0.5
        ok &= good
        print(f'  {"ok  " if good else "FAIL"} wheel {tag} vs body      {v:8.3f} mm3')
    for tag, rod in axles.items():
        v = overlap(rod, body)
        good = v < 0.5
        ok &= good
        print(f'  {"ok  " if good else "FAIL"} axle {tag:<5} vs body    {v:8.3f} mm3'
              f'   (bore is 0.35 mm a side larger than the rod)')
    # The press fit is 0.05 mm of interference on the radius — thinner than
    # the boolean solver resolves, so it is measured as ENGAGEMENT instead:
    # how far the rod actually reaches into each wheel's bore.
    for tag, wheel in wheels.items():
        rod = axles['front' if tag[0] == 'f' else 'rear']
        rod_y = [(rod.matrix_world @ v.co).y for v in rod.data.vertices]
        face = wheel.location.y - math.copysign(WHEEL_W / 2, wheel.location.y)
        mouth, floor = sorted((face, face + math.copysign(BORE_DEPTH, wheel.location.y)))
        reach = min(max(rod_y), floor) - max(min(rod_y), mouth)
        good = reach >= 4.0
        ok &= good
        print(f'  {"ok  " if good else "FAIL"} wheel {tag} on its rod  {reach:8.2f} mm'
              f'   of rod inside a {BORE_DEPTH:.1f} mm bore')
    print(f'\n  rod {AXLE_D:.2f} mm in a {BORE_WHEEL:.2f} mm wheel bore  '
          f'-> {(AXLE_D - BORE_WHEEL) / 2:.3f} mm interference a side (grips)')
    print(f'  rod {AXLE_D:.2f} mm in a {BORE_CHASSIS:.2f} mm chassis bore'
          f' -> {(BORE_CHASSIS - AXLE_D) / 2:.3f} mm clearance a side (turns)')
    v = overlap(wheels['fl'], wheels['fr'])
    print(f'  {"ok  " if v < 0.5 else "FAIL"} front wheels apart   {v:8.3f} mm3')
    ok &= v < 0.5

    # Ride height, measured rather than assumed: the body must not touch down.
    low = min((body.matrix_world @ v.co).z for v in body.data.vertices)
    print(f'\n  ride height           {low:8.2f} mm   (wheels put the axle at '
          f'{WHEEL_R:.2f} mm)')
    ok &= low > 1.0

    # Solid volume is NOT filament: a slicer prints walls and sparse infill.
    # Two 0.4 mm walls plus 12 % of what is left is the realistic figure.
    solid = volume(body) + 4 * volume(wheels['fl']) + 2 * volume(axles['front'])
    area = sum(sum(p.area for p in o.data.polygons)
               for o in (body, wheels['fl'], wheels['fr'], wheels['rl'],
                         wheels['rr'], axles['front'], axles['rear']))
    shell = area * 0.8
    filament = (shell + max(0.0, solid - shell) * 0.12) / 1000.0
    print(f'  solid volume          {solid / 1000.0:8.2f} cm3   (all 7 parts)')
    print(f'  filament, 2 walls/12% {filament * 1.24:8.0f} g     of PLA, roughly')
    return ok


def render(body, wheels, axles):
    """Two pictures: the car as it will stand, and the seven parts apart.

    Aimed with a TRACK_TO constraint rather than by writing an euler by hand —
    the hand-rolled one pointed the lens at empty space and rendered two white
    frames, which is exactly the sort of thing a render is supposed to catch.
    """
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x, scene.render.resolution_y = 1500, 950
    shading = scene.display.shading
    shading.light, shading.color_type = 'STUDIO', 'SINGLE'
    shading.single_color = (0.62, 0.66, 0.72)
    shading.show_cavity, shading.cavity_type = True, 'BOTH'
    shading.show_shadows = True
    shading.shadow_intensity = 0.35
    scene.display.render_aa = '16'
    world = bpy.data.worlds.new('w')
    world.color = (0.09, 0.11, 0.17)
    scene.world = world

    target = bpy.data.objects.new('target', None)
    bpy.context.collection.objects.link(target)
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 55
    cam = bpy.data.objects.new('cam', cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    track = cam.constraints.new('TRACK_TO')
    track.target, track.track_axis, track.up_axis = target, 'TRACK_NEGATIVE_Z', 'UP_Y'

    def shoot(path, loc, look):
        target.location = look
        cam.location = loc
        bpy.context.view_layer.update()
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        print(f'  rendered {os.path.basename(path)}')

    shoot(os.path.join(OUT, 'preview-assembled.png'), (205, -235, 135), (0, 0, 20))

    # Exploded: wheels out and up off their axles, rods lifted clear.
    for wheel in wheels.values():
        wheel.location = (wheel.location.x, wheel.location.y * 2.2, wheel.location.z + 30)
    for rod in axles.values():
        rod.location = (rod.location.x, rod.location.y, rod.location.z + 58)
    shoot(os.path.join(OUT, 'preview-exploded.png'), (235, -270, 190), (0, 0, 42))


def main():
    wipe()
    print('\n== NV-1 print assembly ==')
    body, wheels, axles = assemble()
    ok = check(body, wheels, axles)
    render(body, wheels, axles)
    print('\nASSEMBLY OK' if ok else '\nASSEMBLY FAILED')


main()
