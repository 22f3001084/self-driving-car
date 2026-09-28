"""Author every 3D asset in the game, in Blender, and export one GLB.

Run headless:
    blender-launcher.exe --background --factory-startup --python blender/build_kit.py

Why a kit and not a scene: the street is built at runtime by TILING road pieces
end to end, so one 12-metre tile serves a hundred metres of road and the same
four pieces cover every level and patrol. Add a piece here and the game can lay
it immediately — that is the reusable road system.

Coordinate note. Blender is Z-up; the glTF exporter converts to Y-up, mapping
Blender +Y to glTF -Z. The game drives +X with the near lane at +Z, so anything
that belongs on the near side is modelled at NEGATIVE Blender Y. `near()` below
does that conversion in one place so no individual asset has to think about it.
"""
import math
import pathlib
import sys

import bmesh
import bpy

OUT = pathlib.Path(bpy.path.abspath('//')) if False else None

# ---------------------------------------------------------------- geometry ---

TILE = 12.0          # length of one road piece, metres
ROAD_HALF = 9.2      # kerb face to centreline (four lanes of 4.6)
KERB_W = 0.34
KERB_H = 0.16
# 13.0, down from 17.2. An eight-metre pavement each side put sixteen metres
# of flat grey concrete on a screen that already has eighteen of tarmac — from
# the low camera, two-thirds of the frame was grey. 3.5 m is a real pavement,
# and everything beyond it is grass now, which is where the colour comes from.
PAVE_OUT = 13.0      # outer edge of the pavement
LANE = 6.9           # kerb-side lane centre; the inner lane sits at 2.3


def near(y: float) -> float:
    """Convert a game-space Z (near lane positive) to Blender Y."""
    return -y


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for item in list(block):
            if item.users == 0:
                block.remove(item)
    # The material cache holds handles to datablocks this just deleted. Anything
    # that clears the scene twice — the art renderer builds two of them — would
    # otherwise hand the second scene freed pointers and die on the first
    # `materials.append`.
    MATERIALS.clear()


MATERIALS: dict[str, bpy.types.Material] = {}


def mat(name, colour, roughness=0.75, metallic=0.0, emission=None, strength=0.0, alpha=1.0):
    """A Principled material. No image textures anywhere: solid factors keep the
    GLB tiny, which matters because it is base64-inlined for offline use."""
    key = f'{name}'
    if key in MATERIALS:
        return MATERIALS[key]
    material = bpy.data.materials.new(key)
    material.use_nodes = True
    bsdf = material.node_tree.nodes['Principled BSDF']
    r, g, b = colour
    bsdf.inputs['Base Color'].default_value = (r, g, b, alpha)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1.0)
        bsdf.inputs['Emission Strength'].default_value = strength
    if alpha < 1.0:
        material.blend_method = 'BLEND'
        bsdf.inputs['Alpha'].default_value = alpha
    MATERIALS[key] = material
    return material


def srgb(hex_value):
    """Blender wants linear values; the palette is authored in sRGB."""
    def lin(channel):
        c = channel / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (
        lin((hex_value >> 16) & 255),
        lin((hex_value >> 8) & 255),
        lin(hex_value & 255),
    )


# CityRide, from the SKAI Space design system.
PAL = {
    'orange': srgb(0xFCA01B), 'darkOrange': srgb(0xE07A00), 'navy': srgb(0x091C56),
    'mint': srgb(0x45CDB5), 'teal': srgb(0x0F8F87), 'white': srgb(0xF7FBFF),
    'asphalt': srgb(0x3B3F47), 'kerb': srgb(0xB9BEC7), 'pavement': srgb(0xA8AEB8),
    'brick': srgb(0xA5523C), 'brickDark': srgb(0x8A4231), 'concrete': srgb(0xC2C6CD),
    'cream': srgb(0xDED3BD), 'glass': srgb(0x5C88AD), 'steel': srgb(0x8D949E),
    'leaf': srgb(0x4E8F52), 'leafDark': srgb(0x3F7A45), 'trunk': srgb(0x6B5138),
    'skin': srgb(0xB9825C), 'hair': srgb(0x2B2018), 'red': srgb(0xD7263D),
    'yellow': srgb(0xF5C53D), 'tyre': srgb(0x1D2026), 'lamp': srgb(0xFFE6B0),
    'dog': srgb(0xB07A42), 'dogDark': srgb(0x8C5C30), 'grass': srgb(0x6F7A66),
    'blue': srgb(0x2F6BFF),
    # The shop row, matched to the FLAT edition's painted backdrop so the two
    # editions of one game read as one place: warm terracotta, sage, slate,
    # tan, cream and brick townhouses with cream window frames, pale-blue
    # glass, white shopfront fascias and striped awnings.
    'townRed': srgb(0xC96B52), 'townSage': srgb(0xAECBA4), 'townSlate': srgb(0x7B99A6),
    'townTan': srgb(0xD9BE93), 'townCream': srgb(0xEFE3C8), 'townBrick': srgb(0xB85C4A),
    'townFrame': srgb(0xF4EAD2), 'townGlass': srgb(0xBCD9EA), 'townFascia': srgb(0xF7F1E1),
    'awnTeal': srgb(0x4FB3A4), 'awnOrange': srgb(0xE98A3C), 'awnRed': srgb(0xC95B4B),
    'doorWood': srgb(0x8A5A38),
}


def box(name, size, loc=(0, 0, 0), material=None, bevel=0.0, rot=(0, 0, 0)):
    """A cube of the given dimensions, positioned by its centre."""
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bm.to_mesh(mesh)
    bm.free()
    obj.location = loc
    obj.rotation_euler = rot
    if material:
        obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('Bevel', 'BEVEL')
        modifier.width = bevel
        # Three segments turn a chamfer into a CURVE. One segment reads as a
        # bevelled box; three read as pressed metal — the difference between
        # "boxy" and "moulded" at zero authoring cost.
        modifier.segments = 3
        modifier.limit_method = 'ANGLE'
        modifier.angle_limit = math.radians(40)
    return obj


def smooth(obj, angle=55):
    """Shade smooth with an angle limit: curves render as curves, creases
    stay sharp. Blender 4.1+ moved auto-smooth to an operator."""
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.shade_auto_smooth(angle=math.radians(angle))
    except Exception:
        bpy.ops.object.shade_smooth()
    return obj


def cylinder(name, radius, depth, loc=(0, 0, 0), material=None, verts=20, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    if material:
        obj.data.materials.append(material)
    return obj


def sphere(name, radius, loc=(0, 0, 0), material=None, segments=14, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    bpy.ops.object.shade_smooth()
    if material:
        obj.data.materials.append(material)
    return obj


def ico(name, radius, loc=(0, 0, 0), material=None, subdiv=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=radius, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    if material:
        obj.data.materials.append(material)
    return obj


def cone(name, radius, depth, loc=(0, 0, 0), material=None, verts=16):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=radius, depth=depth, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    if material:
        obj.data.materials.append(material)
    return obj


def torus(name, major, minor, loc=(0, 0, 0), material=None, rot=(0, 0, 0), major_seg=16, minor_seg=5):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor, location=loc, rotation=rot,
        major_segments=major_seg, minor_segments=minor_seg,
    )
    obj = bpy.context.active_object
    obj.name = name
    if material:
        obj.data.materials.append(material)
    return obj


def join(name, objects, origin=None):
    """Weld a group of parts into one mesh, keeping a chosen origin.

    Fewer objects means fewer draw calls at runtime, which is what lets the game
    put a hundred of these on screen. `origin` matters for anything the code
    rotates — a wheel, a limb — because it becomes the pivot.
    """
    objects = [o for o in objects if o is not None]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    # Bake every part's transform into its mesh BEFORE joining. join() keeps the
    # ACTIVE object's transform, so if the first part happens to be a rotated
    # torus, the whole assembly inherits a 90-degree object rotation — and any
    # later rotation_euler assignment silently un-rotates the geometry. That is
    # how the scooter ended up lying flat on the road.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    result = bpy.context.active_object
    result.name = name
    if origin is not None:
        # Shift the mesh so the object's origin lands exactly on the pivot.
        offset = [result.location[i] - origin[i] for i in range(3)]
        mesh_offset = [origin[i] - result.location[i] for i in range(3)]
        for vertex in result.data.vertices:
            for i in range(3):
                vertex.co[i] += (result.location[i] - origin[i])
        result.location = origin
        _ = offset, mesh_offset
    return result


def empty(name, loc=(0, 0, 0)):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_size = 0.2
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    return obj


# ===================================================================== ROAD ===

def road_base(suffix):
    """The shared footprint of every road piece: surface, kerbs, pavements and
    lane lines. One tile is TILE metres long and butts against the next."""
    parts = []
    asphalt = mat('asphalt', PAL['asphalt'], roughness=0.9)
    line = mat('roadline', PAL['white'], roughness=0.62)
    kerb_m = mat('kerb', PAL['kerb'], roughness=0.82)
    pave_m = mat('pavement', PAL['pavement'], roughness=0.88)

    parts.append(box(f'surface_{suffix}', (TILE, ROAD_HALF * 2, 0.12), (0, 0, -0.06), asphalt))

    # ONE line down the middle, dashed, and nothing else on the tarmac.
    #
    # A tile used to carry ten painted markings: a continuous edge line each
    # side, a DOUBLE solid centre, and a dashed lane line either side of it —
    # eleven stripes across an eighteen-metre road, plus four slab joints per
    # pavement. From the low rear camera that is a page of horizontal rules the
    # child has to look through to find the car, and none of it is the lesson:
    # the game never asks about lane discipline or about which side of a double
    # white you may cross.
    #
    # Two dashes per tile, so the rhythm survives tiling with no seam maths, and
    # they are the only thing that MOVES past the car — which is what makes the
    # street read as driven rather than slid.
    for i in (-1, 1):
        parts.append(box(
            f'centre_{suffix}_{i}', (3.4, 0.24, 0.02), (i * 3.0, 0, 0.005), line,
        ))

    for side in (1, -1):
        y = side * (ROAD_HALF + KERB_W / 2)
        parts.append(box(f'kerb_{suffix}_{side}', (TILE, KERB_W, KERB_H), (0, y, KERB_H / 2), kerb_m, bevel=0.03))
        width = PAVE_OUT - ROAD_HALF - KERB_W
        centre = side * (ROAD_HALF + KERB_W + width / 2)
        parts.append(box(f'pave_{suffix}_{side}', (TILE, width, KERB_H), (0, centre, KERB_H / 2), pave_m))
    return parts


def make_road_straight():
    return join('road_straight', road_base('st'))


def make_road_crossing():
    parts = road_base('cr')
    white = mat('zebra', PAL['white'], roughness=0.6)
    # Zebra bars run across the carriageway, repeated along it.
    for i in range(9):
        parts.append(box(f'zebra_{i}', (0.62, ROAD_HALF * 2 - 0.5, 0.03), (-2.7 + i * 0.68, 0, 0.01), white))
    # Belisha beacons on both kerbs.
    for side in (1, -1):
        y = side * (ROAD_HALF + 0.7)
        parts.append(cylinder(f'beacon_post_{side}', 0.07, 2.4, (-3.6, y, 1.2), mat('beaconpost', PAL['white'], roughness=0.5), verts=12))
        parts.append(sphere(f'beacon_globe_{side}', 0.22, (-3.6, y, 2.5),
                            mat('beaconglow', PAL['orange'], roughness=0.4, emission=PAL['orange'], strength=1.3)))
    return join('road_crossing', parts)


def make_road_bay():
    parts = road_base('bay')
    paint = mat('baypaint', PAL['orange'], roughness=0.66)
    y = near(LANE)
    parts.append(box('bay_edge_a', (9.0, 0.16, 0.02), (0, y + 1.6, 0.008), paint))
    parts.append(box('bay_edge_b', (9.0, 0.16, 0.02), (0, y - 1.6, 0.008), paint))
    parts.append(box('bay_edge_c', (0.16, 3.2, 0.02), (-4.5, y, 0.008), paint))
    parts.append(box('bay_edge_d', (0.16, 3.2, 0.02), (4.5, y, 0.008), paint))
    for i in range(7):
        parts.append(box(f'bay_hatch_{i}', (0.12, 3.4, 0.02), (-3.6 + i * 1.2, y, 0.008), paint, rot=(0, 0, math.radians(28))))
    return join('road_bay', parts)


def make_road_works():
    """A narrowed carriageway: the tile that teaches 'the gap is one van wide'."""
    parts = road_base('wk')
    paint = mat('workspaint', PAL['yellow'], roughness=0.7)
    for i in range(6):
        parts.append(box(f'taper_{i}', (0.7, 0.14, 0.02), (-4 + i * 1.5, near(-LANE) + i * 0.28, 0.008), paint, rot=(0, 0, math.radians(-14))))
    return join('road_works', parts)


# ================================================================ BUILDINGS ===

def make_shop(name, width, floors, colour, trim_colour, awning_colour):
    """
    One townhouse, in the flat edition's own visual language.

    The 2D edition's street is a painted row of townhouses: flat warm colour,
    a parapet with a cornice under it, a regular grid of cream-framed windows,
    and a white shopfront fascia at the ground floor with a STRIPED awning over
    it. The first 3D shops were generic toy boxes with big overhanging roofs —
    nothing like it, so the two editions of one game looked like two games.
    This builder reproduces the painting's vocabulary in geometry, and the
    palette above is sampled from the painting itself.

    Kept two or three storeys and placed at the measured setback: the answer
    cards spread over the near pavement, and `scripts/probe-card-occlusion.mjs`
    stays the judge of whether anything stands in front of one.
    """
    parts = []
    depth = 9.0
    storey = 3.3
    height = floors * storey
    shell = mat(f'shell_{name}', colour, roughness=0.85)
    trim = mat(f'trim_{name}', trim_colour, roughness=0.82)
    frame = mat('townframe', PAL['townFrame'], roughness=0.7)
    glass = mat('townglass', PAL['townGlass'], roughness=0.25, metallic=0.1)
    fascia = mat('townfascia', PAL['townFascia'], roughness=0.75)

    parts.append(box(f'{name}_shell', (width, depth, height), (0, depth / 2, height / 2), shell, bevel=0.04))

    # The parapet: a slightly proud lip around a FLAT top, with a cornice band
    # under it — the painting's roofline, not a house's pitched roof.
    parts.append(box(f'{name}_parapet', (width + 0.36, depth + 0.36, 0.5),
                     (0, depth / 2, height + 0.25), trim, bevel=0.06))
    parts.append(box(f'{name}_cornice', (width + 0.24, 0.3, 0.34),
                     (0, -0.08, height - 0.28), trim, bevel=0.05))

    # Windows: a regular grid of cream frames with pale glass set into them,
    # exactly the rhythm the painting uses. Tall-ish, 2:3.
    columns = 3 if width > 9 else 2
    for floor in range(1, floors):
        z = floor * storey + storey / 2
        for col in range(columns):
            x = -width / 2 + width * (col + 0.5) / columns
            parts.append(box(f'{name}_fr_{floor}_{col}', (1.34, 0.12, 1.9), (x, -0.03, z), frame, bevel=0.03))
            parts.append(box(f'{name}_gl_{floor}_{col}', (1.06, 0.12, 1.6), (x, -0.08, z), glass))
            # The painting gives every window a little sill shadow.
            parts.append(box(f'{name}_sill_{floor}_{col}', (1.5, 0.2, 0.1), (x, -0.1, z - 1.0), frame))

    # Ground floor: white fascia band across the whole front, a wide shop
    # window, a door, and the striped awning.
    parts.append(box(f'{name}_fascia', (width, 0.16, 0.62), (0, -0.06, storey - 0.28), fascia, bevel=0.03))
    parts.append(box(f'{name}_shopfr', (width - 2.2, 0.12, 2.2), (-0.55, -0.03, 1.45), frame, bevel=0.03))
    parts.append(box(f'{name}_shopgl', (width - 2.6, 0.12, 1.9), (-0.55, -0.08, 1.45), glass))
    parts.append(box(f'{name}_door', (1.3, 0.16, 2.3), (width / 2 - 1.1, -0.06, 1.15),
                     mat('towndoor', PAL['doorWood'], roughness=0.8), bevel=0.03))

    # THE AWNING, striped: alternating slats of the shop's accent colour and
    # white, pitched down over the shopfront. This is the single strongest
    # signature of the 2D street, so it is built from real geometry rather
    # than painted on.
    awn_a = mat(f'awn_{name}', awning_colour, roughness=0.72)
    awn_b = mat('awnwhite', PAL['townFascia'], roughness=0.72)
    slats = max(6, int(width // 1.4))
    slat_w = (width - 0.6) / slats
    for i in range(slats):
        sx = -(width - 0.6) / 2 + slat_w * (i + 0.5)
        parts.append(box(
            f'{name}_awn_{i}', (slat_w, 1.35, 0.1), (sx, -0.72, 2.62),
            awn_a if i % 2 == 0 else awn_b, rot=(math.radians(-18), 0, 0),
        ))
    # A straight valance under the awning's lip, like the painting's scalloped
    # edge read from a distance.
    parts.append(box(f'{name}_valance', (width - 0.5, 0.08, 0.22), (0, -1.32, 2.28), awn_a))

    group = join(name, parts)
    smooth(group, angle=30)
    return group


def make_building(name, width, floors, depth, base_colour, brick=False):
    """A block with REAL window recesses, a shopfront and a parapet.

    Insets rather than a painted texture: at street level the depth of a window
    reveal is most of what makes a building read as built rather than printed.
    """
    parts = []
    height = floors * 3.3
    shell_m = mat(f'shell_{name}', base_colour, roughness=0.86 if brick else 0.78)
    parts.append(box(f'{name}_shell', (width, depth, height), (0, depth / 2, height / 2), shell_m))
    parts.append(box(f'{name}_parapet', (width + 0.3, depth + 0.3, 0.4),
                     (0, depth / 2, height + 0.2), mat(f'para_{name}', PAL['brickDark'] if brick else PAL['steel']), bevel=0.05))

    glass_m = mat('bldgglass', PAL['glass'], roughness=0.16, metallic=0.25)
    frame_m = mat('bldgframe', PAL['white'], roughness=0.6)
    columns = max(2, int(width // 3.2))
    for floor in range(1, floors):
        z = floor * 3.3 + 1.5
        for col in range(columns):
            x = -width / 2 + width * (col + 0.5) / columns
            # Recess, glass, then a frame standing proud of the wall.
            parts.append(box(f'{name}_rec_{floor}_{col}', (1.3, 0.3, 1.5), (x, -0.1, z), shell_m))
            parts.append(box(f'{name}_gls_{floor}_{col}', (1.25, 0.06, 1.45), (x, -0.2, z), glass_m))
            # A surround around the opening, not bars across it: a mullion and
            # transom at this scale read as a big white cross on every window.
            parts.append(box(f'{name}_fr_t_{floor}_{col}', (1.42, 0.06, 0.07), (x, -0.24, z + 0.76), frame_m))
            parts.append(box(f'{name}_fr_l_{floor}_{col}', (0.07, 0.06, 1.5), (x - 0.67, -0.24, z), frame_m))
            parts.append(box(f'{name}_fr_r_{floor}_{col}', (0.07, 0.06, 1.5), (x + 0.67, -0.24, z), frame_m))
            parts.append(box(f'{name}_sill_{floor}_{col}', (1.5, 0.15, 0.09), (x, -0.21, z - 0.78), frame_m))
        parts.append(box(f'{name}_band_{floor}', (width + 0.12, 0.2, 0.24), (0, -0.06, floor * 3.3), mat(f'band_{name}', PAL['cream'])))

    # Ground floor: shopfront glazing, a stall riser and an awning.
    bays = max(1, int(width // 4.5))
    for bay in range(bays):
        bx = -width / 2 + width * (bay + 0.5) / bays
        bw = width / bays - 0.5
        parts.append(box(f'{name}_shopg_{bay}', (bw, 0.08, 2.5), (bx, -0.22, 1.6), glass_m))
        parts.append(box(f'{name}_riser_{bay}', (bw + 0.2, 0.24, 0.5), (bx, -0.2, 0.25), mat('riser', PAL['navy'])))
        awning = mat(f'awn_{name}_{bay}', [PAL['orange'], PAL['mint'], PAL['red'], PAL['teal']][bay % 4], roughness=0.7)
        parts.append(box(f'{name}_awn_{bay}', (bw + 0.3, 1.1, 0.12), (bx, -0.7, 3.1), awning, rot=(math.radians(-12), 0, 0)))
        parts.append(box(f'{name}_sign_{bay}', (bw, 0.12, 0.5), (bx, -0.24, 3.6), mat('signband', PAL['navy'])))
    return join(name, parts)


# ================================================================= FURNITURE ==

def make_lamp():
    """An 8 m lamp with a TAPERED column and a swept arm — three angled
    segments approximating an arc, which is all a street lamp's curve is at
    game scale. Head has a glass underside so the light source reads."""
    steel = mat('lampsteel', PAL['steel'], roughness=0.42, metallic=0.5)
    parts = []
    pole = cone('lamp_col', 0.13, 8.0, (0, 0, 4.0), steel, verts=14)
    # primitive_cone gives radius2=0; rebuild taper by scaling top via a second cone is messy —
    # instead use a cylinder base + narrower upper section.
    parts.append(cylinder('lamp_lower', 0.12, 4.5, (0, 0, 2.25), steel, verts=14))
    parts.append(cylinder('lamp_upper', 0.085, 3.6, (0, 0, 6.2), steel, verts=14))
    bpy.data.objects.remove(pole, do_unlink=True)
    parts.append(cylinder('lamp_collar', 0.14, 0.16, (0, 0, 4.45), steel, verts=14))
    parts.append(cylinder('lamp_base', 0.2, 0.5, (0, 0, 0.25), steel, verts=14))

    # Swept arm: three segments stepping over the carriageway.
    parts.append(cylinder('lamp_arm_a', 0.06, 0.7, (0, -0.28, 8.05), steel, verts=10, rot=(math.radians(55), 0, 0)))
    parts.append(cylinder('lamp_arm_b', 0.055, 0.7, (0, -0.82, 8.28), steel, verts=10, rot=(math.radians(75), 0, 0)))
    parts.append(cylinder('lamp_arm_c', 0.05, 0.8, (0, -1.5, 8.36), steel, verts=10, rot=(math.radians(90), 0, 0)))
    parts.append(box('lamp_head', (0.36, 0.85, 0.16), (0, -1.95, 8.3), steel, bevel=0.05))
    parts.append(box('lamp_glass', (0.28, 0.7, 0.05), (0, -1.95, 8.2),
                     mat('lampglow', PAL['lamp'], roughness=0.3, emission=PAL['lamp'], strength=1.2), bevel=0.02))
    group = join('lamp', parts, origin=(0, 0, 0))
    smooth(group)
    return group


def make_parked_car(name, colour):
    """
    A parked hatchback, for the laybys: the cheapest thing that reads as
    "other people's cars live on this street". Scenery only — never driven,
    never an obstacle — so it is a dozen boxes and four cylinders. Faces the
    road (+Y at export, like the shops).
    """
    paint = mat(f'park_{name}', colour, roughness=0.35, metallic=0.2)
    dark = mat('parkglass', srgb(0x22314A), roughness=0.2, metallic=0.1)
    tyre = mat('parktyre', PAL['tyre'], roughness=0.9)
    parts = [
        box(f'{name}_body', (3.6, 1.62, 0.62), (0, 0, 0.55), paint, bevel=0.1),
        box(f'{name}_cabin', (2.0, 1.5, 0.55), (-0.15, 0, 1.1), paint, bevel=0.12),
        box(f'{name}_glass', (1.7, 1.54, 0.34), (-0.15, 0, 1.12), dark, bevel=0.08),
    ]
    for dx in (-1.15, 1.15):
        for dy in (-0.72, 0.72):
            parts.append(cylinder(f'{name}_w_{dx}_{dy}', 0.3, 0.22, (dx, dy, 0.3), tyre, verts=12, rot=(math.radians(90), 0, 0)))
    group = join(name, parts)
    smooth(group, angle=40)
    return group


def make_traffic_light():
    """
    A pedestrian-crossing signal for the zebra tiles: a pole with a two-lamp
    head, green lit. Scenery with a teaching job — a crossing that has ONLY
    paint reads as decoration; a signal head says "people cross here" from
    fifty metres.
    """
    steel = mat('siglsteel', PAL['steel'], roughness=0.45, metallic=0.5)
    housing = mat('siglbox', srgb(0x2B3440), roughness=0.6)
    parts = [
        cylinder('sigl_pole', 0.09, 3.4, (0, 0, 1.7), steel, verts=12),
        cylinder('sigl_base', 0.16, 0.3, (0, 0, 0.15), steel, verts=12),
        box('sigl_head', (0.34, 0.3, 0.86), (0, 0, 3.6), housing, bevel=0.04),
        # Lamps: red above, green below and LIT — the street is a safe one.
        sphere('sigl_red', 0.1, (0, -0.14, 3.82), mat('siglred', PAL['red'], roughness=0.4)),
        sphere('sigl_green', 0.1, (0, -0.14, 3.4),
               mat('siglgreen', PAL['mint'], roughness=0.35, emission=PAL['mint'], strength=1.6)),
    ]
    group = join('traffic_light', parts, origin=(0, 0, 0))
    smooth(group, angle=50)
    return group


def make_railing():
    """
    One tile's worth of pedestrian guard rail, for the outer edge of the pavement.

    This is what replaced the frontages. The street used to be lined both sides
    with five storeys of brick and a tree every twenty-four metres, and from the
    fixed rear camera the near-side buildings stood between the lens and
    everything the child was being asked to look at — including, measurably, the
    third answer card, which floats eight metres ahead of the car in the middle
    of the road. A railing gives the street an edge and a sense of scale, and at
    1.02 m tall it can never be in front of anything that matters.

    Exactly TILE long, so one section serves one road tile and a run of them
    butts up with no spacing arithmetic at the far end. Modelled along Blender X.
    """
    steel = mat('railsteel', PAL['steel'], roughness=0.4, metallic=0.55)
    accent = mat('railtop', PAL['mint'], roughness=0.45, metallic=0.2)
    parts = []
    # Posts every two metres, the end pair set in a little so butted sections
    # do not put two posts in the same place.
    span = TILE / 2 - 0.5
    count = 7
    for i in range(count):
        x = -span + (2 * span) * i / (count - 1)
        parts.append(box(f'rail_post_{i}', (0.08, 0.08, 1.02), (x, 0, 0.51), steel, bevel=0.014))
        parts.append(box(f'rail_foot_{i}', (0.17, 0.17, 0.05), (x, 0, 0.025), steel))
    # Top rail carries the brand colour: it is the only line of it at eye level.
    parts.append(box('rail_top', (TILE, 0.09, 0.075), (0, 0, 1.0), accent, bevel=0.022))
    parts.append(box('rail_mid', (TILE, 0.06, 0.05), (0, 0, 0.58), steel, bevel=0.014))
    group = join('railing', parts, origin=(0, 0, 0))
    smooth(group, angle=40)
    return group


def make_tree():
    """A street tree with a lobed canopy: four smooth-shaded spheres in two
    greens, over a leaning trunk. Reads soft instead of crystalline."""
    trunk = cylinder('tree_trunk', 0.15, 2.9, (0.04, 0, 1.45), mat('trunk', PAL['trunk'], roughness=0.92), verts=10, rot=(0, math.radians(3), 0))
    lobes = []
    for i, (dx, dy, dz, r, dark_leaf) in enumerate((
            (0.0, 0.0, 3.8, 1.35, False),
            (0.75, 0.35, 3.2, 0.95, True),
            (-0.7, -0.25, 3.25, 0.9, True),
            (0.1, 0.65, 3.1, 0.8, False),
    )):
        lobe = sphere('tree_lobe_' + str(i), r, (dx, dy, dz), mat('leafdark' if dark_leaf else 'leaf', PAL['leafDark'] if dark_leaf else PAL['leaf'], roughness=0.88), segments=16, rings=10)
        lobes.append(lobe)
    group = join('tree', [trunk] + lobes, origin=(0, 0, 0))
    smooth(group, angle=80)
    return group


def make_bench():
    wood = mat('benchwood', PAL['trunk'], roughness=0.8)
    steel = mat('benchsteel', PAL['steel'], roughness=0.45, metallic=0.5)
    parts = [
        box('bench_seat', (1.9, 0.52, 0.1), (0, 0, 0.62), wood, bevel=0.02),
        box('bench_back', (1.9, 0.1, 0.5), (0, -0.21, 0.88), wood, bevel=0.02),
        box('bench_leg_l', (0.12, 0.5, 0.62), (-0.85, 0, 0.31), steel),
        box('bench_leg_r', (0.12, 0.5, 0.62), (0.85, 0, 0.31), steel),
    ]
    return join('bench', parts, origin=(0, 0, 0))


def make_bin():
    body = cylinder('bin_body', 0.3, 0.9, (0, 0, 0.45), mat('binbody', PAL['navy'], roughness=0.6), verts=16)
    lid = cylinder('bin_lid', 0.34, 0.1, (0, 0, 0.95), mat('binlid', PAL['steel'], roughness=0.4, metallic=0.6), verts=16)
    return join('bin', [body, lid], origin=(0, 0, 0))


# ===================================================================== PROPS ==

def make_scooter():
    """A parked step-through scooter, curved: apron and cowl are squashed
    spheres, the seat a capsule, wheels proper tori. Leans on its stand."""
    paint = mat('scooterpaint', PAL['mint'], roughness=0.28, metallic=0.25)
    dark = mat('scooterdark', PAL['tyre'], roughness=0.85)
    steel = mat('scootersteel', PAL['steel'], roughness=0.35, metallic=0.6)
    parts = []

    for tag, x in (('f', 0.5), ('r', -0.46)):
        tyre = torus('sc_w_' + tag, 0.22, 0.07, (x, 0, 0.24), dark, rot=(math.radians(90), 0, 0), major_seg=20, minor_seg=10)
        parts.append(tyre)
        hub = cylinder('sc_h_' + tag, 0.1, 0.08, (x, 0, 0.24), steel, verts=14, rot=(math.radians(90), 0, 0))
        parts.append(hub)

    apron = sphere('sc_apron', 0.4, (0.4, 0, 0.62), paint)
    apron.scale = (0.5, 0.5, 1.0)
    parts.append(apron)
    board = box('sc_board', (0.7, 0.34, 0.1), (-0.02, 0, 0.36), paint, bevel=0.05)
    parts.append(board)
    cowl = sphere('sc_cowl', 0.34, (-0.42, 0, 0.6), paint)
    cowl.scale = (0.9, 0.62, 0.72)
    parts.append(cowl)
    seat = sphere('sc_seat', 0.3, (-0.32, 0, 0.84), dark)
    seat.scale = (1.15, 0.6, 0.32)
    parts.append(seat)

    parts.append(cylinder('sc_stem', 0.045, 0.62, (0.48, 0, 0.95), steel, verts=12, rot=(0, math.radians(-16), 0)))
    parts.append(cylinder('sc_bars', 0.035, 0.56, (0.54, 0, 1.24), dark, verts=10, rot=(math.radians(90), 0, 0)))
    for side in (1, -1):
        parts.append(cylinder('sc_grip_' + str(side), 0.045, 0.12, (0.54, side * 0.26, 1.24), dark, verts=10, rot=(math.radians(90), 0, 0)))
        stalk = cylinder('sc_mstalk_' + str(side), 0.015, 0.16, (0.5, side * 0.2, 1.36), steel, verts=8)
        parts.append(stalk)
        mirror = sphere('sc_mirror_' + str(side), 0.05, (0.5, side * 0.2, 1.45), dark)
        mirror.scale = (0.5, 1.0, 1.2)
        parts.append(mirror)
    basket = box('sc_basket', (0.3, 0.34, 0.24), (-0.6, 0, 0.98), steel, bevel=0.04)
    parts.append(basket)
    parts.append(cylinder('sc_stand', 0.02, 0.3, (-0.1, 0.14, 0.16), steel, verts=8, rot=(math.radians(20), 0, 0)))

    group = join('scooter', parts, origin=(0, 0, 0))
    group.rotation_euler = (math.radians(9), 0, 0)
    smooth(group)
    return group


def make_barrier():
    """One roadworks panel. The game lines several up to close a lane."""
    red = mat('barrierred', PAL['red'], roughness=0.66)
    white = mat('barrierwhite', PAL['white'], roughness=0.66)
    steel = mat('barriersteel', PAL['steel'], roughness=0.4, metallic=0.55)
    parts = []
    for i in range(6):
        top = red if i % 2 == 0 else white
        low = white if i % 2 == 0 else red
        parts.append(box(f'bar_t_{i}', (0.3, 0.1, 0.22), (-0.75 + i * 0.3, 0, 0.95), top))
        parts.append(box(f'bar_b_{i}', (0.3, 0.1, 0.22), (-0.75 + i * 0.3, 0, 0.66), low))
    for side in (-1, 1):
        parts.append(box(f'bar_leg_{side}', (0.1, 0.1, 1.0), (side * 0.8, 0, 0.5), steel))
        parts.append(box(f'bar_foot_{side}', (0.36, 0.5, 0.08), (side * 0.8, 0, 0.04), steel, bevel=0.02))
    return join('barrier', parts, origin=(0, 0, 0))


def make_cone():
    body = cone('cone_body', 0.24, 0.68, (0, 0, 0.37), mat('conebody', PAL['darkOrange'], roughness=0.68), verts=16)
    stripe = cone('cone_stripe', 0.17, 0.16, (0, 0, 0.46), mat('conestripe', PAL['white'], roughness=0.66), verts=16)
    base = box('cone_base', (0.48, 0.48, 0.07), (0, 0, 0.035), mat('conebase', PAL['darkOrange']), bevel=0.02)
    return join('cone', [body, stripe, base], origin=(0, 0, 0))


def make_sign(name, face_colour, glyph_colour):
    steel = mat('signpost', PAL['steel'], roughness=0.4, metallic=0.6)
    parts = [
        cylinder(f'{name}_post', 0.055, 2.4, (0, 0, 1.2), steel, verts=12),
        box(f'{name}_face', (1.0, 0.07, 0.74), (0, 0, 2.3), mat(f'{name}_facem', face_colour, roughness=0.5), bevel=0.03),
        box(f'{name}_inner', (0.84, 0.03, 0.58), (0, -0.05, 2.3), mat('signwhite', PAL['white'], roughness=0.55)),
        box(f'{name}_glyph_a', (0.36, 0.03, 0.28), (0, -0.08, 2.32), mat(f'{name}_glyphm', glyph_colour)),
        box(f'{name}_glyph_b', (0.36, 0.03, 0.07), (0, -0.09, 2.32), mat('signnavy', PAL['navy'])),
    ]
    return join(name, parts, origin=(0, 0, 0))


def make_ball():
    ball = sphere('ball_body', 0.12, (0, 0, 0.12), mat('ballwhite', PAL['white'], roughness=0.5), segments=16, rings=10)
    return join('ball', [ball], origin=(0, 0, 0))


# ================================================================== VEHICLES ==

# The player's car lives in its own file: it is by far the most detailed asset
# here and it earns the separation. It is exec'd rather than imported because
# Blender's bundled Python has no idea where this project is on disk when the
# launcher starts it headless from an arbitrary working directory.
def _load_module(name):
    source = pathlib.Path(__file__).with_name(name)
    exec(compile(source.read_text(encoding='utf8'), str(source), 'exec'), globals())


_load_module('be6.py')
# The ambulance borrows be6's loft, prism, alloy_wheel and bake_modifiers, so it
# has to come second.
_load_module('ambulance.py')
_load_module('parking_assets.py')


def wheel(name, radius, width, loc):
    """A wheel whose axle runs across the road. The game spins these by name, so
    the origin must sit exactly on the hub."""
    tyre = cylinder(f'{name}_tyre', radius, width, loc, mat('tyre', PAL['tyre'], roughness=0.92), verts=28, rot=(math.radians(90), 0, 0))
    hub = cylinder(f'{name}_hub', radius * 0.55, width * 1.04, loc, mat('hub', PAL['steel'], roughness=0.3, metallic=0.8), verts=16, rot=(math.radians(90), 0, 0))
    # Spokes have to reach PAST the hub or the wheel is a plain disc: at
    # radius * 1.0 they ended inside the hub cylinder, so a rotating wheel
    # looked identical at every angle and the 2D sprite strip rendered four
    # copies of the same frame.
    spokes = []
    for i in range(4):
        spokes.append(box(
            f'{name}_spoke_{i}', (radius * 0.13, width * 1.06, radius * 1.62), loc,
            mat('spoke', PAL['white'], roughness=0.35, metallic=0.4),
            rot=(0, math.radians(i * 45), 0),
        ))
    return join(name, [tyre, hub] + spokes, origin=loc)


def wedge(name, size, loc=(0, 0, 0), material=None, bevel=0.0, front_in=0.0, back_in=0.0):
    """A box whose TOP face is pulled inward along X - a car's greenhouse.

    Modelling the cabin as a plain box and leaning separate slabs against it
    left the windscreen reading as a fin stuck to a pickup. Tapering the box
    itself gives the silhouette a car actually has, and the glass can then be
    laid exactly on the faces the taper creates.
    """
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    top = max(v.co.z for v in bm.verts)
    for vert in bm.verts:
        if abs(vert.co.z - top) > 1e-5:
            continue
        if vert.co.x > 0:
            vert.co.x -= front_in
        else:
            vert.co.x += back_in
    bm.to_mesh(mesh)
    bm.free()
    obj.location = loc
    if material:
        obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('Bevel', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 3
        modifier.limit_method = 'ANGLE'
    return obj


def make_van_procedural():
    """The autonomous delivery van, 5.3 m, remodelled for curvature.

    Built the way a real van body reads: low skirt, curved-roof cargo box, a
    raked cab stepping down from it, bumpers, grille, light clusters, door
    seams and mirrors — every large panel bevelled into a curve and shaded
    smooth. Wheels stay separate objects (van_wheel_*) for the runtime.
    """
    L, W = 5.3, 2.0
    paint = mat('vanpaint', PAL['white'], roughness=0.28, metallic=0.12)
    trim = mat('vantrim', PAL['navy'], roughness=0.55)
    glass = mat('vanglass', PAL['glass'], roughness=0.08, metallic=0.3)
    dark = mat('vanunder', srgb(0x2B3038), roughness=0.82)
    steel = mat('vansteel', PAL['steel'], roughness=0.35, metallic=0.6)

    body = []
    body.append(box('van_skirt', (L * 0.98, W - 0.1, 0.4), (0, 0, 0.5), dark, bevel=0.08))
    body.append(box('van_bumper_f', (0.3, W - 0.04, 0.34), (L * 0.5, 0, 0.6), trim, bevel=0.1))
    body.append(box('van_bumper_r', (0.24, W - 0.04, 0.34), (-L * 0.5, 0, 0.6), trim, bevel=0.1))

    # Cargo box with a genuinely curved roof: heavy bevel plus a half-round cap.
    body.append(box('van_cargo', (L * 0.62, W, 1.66), (-L * 0.18, 0, 1.6), paint, bevel=0.16))
    cap = cylinder('van_roofcap', W / 2 - 0.06, L * 0.6, (-L * 0.18, 0, 2.36), paint, verts=24, rot=(0, math.radians(90), 0))
    # After the 90-degree Y rotation the cylinder's LOCAL X points at the world
    # ceiling, so that is the axis to flatten. Squashing local Z (the first
    # attempt) shortened the cap along the van instead and left a bulbous tube.
    cap.scale = (0.3, 1.0, 1.0)
    body.append(cap)

    body.append(box('van_cab', (L * 0.28, W - 0.05, 1.18), (L * 0.33, 0, 1.36), paint, bevel=0.14))
    body.append(box('van_nose', (L * 0.18, W - 0.12, 0.62), (L * 0.44, 0, 0.92), paint, bevel=0.12))
    screen = box('van_screen', (0.1, W - 0.3, 0.94), (L * 0.44, 0, 1.62), glass, rot=(0, math.radians(22), 0), bevel=0.04)
    body.append(screen)
    body.append(box('van_side_l', (L * 0.24, 0.05, 0.66), (L * 0.31, W / 2 - 0.01, 1.68), glass, bevel=0.04))
    body.append(box('van_side_r', (L * 0.24, 0.05, 0.66), (L * 0.31, -W / 2 + 0.01, 1.68), glass, bevel=0.04))

    for i in range(3):
        body.append(box('van_grille_' + str(i), (0.04, 0.9, 0.05), (L * 0.505, 0, 0.82 + i * 0.1), trim))
    for tag, y in (('l', W / 2 - 0.28), ('r', -W / 2 + 0.28)):
        body.append(box('van_hl_house_' + tag, (0.1, 0.4, 0.24), (L * 0.5, y, 1.06), steel, bevel=0.05))

    body.append(box('van_band', (L * 0.63, W + 0.02, 0.28), (-L * 0.18, 0, 1.0), trim))
    for side in (1, -1):
        body.append(box('van_seam_' + str(side), (0.015, 0.02, 1.3), (L * 0.19, side * (W / 2 + 0.002), 1.3), dark))
        body.append(box('van_badge_' + str(side), (1.4, 0.03, 0.46), (-L * 0.18, side * (W / 2 + 0.015), 1.86), mat('vanbadge', PAL['orange'], roughness=0.4)))
        body.append(box('van_mirror_arm_' + str(side), (0.05, 0.22, 0.05), (L * 0.42, side * (W / 2 + 0.12), 1.82), trim))
        body.append(box('van_mirror_' + str(side), (0.06, 0.1, 0.22), (L * 0.42, side * (W / 2 + 0.24), 1.82), trim, bevel=0.03))
    body.append(box('van_step', (L * 0.2, W - 0.3, 0.06), (L * 0.33, 0, 0.32), steel, bevel=0.02))

    body.append(cylinder('van_pod_base', 0.3, 0.14, (L * 0.08, 0, 2.56), trim, verts=24))
    body.append(sphere('van_pod_dome', 0.24, (L * 0.08, 0, 2.66), mat('vandome', srgb(0x1B2B4D), roughness=0.15, metallic=0.4)))
    body.append(cylinder('van_pod_ant', 0.015, 0.3, (L * 0.02, 0, 2.86), steel, verts=8))
    body.append(box('van_sensor_bar', (0.06, 1.2, 0.08), (L * 0.5, 0, 1.32), mat('vansensor', srgb(0x0D2360), roughness=0.2, emission=srgb(0x17BDE0), strength=0.8), bevel=0.03))
    body.append(box('van_plate', (0.04, 0.5, 0.13), (L * 0.515, 0, 0.66), mat('plate', PAL['yellow'], roughness=0.5)))

    shell = join('van_body', body, origin=(0, 0, 0))
    smooth(shell)

    lights = [
        box('van_hl_l', (0.1, 0.32, 0.18), (L * 0.505, W / 2 - 0.28, 1.06),
            mat('headlight', PAL['lamp'], roughness=0.2, emission=(1, 0.95, 0.82), strength=1.3), bevel=0.04),
        box('van_hl_r', (0.1, 0.32, 0.18), (L * 0.505, -W / 2 + 0.28, 1.06),
            mat('headlight', PAL['lamp'], roughness=0.2, emission=(1, 0.95, 0.82), strength=1.3), bevel=0.04),
    ]
    smooth(join('van_lights', lights, origin=(0, 0, 0)))

    brakes = [
        box('van_bl_l', (0.08, 0.3, 0.34), (-L * 0.505, W / 2 - 0.24, 1.12), mat('brakelamp', PAL['red'], roughness=0.3, emission=PAL['red'], strength=0.4), bevel=0.04),
        box('van_bl_r', (0.08, 0.3, 0.34), (-L * 0.505, -W / 2 + 0.24, 1.12), mat('brakelamp', PAL['red'], roughness=0.3, emission=PAL['red'], strength=0.4), bevel=0.04),
    ]
    smooth(join('van_brakes', brakes, origin=(0, 0, 0)))

    for tag, x, y in (('fl', L * 0.31, W / 2 - 0.14), ('fr', L * 0.31, -W / 2 + 0.14),
                      ('rl', -L * 0.31, W / 2 - 0.14), ('rr', -L * 0.31, -W / 2 + 0.14)):
        wheel('van_wheel_' + tag, 0.4, 0.28, (x, y, 0.4))

    ind = mat('indicator', PAL['orange'], roughness=0.35, emission=PAL['orange'], strength=0.3)
    for tag, x, y in (('fl', L * 0.49, W / 2 - 0.02), ('fr', L * 0.49, -W / 2 + 0.02),
                      ('rl', -L * 0.47, W / 2 - 0.02), ('rr', -L * 0.47, -W / 2 + 0.02)):
        box('van_ind_' + tag, (0.1, 0.14, 0.14), (x, y, 1.06), ind, bevel=0.04)
    return shell


def make_gate():
    """A boom gate: post, control box and a striped arm hinged at the post.

    The arm is its own object (gate_arm) with its origin ON the hinge, so the
    runtime raises it by rotating one node.
    """
    steel = mat('gatesteel', PAL['steel'], roughness=0.4, metallic=0.55)
    red = mat('gatered', PAL['red'], roughness=0.6)
    white = mat('gatewhite', PAL['white'], roughness=0.6)
    post = [
        cylinder('gate_post', 0.09, 1.1, (0, 0, 0.55), steel, verts=14),
        box('gate_house', (0.3, 0.26, 0.34), (0, 0, 1.05), mat('gatebox', PAL['navy'], roughness=0.5), bevel=0.05),
        box('gate_base', (0.42, 0.42, 0.08), (0, 0, 0.04), steel, bevel=0.02),
    ]
    smooth(join('gate_body', post, origin=(0, 0, 0)))

    arm_parts = [box('gate_counter', (0.34, 0.14, 0.14), (0.25, 0, 0), red, bevel=0.04)]
    for i in range(6):
        colour = red if i % 2 == 0 else white
        arm_parts.append(box('gate_seg_' + str(i), (0.62, 0.1, 0.12), (-0.5 - i * 0.62, 0, 0), colour, bevel=0.03))
    arm = join('gate_arm', arm_parts, origin=(0, 0, 0))
    arm.location = (0, 0, 1.05)
    smooth(arm)
    return None


CAR_GLB = pathlib.Path(r"C:/Users/sumit/Downloads/cartoon_car.glb")
CAR_LENGTH = 4.6


def make_van_from_glb():
    """Import, tame and wire up the user's cartoon car as the vehicle."""
    if not CAR_GLB.exists():
        # The car is an asset choice, not a dependency: without the file the
        # build still produces a working kit with the procedural van.
        make_van_procedural()
        return

    import mathutils

    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(CAR_GLB))
    imported = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in imported if o.type == 'MESH']

    # ---- drop the baked shadow blob ---------------------------------------
    for obj in list(meshes):
        mats = [m.name for m in obj.data.materials if m]
        if any(name.startswith('Pure_black') for name in mats):
            meshes.remove(obj)
            bpy.data.objects.remove(obj, do_unlink=True)

    # ---- decimate the heavy meshes ----------------------------------------
    # Wheels are protected: a tyre collapsed to 8% is a lumpy polygon that
    # visibly thumps as it turns. They keep enough faces to stay circular and
    # the BODY absorbs the whole reduction budget instead.
    def is_wheel(obj):
        return 'wheel' in obj.name.lower()

    body_total = sum(len(o.data.polygons) for o in meshes if not is_wheel(o))
    budget = 11000
    for obj in meshes:
        faces = len(obj.data.polygons)
        if faces < 1200:
            continue
        modifier = obj.modifiers.new('Dec', 'DECIMATE')
        modifier.ratio = 0.32 if is_wheel(obj) else max(0.06, min(0.5, budget / body_total))
        # APPLY it now: bpy.ops.object.join keeps only the active object's
        # modifiers, so a decimate left pending on the others would be silently
        # discarded and 191k faces would sail into the export.
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier='Dec')

    # ---- shrink textures ----------------------------------------------------
    for image in bpy.data.images:
        if image.size[0] > 512 or image.size[1] > 512:
            image.scale(512, max(1, round(512 * image.size[1] / max(1, image.size[0]))))

    # ---- flatten the empty hierarchy ----------------------------------------
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    # Some imports were already deleted (the shadow blob); a removed object's
    # Python handle throws on ANY attribute access, so filter by liveness first.
    live = {o.name: o for o in bpy.data.objects}
    for obj in list(imported):
        if obj not in meshes and any(o is obj for o in live.values()):
            if obj.type == 'EMPTY':
                bpy.data.objects.remove(obj, do_unlink=True)

    # ---- gather into body + wheels ------------------------------------------
    def is_named(obj, key):
        return key in obj.name.lower()

    fl = [o for o in meshes if is_named(o, 'front left wheel')]
    fr = [o for o in meshes if is_named(o, 'front right wheel')]
    rear = [o for o in meshes if is_named(o, 'rear wheels')]
    body = [o for o in meshes if o not in fl + fr + rear]

    def join_group(name, objs):
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objs:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        joined = bpy.context.active_object
        joined.name = name
        return joined

    car_body = join_group('van_body', body)
    wheel_fl = join_group('van_wheel_fl', fl)
    wheel_fr = join_group('van_wheel_fr', fr)
    wheel_rear = join_group('van_wheel_rl', rear)
    parts = [car_body, wheel_fl, wheel_fr, wheel_rear]

    # ---- orient, scale, ground ----------------------------------------------
    # Freeze current transforms so vertex data is in world space.
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = car_body
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    def bounds(obj):
        lo = [1e9] * 3
        hi = [-1e9] * 3
        for vertex in obj.data.vertices:
            for i in range(3):
                lo[i] = min(lo[i], vertex.co[i])
                hi[i] = max(hi[i], vertex.co[i])
        return lo, hi

    lo, hi = bounds(car_body)
    # The long axis is Y. Which end is the front? The front wheels know.
    (flo, fhi) = bounds(wheel_fl)
    front_y = (flo[1] + fhi[1]) / 2
    mid_y = (lo[1] + hi[1]) / 2
    # Rotate so the front points at +X: -90 deg about Z maps +Y to +X.
    sign = 1.0 if front_y > mid_y else -1.0
    rot = mathutils.Matrix.Rotation(sign * -math.pi / 2, 4, 'Z')
    scale = CAR_LENGTH / (hi[1] - lo[1])
    scale_m = mathutils.Matrix.Scale(scale, 4)
    for obj in parts:
        obj.data.transform(scale_m @ rot)

    # Ground and centre.
    lo, hi = bounds(car_body)
    for w in (wheel_fl, wheel_fr, wheel_rear):
        wlo, whi = bounds(w)
        lo = [min(lo[i], wlo[i]) for i in range(3)]
        hi = [max(hi[i], whi[i]) for i in range(3)]
    shift = mathutils.Matrix.Translation((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]))
    for obj in parts:
        obj.data.transform(shift)
        obj.matrix_world = mathutils.Matrix.Identity(4)

    # ---- wheel origins on their axles ----------------------------------------
    # The axle passes through the wheel's TRUE centre. Bounding boxes lie after
    # decimation (a lump on one side shifts the box), so use the exact bbox in
    # X/Z from the round profile but verify against the vertex centroid; and
    # smooth-shade the wheels so what faces survive still read as a curve.
    radius = 0.4
    for w in (wheel_fl, wheel_fr, wheel_rear):
        wlo, whi = bounds(w)
        n = len(w.data.vertices)
        cx = sum(v.co[0] for v in w.data.vertices) / n
        cy = sum(v.co[1] for v in w.data.vertices) / n
        centre = (
            (wlo[0] + whi[0]) / 2 * 0.5 + cx * 0.5,
            (wlo[1] + whi[1]) / 2 * 0.5 + cy * 0.5,
            (wlo[2] + whi[2]) / 2,
        )
        back = mathutils.Matrix.Translation((-centre[0], -centre[1], -centre[2]))
        w.data.transform(back)
        w.location = centre
        radius = (whi[2] - wlo[2]) / 2
        smooth(w, angle=42)
    smooth(car_body, angle=48)

    # ---- graft the game parts -------------------------------------------------
    blo, bhi = bounds(car_body)
    W = bhi[1] - blo[1]
    roof = bhi[2]
    nose = bhi[0]
    tail = blo[0]

    pod = [
        cylinder('van_pod_base', 0.22, 0.1, (-0.4, 0, roof + 0.04), mat('vantrim', PAL['navy'], roughness=0.55), verts=20),
        sphere('van_pod_dome', 0.17, (-0.4, 0, roof + 0.12), mat('vandome', srgb(0x1B2B4D), roughness=0.15, metallic=0.4)),
        cylinder('van_pod_ant', 0.012, 0.22, (-0.52, 0, roof + 0.26), mat('vansteel', PAL['steel'], roughness=0.35, metallic=0.6), verts=8),
    ]
    pod_join = join('van_pod', pod, origin=(0, 0, 0))
    smooth(pod_join)
    # Fold the pod into the body so the runtime sees one van_body.
    bpy.ops.object.select_all(action='DESELECT')
    car_body.select_set(True)
    pod_join.select_set(True)
    bpy.context.view_layer.objects.active = car_body
    bpy.ops.object.join()
    bpy.context.active_object.name = 'van_body'
    car_body = bpy.context.active_object

    lights = [
        box('van_hl_l', (0.06, 0.24, 0.12), (nose - 0.02, W * 0.3, radius + 0.34),
            mat('headlight', PAL['lamp'], roughness=0.2, emission=(1, 0.95, 0.82), strength=1.3), bevel=0.03),
        box('van_hl_r', (0.06, 0.24, 0.12), (nose - 0.02, -W * 0.3, radius + 0.34),
            mat('headlight', PAL['lamp'], roughness=0.2, emission=(1, 0.95, 0.82), strength=1.3), bevel=0.03),
    ]
    smooth(join('van_lights', lights, origin=(0, 0, 0)))
    brakes = [
        box('van_bl_l', (0.05, 0.22, 0.12), (tail + 0.02, W * 0.3, radius + 0.4),
            mat('brakelamp', PAL['red'], roughness=0.3, emission=PAL['red'], strength=0.4), bevel=0.03),
        box('van_bl_r', (0.05, 0.22, 0.12), (tail + 0.02, -W * 0.3, radius + 0.4),
            mat('brakelamp', PAL['red'], roughness=0.3, emission=PAL['red'], strength=0.4), bevel=0.03),
    ]
    smooth(join('van_brakes', brakes, origin=(0, 0, 0)))
    ind = mat('indicator', PAL['orange'], roughness=0.35, emission=PAL['orange'], strength=0.3)
    for tag, x, y in (('fl', nose - 0.14, W * 0.42), ('fr', nose - 0.14, -W * 0.42),
                      ('rl', tail + 0.14, W * 0.42), ('rr', tail + 0.14, -W * 0.42)):
        box('van_ind_' + tag, (0.07, 0.1, 0.1), (x, y, radius + 0.36), ind, bevel=0.03)

    print('CAR_OK radius=%.3f width=%.2f length=%.2f roof=%.2f' % (radius, W, bhi[0] - blo[0], roof))
    global CAR_RADIUS
    CAR_RADIUS = radius


CAR_RADIUS = 0.4


def make_simple_car():
    """The autonomous car, 4.35 m, exporting the van_* contract names.

    Built as a real car is read: a rounded lower body with a shoulder line,
    a greenhouse tapered at both ends, wheels large enough for the body sitting
    in arches that follow them, and the small things the eye actually checks —
    lamp housings, a grille, door seams, handles, mirrors on stalks.
    """
    L, W = 4.20, 1.86
    paint = mat('carpaint', PAL['white'], roughness=0.24, metallic=0.16)
    trim = mat('cartrim', PAL['navy'], roughness=0.5)
    # A darker tint: at the pale end the windscreen read as a flat panel stuck
    # on the roof rather than as glass set into the body.
    glass = mat('carglass', srgb(0x46617F), roughness=0.06, metallic=0.4)
    dark = mat('carunder', srgb(0x23272E), roughness=0.85)
    steel = mat('carsteel', PAL['steel'], roughness=0.32, metallic=0.65)
    lens = mat('carlens', PAL['lamp'], roughness=0.12,
               emission=(1, 0.95, 0.84), strength=1.1)

    # ---- proportions, kept as names so the glass can be derived from them ---
    # The body's lower edge sits BELOW the axle line, so the wheels read as set
    # into the car rather than bolted under a chassis — the single thing that
    # made the first attempt look like a flat-bed truck on castors.
    BODY_TOP = 1.06
    BODY_BOT = 0.28
    # A long, full-width upper volume rather than a narrow cap: at half the
    # length and 20 cm narrower than the body it read as a cabin bolted onto a
    # flat-bed, whatever the stance underneath.
    CAB_L, CAB_H = L * 0.72, 0.52
    CAB_X = -0.16
    FRONT_IN, BACK_IN = 0.76, 0.46
    WHEEL_R, WHEEL_W = 0.36, 0.25
    AXLE_F, AXLE_R = L * 0.305, -L * 0.305
    TRACK = W / 2 - 0.11
    cab_top = BODY_TOP + CAB_H
    nose_base = CAB_X + CAB_L / 2
    tail_base = CAB_X - CAB_L / 2

    body = []
    # Main volume, generously bevelled so the shoulders are curves.
    body.append(box('car_body', (L, W, BODY_TOP - BODY_BOT), (0, 0, (BODY_TOP + BODY_BOT) / 2),
                    paint, bevel=0.21))
    # Rocker below the doors, and the shadowed underbody.
    body.append(box('car_rocker', (L * 0.80, W + 0.005, 0.16), (0, 0, 0.36), dark, bevel=0.05))
    # A bonnet crease and a boot lip, so neither end is a plain slab.
    body.append(box('car_bonnet', (L * 0.15, W - 0.42, 0.05), (L * 0.40, 0, BODY_TOP), paint, bevel=0.02))

    cabin = wedge('car_cabin', (CAB_L, W - 0.07, CAB_H), (CAB_X, 0, BODY_TOP + CAB_H / 2),
                  paint, bevel=0.19, front_in=FRONT_IN, back_in=BACK_IN)
    body.append(cabin)

    # Glass laid on the faces the taper creates, a little short so the corners
    # tuck under the bevel rather than poking through the roofline.
    screen_len = math.hypot(FRONT_IN, CAB_H)
    screen_ang = math.atan2(FRONT_IN, CAB_H)
    body.append(box('car_glass_f', (0.06, W - 0.32, screen_len - 0.04),
                    (nose_base - FRONT_IN / 2, 0, BODY_TOP + CAB_H / 2), glass,
                    rot=(0, -screen_ang, 0)))
    rear_len = math.hypot(BACK_IN, CAB_H)
    rear_ang = math.atan2(BACK_IN, CAB_H)
    body.append(box('car_glass_r', (0.06, W - 0.32, rear_len - 0.04),
                    (tail_base + BACK_IN / 2, 0, BODY_TOP + CAB_H / 2), glass,
                    rot=(0, rear_ang, 0)))

    flank = (W - 0.07) / 2
    for side in (1, -1):
        # Side glass, with a dark pillar frame behind it so it reads as a window
        # in a body rather than a sticker on a box.
        body.append(box('car_frame%d' % side, (CAB_L - FRONT_IN - BACK_IN + 0.34, 0.035, CAB_H * 0.66),
                        (CAB_X - 0.03, side * (flank - 0.035), BODY_TOP + CAB_H * 0.52), trim))
        body.append(box('car_glass_s%d' % side, (CAB_L - FRONT_IN - BACK_IN + 0.26, 0.04, CAB_H * 0.54),
                        (CAB_X - 0.03, side * (flank - 0.012), BODY_TOP + CAB_H * 0.53), glass))
        # Mirror on a stalk.
        body.append(box('car_stalk%d' % side, (0.05, 0.09, 0.04),
                        (nose_base - FRONT_IN + 0.04, side * (W / 2 + 0.03), BODY_TOP + 0.02), trim))
        body.append(box('car_mirror%d' % side, (0.07, 0.13, 0.13),
                        (nose_base - FRONT_IN + 0.02, side * (W / 2 + 0.10), BODY_TOP + 0.06),
                        trim, bevel=0.035))
        # Door seam and handle.
        body.append(box('car_seam%d' % side, (0.022, 0.02, 0.40),
                        (CAB_X + 0.30, side * (W / 2 + 0.004), 0.72), dark))
        body.append(box('car_handle%d' % side, (0.15, 0.05, 0.05),
                        (CAB_X - 0.18, side * (W / 2 + 0.025), 0.92), steel, bevel=0.02))
        # Arches that follow the tyre, thin enough to read as a flare.
        for wx in (AXLE_F, AXLE_R):
            body.append(torus('car_arch%d_%d' % (side, round(wx * 100)), WHEEL_R + 0.10, 0.07,
                              (wx, side * (W / 2 - 0.01), WHEEL_R), dark,
                              rot=(math.radians(90), 0, 0), major_seg=30, minor_seg=7))

    # ---- front: bumper, grille slats, lamp housings, plate ------------------
    body.append(box('car_bumper_f', (0.24, W - 0.02, 0.32), (L * 0.5 - 0.02, 0, 0.50), trim, bevel=0.11))
    body.append(box('car_bumper_r', (0.22, W - 0.02, 0.32), (-L * 0.5 + 0.02, 0, 0.50), trim, bevel=0.11))
    for i in range(3):
        body.append(box('car_slat_%d' % i, (0.04, 0.78, 0.045),
                        (L * 0.5 + 0.005, 0, 0.72 + i * 0.08), trim, bevel=0.012))
    for side in (1, -1):
        # Housing, then a lens sitting proud of it.
        body.append(box('car_lamp_h%d' % side, (0.13, 0.34, 0.19),
                        (L * 0.5 - 0.06, side * 0.63, 0.86), trim, bevel=0.05))
    body.append(box('car_plate', (0.03, 0.46, 0.12), (L * 0.5 + 0.02, 0, 0.49),
                    mat('plate', PAL['yellow'], roughness=0.5)))
    body.append(cylinder('car_exhaust', 0.045, 0.14, (-L * 0.5 - 0.02, -0.55, 0.42), steel,
                         verts=12, rot=(0, math.radians(90), 0)))
    # A waist stripe rather than a slab of colour down the door.
    body.append(box('car_stripe', (L * 0.96, W + 0.012, 0.06), (0, 0, 1.0), trim))

    # ---- roof sensor pod: BASE stays on the body; the dome is a separate object below,
    # so the runtime can spin it — a lidar that never turns says nothing about
    # a car that is supposed to be looking.
    roof_x = CAB_X + (BACK_IN - FRONT_IN) / 2
    body.append(cylinder('car_pod_base', 0.185, 0.08, (roof_x, 0, cab_top + 0.02), trim, verts=24))
    body.append(box('car_sensor_bar', (0.05, 0.88, 0.06), (L * 0.5 - 0.01, 0, 0.99),
                    mat('vansensor', srgb(0x0D2360), roughness=0.2,
                        emission=srgb(0x17BDE0), strength=0.8), bevel=0.02))

    shell = join('van_body', body, origin=(0, 0, 0))
    smooth(shell)

    # The spinning lidar: dome, a visible facet window so the spin READS, and
    # the antenna riding round with it. Origin on the spin axis.
    pod_parts = [
        sphere('van_pod_dome', 0.14, (roof_x, 0, cab_top + 0.09),
               mat('vandome', srgb(0x1B2B4D), roughness=0.14, metallic=0.45),
               segments=20, rings=12),
        # The facet: an emissive eye on one side of the dome. Without an
        # asymmetry the spin would be invisible.
        box('van_pod_eye', (0.05, 0.09, 0.05), (roof_x + 0.12, 0, cab_top + 0.10),
            mat('podeye', srgb(0x17BDE0), roughness=0.2, emission=srgb(0x17BDE0), strength=1.2),
            bevel=0.015),
        cylinder('van_pod_ant', 0.011, 0.20, (roof_x - 0.10, 0, cab_top + 0.23), steel, verts=8),
    ]
    smooth(join('van_pod', pod_parts, origin=(roof_x, 0, cab_top + 0.09)))

    # Lamps are separate so the runtime can switch them on.
    lights = [
        box('van_hl_l', (0.07, 0.28, 0.14), (L * 0.5 + 0.01, 0.63, 0.86), lens, bevel=0.04),
        box('van_hl_r', (0.07, 0.28, 0.14), (L * 0.5 + 0.01, -0.63, 0.86), lens, bevel=0.04),
    ]
    smooth(join('van_lights', lights, origin=(0, 0, 0)))
    brake = mat('brakelamp', PAL['red'], roughness=0.28, emission=PAL['red'], strength=0.4)
    brakes = [
        box('van_bl_l', (0.06, 0.30, 0.16), (-L * 0.5 - 0.01, 0.62, 0.90), brake, bevel=0.045),
        box('van_bl_r', (0.06, 0.30, 0.16), (-L * 0.5 - 0.01, -0.62, 0.90), brake, bevel=0.045),
    ]
    smooth(join('van_brakes', brakes, origin=(0, 0, 0)))

    for tag, x, y in (('fl', AXLE_F, TRACK), ('fr', AXLE_F, -TRACK),
                      ('rl', AXLE_R, TRACK), ('rr', AXLE_R, -TRACK)):
        wheel('van_wheel_' + tag, WHEEL_R, WHEEL_W, (x, y, WHEEL_R))

    ind = mat('indicator', PAL['orange'], roughness=0.35, emission=PAL['orange'], strength=0.3)
    for tag, x, y in (('fl', L * 0.49, W / 2 - 0.02), ('fr', L * 0.49, -W / 2 + 0.02),
                      ('rl', -L * 0.48, W / 2 - 0.02), ('rr', -L * 0.48, -W / 2 + 0.02)):
        box('van_ind_' + tag, (0.07, 0.10, 0.10), (x, y, 0.88), ind, bevel=0.03)

    global CAR_RADIUS
    CAR_RADIUS = WHEEL_R
    return shell


def make_clinic():
    """The destination: the Fenner Street clinic, standing at the delivery bay.
    Mint cross, glass entrance, canopy over the doors — the parcel visibly has
    somewhere to arrive."""
    wall = mat('clinicwall', PAL['cream'], roughness=0.8)
    trim = mat('clinictrim', PAL['teal'], roughness=0.6)
    glass = mat('clinicglass', PAL['glass'], roughness=0.14, metallic=0.25)
    parts = [
        # Seven metres deep, not ten: at ten the building reached past the
        # side camera's standing position and the shot was solid wall.
        box('cl_shell', (14, 7, 8.5), (0, 3.5, 4.25), wall, bevel=0.08),
        box('cl_parapet', (14.3, 7.3, 0.4), (0, 3.5, 8.7), trim, bevel=0.05),
        # Entrance: recessed glass doors under a canopy.
        box('cl_doors', (4.6, 0.2, 3.0), (0, -0.02, 1.5), glass),
        box('cl_doorframe', (4.9, 0.14, 0.2), (0, -0.06, 3.05), trim),
        box('cl_canopy', (6.4, 2.6, 0.22), (0, -1.3, 3.5), trim, bevel=0.06),
        box('cl_canopy_leg_l', (0.12, 0.12, 3.4), (-2.9, -2.3, 1.7), mat('clinicsteel', PAL['steel'], roughness=0.4, metallic=0.5)),
        box('cl_canopy_leg_r', (0.12, 0.12, 3.4), (2.9, -2.3, 3.4 / 2), mat('clinicsteel', PAL['steel'], roughness=0.4, metallic=0.5)),
        # The mint cross, standing proud of the wall above the canopy.
        box('cl_cross_v', (0.9, 0.2, 2.6), (0, -0.12, 5.8), mat('cliniccross', PAL['mint'], roughness=0.4, emission=PAL['mint'], strength=0.5)),
        box('cl_cross_h', (2.6, 0.2, 0.9), (0, -0.12, 5.8), mat('cliniccross', PAL['mint'], roughness=0.4, emission=PAL['mint'], strength=0.5)),
    ]
    # Windows: two rows of four, recessed with frames.
    frame = mat('clinicframe', PAL['white'], roughness=0.6)
    for row, z in ((0, 5.2), (1, 7.0)):
        for i in range(4):
            x = -5.2 + i * 3.5
            if row == 0 and -2.6 < x < 2.6:
                continue  # the cross owns the centre of the wall
            parts.append(box(f'cl_win_{row}_{i}', (1.6, 0.14, 1.2), (x, -0.06, z), glass))
            parts.append(box(f'cl_sill_{row}_{i}', (1.8, 0.18, 0.1), (x, -0.1, z - 0.68), frame))
    building = join('clinic', parts, origin=(0, 0, 0))
    smooth(building)
    return building


def make_ambulance_boxy():
    """The first ambulance: a white box with a small light bar.

    Superseded by blender/ambulance.py. Kept, like the earlier vehicles in this
    file, as a record of what was tried — it was modelled three-quarter front
    and had nothing at all on its back, which is the only side of it the game
    ever really shows."""
    L = 5.9
    shell_m = mat('ambshell', PAL['white'], roughness=0.26, metallic=0.12)
    red = mat('ambred', PAL['red'], roughness=0.55)
    glass = mat('ambglass', srgb(0x46617F), roughness=0.08, metallic=0.4)
    dark = mat('ambunder', srgb(0x23272E), roughness=0.85)
    steel = mat('ambsteel', PAL['steel'], roughness=0.35, metallic=0.6)

    W = 2.2
    parts = [
        box('amb_skirt', (L * 0.94, W - 0.2, 0.24), (0, 0, 0.34), dark, bevel=0.05),
        # One box body, generously bevelled, with the cab stepping down ahead.
        box('amb_box', (L * 0.60, W, 2.15), (-L * 0.18, 0, 1.62), shell_m, bevel=0.13),
        box('amb_cab', (L * 0.30, W - 0.1, 1.30), (L * 0.31, 0, 1.15), shell_m, bevel=0.12),
        wedge('amb_hood', (L * 0.16, W - 0.16, 0.5), (L * 0.44, 0, 0.85), shell_m,
              bevel=0.08, front_in=0.14),
        # Windscreen laid into the cab's raked front.
        box('amb_screen', (0.08, W - 0.5, 0.72), (L * 0.44, 0, 1.42), glass,
            rot=(0, math.radians(-22), 0)),
        # Bumpers and grille.
        box('amb_bumper_f', (0.2, W - 0.1, 0.3), (L * 0.51, 0, 0.5), dark, bevel=0.08),
        box('amb_bumper_r', (0.2, W - 0.1, 0.3), (-L * 0.5, 0, 0.5), dark, bevel=0.08),
        box('amb_grille', (0.05, 0.9, 0.16), (L * 0.52, 0, 0.78), dark, bevel=0.03),
    ]
    for side in (1, -1):
        y = side * (W / 2 + 0.005)
        # Cab door glass and body windows in frames.
        parts.append(box(f'amb_cabglass_{side}', (0.7, 0.05, 0.5), (L * 0.30, y, 1.55), glass))
        parts.append(box(f'amb_boxglass_{side}', (0.8, 0.05, 0.5), (-L * 0.02, y, 1.95), glass))
        # Red stripe the length of the flank, and the cross on the box.
        parts.append(box(f'amb_stripe_{side}', (L * 0.92, 0.03, 0.3), (0, y + side * 0.012, 1.06), red))
        parts.append(box(f'amb_cross_v_{side}', (0.22, 0.04, 0.72), (-L * 0.22, y + side * 0.02, 2.05), red))
        parts.append(box(f'amb_cross_h_{side}', (0.72, 0.04, 0.22), (-L * 0.22, y + side * 0.02, 2.05), red))
        # Mirror.
        parts.append(box(f'amb_mirror_{side}', (0.07, 0.12, 0.16), (L * 0.42, side * (W / 2 + 0.12), 1.66), dark, bevel=0.03))
        # Wheel arches.
        for wx in (L * 0.30, -L * 0.26):
            parts.append(torus(f'amb_arch_{side}_{round(wx * 100)}', 0.50, 0.06,
                               (wx, side * (W / 2 - 0.02), 0.44), dark,
                               rot=(math.radians(90), 0, 0), major_seg=26, minor_seg=6))
    # Rear doors: seam and handles, and the cross again for the car behind.
    parts.append(box('amb_door_seam', (0.02, 0.03, 1.7), (-L * 0.5 - 0.01, 0, 1.7), dark))
    parts.append(box('amb_cross_v_rear', (0.04, 0.2, 0.6), (-L * 0.5 - 0.02, 0.5, 2.0), red))
    parts.append(box('amb_cross_h_rear', (0.04, 0.6, 0.2), (-L * 0.5 - 0.02, 0.5, 2.0), red))
    for side in (1, -1):
        parts.append(box(f'amb_handle_{side}', (0.05, 0.14, 0.05), (-L * 0.5 - 0.02, side * 0.24, 1.5), steel))
    # Light bar base; the blue lenses stay separate for the runtime to flash.
    parts.append(box('amb_bar', (1.5, 1.6, 0.13), (-L * 0.02, 0, 2.78), mat('ambbarbase', PAL['navy']), bevel=0.04))

    shell = join('ambulance_body', parts, origin=(0, 0, 0))
    smooth(shell, angle=58)

    for tag, y in (('l', 0.5), ('r', -0.5)):
        box(f'ambulance_blue_{tag}', (0.55, 0.4, 0.18), (-L * 0.02, y, 2.9),
            mat('ambblue', PAL['blue'], roughness=0.3, emission=PAL['blue'], strength=0.5), bevel=0.04)
    for tag, x, y in (('fl', L * 0.30, 0.94), ('fr', L * 0.30, -0.94),
                      ('rl', -L * 0.26, 0.94), ('rr', -L * 0.26, -0.94)):
        wheel(f'ambulance_wheel_{tag}', 0.44, 0.3, (x, y, 0.44))
    return None


# ================================================================ CHARACTERS ==

def figure(prefix, shirt, trousers, scale=1.0, child=False):
    """A jointed figure. Limbs are separate objects with their origins ON the
    joint, so the runtime swings them about the hip and shoulder and the legs
    stay attached — the thing a flat sprite could never do.

    Volumes, not slabs: a chest that tapers to the waist, a neck under the
    head, shoulders the arms hang OUTSIDE of. The old figure's arms sat four
    centimetres off the torso wall and the whole thing read as one box.
    """
    skin = mat(f'skin_{prefix}', PAL['skin'], roughness=0.72)
    shirt_m = mat(f'shirt_{prefix}', shirt, roughness=0.8)
    trs = mat(f'trs_{prefix}', trousers, roughness=0.82)
    hair = mat('hair', PAL['hair'], roughness=0.9)
    head_r = 0.15 if not child else 0.14

    torso = [
        # Chest: widest at the shoulders, eased in toward the waist.
        wedge(f'{prefix}_chest', (0.26, 0.40, 0.46), (0, 0, 1.28), shirt_m,
              bevel=0.09, front_in=0.02, back_in=0.02),
        box(f'{prefix}_waist', (0.22, 0.30, 0.20), (0, 0, 0.98), shirt_m, bevel=0.06),
        box(f'{prefix}_hips', (0.23, 0.33, 0.18), (0, 0, 0.86), trs, bevel=0.06),
        cylinder(f'{prefix}_neck', 0.055, 0.12, (0, 0, 1.55), skin, verts=12),
        sphere(f'{prefix}_head', head_r, (0, 0, 1.70), skin, segments=18, rings=12),
        ico(f'{prefix}_hair', head_r * 1.04, (0, 0, 1.75), hair, subdiv=1),
        # Shoulder caps, so the arm hangs from something rounded.
        sphere(f'{prefix}_shoulder_l', 0.075, (0, 0.24, 1.44), shirt_m, segments=12, rings=8),
        sphere(f'{prefix}_shoulder_r', 0.075, (0, -0.24, 1.44), shirt_m, segments=12, rings=8),
    ]
    body = join(f'{prefix}_body', torso, origin=(0, 0, 0))
    smooth(body, angle=66)

    # Arms pivot at the shoulder — clear of the torso, elbow hinted by a taper.
    for tag, y in (('l', 0.28), ('r', -0.28)):
        upper = cylinder(f'{prefix}_arm_{tag}_u', 0.055, 0.28, (0, y, 1.32), shirt_m, verts=12)
        lower = cylinder(f'{prefix}_arm_{tag}_d', 0.045, 0.26, (0, y, 1.06), skin, verts=12)
        hand = sphere(f'{prefix}_hand_{tag}', 0.055, (0, y, 0.92), skin, segments=10, rings=6)
        arm = join(f'{prefix}_arm_{tag}', [upper, lower, hand], origin=(0, y, 1.44))
        smooth(arm, angle=66)
    for tag, y in (('l', 0.11), ('r', -0.11)):
        thigh = cylinder(f'{prefix}_leg_{tag}_u', 0.075, 0.42, (0, y, 0.62), trs, verts=12)
        shin = cylinder(f'{prefix}_leg_{tag}_d', 0.06, 0.36, (0, y, 0.26), trs, verts=12)
        shoe = box(f'{prefix}_shoe_{tag}', (0.24, 0.12, 0.09), (0.05, y, 0.05),
                   mat('shoe', PAL['navy']), bevel=0.03)
        leg = join(f'{prefix}_leg_{tag}', [thigh, shin, shoe], origin=(0, y, 0.85))
        smooth(leg, angle=66)

    if scale != 1.0:
        for obj in bpy.data.objects:
            if obj.name.startswith(prefix + '_'):
                obj.scale = (scale, scale, scale)
                obj.location = tuple(c * scale for c in obj.location)
    return None


def make_cyclist():
    frame = mat('bikeframe', PAL['teal'], roughness=0.3, metallic=0.4)
    dark = mat('biketyre', PAL['tyre'], roughness=0.9)
    parts = [
        box('cy_bar', (1.2, 0.07, 0.07), (0.02, 0, 0.62), frame),
        cylinder('cy_seatpost', 0.04, 0.44, (-0.42, 0, 0.74), frame, verts=10),
        box('cy_bars', (0.08, 0.5, 0.08), (0.52, 0, 0.95), dark),
        cylinder('cy_stem', 0.04, 0.5, (0.52, 0, 0.7), frame, verts=10),
        box('cy_seat', (0.26, 0.12, 0.07), (-0.42, 0, 0.98), dark, bevel=0.02),
    ]
    join('cyclist_frame', parts, origin=(0, 0, 0))
    for tag, x in (('f', 0.55), ('r', -0.5)):
        tyre = torus(f'cy_w_{tag}_t', 0.34, 0.045, (x, 0, 0.34), dark, rot=(math.radians(90), 0, 0), major_seg=14, minor_seg=5)
        hubc = cylinder(f'cy_w_{tag}_h', 0.05, 0.08, (x, 0, 0.34), frame, verts=10, rot=(math.radians(90), 0, 0))
        spokes = [box(f'cy_w_{tag}_s{i}', (0.02, 0.02, 0.62), (x, 0, 0.34), frame, rot=(0, math.radians(i * 45), 0)) for i in range(4)]
        join(f'cyclist_wheel_{tag}', [tyre, hubc] + spokes, origin=(x, 0, 0.34))
    figure('rider', PAL['orange'], PAL['navy'], scale=0.95)
    return None


def make_dog():
    """A street dog built from rounded volumes.

    The old one was six boxes: a box body, box ears, box legs. At the distance
    the game actually shows it that reads as a crate on stilts. This is the
    same silhouette a child would draw — barrel chest, tapering muzzle,
    pricked ears, paws, a tail that curves up — and it is smooth-shaded, so the
    light runs over it rather than breaking on facets.
    """
    fur = mat('dogfur', PAL['dog'], roughness=0.9)
    dark = mat('dogdark', PAL['dogDark'], roughness=0.9)
    nose_mat = mat('dognose', srgb(0x2A2622), roughness=0.55)

    def blob(name, radius, loc, material, scale, segments=20, rings=12):
        obj = sphere(name, radius, loc, material, segments=segments, rings=rings)
        obj.scale = scale
        return obj

    parts = []
    # Barrel body, deeper at the chest than at the hips.
    parts.append(blob('dog_torso', 0.20, (-0.04, 0, 0.50), fur, (1.85, 1.0, 1.05)))
    parts.append(blob('dog_chest', 0.19, (0.24, 0, 0.50), fur, (1.0, 1.05, 1.1)))
    parts.append(blob('dog_hips', 0.18, (-0.30, 0, 0.50), fur, (1.0, 1.0, 1.0)))
    # Neck rising to the head.
    parts.append(cylinder('dog_neck', 0.10, 0.26, (0.42, 0, 0.62), fur, verts=16,
                          rot=(0, math.radians(52), 0)))
    parts.append(blob('dog_head', 0.145, (0.56, 0, 0.72), fur, (1.15, 1.0, 1.0)))
    # Muzzle and nose.
    parts.append(blob('dog_muzzle', 0.085, (0.70, 0, 0.68), dark, (1.5, 0.95, 0.85)))
    parts.append(sphere('dog_nose', 0.035, (0.80, 0, 0.70), nose_mat, segments=12, rings=8))
    # Pricked ears, angled outward.
    for side in (1, -1):
        parts.append(cone('dog_ear_%d' % side, 0.06, 0.15, (0.52, side * 0.075, 0.85), dark, verts=12))
    body = join('dog_body', parts, origin=(0, 0, 0))
    smooth(body, angle=68)

    # Legs stay SEPARATE objects hinged at the hip — the runtime swings them by
    # name to make the dog trot, and joining them into the body silently killed
    # the walk.
    for tag, x, y in (('fl', 0.26, 0.10), ('fr', 0.26, -0.10),
                      ('rl', -0.28, 0.10), ('rr', -0.28, -0.10)):
        leg = [
            blob('dog_thigh_' + tag, 0.075, (x, y, 0.40), fur, (1.0, 1.0, 1.5)),
            cylinder('dog_shin_' + tag, 0.042, 0.26, (x, y, 0.19), fur, verts=12),
            blob('dog_paw_' + tag, 0.055, (x + 0.02, y, 0.05), dark, (1.25, 1.0, 0.6)),
        ]
        smooth(join('dog_leg_' + tag, leg, origin=(x, y, 0.46)), angle=68)

    # The tail is hinged, so the runtime can wag it.
    tail = [
        cylinder('dog_tail_m', 0.035, 0.26, (-0.50, 0, 0.62), fur, verts=12,
                 rot=(0, math.radians(58), 0)),
        sphere('dog_tail_tip', 0.045, (-0.58, 0, 0.74), fur, segments=12, rings=8),
    ]
    smooth(join('dog_tail', tail, origin=(-0.40, 0, 0.54)), angle=68)
    return None


# ====================================================================== MAIN ==

# The revised edition keeps authoring separated by asset family.
# Load after the legacy builders so the new jointed figures replace them.
_load_module('living_assets.py')
_load_module('environment_assets.py')

def main():
    clear_scene()

    make_road_straight()
    make_road_crossing()
    make_road_bay()
    make_road_works()

    # THE FRONTAGES ARE GONE.
    #
    # `make_building`, `make_tree`, `make_bench` and `make_bin` are still in this
    # file — they are a record of what the street was — but nothing calls them,
    # so they are not in the kit and not in the download. The street is now road,
    # kerbs, pavements, a guard rail down each outer edge, lamps on the far side,
    # the clinic, and whatever the hazard needs. Nothing else.
    #
    # Two reasons, and the first is not taste. From the fixed rear camera the
    # near-side buildings stood between the lens and the street: the answer cards
    # float eight metres ahead of the car in the middle of the road, and a
    # five-storey frontage on the near pavement is closer to the camera than
    # they are, so it drew over the third card. The second reason is that forty
    # buildings and nine trees behind a question a nine-year-old is trying to
    # answer is forty-nine things competing with it.
    # The shop row: six townhouses in the flat edition's palette. Asset names
    # and widths are load-bearing — `roadSystem.ts` spawns by name and spaces by
    # width — so a repaint keeps both.
    for shop_name, width, floors, colour, trim_c, awning in (
        ('shop_red', 8.5, 2, PAL['townRed'], PAL['townCream'], PAL['awnTeal']),
        ('shop_sun', 10.5, 2, PAL['townTan'], PAL['townFrame'], PAL['awnOrange']),
        ('shop_mint', 9.0, 3, PAL['townSage'], PAL['townFrame'], PAL['awnRed']),
        ('shop_sky', 11.5, 2, PAL['townSlate'], PAL['townCream'], PAL['awnOrange']),
        ('shop_plum', 8.0, 3, PAL['townBrick'], PAL['townCream'], PAL['awnTeal']),
        ('shop_cream', 12.0, 2, PAL['townCream'], PAL['townTan'], PAL['awnRed']),
    ):
        make_shop(shop_name, width, floors, colour, trim_c, awning)

    make_railing()
    make_lamp()
    make_traffic_light()
    for car_name, colour in (
        ('parked_blue', srgb(0x4A79C4)),
        ('parked_yellow', srgb(0xE8B23C)),
        ('parked_white', srgb(0xEDEFF2)),
    ):
        make_parked_car(car_name, colour)

    make_parking_lot()

    make_scooter()
    make_gate()
    make_barrier()
    make_cone()
    make_sign('sign_bay', PAL['navy'], PAL['orange'])
    make_sign('sign_works', PAL['orange'], PAL['navy'])
    make_ball()

    # The vehicle. `make_van_procedural`, `make_van_from_glb` and
    # `make_simple_car` are the three earlier attempts; they stay in the file as
    # a record of what was tried, and none of them is called.
    make_be6_car()
    make_clinic()
    make_ambulance()

    figure('person', PAL['mint'], PAL['navy'])
    figure('child', PAL['yellow'], srgb(0x2F57C4), scale=0.72, child=True)
    make_cyclist()
    make_dog()
    build_environment_assets()

    # Every asset stands at the origin; the game positions clones.
    root = pathlib.Path(sys.argv[sys.argv.index('--out') + 1]) if '--out' in sys.argv else pathlib.Path('kit.glb')
    root.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(root),
        export_format='GLB',
        use_selection=False,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
        export_normals=True,
        export_tangents=False,
        export_skins=False,
        export_animations=False,
    )
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    faces = sum(len(o.data.polygons) for o in meshes)
    report = pathlib.Path(str(root) + '.report.txt')
    rows = sorted(((len(o.data.polygons), o.name) for o in meshes), reverse=True)
    summary = [
        f'car_radius {CAR_RADIUS:.4f}',
        f'objects {len(meshes)}',
        f'faces {faces}',
        f'bytes {root.stat().st_size}',
        '',
    ]
    summary += [f'{count:6}  {name}' for count, name in rows]
    report.write_text('\n'.join(summary), encoding='utf8')
    print(f'KIT_OK objects={len(meshes)} faces={faces} bytes={root.stat().st_size}')


# Blender's Store launcher detaches, so stdout never reaches the caller. Write
# the outcome — success or traceback — next to the output where it can be read.
def _run():
    import traceback
    out = pathlib.Path(sys.argv[sys.argv.index('--out') + 1]) if '--out' in sys.argv else pathlib.Path('kit.glb')
    log = pathlib.Path(str(out) + '.log.txt')
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        main()
        log.write_text('OK', encoding='utf8')
    except Exception:
        log.write_text('FAILED' + '\n' + traceback.format_exc(), encoding='utf8')
        raise


# `--library` lets blender/preview_car.py pull these builders in without
# triggering a full kit export.
if '--library' not in sys.argv:
    _run()
