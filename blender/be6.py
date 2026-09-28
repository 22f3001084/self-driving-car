"""The player's vehicle: a Mahindra BE 6 electric coupe-SUV.

Exec'd into `build_kit.py`'s namespace, which has already defined `box`,
`cylinder`, `torus`, `join`, `smooth`, `mat`, `srgb` and `PAL`. It is exec'd
rather than imported because Blender's bundled Python cannot see the project on
sys.path when the launcher starts it headless from an arbitrary directory.

Why this is lofted rather than stacked out of primitives: a car's shape is a
SURFACE. The two hulls below are built the way a body-in-white is — a row of
stations along the car, each a rounded-rectangle section, bridged into a shell —
and every piece of trim is then placed ON that surface by solving the section
for the exact half-width at its own height. Trim placed at a fixed distance from
the centreline either sinks into the paint or floats off it, because the flanks
tuck in as they climb; `Hull.flank` is what stops both.

Scale. The real BE 6 is 4371 x 1907 x 1627 mm on a 2775 mm wheelbase. The
driving model was tuned around a 4.20 m car (CAR_HALF_X = 2.10 in stage.ts) and
a 0.36 m wheel radius, so this is reproduced at 0.961 of life size: every
proportion is the real car's, and every constant the simulation relies on still
describes it. 4.20 x 1.833 x 1.56 on a 2.667 m wheelbase, wheel r = 0.361.

Naming contract, which the runtime looks up by string:
    van_body                  the shell — everything that does not move
    van_wheel_fl/fr/rl/rr     origins exactly on the hubs, rolled about Y here
    van_pod                   roof sensor, origin on its spin axis
    van_lights                headlamps + DRLs, emissive-boosted when lit
    van_brakes                tail lamps, boosted under braking
    van_ind_fl/fr/rl/rr       indicators, flashed one side at a time
"""

# ---------------------------------------------------------------- sections ---

SECTION_N = 22
BODY_P_TOP = 3.4
BODY_P_BOT = 5.2
CABIN_P_TOP = 3.9
CABIN_P_BOT = 4.2


def lerp_table(table, x):
    """Piecewise-linear lookup over [(x, value), ...]. Clamps past both ends."""
    pts = sorted(table)
    if x <= pts[0][0]:
        return pts[0][1]
    if x >= pts[-1][0]:
        return pts[-1][1]
    for (x0, v0), (x1, v1) in zip(pts, pts[1:]):
        if x0 <= x <= x1:
            t = 0.0 if x1 == x0 else (x - x0) / (x1 - x0)
            return v0 + (v1 - v0) * t
    return pts[-1][1]


def ring_points(half_w, z0, z1, n=SECTION_N, p_top=BODY_P_TOP, p_bottom=BODY_P_BOT):
    """One cross-section, in the Y-Z plane, as a superellipse.

    An ellipse gives a barrel; a rectangle gives a crate. A car's section is
    neither — flat down the flank and across the roof with the corners rolled
    off, which is what an exponent above 2 produces. The floor is squarer than
    the roof, so the two halves take different exponents.
    """
    cz = (z0 + z1) / 2.0
    a, b = half_w, (z1 - z0) / 2.0
    out = []
    for i in range(n):
        t = 2.0 * math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        e = 2.0 / (p_top if s >= 0 else p_bottom)
        y = a * math.copysign(abs(c) ** e, c) if c else 0.0
        z = cz + (b * math.copysign(abs(s) ** e, s) if s else 0.0)
        out.append((y, z))
    return out


def section_half_width(half_w, z0, z1, z, p_top=BODY_P_TOP, p_bottom=BODY_P_BOT):
    """Invert a section: how wide is the body at this height?"""
    b = (z1 - z0) / 2.0
    if b <= 1e-6:
        return half_w
    s = (z - (z0 + z1) / 2.0) / b
    s = max(-0.9995, min(0.9995, s))
    e = 2.0 / (p_top if s >= 0 else p_bottom)
    sin_t = abs(s) ** (1.0 / e)
    cos_t = math.sqrt(max(0.0, 1.0 - sin_t * sin_t))
    return half_w * (cos_t ** e)


class Hull:
    """A lofted volume, and the surface queries that let trim follow it."""

    def __init__(self, stations, p_top=BODY_P_TOP, p_bottom=BODY_P_BOT):
        self.stations = stations
        self.p_top = p_top
        self.p_bottom = p_bottom
        self._hw = [(x, hw) for (x, hw, _z0, _z1) in stations]
        self._z0 = [(x, z0) for (x, _hw, z0, _z1) in stations]
        self._z1 = [(x, z1) for (x, _hw, _z0, z1) in stations]

    def top(self, x):
        return lerp_table(self._z1, x)

    def bottom(self, x):
        return lerp_table(self._z0, x)

    def flank(self, x, z):
        """Half-width at (x, z) — where a piece of trim has to sit to be ON the
        paint. Heights outside the section are pulled back inside it first: over
        a wheel arch the body simply is not there, and an unclamped query would
        collapse the trim onto the centreline and swallow it whole."""
        z0, z1 = self.bottom(x), self.top(x)
        margin = min(0.02, (z1 - z0) * 0.2)
        z = min(max(z, z0 + margin), z1 - margin)
        return section_half_width(lerp_table(self._hw, x), z0, z1, z, self.p_top, self.p_bottom)

    def hug(self, side, gap):
        """A `surface` function for `prism`: lie on this hull's flank."""
        return lambda x, z: side * (self.flank(x, z) + gap)

    def build(self, name, material):
        mesh = bpy.data.meshes.new(name)
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        bm = bmesh.new()
        rings = []
        for (x, hw, z0, z1) in self.stations:
            rings.append([bm.verts.new((x, y, z)) for (y, z) in
                          ring_points(hw, z0, z1, SECTION_N, self.p_top, self.p_bottom)])
        bm.verts.ensure_lookup_table()
        for a, b in zip(rings, rings[1:]):
            for i in range(SECTION_N):
                j = (i + 1) % SECTION_N
                bm.faces.new((a[i], a[j], b[j], b[i]))
        bm.faces.new(rings[0])
        bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
        bm.to_mesh(mesh)
        bm.free()
        obj.data.materials.append(material)
        return obj

    def skin(self, name, x_from, x_to, material, steps=8, depth=0.06, lift=0.010, inset=0.0):
        """A thin panel lying ON the top surface between two stations.

        The windscreen, the backlight, the roof and the bonnet are all this:
        each follows the body line exactly because it is generated from the same
        table, so no angle has to be guessed and none can drift when the line is
        tuned. Its width comes from the section solved AT panel height — taking
        the section's widest point instead is what made the first roof overhang
        the car like a tray.
        """
        stations = []
        for i in range(steps + 1):
            x = x_from + (x_to - x_from) * i / steps
            top = self.top(x)
            stations.append((x, max(0.02, self.flank(x, top - depth * 0.5) - inset),
                             top - depth, top + lift))
        return Hull(stations, self.p_top, self.p_bottom).build(name, material)


def prism(name, points, thickness, material=None, plane='xz', offset=0.0,
          bevel=0.0, surface=None):
    """Extrude a 2-D outline into a slab.

    plane 'xz' puts the outline in X-Z with the slab thick along Y — glazing,
    arch cladding, door shuts. plane 'yz' puts it in Y-Z thick along X, which is
    how the C-shaped lamps that face down the road are made.

    Pass `surface` — a function of the two outline coordinates returning the
    slab's centre on the thickness axis — and the panel curves with the body
    instead of standing off it as a flat card.
    """
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    half = thickness / 2.0
    verts = []
    for (u, v) in points:
        base = surface(u, v) if surface else offset
        verts.append(bm.verts.new((u, base - half, v) if plane == 'xz'
                                  else (base - half, u, v)))
    face = bm.faces.new(verts)
    result = bmesh.ops.extrude_face_region(bm, geom=[face])
    moved = [e for e in result['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=moved,
                        vec=(0, thickness, 0) if plane == 'xz' else (thickness, 0, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # The lamp signatures are concave C shapes, and a surface-hugged panel is
    # not planar. glTF triangulates n-gons on the way out anyway; doing it here
    # keeps it under our control, which is where the two disagree.
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.to_mesh(mesh)
    bm.free()
    if material:
        obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('Bevel', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 2
        modifier.limit_method = 'ANGLE'
        modifier.angle_limit = math.radians(40)
    return obj


def band(name, points, inset, thickness, material, surface):
    """A closed outline as a FRAME rather than a filled panel.

    A window surround drawn as one polygon is a sheet of chrome over the glass.
    This walks the outline and emits one thin quad per edge, inset toward the
    centroid, so what you get is the bright strip round the daylight opening.
    """
    cx = sum(p[0] for p in points) / len(points)
    cy = sum(p[1] for p in points) / len(points)
    inner = []
    for (u, v) in points:
        dx, dy = cx - u, cy - v
        d = math.hypot(dx, dy) or 1.0
        inner.append((u + dx / d * inset, v + dy / d * inset))
    parts = []
    for i in range(len(points)):
        j = (i + 1) % len(points)
        parts.append(prism('%s_%d' % (name, i),
                           [points[i], points[j], inner[j], inner[i]],
                           thickness, material, plane='xz', surface=surface))
    return parts


def c_outline(y_outer, z_bottom, height, width, arm, spine, inward):
    """The BE 6's lighting motif: a squared C, open toward the car's centre.

    It is the one shape that identifies this car from any angle, front or rear,
    so it is cut as a real outline rather than suggested with two bars.
    `inward` is +1 when the car's centre lies at -Y from `y_outer`.
    """
    steps = [
        (0.0, 0.0), (width, 0.0), (width, arm), (spine, arm),
        (spine, height - arm), (width, height - arm), (width, height), (0.0, height),
    ]
    return [(y_outer - inward * u, z_bottom + v) for (u, v) in steps]


def bake_modifiers(objects):
    """Apply every pending modifier.

    `bpy.ops.object.join()` keeps only the ACTIVE object's modifiers, so a bevel
    left pending on any other part is silently dropped — which is why the car
    this replaces shipped as raw boxes despite asking for bevels everywhere.
    """
    for obj in objects:
        if not obj.modifiers:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        for modifier in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=modifier.name)


# ----------------------------------------------------------------- wheels ----

def tube(name, r_outer, r_inner, length, material, segments=32):
    """A hollow cylinder about Y — a tyre carcass, or the well of a rim.

    A solid cylinder is simpler and is what the wheel this replaces used, which
    is exactly why nothing inside it was ever visible: a tyre is a RING, and a
    tyre modelled as a disc buries the rim, the spokes and the brake behind a
    slab of rubber. The wheel then reads as a black circle at every angle, which
    is the whole complaint.
    """
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    half = length / 2.0
    rings = {}
    for key, r in (('o', r_outer), ('i', r_inner)):
        for side, y in (('-', -half), ('+', half)):
            rings[key + side] = [
                bm.verts.new((r * math.cos(2 * math.pi * i / segments), y,
                              r * math.sin(2 * math.pi * i / segments)))
                for i in range(segments)]
    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new((rings['o-'][i], rings['o-'][j], rings['o+'][j], rings['o+'][i]))
        bm.faces.new((rings['i-'][i], rings['i-'][j], rings['i+'][j], rings['i+'][i]))
        bm.faces.new((rings['o-'][i], rings['o-'][j], rings['i-'][j], rings['i-'][i]))
        bm.faces.new((rings['o+'][i], rings['o+'][j], rings['i+'][j], rings['i+'][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()
    obj.data.materials.append(material)
    return obj


def alloy_wheel(name, radius, width, loc, outward=1.0, spokes=5):
    """A 19-inch aero alloy on a low-profile tyre.

    The wheel this replaces was a disc with four spokes at 45 degrees — an
    eight-fold symmetric shape, identical to itself every 45 degrees, so
    rotating it changed nothing you could see and the wheels read as painted on.
    Five twin-spokes, a five-lug circle, a red caliper and a valve stem all
    break that symmetry, which is what makes the roll legible; two dozen tread
    blocks do the same at the rim, where the speed is.

    `outward` says which way along Y the dished face looks, because a rim is not
    symmetric: build both sides the same and one of them shows the car its own
    brake disc while the street sees a blank drum.

    Modelled about the origin and moved to `loc` afterwards, because `join`
    bakes transforms and the hub has to end up exactly on the pivot.
    """
    o = outward
    rubber = mat('be6_tyre', PAL['tyre'], roughness=0.94)
    rim = mat('be6_rim', srgb(0x2A2E34), roughness=0.34, metallic=0.85)
    machined = mat('be6_rimface', srgb(0x9BA4AF), roughness=0.24, metallic=0.92)
    disc = mat('be6_disc', srgb(0x6E7580), roughness=0.26, metallic=0.9)
    caliper = mat('be6_caliper', srgb(0xC8102E), roughness=0.4)

    axis = (math.radians(90), 0, 0)
    parts = []

    # Everything below is stacked along Y so that nothing hides what is behind
    # it. Outboard first: tyre wall, rim lip, spokes, lugs, centre cap; then,
    # visible THROUGH the spokes, the brake disc; then the well that closes the
    # back of the wheel. Get that order wrong and the face is a black disc.
    seat = radius * 0.735
    tyre = tube(f'{name}_tyre', radius, seat, width, rubber, segments=48)
    shoulder = tyre.modifiers.new('Bevel', 'BEVEL')
    shoulder.width = 0.026
    shoulder.segments = 2
    shoulder.limit_method = 'ANGLE'
    parts.append(tyre)
    for i in range(24):
        angle = 2.0 * math.pi * i / 24.0
        parts.append(box(
            f'{name}_tread{i}', (0.003, width * 0.34, 0.020),
            (radius * 0.994 * math.cos(angle), (0.15 if i % 2 else -0.15) * width,
             radius * 0.994 * math.sin(angle)),
            rubber, rot=(0, -angle, 0)))

    parts.append(tube(f'{name}_well', seat, radius * 0.66, width * 0.94, rim, segments=26))
    parts.append(torus(f'{name}_lip', seat + 0.014, 0.024, (0, o * width * 0.45, 0), machined,
                       rot=(math.radians(90), 0, 0), major_seg=26, minor_seg=4))
    # The back of the well, so the road is not visible through the hub.
    parts.append(cylinder(f'{name}_backing', radius * 0.70, 0.02, (0, -o * width * 0.30, 0), rim, verts=24, rot=axis))

    # Brake disc and caliper, seen between the spokes — the detail that says the
    # wheel is hollow, and therefore that it is turning.
    parts.append(cylinder(f'{name}_disc', radius * 0.55, 0.020, (0, -o * width * 0.10, 0), disc, verts=22, rot=axis))
    parts.append(cylinder(f'{name}_bell', radius * 0.23, 0.06, (0, -o * width * 0.02, 0), rim, verts=14, rot=axis))
    if not name.startswith('van_wheel_'):
        parts.append(box(f'{name}_caliper', (0.07, 0.05, 0.18),
                         (-radius * 0.44, -o * width * 0.02, radius * 0.28),
                         caliper, rot=(0, math.radians(-33), 0)))

    for i in range(spokes):
        angle = 2.0 * math.pi * i / spokes
        for k, (inner, outer, thick, y, skew) in enumerate((
                (0.028, 0.060, 0.050, o * width * 0.32, 0.0),
                (0.016, 0.032, 0.038, o * width * 0.27, 0.17))):
            r0, r1 = radius * 0.19, radius * 0.742
            spoke = prism(f'{name}_spoke{i}_{k}',
                          [(r0, -inner), (r1, -outer), (r1, outer), (r0, inner)],
                          thick, machined if k == 0 else rim, plane='xz', offset=y)
            spoke.rotation_euler = (0, -angle - skew, 0)
            parts.append(spoke)
        parts.append(cylinder(f'{name}_lug{i}', 0.016, 0.028,
                              (radius * 0.185 * math.cos(angle + 0.31), o * width * 0.36,
                               radius * 0.185 * math.sin(angle + 0.31)),
                              machined, verts=6, rot=axis))

    parts.append(cylinder(f'{name}_cap', radius * 0.185, 0.05, (0, o * width * 0.38, 0), rim, verts=18, rot=axis))
    parts.append(cylinder(f'{name}_capface', radius * 0.140, 0.02, (0, o * width * 0.42, 0), machined, verts=18, rot=axis))
    parts.append(cylinder(f'{name}_capmark', radius * 0.075, 0.02, (0, o * width * 0.44, 0),
                          mat('be6_capmark', PAL['navy'], roughness=0.4), verts=14, rot=axis))
    parts.append(cylinder(f'{name}_valve', 0.011, 0.05,
                          (radius * 0.48, o * width * 0.34, radius * 0.30), rim, verts=6, rot=axis))

    bake_modifiers(parts)
    wheel = join(name, parts, origin=(0, 0, 0))
    smooth(wheel, angle=32)
    wheel.location = loc
    return wheel


# The production exterior is isolated from the reusable hull/wheel helpers
# above, also consumed by the ambulance builder.
_source = pathlib.Path(__file__).with_name('be6_refined.py')
exec(compile(_source.read_text(encoding='utf8'), str(_source), 'exec'), globals())
