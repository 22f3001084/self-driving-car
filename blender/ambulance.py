"""The ambulance.

Exec'd into `build_kit.py`'s namespace after `be6.py`, so the loft, prism,
tube, alloy_wheel and bake_modifiers helpers are all available here.

This vehicle has one job the others do not: it is seen almost entirely FROM IN
FRONT OF IT, because it comes up behind the car. The version this replaces was
modelled the way you look at a vehicle in a showroom — three-quarter front — and
its back was a plain white box with an off-centre cross and no lamps at all. On
the street, closing on a child's rear-view, it read as "another car", which is
exactly the note that came back.

So the rear is the front of this model. It carries, in descending order of how
far away each one still reads:

    chevrons     three red/yellow/red V bands, 0.34 m deep each. The version
                 before this had SIX bands of 0.158 m, which an audit measured
                 at eight pixels apiece over the 8-20 m the child actually sees
                 this vehicle from: six bands that close together do not read as
                 six bands, they read as one band of orange mush. Three deep
                 ones read as chevrons.
    lettering    AMBULANCE across the doors in 0.34 m block capitals, and again
                 mirror-reversed on the bonnet. There is not one texture in this
                 kit — every material is a solid factor — so lettering has to be
                 built out of geometry or not exist. A stroke font makes that
                 cheap: 31 boxes a word, 372 faces for both.
    strobes      two rear-facing blues at roof height, 0.52 x 0.26 each, wired
                 to the same objects the light bar uses so they flash together
    lamp bank    real red clusters, plus reversing and indicator lenses
    cross        a sign on the rear roof edge, above the glass line, with bars
                 wide enough to survive the distance

Everything on the back is measured off AMB_REAR, the module's real rear wall.
The obvious constant, AMB_TAIL, is the body's nominal envelope and sits 7.4 cm
BEHIND that wall: graphics placed off it floated in open air, which is why the
old chevrons cast no shadow on anything.

Naming contract, unchanged, because the runtime looks these up by string:
    ambulance_body                  the shell
    ambulance_wheel_fl/fr/rl/rr     origins on the hubs
    ambulance_blue_l / _r           every blue lens on that side of the vehicle,
                                    roof and rear together, flashed alternately
"""

AMB_L = 5.90
AMB_W = 2.24
AMB_HALF = AMB_L / 2.0
AMB_HW = AMB_W / 2.0
AMB_WHEEL_R = 0.44
AMB_WHEEL_W = 0.30
AMB_AXLE_F = 1.80
AMB_AXLE_R = -1.58
AMB_BOX_TOP = 2.72
AMB_TAIL = -AMB_HALF        # nominal envelope. NOT the door face — see AMB_REAR.

# The box module, as numbers rather than as fractions buried in a box() call,
# because everything on the back of this vehicle is placed off its rear wall.
AMB_MOD_LEN = AMB_L * 0.665
AMB_MOD_CX = -AMB_L * 0.155
AMB_MOD_CZ = 1.78
AMB_MOD_H = 1.86
AMB_MOD_BEVEL = 0.11
AMB_FLOOR = AMB_MOD_CZ - AMB_MOD_H / 2.0            # 0.85, the module's underside
AMB_SKIRT_TOP = 0.49
AMB_LOWER_TOP = AMB_FLOOR + 0.01                    # lower body, lapped into the floor
AMB_REAR = AMB_MOD_CX - AMB_MOD_LEN / 2.0           # -2.87625, the door face
AMB_CROWN_LEN = AMB_L * 0.64
AMB_CROWN_REAR = AMB_MOD_CX - AMB_CROWN_LEN / 2.0   # -2.8025, the roof cap face

# The chevron stack: three bands, bottom edge of the lowest at AMB_CHEV_Z0, each
# one AMB_CHEV_H deep, each rising AMB_CHEV_RISE to its apex.
AMB_CHEV_Z0 = 0.88
AMB_CHEV_H = 0.34
AMB_CHEV_RISE = 0.30
AMB_CHEV_TOP = AMB_CHEV_Z0 + 3 * AMB_CHEV_H          # 1.90 at the outer edge
AMB_CHEV_APEX = AMB_CHEV_TOP + AMB_CHEV_RISE         # 2.20 on the centreline

# Block lettering. 0.34 m caps is the largest that fits between the chevron apex
# and the roof, and a 0.058 m stroke is what keeps the counters open at that
# width without the word going thin.
AMB_CAP_H = 0.34
AMB_CAP_W = 0.19
AMB_CAP_S = 0.058
AMB_CAP_GAP = 0.028


def rear_x(thickness, proud=0.015, face=None):
    """Centre X for a rear graphic `thickness` deep, standing `proud` of a face.

    Every rear marking used to be placed off AMB_TAIL (-2.95) while the module's
    rear wall is at -2.87625, so the chevrons, the cross and the strobes all
    hung 4-10 cm off the back of the vehicle with daylight behind them. Off the
    real face, at 1-2 cm proud, they behave like paint and applied lamps: the
    body is always the thing directly behind them. Only the markings are held to
    that; the mouldings that are genuinely bolted on — bumper, step, handles,
    lamp housings — ask for more, and say so at the call.
    """
    return (AMB_REAR if face is None else face) - proud + thickness / 2.0


def chevron_band(y_half, z0, thickness, rise, height):
    """One V of a chevron panel, apex up, as a closed outline in (y, z).

    Drawn as a real band rather than a diagonal stripe: a stripe reads as
    decoration, a chevron reads as a warning, and the difference is entirely in
    whether the two halves meet in the middle.
    """
    return [
        (-y_half, z0),
        (0.0, z0 + rise),
        (y_half, z0),
        (y_half, z0 + height),
        (0.0, z0 + rise + height),
        (-y_half, z0 + height),
    ]


def letter_bars(glyph, w, h, s):
    """One block capital as a handful of rectangular strokes.

    Each stroke comes back as (cx, cy, along, across, angle): a rectangle
    `along` by `across`, centred at (cx, cy) in a cell `w` wide and `h` tall
    whose origin is its bottom-left corner, turned `angle` radians anticlockwise.
    Everything is in metres so that a diagonal keeps its stroke width instead of
    being sheared by a non-square cell.

    A stroke font is the right font for this kit. There are no textures, so a
    letter is geometry; and geometry that has to survive being seen at 20 m
    through a rear window wants to be five rectangles, not an outline with
    thirty verts on the bowl of the B.
    """
    def rect(x0, y0, x1, y1):
        return ((x0 + x1) / 2.0, (y0 + y1) / 2.0, x1 - x0, y1 - y0, 0.0)

    def diag(x0, y0, x1, y1):
        dx, dy = x1 - x0, y1 - y0
        # Half a stroke of overrun at each end so the joints close.
        return ((x0 + x1) / 2.0, (y0 + y1) / 2.0,
                math.hypot(dx, dy) + s * 0.5, s, math.atan2(dy, dx))

    mid_lo, mid_hi = (h - s) / 2.0, (h + s) / 2.0
    if glyph == 'A':
        return [diag(s * 0.5, 0.0, w / 2.0, h - s * 0.4),
                diag(w - s * 0.5, 0.0, w / 2.0, h - s * 0.4),
                rect(w * 0.20, h * 0.26, w * 0.80, h * 0.26 + s)]
    if glyph == 'M':
        return [rect(0.0, 0.0, s, h), rect(w - s, 0.0, w, h),
                diag(s * 0.5, h - s * 0.4, w / 2.0, h * 0.36),
                diag(w - s * 0.5, h - s * 0.4, w / 2.0, h * 0.36)]
    if glyph == 'B':
        return [rect(0.0, 0.0, s, h),
                rect(0.0, h - s, w, h), rect(0.0, mid_lo, w, mid_hi),
                rect(0.0, 0.0, w, s),
                rect(w - s, mid_lo, w, h - s), rect(w - s, s, w, mid_hi)]
    if glyph == 'U':
        return [rect(0.0, s, s, h), rect(w - s, s, w, h), rect(0.0, 0.0, w, s)]
    if glyph == 'L':
        return [rect(0.0, 0.0, s, h), rect(0.0, 0.0, w, s)]
    if glyph == 'N':
        return [rect(0.0, 0.0, s, h), rect(w - s, 0.0, w, h),
                diag(s * 0.5, h - s * 0.3, w - s * 0.5, s * 0.3)]
    if glyph == 'C':
        return [rect(0.0, 0.0, s, h), rect(0.0, h - s, w, h), rect(0.0, 0.0, w, s)]
    if glyph == 'E':
        return [rect(0.0, 0.0, s, h), rect(0.0, h - s, w, h),
                rect(0.0, mid_lo, w * 0.86, mid_hi), rect(0.0, 0.0, w, s)]
    raise KeyError('no stroke pattern for %r' % glyph)


def block_word(prefix, text, material, origin, face, thickness=0.06,
               cap_h=AMB_CAP_H, cap_w=AMB_CAP_W, stroke=AMB_CAP_S, gap=AMB_CAP_GAP):
    """Extruded lettering, laid out in reading order for the eye that sees it.

    `face` 'rear' paints the word on the back doors. The reader is at -X, so
    screen-right is -Y and the word marches that way; `origin` is (x, y-centre,
    baseline).

    `face` 'bonnet' lays it flat on the bonnet MIRROR-REVERSED — every glyph
    flipped and the word running the other way — which is the point of bonnet
    lettering: it is not for the people beside the vehicle, it is for the driver
    who reads it in a rear-view mirror, and a mirror flips it back. Here the
    letters stand up in +X and `origin` is (baseline x, y-centre, z).
    """
    parts = []
    pitch = cap_w + gap
    span = len(text) * cap_w + (len(text) - 1) * gap
    for index, glyph in enumerate(text):
        cell = -span / 2.0 + index * pitch
        for j, (cx, cy, along, across, angle) in enumerate(letter_bars(glyph, cap_w, cap_h, stroke)):
            u, v = cell + cx, cy
            name = '%s_%d_%d' % (prefix, index, j)
            if face == 'rear':
                parts.append(box(name, (thickness, along, across),
                                 (origin[0], origin[1] - u, origin[2] + v),
                                 material, rot=(-angle, 0, 0)))
            else:
                parts.append(box(name, (across, along, thickness),
                                 (origin[0] + v, origin[1] - u, origin[2]),
                                 material, rot=(0, 0, angle)))
    return parts


def make_ambulance():
    """A box-body ambulance, built to be recognised from behind."""
    shell = mat('amb_shell', PAL['white'], roughness=0.28, metallic=0.10)
    red = mat('amb_red', srgb(0xD7263D), roughness=0.42)
    yellow = mat('amb_yellow', srgb(0xF7C948), roughness=0.44)
    glass = mat('amb_glass', srgb(0x1F2E3C), roughness=0.06, metallic=0.5)
    dark = mat('amb_dark', srgb(0x22262D), roughness=0.80)
    steel = mat('amb_steel', srgb(0x8D949E), roughness=0.34, metallic=0.65)
    chrome = mat('amb_chrome', srgb(0xCED6E0), roughness=0.16, metallic=0.95)
    navy = mat('amb_barbase', PAL['navy'], roughness=0.5)
    lamp = mat('amb_head', PAL['lamp'], roughness=0.12, emission=srgb(0xFFF4DC), strength=2.2)
    tail = mat('amb_tail', srgb(0xD8102A), roughness=0.18, emission=srgb(0xFF1A34), strength=1.6)
    amberm = mat('amb_amber', PAL['orange'], roughness=0.3, emission=PAL['orange'], strength=1.1)
    # The bar's red modules are joined into the flashing objects now, so this one
    # is driven by the runtime and only ever glows on its half of the cycle.
    redlens = mat('amb_redlens', srgb(0xE01030), roughness=0.2, emission=srgb(0xFF2244), strength=2.4)
    white_lens = mat('amb_whitelens', srgb(0xF2F6FF), roughness=0.16, emission=srgb(0xEAF2FF), strength=1.4)
    # Two materials that deliberately sit UNDER the 1.05 bloom threshold. Steady
    # emitters above it bloom for the whole overtake, and a permanent glow next
    # to a flashing one wins: the blues were losing their own pixels to a red bar
    # they were mounted inside, and the light bar read as continuously lit
    # because its white ends and red modules never went out.
    tailbar = mat('amb_tailbar', srgb(0xD8102A), roughness=0.22, emission=srgb(0xFF1A34), strength=0.8)
    bar_white = mat('amb_barwhite', srgb(0xF2F6FF), roughness=0.16, emission=srgb(0xEAF2FF), strength=0.6)

    body = []

    # ---- chassis and body volumes -----------------------------------------
    body.append(box('amb_skirt', (AMB_L * 0.95, AMB_W - 0.16, 0.30), (0, 0, 0.34), dark, bevel=0.05))
    # The box module. A real crown across the roof rather than a flat lid: the
    # chase camera looks slightly down on this vehicle for the whole overtake.
    body.append(box('amb_module', (AMB_MOD_LEN, AMB_W, AMB_MOD_H), (AMB_MOD_CX, 0, AMB_MOD_CZ),
                    shell, bevel=AMB_MOD_BEVEL))
    body.append(box('amb_crown', (AMB_CROWN_LEN, AMB_W - 0.16, 0.14), (AMB_MOD_CX, 0, AMB_BOX_TOP - 0.03), shell, bevel=0.07))
    # Lower body, filling the 0.36 m of nothing that used to sit between the top
    # of the skirt and the underside of the module — the band the bottom chevron
    # and the bottom half of both lamp banks are drawn across. It stops at the
    # skirt's width rather than the module's, because a panel the full 2.24 m
    # would swallow the rear wheels, whose outer faces are at 1.11; the last
    # 0.32 m at the back goes full width so the door face and the lamp banks
    # have bodywork behind them all the way out to the corner.
    lower_h = AMB_LOWER_TOP - AMB_SKIRT_TOP
    lower_z = (AMB_LOWER_TOP + AMB_SKIRT_TOP) / 2.0
    body.append(box('amb_lower_panel', (AMB_MOD_LEN, AMB_W - 0.16, lower_h),
                    (AMB_MOD_CX, 0, lower_z), shell, bevel=0.06))
    body.append(box('amb_lower_rear', (0.32, AMB_W, lower_h),
                    (AMB_REAR + 0.16, 0, lower_z), shell, bevel=0.06))
    # Cab, stepping down from the module, with a raked screen.
    body.append(box('amb_cab', (AMB_L * 0.30, AMB_W - 0.09, 1.34), (AMB_L * 0.305, 0, 1.20), shell, bevel=0.10))
    body.append(box('amb_bonnet', (AMB_L * 0.16, AMB_W - 0.16, 0.52), (AMB_L * 0.455, 0, 0.86), shell, bevel=0.08))
    body.append(box('amb_screen', (0.09, AMB_W - 0.46, 0.78), (AMB_L * 0.442, 0, 1.50), glass,
                    rot=(0, math.radians(-19), 0)))
    body.append(box('amb_screen_band', (0.07, AMB_W - 0.46, 0.10), (AMB_L * 0.433, 0, 1.83), dark,
                    rot=(0, math.radians(-19), 0)))

    # ---- front -------------------------------------------------------------
    nose = AMB_L * 0.53
    body.append(box('amb_bumper_f', (0.26, AMB_W - 0.04, 0.40), (nose - 0.02, 0, 0.50), dark, bevel=0.09))
    body.append(box('amb_grille', (0.07, 0.94, 0.30), (nose + 0.01, 0, 0.94), dark, bevel=0.04))
    for i in range(3):
        body.append(box('amb_grille_bar%d' % i, (0.04, 0.86, 0.035),
                        (nose + 0.04, 0, 0.86 + i * 0.10), chrome))
    for side in (1, -1):
        # Headlamp, and an amber corner lens beside it.
        body.append(box('amb_head%d' % side, (0.10, 0.36, 0.22), (nose + 0.02, side * 0.76, 0.94),
                        lamp, bevel=0.04))
        body.append(box('amb_corner%d' % side, (0.08, 0.12, 0.16), (nose - 0.01, side * (AMB_HW - 0.09), 0.92),
                        amberm, bevel=0.03))
        body.append(box('amb_fog%d' % side, (0.06, 0.16, 0.10), (nose + 0.02, side * 0.58, 0.56),
                        white_lens, bevel=0.02))
    # A red cross on the nose, and the blue strobes set into the bumper — the
    # pair a driver sees in the mirror before anything else resolves.
    body.append(box('amb_nose_cross_v', (0.05, 0.20, 0.60), (nose + 0.03, 0, 1.50), red))
    body.append(box('amb_nose_cross_h', (0.05, 0.60, 0.20), (nose + 0.03, 0, 1.50), red))
    body.append(box('amb_skid_f', (0.30, AMB_W - 0.30, 0.06), (nose - 0.22, 0, 0.31), steel, bevel=0.02))
    # AMBULANCE across the bonnet, mirror-reversed. The deck between the foot of
    # the windscreen (x 2.777) and the bonnet's front bevel (x 3.14) is 0.36 m
    # of flat, which is exactly one 0.34 m cap height laid on its back.
    # Narrower than the rear word: nine letters at 0.185 came to 1.88 m across a
    # bonnet that is 2.08 wide before its bevel, so the first and last glyphs
    # ran over the wing edges and broke up.
    body.extend(block_word('amb_word_f', 'AMBULANCE', red,
                           (2.79, 0.0, 1.12), 'bonnet', thickness=0.04,
                           cap_w=0.145, gap=0.018))

    # ---- flanks ------------------------------------------------------------
    for side in (1, -1):
        y = side * (AMB_HW + 0.004)
        body.append(box('amb_cabglass%d' % side, (0.78, 0.05, 0.56), (AMB_L * 0.295, y, 1.58), glass))
        body.append(box('amb_boxglass%d' % side, (0.86, 0.05, 0.52), (-AMB_L * 0.02, y, 2.10), glass))
        body.append(box('amb_glassframe%d' % side, (0.94, 0.035, 0.60), (-AMB_L * 0.02, y - side * 0.012, 2.10), dark))
        # Battenburg: alternating blocks along the waist. It is the marking
        # every emergency service in the world converged on because it reads as
        # a pattern long after the colours have gone to mush at distance.
        blocks = 9
        span = AMB_L * 0.90
        bw = span / blocks
        for i in range(blocks):
            body.append(box('amb_batt%d_%d' % (side, i), (bw * 0.94, 0.02, 0.30),
                            (-span / 2 + bw * (i + 0.5), y + side * 0.010, 1.16),
                            red if i % 2 == 0 else yellow))
        # The cross, on the module where there is room for it to be big.
        body.append(box('amb_cross_v%d' % side, (0.26, 0.03, 0.86), (-AMB_L * 0.30, y + side * 0.014, 1.98), red))
        body.append(box('amb_cross_h%d' % side, (0.86, 0.03, 0.26), (-AMB_L * 0.30, y + side * 0.014, 1.98), red))
        # Mirror on an arm, high and wide as a van's is.
        body.append(box('amb_mirror_arm%d' % side, (0.055, 0.26, 0.055), (AMB_L * 0.430, side * (AMB_HW + 0.15), 1.86), dark))
        body.append(box('amb_mirror%d' % side, (0.10, 0.17, 0.42), (AMB_L * 0.418, side * (AMB_HW + 0.27), 1.68), dark, bevel=0.035))
        # Side marker lamps, and the step under the cab door.
        body.append(box('amb_marker_f%d' % side, (0.10, 0.05, 0.07), (AMB_L * 0.40, y + side * 0.012, 0.70), amberm))
        body.append(box('amb_marker_r%d' % side, (0.10, 0.05, 0.07), (-AMB_L * 0.44, y + side * 0.012, 0.70), amberm))
        body.append(box('amb_step%d' % side, (0.60, 0.16, 0.06), (AMB_L * 0.24, side * (AMB_HW - 0.02), 0.40), steel))
        # Arch lips that follow the tyres.
        for wx in (AMB_AXLE_F, AMB_AXLE_R):
            arch, steps = [], 14
            for i in range(steps + 1):
                a = math.pi * i / steps
                arch.append((wx - 0.560 * math.cos(a), 0.400 + 0.540 * math.sin(a)))
            for i in range(steps, -1, -1):
                a = math.pi * i / steps
                arch.append((wx - 0.505 * math.cos(a), 0.400 + 0.487 * math.sin(a)))
            body.append(prism('amb_arch%d_%d' % (side, round(wx * 10)), arch, 0.05, dark,
                              plane='xz', offset=side * (AMB_HW - 0.015)))

    # ---- rear: the face this vehicle is actually seen from ------------------
    # Everything below is placed off AMB_REAR through rear_x(). The mouldings
    # take a deliberately larger stand-off than the markings do: a bumper that
    # sits 1.5 cm off the door face is not a bumper.
    body.append(box('amb_bumper_r', (0.24, AMB_W - 0.04, 0.42), (rear_x(0.24, 0.04), 0, 0.50), dark, bevel=0.08))
    body.append(box('amb_step_r', (0.30, AMB_W - 0.60, 0.07), (rear_x(0.30, 0.10), 0, 0.33), steel, bevel=0.02))
    # The shut line between the doors, 5 mm prouder than the chevrons so it
    # draws over them instead of being buried by them.
    body.append(box('amb_door_seam', (0.05, 0.05, 1.70), (rear_x(0.05, 0.02), 0, 1.73), dark))
    for side in (1, -1):
        body.append(box('amb_door_handle%d' % side, (0.10, 0.16, 0.06), (rear_x(0.10, 0.06), side * 0.30, 1.42), chrome))
        # A vision slot in each door. It used to be a 0.62 x 0.42 window sitting
        # where the cross wanted to be; the chevron stack owns the doors now, so
        # the glass is a letterbox tucked into the clear triangle beside the top
        # band's apex, and the cross has moved above it.
        body.append(box('amb_door_glass%d' % side, (0.06, 0.52, 0.24),
                        (rear_x(0.06, 0.03), side * 0.70, 2.08), glass))

    # Three chevrons, red / yellow / red, apex up, from just above the bumper to
    # the height of the door glass. Inset to AMB_HW - 0.13 so the band ends on
    # the flat of the door and not out over the module's 0.11 bevel, and 0.06
    # deep so it stays buried in the bodywork where that bevel starts to curve.
    for i in range(3):
        body.append(prism(
            'amb_chevron%d' % i,
            chevron_band(AMB_HW - 0.13, AMB_CHEV_Z0 + i * AMB_CHEV_H, 0.0, AMB_CHEV_RISE, AMB_CHEV_H),
            0.06, red if i % 2 == 0 else yellow, plane='yz', offset=rear_x(0.06)))

    # AMBULANCE across the doors, in the band between the chevron apex and the
    # roof. This is the only stretch of flat door left, and at 0.34 m caps it is
    # the second thing to resolve after the chevrons themselves.
    body.extend(block_word('amb_word_r', 'AMBULANCE', red,
                           (rear_x(0.06, 0.03), 0.0, AMB_CHEV_APEX + 0.03), 'rear'))

    # The cross: a sign box on the rear roof edge, clear above the glass line,
    # bars 0.30 m wide. It was a 0.22 m cross drawn straight through both door
    # windows. Deep enough (0.12) to be anchored in the module below and the
    # crown behind, and it tops out just under the light bar so the vehicle's
    # silhouette does not grow.
    for tag, size in (('v', (0.12, 0.30, 0.72)), ('h', (0.12, 0.72, 0.30))):
        body.append(box('amb_cross_%s_r' % tag, size, (rear_x(0.12, 0.02), 0, 2.90), red))

    # Lamp bank, low and outboard: red stop/tail, amber indicator, white
    # reverse. Three separate lenses per side, not one red smear. The housing is
    # deep enough to pass through the chevron behind it rather than fight it.
    for side in (1, -1):
        y = side * (AMB_HW - 0.20)
        body.append(box('amb_lampbox%d' % side, (0.14, 0.30, 0.66), (rear_x(0.14, 0.06), y, 0.86), dark, bevel=0.03))
        body.append(box('amb_tail%d' % side, (0.06, 0.24, 0.22), (rear_x(0.06, 0.08), y, 1.06), tail, bevel=0.02))
        body.append(box('amb_ind%d' % side, (0.06, 0.24, 0.16), (rear_x(0.06, 0.08), y, 0.86), amberm, bevel=0.02))
        body.append(box('amb_rev%d' % side, (0.06, 0.24, 0.14), (rear_x(0.06, 0.08), y, 0.68), white_lens, bevel=0.02))
    # The red bar that ties the two lamp banks together, in two pieces with the
    # shut line between them. It used to run across the top of the doors THROUGH
    # both rear strobes, so a flashing blue was physically inside a lens held at
    # 2.4 — permanently over the bloom threshold. Down here at lamp-bank height
    # it shares no pixels with the blues, and at 0.8 it no longer blooms.
    for side in (1, -1):
        body.append(box('amb_tail_bar%d' % side, (0.05, 0.74, 0.10),
                        (rear_x(0.05, 0.02), side * 0.51, 0.77), tailbar, bevel=0.02))

    # ---- light bar ---------------------------------------------------------
    # Full width, on feet, with clear end modules. The old one was a small navy
    # slab with two pale lenses that never read as a beacon at all.
    bar_x = -AMB_L * 0.10
    bar_z = AMB_BOX_TOP + 0.14
    body.append(box('amb_bar_base', (0.44, AMB_W - 0.12, 0.10), (bar_x, 0, bar_z), navy, bevel=0.03))
    for side in (1, -1):
        body.append(box('amb_bar_foot%d' % side, (0.36, 0.10, 0.09), (bar_x, side * 0.62, bar_z - 0.09), navy))
        # Steady white ends, under the bloom threshold. At 1.4 they glowed for
        # the whole overtake, and a bar with two permanently lit ends reads as a
        # lit sign rather than as something flashing.
        body.append(box('amb_bar_end%d' % side, (0.40, 0.14, 0.20), (bar_x, side * (AMB_W / 2 - 0.10), bar_z + 0.13),
                        bar_white, bevel=0.03))
    body.append(box('amb_bar_lid', (0.46, AMB_W - 0.10, 0.05), (bar_x, 0, bar_z + 0.25), navy, bevel=0.02))
    # Rear-facing takedown, on the back of the bar.
    body.append(box('amb_bar_takedown', (0.05, 0.90, 0.10), (bar_x - 0.24, 0, bar_z + 0.13), bar_white, bevel=0.02))

    bake_modifiers(body)
    hull = join('ambulance_body', body, origin=(0, 0, 0))
    smooth(hull, angle=46)

    # ---- the blues, kept out of the shell so the runtime can flash them -----
    # Roof AND rear on the same two objects, so one side's roof beacon and its
    # rear strobe pulse together — which is what a real light bar does, and what
    # makes the vehicle read as emergency rather than as a car with a roof box.
    #
    # The bar's red modules are in here too. Welded into the shell they were
    # 0.60 m of the bar's 2.12 m glowing flat out and never going off, so only
    # 0.68 m of the bar ever changed and the thing read as steadily lit. On the
    # flashing objects they alternate with the blues, side by side, and 1.28 m
    # of the bar now moves.
    blue = mat('amb_blue', srgb(0x2F6BFF), roughness=0.22, emission=srgb(0x4C8BFF), strength=1.0)
    for tag, side in (('l', 1), ('r', -1)):
        parts = [
            box('amb_blue_roof_%s' % tag, (0.40, 0.34, 0.19), (bar_x, side * 0.66, bar_z + 0.13), blue, bevel=0.03),
            box('amb_bar_red_%s' % tag, (0.36, 0.30, 0.19), (bar_x, side * 0.30, bar_z + 0.13), redlens, bevel=0.03),
            # Rear strobe: 0.52 x 0.26 where it used to be 0.26 x 0.14, up on the
            # roof edge where nothing else is emitting, and mounted off the
            # crown so it is a lamp on the corner of the body rather than a card
            # floating behind it.
            box('amb_blue_rear_%s' % tag, (0.10, 0.52, 0.26),
                (rear_x(0.10, 0.03, AMB_CROWN_REAR), side * 0.74, 2.75), blue, bevel=0.02),
            box('amb_blue_grille_%s' % tag, (0.06, 0.20, 0.09), (nose + 0.02, side * 0.30, 0.72), blue, bevel=0.02),
        ]
        bake_modifiers(parts)
        smooth(join('ambulance_blue_%s' % tag, parts, origin=(0, 0, 0)), angle=40)

    for tag, x, y in (('fl', AMB_AXLE_F, AMB_HW - 0.16), ('fr', AMB_AXLE_F, -AMB_HW + 0.16),
                      ('rl', AMB_AXLE_R, AMB_HW - 0.16), ('rr', AMB_AXLE_R, -AMB_HW + 0.16)):
        alloy_wheel('ambulance_wheel_' + tag, AMB_WHEEL_R, AMB_WHEEL_W, (x, y, AMB_WHEEL_R),
                    outward=1.0 if y > 0 else -1.0, spokes=6)

    return hull
