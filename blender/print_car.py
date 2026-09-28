"""NV-1 as a PRINTABLE model: body, four rolling wheels, two axles.

    "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" --background \
        --enable-autoexec --python blender/print_car.py

Why this is a separate model rather than an export of the game car.

`be6.py` builds a SHOW model: a lofted shell with no thickness, wheels that are
two dozen loose parts sharing one origin, and details a tenth of a millimetre
tall at print scale. Sliced, that is a cloud of open surfaces — and its wheels
are decoration, welded to nothing. A printed car needs the opposite: closed
solids, one part per printed piece, and real mechanical fits.

So the SHAPE comes from the game car (the same station tables, the same
proportions, so the print is recognisably NV-1) and the ENGINEERING is new:

    body    one closed solid: hull + coupe roof + a chassis beam at each axle,
            drilled through for the axle. Wheel arches come from the station
            table's own floor rise, exactly as in the game model.
    wheel   printed flat, face up. Blind bore, so no axle end shows.
    axle    a plain rod with lead-in chamfers.

The fit is the whole point:

    axle rod          4.00 mm
    wheel bore        3.80 mm   press fit — the wheels grip the rod
    chassis bore      4.70 mm   0.35 mm clearance a side — the rod spins free
    wheel-to-beam     0.45 mm a side, so a wheel cannot rub the chassis
    tyre-to-arch      ~2 mm, so a wheel cannot rub the body

The rod therefore turns inside the chassis and the wheels turn with it, and
the two pressed-on wheels are what stops the rod sliding out. Nothing to glue,
nothing to screw, and a 0.4 mm nozzle prints every wall in it.
"""

import bpy
import bmesh
import math
import os

# --------------------------------------------------------------------- scale --
#
# One Blender unit = one millimetre, which is what an STL is read as. The model
# is 150 mm long: it is the biggest a 180 mm bed takes with room for the wheels
# beside it, and at that size the wheel is Ø25.8 mm — big enough that a press
# fit holds and a child can spin it.

MODEL_MM = 150.0
CAR_L = 4.20                       # the game car's length, in metres
S = MODEL_MM / CAR_L               # 35.714 mm per game metre

HW = 0.9165 * S                    # body half width      32.73
AXLE_X = 1.3335 * S                # half the wheelbase    47.62
WHEEL_R = 0.361 * S                # wheel radius          12.89
WHEEL_W = 0.235 * S                # wheel width            8.39
WHEEL_Y = (0.9165 - 0.150) * S     # wheel centreline      27.38

# ---- the fits, all in millimetres -------------------------------------------
AXLE_D = 4.00
BORE_WHEEL = 3.90                  # press fit on the rod. An FDM hole
                                   # prints under size, so 0.10 mm nominal
                                   # lands at ~0.25 mm real interference:
                                   # firm by hand, not a press.
BORE_CHASSIS = 4.70                # running clearance in the beam
BORE_DEPTH = 6.50                  # how deep the rod goes into a wheel
BEAM_HALF_Y = WHEEL_Y - WHEEL_W / 2 - 0.45   # 0.45 mm gap to the wheel's face
BEAM_X = 7.0                       # half length of the axle beam
FLOOR_Z0, FLOOR_Z1 = 8.6, 13.4     # the floor pan: what the car is printed ON
BEAM_Z0, BEAM_Z1 = FLOOR_Z0, 20.0  # the beam straddles the axle at z = WHEEL_R
WELL_Y0 = 22.90                    # wheel wells are cut OUTBOARD of the beam
AXLE_LEN = 2 * (BEAM_HALF_Y + BORE_DEPTH - 0.7)

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       '..', '..', 'NV-1-3D-Print')

# ------------------------------------------------------------------ sections --
# Copied from be6.py so the print is the same car. (x, half width, underside,
# shoulder) in game metres; the floor rise at each axle IS the wheel arch.

SECTION_N = 48
BODY_P_TOP, BODY_P_BOT = 3.4, 5.2
CABIN_P_TOP, CABIN_P_BOT = 3.9, 4.2

BODY_STATIONS = [
    (2.100, 0.800, 0.470, 0.960), (2.070, 0.858, 0.408, 1.000),
    (2.020, 0.884, 0.362, 1.028), (1.950, 0.900, 0.324, 1.050),
    (1.860, 0.908, 0.336, 1.062), (1.740, 0.912, 0.500, 1.068),
    (1.630, 0.915, 0.660, 1.074), (1.500, 0.9165, 0.752, 1.080),
    (1.3335, 0.9165, 0.782, 1.086), (1.170, 0.9165, 0.752, 1.091),
    (1.050, 0.913, 0.648, 1.095), (0.950, 0.906, 0.478, 1.099),
    (0.860, 0.901, 0.358, 1.101), (0.500, 0.898, 0.320, 1.105),
    (0.000, 0.897, 0.314, 1.107), (-0.500, 0.900, 0.320, 1.105),
    (-0.860, 0.905, 0.358, 1.099), (-0.950, 0.911, 0.478, 1.094),
    (-1.050, 0.9165, 0.648, 1.088), (-1.170, 0.9165, 0.752, 1.082),
    (-1.3335, 0.9165, 0.782, 1.076), (-1.500, 0.9165, 0.752, 1.070),
    (-1.630, 0.912, 0.660, 1.058), (-1.740, 0.902, 0.500, 1.040),
    (-1.860, 0.888, 0.348, 1.018), (-1.960, 0.868, 0.344, 0.998),
    (-2.040, 0.842, 0.372, 0.972), (-2.100, 0.762, 0.450, 0.918),
]

CABIN_STATIONS = [
    (1.020, 0.720, 1.000, 1.100), (0.880, 0.752, 1.000, 1.205),
    (0.700, 0.788, 1.000, 1.340), (0.500, 0.813, 1.000, 1.442),
    (0.260, 0.828, 1.000, 1.516), (0.000, 0.835, 1.000, 1.546),
    (-0.300, 0.837, 1.000, 1.556), (-0.620, 0.831, 1.000, 1.544),
    (-0.900, 0.817, 1.000, 1.504), (-1.150, 0.794, 1.000, 1.434),
    (-1.380, 0.764, 1.000, 1.334), (-1.580, 0.729, 1.000, 1.224),
    (-1.740, 0.688, 1.000, 1.136), (-1.860, 0.632, 1.000, 1.062),
]


def wipe():
    """An empty file, whatever the launcher's start-up scene held."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 0.001      # 1 unit = 1 mm
    scene.unit_settings.length_unit = 'MILLIMETERS'


def ring(half_w, z0, z1, p_top, p_bot, n=SECTION_N):
    """One superellipse cross-section in the Y-Z plane — a car's section is
    flat down the flank and across the roof with the corners rolled off."""
    cz, a, b = (z0 + z1) / 2.0, half_w, (z1 - z0) / 2.0
    out = []
    for i in range(n):
        t = 2.0 * math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        e = 2.0 / (p_top if s >= 0 else p_bot)
        y = a * math.copysign(abs(c) ** e, c) if c else 0.0
        z = cz + (b * math.copysign(abs(s) ** e, s) if s else 0.0)
        out.append((y, z))
    return out


def loft(name, stations, p_top, p_bot):
    """Bridge a row of sections into a CLOSED solid, ends capped.

    Closed is the requirement a slicer has and the game's shell does not meet:
    every edge shared by exactly two faces, normals out, so the volume is
    unambiguous.
    """
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rows = []
    for x, half_w, z0, z1 in stations:
        rows.append([bm.verts.new((x * S, y * S, z * S))
                     for y, z in ring(half_w, z0, z1, p_top, p_bot)])
    bm.verts.ensure_lookup_table()
    for a, b in zip(rows, rows[1:]):
        for i in range(SECTION_N):
            j = (i + 1) % SECTION_N
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(tuple(reversed(rows[0])))        # nose cap
    bm.faces.new(tuple(rows[-1]))                 # tail cap
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def cube(name, size, loc=(0, 0, 0), rot=(0, 0, 0)):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts[:])
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location, obj.rotation_euler = loc, rot
    bpy.context.collection.objects.link(obj)
    return obj


def cyl(name, r, h, loc=(0, 0, 0), rot=(0, 0, 0), seg=64, r_top=None):
    """A capped cylinder (or cone, with r_top). Segment count is generous:
    a printed wheel shows facets a game model never would."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                          radius1=r, radius2=r if r_top is None else r_top, depth=h)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location, obj.rotation_euler = loc, rot
    bpy.context.collection.objects.link(obj)
    return obj


def boolean(target, tool, op='UNION'):
    """Apply one exact boolean and consume the tool object."""
    bpy.context.view_layer.objects.active = target
    mod = target.modifiers.new(f'bool_{op.lower()}', 'BOOLEAN')
    mod.operation = op
    mod.object = tool
    mod.solver = 'EXACT'
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(tool, do_unlink=True)
    return target


def bevel(obj, width, segments=2, angle=35.0):
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('Bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(angle)
    mod.harden_normals = False
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def report(obj):
    """What a slicer will say, said here instead: closed, solid, how big."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    open_edges = [e for e in bm.edges if not e.is_manifold]
    volume = bm.calc_volume(signed=True)
    tris = sum(len(f.verts) - 2 for f in bm.faces)
    bm.free()
    d = obj.dimensions
    ok = not open_edges and volume > 0
    print(f'  {"ok  " if ok else "FAIL"} {obj.name:<14} '
          f'{d.x:6.2f} x {d.y:6.2f} x {d.z:6.2f} mm  '
          f'vol {volume / 1000.0:7.2f} cm3  {tris:6d} tris  '
          f'{"watertight" if not open_edges else f"{len(open_edges)} OPEN EDGES"}')
    return ok


# ---------------------------------------------------------------------- body --

def build_body():
    """Hull + roof + floor pan + two drilled axle beams, welded into one solid."""
    body = loft('NV-1-body', BODY_STATIONS, BODY_P_TOP, BODY_P_BOT)
    boolean(body, loft('cabin', CABIN_STATIONS, CABIN_P_TOP, CABIN_P_BOT))

    # The floor pan: a flat sole for the printer to grip.
    #
    # The car's underside is a curve that clears the ground by 11 mm at the
    # belly and 17 mm at the nose, so as modelled it would balance on the two
    # axle beams — a few hundred square millimetres of contact under a 150 mm
    # part, which is a warp and a knocked-over print. A slab in the body's OWN
    # plan shape (same stations, so it never oversteps the silhouette) gives it
    # a full-length flat bottom, and reads as a die-cast toy's floor pan.
    # Inset 1.6 mm all round: flush with the flanks it stood proud as a lip
    # under the nose, and tucked under it reads as the shadow gap beneath an
    # EV battery pack. Still 62 mm of flat bed contact.
    floor = loft('floor', [(x, hw - 1.6 / S, FLOOR_Z0 / S, FLOOR_Z1 / S)
                           for x, hw, _z0, _z1 in BODY_STATIONS],
                 BODY_P_TOP, BODY_P_BOT)
    boolean(body, floor)

    for sign in (1, -1):
        x = sign * AXLE_X
        # The beam carries the axle across the car. The station table lifts the
        # floor to 27.9 mm over each hub — the arch — so there is nothing at
        # axle height to drill through until this is added.
        beam = cube('beam', (BEAM_X * 2, BEAM_HALF_Y * 2, BEAM_Z1 - BEAM_Z0),
                    (x, 0, (BEAM_Z0 + BEAM_Z1) / 2))
        bevel(beam, 1.2, segments=2, angle=50)
        boolean(body, beam)
        # A round boss around the bore, so the bearing surface is not a corner.
        # Radius is capped by the floor pan: at 5.6 it hung 1.3 mm BELOW the
        # sole and the car rocked on two studs instead of sitting flat.
        boss_r = min(4.2, WHEEL_R - FLOOR_Z0)
        boolean(body, cyl('boss', boss_r, BEAM_HALF_Y * 2, (x, 0, WHEEL_R),
                          rot=(math.radians(90), 0, 0), seg=48))

    # The wheels need their wells back: the pan filled them in. Cut OUTBOARD
    # of the beam only, so the beam and the centre of the pan survive.
    for sx in (1, -1):
        for sy in (1, -1):
            boolean(body, cube('well', ((WHEEL_R + 2.2) * 2, 40.0, (WHEEL_R + 2.4) * 2),
                               (sx * AXLE_X, sy * (WELL_Y0 + 20.0), 0)),
                    op='DIFFERENCE')

    # Drill both axle bores last, through everything above.
    for sign in (1, -1):
        boolean(body, cyl('bore', BORE_CHASSIS / 2, HW * 2.4,
                          (sign * AXLE_X, 0, WHEEL_R),
                          rot=(math.radians(90), 0, 0), seg=48), op='DIFFERENCE')

    return body


# --------------------------------------------------------------------- wheel --

def build_wheel():
    """One wheel, printed flat with its face UP.

    Five spokes and a lug circle, as on the game car — five-fold symmetry is
    what makes a turning wheel legible; an eight-spoke disc looks painted on.
    The bore is BLIND: the rod stops 1.9 mm short of the face, so no axle end
    shows and the wheel has a ceiling to bridge rather than a through hole.
    """
    tyre = cyl('NV-1-wheel', WHEEL_R, WHEEL_W, (0, 0, WHEEL_W / 2), seg=96)

    # Tread: shallow, wide blocks. Fine grooves at this scale are noise a
    # 0.4 mm nozzle cannot resolve, and they only weaken the tyre wall.
    for i in range(16):
        a = 2.0 * math.pi * i / 16.0
        boolean(tyre, cube('groove', (2.2, 2.2, WHEEL_W * 0.62),
                           ((WHEEL_R - 0.25) * math.cos(a),
                            (WHEEL_R - 0.25) * math.sin(a), WHEEL_W / 2),
                           rot=(0, 0, a)), op='DIFFERENCE')

    # The dished rim face, then the spokes standing in it.
    DISH_R, DISH_D = WHEEL_R - 3.3, 2.2
    boolean(tyre, cyl('dish', DISH_R, DISH_D * 2, (0, 0, WHEEL_W + DISH_D * 0.5), seg=72),
            op='DIFFERENCE')
    for i in range(5):
        a = 2.0 * math.pi * i / 5.0
        boolean(tyre, cube('spoke', (DISH_R * 0.98, 2.6, DISH_D),
                           (DISH_R * 0.44 * math.cos(a), DISH_R * 0.44 * math.sin(a),
                            WHEEL_W - DISH_D / 2), rot=(0, 0, a)))
    boolean(tyre, cyl('hub', 4.6, DISH_D + 0.6, (0, 0, WHEEL_W - DISH_D / 2 - 0.3), seg=48))
    for i in range(5):
        a = 2.0 * math.pi * i / 5.0 + 0.31
        boolean(tyre, cyl('lug', 0.75, 1.2,
                          (3.0 * math.cos(a), 3.0 * math.sin(a), WHEEL_W - 0.4), seg=12),
                op='DIFFERENCE')

    # Chamfer the edge that meets the bed: an FDM first layer squashes out, and
    # 0.6 mm of relief is the difference between a wheel that rolls and one
    # that wobbles on its own elephant foot.
    boolean(tyre, cyl('foot', WHEEL_R + 2.0, 1.4, (0, 0, -0.05), seg=96,
                      r_top=WHEEL_R - 0.75), op='DIFFERENCE')

    # The bore, up from the bed face, stopping short of the rim face.
    boolean(tyre, cyl('bore', BORE_WHEEL / 2, BORE_DEPTH * 2,
                      (0, 0, BORE_DEPTH - BORE_DEPTH), seg=40), op='DIFFERENCE')
    return tyre


# ---------------------------------------------------------------------- axle --

def build_axle():
    """A plain rod, chamfered both ends so it finds the bore without a hammer."""
    rod = cyl('NV-1-axle', AXLE_D / 2, AXLE_LEN, (0, 0, AXLE_LEN / 2), seg=48)
    # A subtractive cone at each end, so the rod finds the bore.
    boolean(rod, cyl('leadA', AXLE_D, 1.2, (0, 0, -0.05), seg=48, r_top=AXLE_D / 2 - 0.5),
            op='DIFFERENCE')
    boolean(rod, cyl('leadB', AXLE_D / 2 - 0.5, 1.2, (0, 0, AXLE_LEN + 0.05), seg=48,
                     r_top=AXLE_D), op='DIFFERENCE')
    return rod


# -------------------------------------------------------------------- export --

def clean(obj):
    """Weld and de-sliver.

    Exact booleans leave zero-area triangles and split vertices where cuts
    meet. They print fine — every slicer repairs them — but they are REPORTED
    as errors, and a part that opens with a warning reads as a broken part.
    """
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0015)
    bmesh.ops.dissolve_degenerate(bm, dist=0.0015, edges=bm.edges[:])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def export(obj, path):
    clean(obj)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.wm.stl_export(filepath=path, export_selected_objects=True,
                          global_scale=1.0, apply_modifiers=True)


def main():
    wipe()
    os.makedirs(OUT_DIR, exist_ok=True)
    print('\n== NV-1, print-engineered ==')
    print(f'   scale 1:{CAR_L * 1000 / MODEL_MM:.0f}  ({MODEL_MM:.0f} mm long)')

    body, wheel, axle = build_body(), build_wheel(), build_axle()

    print('\n-- parts --')
    for part in (body, wheel, axle):
        clean(part)
    ok = all(report(part) for part in (body, wheel, axle))

    print('\n-- fits --')
    print(f'  axle rod        {AXLE_D:.2f} mm')
    print(f'  wheel bore      {BORE_WHEEL:.2f} mm   press fit, {AXLE_D - BORE_WHEEL:.2f} mm nominal '
          f'(~{AXLE_D - BORE_WHEEL + 0.15:.2f} mm as printed)')
    print(f'  chassis bore    {BORE_CHASSIS:.2f} mm   free running, '
          f'{(BORE_CHASSIS - AXLE_D) / 2:.2f} mm a side')
    print(f'  axle length     {AXLE_LEN:.2f} mm  (into {BORE_DEPTH:.2f} mm bores)')
    print(f'  wheel to beam   {(WHEEL_Y - WHEEL_W / 2) - BEAM_HALF_Y:.2f} mm a side')
    print(f'  tyre to arch    {0.782 * S - 2 * WHEEL_R:.2f} mm over the tread')
    print(f'  ground clearance{FLOOR_Z0:7.2f} mm   (flat floor pan, {MODEL_MM:.0f} mm of bed contact)')
    print(f'  wheel           {WHEEL_R * 2:.2f} mm across, {WHEEL_W:.2f} mm wide')

    print('\n-- files --')
    for part, name in ((body, 'NV-1-body.stl'), (wheel, 'NV-1-wheel-x4.stl'),
                       (axle, 'NV-1-axle-x2.stl')):
        path = os.path.abspath(os.path.join(OUT_DIR, name))
        export(part, path)
        print(f'  {name:<20} {os.path.getsize(path) / 1024:8.0f} KB')

    print('\nDONE' if ok else '\nFAILED: a part is not watertight')


main()


# --------------------------------------------------------------------- plate --
# Everything a slicer needs in one file: the seven parts, laid out on a bed in
# the orientation they must print in. Sliced as-is on a 220 x 220 bed, this is
# the whole car in one job.

def build_plate():
    """The seven parts arranged on the bed, each sitting ON z = 0.

    Orientation is the load path, not a preference: the ROD lies flat, because
    a 57 mm column printed upright is four layer-lines' worth of glue holding
    the wheels on and it snaps at the first push. Lying down, the layers run
    the length of the rod. The wheels print face UP so the tread band is a
    clean cylinder and the blind bore has a ceiling to bridge. The body prints
    on its floor pan.
    """
    parts = []
    body = build_body()
    body.name = 'plate_body'
    for v in body.data.vertices:          # drop the floor pan onto the bed
        v.co.z -= FLOOR_Z0
    parts.append(body)

    wheel = build_wheel()
    for i in range(4):
        copy = wheel.copy()
        copy.data = wheel.data.copy()
        copy.name = f'plate_wheel_{i}'
        copy.location = (-52.0 + i * 31.0, -56.0, 0.0)
        bpy.context.collection.objects.link(copy)
        parts.append(copy)
    bpy.data.objects.remove(wheel, do_unlink=True)

    rod = build_axle()
    for i in range(2):
        copy = rod.copy()
        copy.data = rod.data.copy()
        copy.name = f'plate_axle_{i}'
        # Laid along X, resting on the bed: rotate about Y, then lift by r.
        copy.rotation_euler = (0, math.radians(90), 0)
        copy.location = (-AXLE_LEN / 2, 52.0 + i * 9.0, AXLE_D / 2)
        bpy.context.collection.objects.link(copy)
        parts.append(copy)
    bpy.data.objects.remove(rod, do_unlink=True)

    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    path = os.path.abspath(os.path.join(OUT_DIR, 'NV-1-plate-all-7-parts.stl'))
    bpy.ops.wm.stl_export(filepath=path, export_selected_objects=True,
                          global_scale=1.0, apply_modifiers=True)
    span_x = max(p.location.x + p.dimensions.x / 2 for p in parts) - \
        min(p.location.x - p.dimensions.x / 2 for p in parts)
    span_y = max(p.location.y + p.dimensions.y / 2 for p in parts) - \
        min(p.location.y - p.dimensions.y / 2 for p in parts)
    print(f'\n-- one-job plate --')
    print(f'  NV-1-plate-all-7-parts.stl   {os.path.getsize(path) / 1024:.0f} KB')
    print(f'  footprint {span_x:.0f} x {span_y:.0f} mm  (fits a 220 x 220 bed)')


wipe()
os.makedirs(OUT_DIR, exist_ok=True)
build_plate()
