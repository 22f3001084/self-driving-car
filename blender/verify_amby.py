"""Assemble the Ambassador's STLs, prove the wheels turn, and photograph it.

    "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" --background \
        --enable-autoexec --python blender/verify_amby.py

Watertight only means it will slice. Whether it WORKS is a question about the
assembly, so the parts are placed where they will physically be and the
overlaps are measured:

    wheel vs body   must be 0 mm3 — any overlap is a wheel that grinds
    axle  vs body   must be 0 mm3 — the rod has to spin inside its bore
    wheel vs wheel  must be 0 mm3
    rod into bore   measured as ENGAGEMENT: the press fit is 0.05 mm on the
                    radius, thinner than the boolean solver resolves, so
                    asking for its volume proves nothing

The dimensions come from `fits.json`, which the build writes — so this check
cannot drift out of step with the model it is checking.
"""

import bpy
import bmesh
import json
import math
import os

OUT = os.path.abspath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'Ambassador-3D-Print'))
F = json.load(open(os.path.join(OUT, 'fits.json')))


def wipe():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def load(name):
    before = set(bpy.data.objects)
    bpy.ops.wm.stl_import(filepath=os.path.join(OUT, name), global_scale=1.0)
    return (set(bpy.data.objects) - before).pop()


def dup(obj, name, loc=(0, 0, 0), rot=(0, 0, 0)):
    c = obj.copy()
    c.data = obj.data.copy()
    c.name = name
    c.location, c.rotation_euler = loc, rot
    bpy.context.collection.objects.link(c)
    return c


def volume(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    v = abs(bm.calc_volume(signed=True))
    bm.free()
    return v


def overlap(a, b):
    probe, tool = dup(a, 'probe', a.location, a.rotation_euler), dup(b, 'tool', b.location, b.rotation_euler)
    bpy.context.view_layer.objects.active = probe
    mod = probe.modifiers.new('x', 'BOOLEAN')
    mod.operation, mod.object, mod.solver = 'INTERSECT', tool, 'EXACT'
    bpy.ops.object.modifier_apply(modifier=mod.name)
    v = volume(probe) if len(probe.data.polygons) else 0.0
    bpy.data.objects.remove(probe, do_unlink=True)
    bpy.data.objects.remove(tool, do_unlink=True)
    return v


def assemble():
    body = load(F['body'])
    body.name = 'body'
    wheel_src, axle_src = load(F['wheel']), load(F['axle'])
    wheels = {}
    for tag, sx, sy in (('fl', 1, 1), ('fr', 1, -1), ('rl', -1, 1), ('rr', -1, -1)):
        # The bore opens along -Z as built; +/-90 about X aims it INWARD.
        wheels[tag] = dup(wheel_src, f'wheel_{tag}',
                          (sx * F['wheel_x'], sy * F['wheel_y'], F['wheel_r']),
                          (math.radians(-90 * sy), 0, 0))
    axles = {}
    for tag, sx in (('front', 1), ('rear', -1)):
        rod = dup(axle_src, f'axle_{tag}', (0, 0, 0), (math.radians(90), 0, 0))
        # Length off the MESH: `dimensions` is the world-axis bounding box, so
        # after the rotation it reports the rod's diameter, not its length.
        zs = [v.co.z for v in rod.data.vertices]
        rod.location = (sx * F['wheel_x'], (max(zs) - min(zs)) / 2.0, F['wheel_r'])
        axles[tag] = rod
    bpy.data.objects.remove(wheel_src, do_unlink=True)
    bpy.data.objects.remove(axle_src, do_unlink=True)
    return body, wheels, axles


def check(body, wheels, axles):
    print('\n-- assembly (0 mm3 = free to turn) --')
    ok = True
    for tag, wheel in wheels.items():
        v = overlap(wheel, body)
        ok &= v < 0.3
        print(f'  {"ok  " if v < 0.3 else "FAIL"} wheel {tag} vs body     {v:7.3f} mm3')
    for tag, rod in axles.items():
        v = overlap(rod, body)
        ok &= v < 0.3
        print(f'  {"ok  " if v < 0.3 else "FAIL"} axle {tag:<5} vs body   {v:7.3f} mm3')
    for tag, wheel in wheels.items():
        rod = axles['front' if tag[0] == 'f' else 'rear']
        ys = [(rod.matrix_world @ v.co).y for v in rod.data.vertices]
        face = wheel.location.y - math.copysign(F['wheel_w'] / 2, wheel.location.y)
        mouth, floor = sorted((face, face + math.copysign(F['bore_depth'], wheel.location.y)))
        reach = min(max(ys), floor) - max(min(ys), mouth)
        good = reach >= F['bore_depth'] * 0.6
        ok &= good
        print(f'  {"ok  " if good else "FAIL"} wheel {tag} on its rod {reach:7.2f} mm'
              f'  of rod in a {F["bore_depth"]:.1f} mm bore')
    v = overlap(wheels['fl'], wheels['fr'])
    ok &= v < 0.3
    print(f'  {"ok  " if v < 0.3 else "FAIL"} front wheels apart  {v:7.3f} mm3')

    low = min((body.matrix_world @ v.co).z for v in body.data.vertices)
    print(f'\n  ride height          {low:7.2f} mm')
    ok &= low > 0.5
    solid = volume(body) + 4 * volume(wheels['fl']) + 2 * volume(axles['front'])
    area = sum(sum(p.area for p in o.data.polygons)
               for o in [body] + list(wheels.values()) + list(axles.values()))
    shell = area * 0.8
    print(f'  solid volume         {solid / 1000.0:7.2f} cm3  (all 7 parts)')
    print(f'  filament, 2 walls/15%{(shell + max(0.0, solid - shell) * 0.15) / 1000.0 * 1.24:7.1f} g   of PLA, roughly')
    return ok


def render(body, wheels, axles):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x, scene.render.resolution_y = 1500, 950
    sh = scene.display.shading
    sh.light, sh.color_type = 'STUDIO', 'SINGLE'
    sh.single_color = (0.78, 0.30, 0.26)      # Ambassador cream-and-red mood
    sh.show_cavity, sh.cavity_type = True, 'BOTH'
    sh.show_shadows, sh.shadow_intensity = True, 0.32
    scene.display.render_aa = '32'
    world = bpy.data.worlds.new('w')
    world.color = (0.10, 0.12, 0.16)
    scene.world = world

    target = bpy.data.objects.new('t', None)
    bpy.context.collection.objects.link(target)
    cam_data = bpy.data.cameras.new('c')
    cam_data.lens = 60
    cam = bpy.data.objects.new('c', cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam
    track = cam.constraints.new('TRACK_TO')
    track.target, track.track_axis, track.up_axis = target, 'TRACK_NEGATIVE_Z', 'UP_Y'

    def shoot(name, loc, look, ortho=None):
        target.location = look
        cam.location = loc
        cam_data.type = 'ORTHO' if ortho else 'PERSP'
        if ortho:
            cam_data.ortho_scale = ortho
        bpy.context.view_layer.update()
        scene.render.filepath = os.path.join(OUT, name)
        bpy.ops.render.render(write_still=True)
        print(f'  rendered {name}')

    shoot('preview-front34.png', (78, -66, 44), (0, 0, 10))
    shoot('preview-side.png', (0, -120, 12), (0, 0, 11), ortho=62)
    shoot('preview-rear34.png', (-72, -62, 40), (0, 0, 10))
    for w in wheels.values():
        w.location = (w.location.x, w.location.y * 2.3, w.location.z + 11)
    for r in axles.values():
        r.location = (r.location.x, r.location.y, r.location.z + 21)
    shoot('preview-exploded.png', (82, -78, 56), (0, 0, 16))


def main():
    wipe()
    print('\n== the cute Ambassador, assembled ==')
    body, wheels, axles = assemble()
    ok = check(body, wheels, axles)
    render(body, wheels, axles)
    print('\nASSEMBLY OK' if ok else '\nASSEMBLY FAILED')


main()
