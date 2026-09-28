"""A cute Ambassador, 50 mm long, with wheels that really turn.

    "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe" --background \
        --enable-autoexec --python blender/print_amby.py

The brief: 50 mm, and CUTE — a chibi Hindustan Ambassador, not a scale model
of one. Cute is proportion, not decoration, so the car is drawn to toy rules:

    short       50 mm on a 29 mm wheelbase: stubby overhangs, a puppy stance
    tall        21.5 mm of height on 23 mm of width. The Ambassador IS its
                high domed roof, and exaggerating it is what makes the shape
                readable at this size
    waisted     the greenhouse is inset 2.5 mm from the flanks, so there is a
                shoulder to catch the light. A cabin flush with the sides is
                what makes a small car read as a lump
    wheels      11 mm across — 22 % of the length, where a real car is 15 %.
                Big, but tucked UNDER the fenders, not bolted to the outside
    a face      two round lamps and a barred grille, high on a round nose.
                The Ambassador's face is the reason people love it

Every mechanical size is chosen for a 50 mm car rather than scaled down from
a bigger one, because fits do not scale — a 4 mm axle would be a fifth of
this car's height:

    axle rod          2.50 mm
    wheel bore        2.40 mm   press fit — the wheels grip the rod
    chassis bore      3.10 mm   0.30 mm a side — the rod spins in the car
    wheel to chassis  0.40 mm a side
    tyre to arch      1.00 mm

Millimetres throughout: one Blender unit is one millimetre, which is what a
slicer reads an STL as.
"""

import bpy
import bmesh
import json
import math
import os

# ------------------------------------------------------------------- the car --

L = 50.0
HW = 11.5                    # 23 mm across the fenders
WHEEL_D, WHEEL_W = 11.0, 4.6
WHEEL_R = WHEEL_D / 2
WHEEL_X = 14.5               # half the wheelbase (29 mm)
WHEEL_Y = 8.2                # so the tyre's outer face sits 1.0 mm INSIDE

AXLE_D = 2.50
BORE_WHEEL = 2.40
BORE_CHASSIS = 3.10
BORE_DEPTH = 3.20            # in a 4.6 mm wheel: 1.4 mm of ceiling
BEAM_HALF_Y = WHEEL_Y - WHEEL_W / 2 - 0.40
BEAM_X, BEAM_Z0, BEAM_Z1 = 4.0, 3.2, 8.8   # 3.2, not 2.6: level with the
                                   # pan's own floor it was a coincident face
AXLE_LEN = 2 * (BEAM_HALF_Y + BORE_DEPTH - 0.5)
FLOOR_Z0, FLOOR_Z1 = 2.6, 4.8
ARCH_R = WHEEL_R + 1.0
BOSS_R = 2.8

SECTION_N = 48
BODY_P_TOP, BODY_P_BOT = 3.0, 4.4
CABIN_P_TOP, CABIN_P_BOT = 3.4, 3.4      # a rounded BOX, not a bubble:
                                         # 2.5 gave a Beetle, not an Amby

# (x, half width, underside, shoulder). The fenders swell to full width over
# each axle and the waist pulls in between them — that curve is the whole
# reason the car reads as an Ambassador rather than as a loaf.
BODY = [
    (25.0, 8.6, 4.2, 11.0),
    (24.0, 9.8, 3.4, 12.2),
    (22.5, 10.6, 2.9, 12.8),
    (20.0, 11.2, 2.7, 13.1),
    (17.0, 11.5, 2.6, 13.2),
    (14.5, 11.5, 2.6, 13.2),       # front axle — fender crown
    (11.5, 11.4, 2.6, 13.2),       # a long FLAT bonnet, not a curve
    (8.5, 11.2, 2.6, 13.2),
    (5.0, 11.0, 2.6, 13.3),        # cowl: the windscreen stands up from here
    (0.0, 11.0, 2.6, 13.4),
    (-6.0, 11.1, 2.6, 13.4),
    (-11.5, 11.4, 2.6, 13.3),
    (-14.5, 11.5, 2.6, 13.2),      # rear axle — fender crown
    (-17.5, 11.4, 2.6, 13.1),
    (-20.0, 11.0, 2.8, 12.8),      # a short flat BOOT deck
    (-22.5, 10.3, 3.1, 12.2),
    (-24.0, 9.3, 3.6, 11.3),
    (-25.0, 7.8, 4.4, 10.2),
]

# The greenhouse: inset from the flanks, tall, round-shouldered, set back.
# It overlaps the body by 1.5 mm so the two lofts weld into one solid.
CABIN = [
    (7.2, 5.6, 12.4, 14.6),        # base of the windscreen
    (5.6, 7.4, 12.4, 17.4),
    (3.6, 8.6, 12.4, 19.4),
    (1.0, 9.2, 12.4, 20.4),
    (-2.0, 9.3, 12.4, 20.7),       # roof, near flat across the middle
    (-5.5, 9.3, 12.4, 20.7),
    (-9.0, 9.1, 12.4, 20.4),
    (-12.0, 8.6, 12.4, 19.5),
    (-14.5, 7.7, 12.4, 17.8),      # the rear screen falls from here
    (-16.5, 6.6, 12.4, 15.6),
    (-17.8, 5.6, 12.4, 13.8),
]

GLASS_Z0, GLASS_Z1 = 13.6, 19.4    # the window band, clear of the roof crown
GLASS_DEPTH = 0.75
PILLARS = (7.0, -1.0, -11.0)       # A, B, C — what the band is divided by

OUT_DIR = os.path.abspath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'Ambassador-3D-Print'))


# ------------------------------------------------------------------- helpers --

def wipe():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.unit_settings.system = 'METRIC'
    s.unit_settings.scale_length = 0.001
    s.unit_settings.length_unit = 'MILLIMETERS'


def ring(half_w, z0, z1, p_top, p_bot, n=SECTION_N):
    cz, a, b = (z0 + z1) / 2.0, half_w, (z1 - z0) / 2.0
    pts = []
    for i in range(n):
        t = 2.0 * math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        e = 2.0 / (p_top if s >= 0 else p_bot)
        y = a * math.copysign(abs(c) ** e, c) if c else 0.0
        z = cz + (b * math.copysign(abs(s) ** e, s) if s else 0.0)
        pts.append((y, z))
    return pts


def at(stations, x, index):
    """Piecewise-linear lookup along a station table (they run front to back)."""
    pts = sorted((st[0], st[index]) for st in stations)
    if x <= pts[0][0]:
        return pts[0][1]
    if x >= pts[-1][0]:
        return pts[-1][1]
    for (x0, v0), (x1, v1) in zip(pts, pts[1:]):
        if x0 <= x <= x1:
            t = 0.0 if x1 == x0 else (x - x0) / (x1 - x0)
            return v0 + (v1 - v0) * t
    return pts[-1][1]


def loft(name, stations, p_top, p_bot):
    """Bridge sections into a closed, capped solid."""
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rows = [[bm.verts.new((x, y, z)) for y, z in ring(hw, z0, z1, p_top, p_bot)]
            for x, hw, z0, z1 in stations]
    for a, b in zip(rows, rows[1:]):
        for i in range(SECTION_N):
            j = (i + 1) % SECTION_N
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(tuple(reversed(rows[0])))
    bm.faces.new(tuple(rows[-1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def cube(name, size, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts[:])
    if bevel:
        bmesh.ops.bevel(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                        offset=bevel, segments=3, affect='EDGES', profile=0.5,
                        clamp_overlap=True)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location, obj.rotation_euler = loc, rot
    bpy.context.collection.objects.link(obj)
    return obj


def cyl(name, r, h, loc=(0, 0, 0), rot=(0, 0, 0), seg=64, r_top=None):
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
    bpy.context.view_layer.objects.active = target
    mod = target.modifiers.new('b', 'BOOLEAN')
    mod.operation, mod.object, mod.solver = op, tool, 'EXACT'
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(tool, do_unlink=True)
    return target


def clean(obj):
    """Weld and de-sliver: exact booleans leave zero-area triangles, and a
    part that opens with a slicer warning reads as a broken part."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0012)
    bmesh.ops.dissolve_degenerate(bm, dist=0.0012, edges=bm.edges[:])
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def openings(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    n = sum(1 for e in bm.edges if not e.is_manifold)
    bm.free()
    return n


def stage(obj, label):
    """Where a solid stops being closed. Printed per step because the answer
    to "which boolean broke it" is not guessable from the final mesh."""
    # Welding here is not tidiness, it is what makes the NEXT boolean work.
    # An exact boolean leaves hairline slivers wherever two surfaces run close
    # together — the floor pan's flanks against the hull's, for one — and they
    # cost nothing until the next operation tries to cut through them. That is
    # how a bumper which unions perfectly onto a bare hull opened 36 edges once
    # the pan had gone on first. Each step now hands the next a clean solid.
    clean(obj)
    if os.environ.get('STAGES'):
        print(f'     stage {label:<12} open edges: {openings(obj)}')
    return obj


def dupe(obj, name):
    c = obj.copy()
    c.data = obj.data.copy()
    c.name = name
    bpy.context.collection.objects.link(c)
    return c


def report(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    open_edges = [e for e in bm.edges if not e.is_manifold]
    vol = bm.calc_volume(signed=True)
    tris = sum(len(f.verts) - 2 for f in bm.faces)
    bm.free()
    d = obj.dimensions
    ok = not open_edges and vol > 0
    print(f'  {"ok  " if ok else "FAIL"} {obj.name:<16} {d.x:6.2f} x {d.y:5.2f} x {d.z:5.2f} mm'
          f'   {vol / 1000.0:6.2f} cm3  {tris:5d} tris  '
          f'{"watertight" if not open_edges else f"{len(open_edges)} OPEN EDGES"}')
    return ok


# ---------------------------------------------------------------------- body --

def build_body():
    body = loft('AMBY-body', BODY, BODY_P_TOP, BODY_P_BOT)
    boolean(body, loft('cabin', CABIN, CABIN_P_TOP, CABIN_P_BOT))

    # The floor pan: a flat sole to print on, inset so it tucks under the body
    # rather than standing proud as a lip.
    stage(body, 'hull+cabin')
    boolean(body, loft('floor', [(x, hw - 1.2, FLOOR_Z0, FLOOR_Z1)
                                 for x, hw, _a, _b in BODY], BODY_P_TOP, BODY_P_BOT))
    stage(body, 'floor pan')

    # ---- bumpers -------------------------------------------------------------
    # Lofted from the body's OWN nose and tail stations, 0.9 mm proud. A
    # straight bar across a round nose stands off it at the middle and sinks
    # into it at the ends; this follows the curve exactly, which is what a
    # wrapped chrome bumper does.
    # The extra station at each end pokes 0.5 mm PAST the body, so the
    # bumper's end cap lands in free space. Sharing a plane with the body's
    # own cap is what opened 459 edges: an exact boolean cannot decide which
    # side of a coincident face is inside.
    # The end station is NARROWER than the body at that x, so the bumper's cap
    # is buried inside the nose: a cap in free space left the car 51 mm long,
    # and a cap sharing the body's own nose plane opened 459 edges (an exact
    # boolean cannot decide which side of a coincident face is inside).
    # Held 0.6 mm clear of the floor pan's top face (4.8). At 4.9 the two
    # surfaces were 0.1 mm apart — near-tangency, which an exact boolean
    # resolves no better than an exact overlap: it opened 36 edges.
    boolean(body, loft('bumper_f',
                       [(24.9, 8.0, 5.9, 8.1)]
                       + [(x, hw + 1.1, 5.8, 8.2) for x, hw, _a, _b in BODY[1:4]],
                       3.0, 3.0))
    boolean(body, loft('bumper_r',
                       [(x, hw + 1.1, 5.6, 8.0) for x, hw, _a, _b in BODY[-4:-1]]
                       + [(-24.9, 7.0, 5.7, 7.9)],
                       3.0, 3.0))
    stage(body, 'bumpers')

    # ---- the face ------------------------------------------------------------
    # A wide grille recess with two bars left standing across it, flat on the
    # round nose — exactly how the real one sits.
    boolean(body, cube('grille', (2.6, 6.6, 5.2), (23.4, 0, 9.6), bevel=0.7),
            op='DIFFERENCE')
    for z in (8.0, 9.6, 11.2):
        boolean(body, cube('bar', (2.2, 6.0, 0.55), (22.9, 0, z)))
    # Round lamps, standing proud, set high and wide: the whole charm.
    for sy in (1, -1):
        # High and wide, on the fender tops — the Ambassador's own face.
        boolean(body, cyl('lamp', 1.9, 2.6, (22.2, sy * 7.0, 11.6),
                          rot=(0, math.radians(90), 0), seg=32))
        boolean(body, cyl('lamprim', 2.3, 1.0, (21.8, sy * 7.0, 11.6),
                          rot=(0, math.radians(90), 0), seg=32))
        # Round tail lamps, to match.
        boolean(body, cyl('tail', 1.2, 1.8, (-23.2, sy * 7.4, 10.4),
                          rot=(0, math.radians(90), 0), seg=24))
    stage(body, 'face')

    # ---- glass ---------------------------------------------------------------
    # Six flat panes cut into the dome: two windows a side with a pillar
    # between them, a windscreen and a rear screen.
    #
    # Cut with BOXES, deliberately. The elegant version — a collar following
    # the dome's curve, made by subtracting a shrunken cabin from a grown one
    # — produced a tool that was not manifold itself, and subtracting a
    # non-manifold tool deleted the entire body (5000 polygons to zero). A box
    # is always a well-formed solid, and a flat pane in a curved body is what
    # every die-cast toy has anyway. Depths come from the station table rather
    # than from guesses, so each pane bites the same 0.8 mm.
    BITE = 0.8
    for sy in (1, -1):
        for cx, clen, cz, ch in ((2.4, 6.4, 16.6, 4.2), (-8.6, 6.8, 16.4, 4.0)):
            y = sy * (at(CABIN, cx, 1) + 3.0 - BITE)
            boolean(body, cube('side', (clen, 6.0, ch), (cx, y, cz), bevel=0.5),
                    op='DIFFERENCE')
    # Windscreen and rear screen: the same idea, tilted onto the slopes.
    boolean(body, cube('screen', (2.6, 13.2, 3.6), (7.2, 0, 16.2),
                       rot=(0, math.radians(-40), 0), bevel=0.5), op='DIFFERENCE')
    boolean(body, cube('rearscreen', (2.4, 12.4, 3.2), (-15.0, 0, 15.5),
                       rot=(0, math.radians(36), 0), bevel=0.5), op='DIFFERENCE')
    stage(body, 'glass')

    # ---- wheel arches --------------------------------------------------------
    # Cut as pockets, not lofted in. A loft section is one closed ring, so
    # lifting its floor to clear a wheel lifts the floor across the whole car
    # — on a body this shallow that saws it in half. A half-round tunnel
    # subtracted from each corner is the arch a car really has: round over the
    # tyre, open at the side, open underneath.
    for sx in (1, -1):
        for sy in (1, -1):
            x, y = sx * WHEEL_X, sy * (BEAM_HALF_Y + 0.4 + 6.0)
            boolean(body, cyl('arch', ARCH_R, 12.0, (x, y, WHEEL_R),
                              rot=(math.radians(90), 0, 0), seg=56), op='DIFFERENCE')
            boolean(body, cube('archbox', (ARCH_R * 2, 12.0, WHEEL_R * 2), (x, y, 0)),
                    op='DIFFERENCE')
    stage(body, 'arches')

    # ---- axle beams and bosses ----------------------------------------------
    for sx in (1, -1):
        x = sx * WHEEL_X
        boolean(body, cube('beam', (BEAM_X * 2, BEAM_HALF_Y * 2, BEAM_Z1 - BEAM_Z0),
                           (x, 0, (BEAM_Z0 + BEAM_Z1) / 2), bevel=0.5))
        boolean(body, cyl('boss', BOSS_R, BEAM_HALF_Y * 2, (x, 0, WHEEL_R),
                          rot=(math.radians(90), 0, 0), seg=48))
    stage(body, 'beams')

    # Drill the axle bores last, through everything.
    for sx in (1, -1):
        boolean(body, cyl('bore', BORE_CHASSIS / 2, 40.0, (sx * WHEEL_X, 0, WHEEL_R),
                          rot=(math.radians(90), 0, 0), seg=40), op='DIFFERENCE')
    return body


# --------------------------------------------------------------------- wheel --

def build_wheel():
    """Chunky tyre, domed chrome hubcap — printed flat, face up."""
    w = cyl('AMBY-wheel', WHEEL_R, WHEEL_W, (0, 0, WHEEL_W / 2), seg=72)
    # A soft shoulder, so the tyre reads as rubber and not as a washer.
    boolean(w, cyl('shoulder', WHEEL_R + 1.5, 0.9, (0, 0, WHEEL_W + 0.1), seg=72,
                   r_top=WHEEL_R - 0.5), op='DIFFERENCE')
    # Ten bold tread notches. Anything finer is below what a 0.4 mm nozzle can
    # draw, so it would print as noise.
    for i in range(10):
        a = 2.0 * math.pi * i / 10.0
        boolean(w, cube('notch', (1.3, 1.3, WHEEL_W * 0.5),
                        ((WHEEL_R - 0.15) * math.cos(a), (WHEEL_R - 0.15) * math.sin(a),
                         WHEEL_W / 2), rot=(0, 0, a)), op='DIFFERENCE')
    # The hubcap: a shallow rim well, then the chrome dome and its pip.
    boolean(w, cyl('well', WHEEL_R - 1.3, 0.7, (0, 0, WHEEL_W - 0.35), seg=56,
                   r_top=WHEEL_R - 2.1), op='DIFFERENCE')
    boolean(w, cyl('cap', 2.9, 1.2, (0, 0, WHEEL_W - 0.75), seg=40, r_top=2.1))
    boolean(w, cyl('pip', 0.7, 0.6, (0, 0, WHEEL_W + 0.05), seg=16))
    # Relieve the edge that meets the bed: a squashed first layer is the
    # difference between a wheel that rolls and one that wobbles.
    boolean(w, cyl('foot', WHEEL_R + 1.5, 0.9, (0, 0, -0.02), seg=72,
                   r_top=WHEEL_R - 0.45), op='DIFFERENCE')
    boolean(w, cyl('bore', BORE_WHEEL / 2, BORE_DEPTH * 2, (0, 0, 0), seg=32),
            op='DIFFERENCE')
    return w


def build_axle():
    rod = cyl('AMBY-axle', AXLE_D / 2, AXLE_LEN, (0, 0, AXLE_LEN / 2), seg=40)
    boolean(rod, cyl('leadA', AXLE_D, 0.7, (0, 0, -0.03), seg=40,
                     r_top=AXLE_D / 2 - 0.3), op='DIFFERENCE')
    boolean(rod, cyl('leadB', AXLE_D / 2 - 0.3, 0.7, (0, 0, AXLE_LEN + 0.03), seg=40,
                     r_top=AXLE_D), op='DIFFERENCE')
    return rod


# -------------------------------------------------------------------- export --

def export(obj, name):
    clean(obj)
    path = os.path.join(OUT_DIR, name)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.wm.stl_export(filepath=path, export_selected_objects=True,
                          global_scale=1.0, apply_modifiers=True)
    print(f'  {name:<28} {os.path.getsize(path) / 1024:6.0f} KB')


def plate():
    """The seven parts on a bed, each already in its printing orientation."""
    parts = []
    body = clean(build_body())
    body.name = 'plate_body'
    for v in body.data.vertices:
        v.co.z -= FLOOR_Z0                 # stand the floor pan on the bed
    parts.append(body)

    wheel = clean(build_wheel())
    for i in range(4):
        c = wheel.copy()
        c.data = wheel.data.copy()
        c.name = f'plate_wheel{i}'
        c.location = (-21.0 + i * 14.0, -22.0, 0)
        bpy.context.collection.objects.link(c)
        parts.append(c)
    bpy.data.objects.remove(wheel, do_unlink=True)

    rod = clean(build_axle())
    for i in range(2):
        c = rod.copy()
        c.data = rod.data.copy()
        c.name = f'plate_axle{i}'
        # LYING DOWN. A 16 mm rod stood on end is held together by layer
        # adhesion alone and snaps the first time a wheel is pushed on.
        c.rotation_euler = (0, math.radians(90), 0)
        c.location = (-AXLE_LEN / 2, 20.0 + i * 5.0, AXLE_D / 2)
        bpy.context.collection.objects.link(c)
        parts.append(c)
    bpy.data.objects.remove(rod, do_unlink=True)

    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    path = os.path.join(OUT_DIR, 'AMBY-plate-all-7-parts.stl')
    bpy.ops.wm.stl_export(filepath=path, export_selected_objects=True,
                          global_scale=1.0, apply_modifiers=True)
    print(f'  {"AMBY-plate-all-7-parts.stl":<28} {os.path.getsize(path) / 1024:6.0f} KB')


def main():
    wipe()
    os.makedirs(OUT_DIR, exist_ok=True)
    print(f'\n== a cute Ambassador, {L:.0f} mm ==')

    body, wheel, axle = build_body(), build_wheel(), build_axle()
    print('\n-- parts --')
    for p in (body, wheel, axle):
        clean(p)
    ok = all(report(p) for p in (body, wheel, axle))

    print('\n-- proportions --')
    print(f'  length          {L:6.1f} mm')
    print(f'  width           {HW * 2:6.1f} mm')
    print(f'  height          {CABIN[5][3]:6.1f} mm   roof crown')
    print(f'  wheelbase       {WHEEL_X * 2:6.1f} mm   {WHEEL_X * 2 / L * 100:.0f}% of the length')
    print(f'  wheel           {WHEEL_D:6.1f} mm   {WHEEL_D / L * 100:.0f}% of the length')
    print(f'  cabin inset     {HW - max(hw for _x, hw, _a, _b in CABIN):6.1f} mm   a shoulder to catch the light')
    print(f'  tyre tuck       {HW - (WHEEL_Y + WHEEL_W / 2):6.1f} mm   inside the fender')

    print('\n-- fits --')
    print(f'  axle rod        {AXLE_D:.2f} mm')
    print(f'  wheel bore      {BORE_WHEEL:.2f} mm   {(AXLE_D - BORE_WHEEL) / 2:.3f} mm interference a side (grips)')
    print(f'  chassis bore    {BORE_CHASSIS:.2f} mm   {(BORE_CHASSIS - AXLE_D) / 2:.3f} mm clearance a side (turns)')
    print(f'  axle length     {AXLE_LEN:.2f} mm  into {BORE_DEPTH:.2f} mm bores')
    print(f'  wheel to beam   {(WHEEL_Y - WHEEL_W / 2) - BEAM_HALF_Y:.2f} mm a side')
    print(f'  tyre to arch    {ARCH_R - WHEEL_R:.2f} mm')
    print(f'  ground clear.   {FLOOR_Z0:.2f} mm')

    print('\n-- files --')
    export(body, 'AMBY-body.stl')
    export(wheel, 'AMBY-wheel-x4.stl')
    export(axle, 'AMBY-axle-x2.stl')
    json.dump({'wheel_r': WHEEL_R, 'wheel_w': WHEEL_W, 'wheel_x': WHEEL_X,
               'wheel_y': WHEEL_Y, 'bore_depth': BORE_DEPTH, 'axle_d': AXLE_D,
               'bore_wheel': BORE_WHEEL, 'bore_chassis': BORE_CHASSIS,
               'floor_z0': FLOOR_Z0, 'length': L,
               'body': 'AMBY-body.stl', 'wheel': 'AMBY-wheel-x4.stl',
               'axle': 'AMBY-axle-x2.stl'},
              open(os.path.join(OUT_DIR, 'fits.json'), 'w'), indent=1)

    wipe()
    plate()
    print('\nDONE' if ok else '\nFAILED: a part is not watertight')


# Importable for the diagnostics: NOMAIN=1 loads the builders without running.
if not os.environ.get('NOMAIN'):
    main()
