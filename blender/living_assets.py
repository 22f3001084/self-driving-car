"""Living street assets. Execute in build_kit.py's namespace before main().

Separate named upper/lower limbs are authored at their actual joint origins.
The runtime supplies the walk cycle; no skeletal animation or textures needed.
"""
from mathutils import Vector


def living_blob(name, loc, size, material, detail=16):
    obj = sphere(name, 1, loc, material, segments=detail, rings=10)
    obj.scale = size
    return obj


def living_link(name, a, b, radius, material, end_radius=None, sides=12):
    start, end = Vector(a), Vector(b)
    delta = end - start
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=radius,
        radius2=end_radius if end_radius is not None else radius,
        depth=delta.length, location=(start + end) / 2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    obj.data.materials.append(material)
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def living_part(name, objects, origin):
    for source in objects:
        bpy.context.view_layer.objects.active = source
        for modifier in list(source.modifiers):
            if modifier.type == 'BEVEL':
                bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj = join(name, objects, origin=origin)
    # Smooth curved forms while retaining the shoe sole and clothing seams.
    smooth(obj, angle=60)
    return obj


def figure(prefix, shirt, trousers, scale=1.0, child=False):
    skin = mat('skin_' + prefix, srgb(0xB77953), roughness=.78)
    shirt_m = mat('shirt_' + prefix, shirt, roughness=.83)
    trim = mat('clothingtrim_' + prefix, srgb(0xF4EBDD), roughness=.83)
    trs = mat('trs_' + prefix, trousers, roughness=.85)
    sole = mat('sneakersole', srgb(0xE9E3D8), roughness=.75)
    shoe = mat('sneakerupper', srgb(0x26364D), roughness=.75)
    hair = mat('hair_' + prefix, srgb(0x26211F), roughness=.92)
    eye = mat('actor_eye', srgb(0x211A19), roughness=.45)
    glint = mat('actor_eye_glint', srgb(0xFFF8E8), roughness=.3)
    lip = mat('actor_lip', srgb(0x754736), roughness=.85)

    torso = [
        living_blob(prefix + '_chest', (0, 0, 1.245), (.135, .213, .269), shirt_m),
        box(prefix + '_shirt_hem', (.249, .343, .095), (0, 0, 1.025), shirt_m, bevel=.035),
        living_blob(prefix + '_hips', (0, 0, .908), (.13, .182, .135), trs),
        cylinder(prefix + '_neck', .056, .115, (0, 0, 1.49), skin, verts=14),
        torus(prefix + '_collar', .060, .014, (0, 0, 1.472), trim, major_seg=20),
    ]
    # One small patch gives the shirt scale and a clear front direction.
    torso.append(box(prefix + '_chest_patch', (.011, .071, .075), (.127, -.075, 1.30), trim, bevel=.01))
    if child:
        backpack = mat('child_backpack', srgb(0xE66049), roughness=.84)
        torso.extend([
            box(prefix + '_backpack', (.135, .292, .30), (-.17, 0, 1.225), backpack, bevel=.052),
            box(prefix + '_pocket', (.035, .19, .13), (-.247, 0, 1.16), backpack, bevel=.02),
        ])
        for side in [-1, 1]:
            torso.append(living_link(prefix + '_strap', (.112, side * .139, 1.06), (.097, side * .167, 1.43), .014, backpack))
    living_part(prefix + '_body', torso, (0, 0, .91))

    hr = .17 if child else .156
    hz = 1.645
    head = [living_blob(prefix + '_head_skin', (0, 0, hz), (hr * .93, hr * .92, hr * 1.09), skin, 20)]
    # The hair forms a cap behind the forehead; it never covers the eyes.
    head.extend([
        living_blob(prefix + '_hair_cap', (-.025, 0, hz + .102), (.145, .15, .089), hair, 20),
        living_blob(prefix + '_hair_back', (-.112, 0, hz + .012), (.056, .128, .118), hair),
        living_blob(prefix + '_hair_sweep', (.048, -.025, hz + .116), (.092, .128, .053), hair),
        living_blob(prefix + '_nose', (.149, 0, hz - .019), (.035, .028, .029), skin),
    ])
    for side in [-1, 1]:
        head.extend([
            living_blob(prefix + '_ear', (-.005, side * .147, hz - .015), (.032, .028, .046), skin),
            living_blob(prefix + '_eye', (.137, side * .056, hz + .016), (.013, .018, .023), eye, 12),
            living_blob(prefix + '_eye_light', (.149, side * .052, hz + .023), (.004, .006, .007), glint, 10),
            living_link(prefix + '_brow', (.132, side * .036, hz + .050), (.128, side * .077, hz + .053), .009, hair, sides=8),
        ])
    for side in [-1, 1]:
        head.append(living_link(prefix + '_mouth', (.137, 0, hz - .076), (.131, side*.031, hz - .069), .005, lip, sides=8))
    if prefix == 'rider':
        helmet = mat('cyclehelmet', srgb(0xF4C542), roughness=.48)
        head.append(living_blob('rider_helmet_shell', (-.006, 0, hz + .125), (.17, .171, .107), helmet, 20))
        for y in [-.095, 0, .095]:
            head.append(living_blob('rider_helmet_vent', (.007, y, hz + .219 - abs(y)*.30), (.077, .015, .007), eye, 12))
        for side in [-1, 1]:
            head.append(living_link('rider_helmet_strap', (.012, side * .147, hz + .08), (.028, side * .067, hz - .135), .009, shoe, sides=8))
    living_part(prefix + '_head', head, (0, 0, 1.495))

    for tag, y in [('l', .25), ('r', -.25)]:
        shoulder = (0, y, 1.414)
        elbow = (0, y, 1.144)
        living_part(prefix + '_arm_' + tag, [
            living_blob(prefix + '_shoulder', (0, y, 1.395), (.073, .075, .086), shirt_m),
            living_link(prefix + '_sleeve', (0, y, 1.36), (0, y, 1.225), .065, shirt_m, .057),
            living_link(prefix + '_upperarm', (0, y, 1.245), elbow, .047, skin, .043),
            living_blob(prefix + '_elbow', elbow, (.044, .045, .045), skin),
        ], shoulder)
        living_part(prefix + '_forearm_' + tag, [
            living_link(prefix + '_forearm', elbow, (0, y, .928), .043, skin, .032),
            living_blob(prefix + '_hand', (.014, y, .901), (.05, .038, .065), skin),
            living_blob(prefix + '_thumb', (.047, y * .96, .922), (.022, .022, .036), skin, 12),
        ], elbow)
    for tag, y in [('l', .103), ('r', -.103)]:
        hip, knee = (0, y, .91), (0, y, .495)
        living_part(prefix + '_leg_' + tag, [
            living_link(prefix + '_thigh', (0, y, .88), knee, .087, trs, .068),
            living_blob(prefix + '_knee', knee, (.069, .071, .071), trs),
        ], hip)
        living_part(prefix + '_shin_' + tag, [
            living_link(prefix + '_calf', knee, (0, y, .13), .068, trs, .047),
            cylinder(prefix + '_sock', .047, .073, (0, y, .119), trim, verts=12),
        ], knee)
        living_part(prefix + '_foot_' + tag, [
            box(prefix + '_shoe_upper', (.255, .126, .085), (.047, y, .075), shoe, bevel=.031),
            box(prefix + '_shoe_sole', (.27, .132, .027), (.047, y, .027), sole, bevel=.011),
            box(prefix + '_shoe_toe', (.078, .109, .011), (.12, y, .109), trim, bevel=.006),
        ], (0, y, .080))
    if scale != 1:
        for obj in list(bpy.data.objects):
            if obj.name.startswith(prefix + '_'):
                obj.scale = (scale, scale, scale)
                obj.location = tuple(v * scale for v in obj.location)


def make_cyclist():
    frame = mat('bikeframe', srgb(0x168D94), roughness=.38, metallic=.35)
    dark = mat('biketyre', srgb(0x252B32), roughness=.87)
    alloy = mat('bikealloy', srgb(0xB9C4C8), roughness=.35, metallic=.75)
    orange = mat('bikereflector', srgb(0xF4A32B), roughness=.4)
    rear, front, crank, seat, stem = (-.65, 0, .365), (.65, 0, .365), (-.08, 0, .36), (-.29, 0, .965), (.40, 0, .93)
    parts = []
    for i, (a, b) in enumerate([(rear, seat), (rear, crank), (crank, seat), (seat, stem), (stem, crank), (stem, front)]):
        parts.append(living_link('cycle_tube_' + str(i), a, b, .026, frame, sides=12))
    for side in [-1, 1]:
        parts.append(living_link('cycle_fork', (.43, side * .066, .93), (.65, side * .066, .365), .018, frame))
        parts.append(living_link('cycle_rear_stay', (-.29, side * .045, .94), (-.65, side * .066, .365), .014, frame))
        parts.append(living_link('cycle_handle', (.49, 0, 1.17), (.49, side * .235, 1.17), .023, alloy))
        parts.append(living_link('cycle_grip', (.49, side * .17, 1.17), (.49, side * .26, 1.17), .03, dark))
    parts.extend([
        living_link('cycle_seatpost', seat, (-.315, 0, 1.035), .024, alloy),
        box('cycle_saddle', (.25, .20, .061), (-.315, 0, 1.041), dark, bevel=.023),
        living_link('cycle_handle_stem', stem, (.49, 0, 1.17), .026, alloy),
        torus('cycle_chainring', .105, .012, (-.08, -.06, .36), alloy, rot=(math.pi/2, 0, 0), major_seg=24),
    ])
    # Two chains make the drivetrain readable in a side view.
    for height in [-.08, .08]:
        parts.append(living_link('cycle_chain', (-.08, -.075, .36 + height), (-.65, -.075, .365 + height * .48), .008, dark, sides=8))
    living_part('cyclist_frame', parts, (0, 0, 0))
    for tag, x in [('f', .65), ('r', -.65)]:
        centre = (x, 0, .365)
        wheelparts = [
            torus('cycle_tyre', .34, .025, centre, dark, rot=(math.pi/2, 0, 0), major_seg=40, minor_seg=8),
            torus('cycle_rim', .315, .012, centre, alloy, rot=(math.pi/2, 0, 0), major_seg=40, minor_seg=6),
            cylinder('cycle_hub', .038, .12, centre, alloy, verts=16, rot=(math.pi/2, 0, 0)),
        ]
        for i in range(12):
            a = i * math.tau / 12
            wheelparts.append(living_link('cycle_spoke', centre, (x + math.sin(a)*.31, 0, .365 + math.cos(a)*.31), .0045, alloy, sides=6))
        wheelparts.append(box('cycle_reflector', (.065, .026, .025), (x + .20, 0, .40), orange, bevel=.006))
        living_part('cyclist_wheel_' + tag, wheelparts, centre)
    living_part('cyclist_crank', [living_link('cycle_crank_arm', (-.08, -.13, .19), (-.08, .13, .53), .018, alloy)], (-.08, 0, .36))
    for tag, y, angle in [('l', .16, 0), ('r', -.16, math.pi)]:
        living_part('cyclist_pedal_' + tag, [box('cycle_pedal', (.105, .12, .035), (-.08, y, .36), dark, bevel=.009)], (-.08, y, .36))
    figure('rider', PAL['orange'], PAL['navy'])


def make_dog():
    fur = mat('dogfur', srgb(0xBE8955), roughness=.92)
    cream = mat('dogcream', srgb(0xEACDA4), roughness=.93)
    dark = mat('dogdark', srgb(0x8B593A), roughness=.95)
    nose = mat('dognose', srgb(0x272426), roughness=.53)
    collar = mat('dogcollar', srgb(0x227E87), roughness=.75)
    body = [
        living_blob('dog_ribcage', (-.035, 0, .54), (.34, .167, .205), fur, 20),
        living_blob('dog_chest', (.23, 0, .545), (.17, .168, .218), fur),
        living_blob('dog_haunch', (-.29, 0, .52), (.175, .153, .173), fur),
        living_blob('dog_bib', (.34, 0, .545), (.075, .112, .153), cream),
        living_link('dog_neck', (.28, 0, .60), (.42, 0, .77), .102, fur, .09),
        torus('dog_collar', .102, .018, (.372, 0, .699), collar, rot=(0, -.50, 0), major_seg=20),
        living_blob('dog_tag', (.40, -.101, .67), (.021, .007, .028), mat('dogtag', srgb(0xE7C45E), metallic=.5), 12),
    ]
    living_part('dog_body', body, (0, 0, 0))
    head = [
        living_blob('dog_skull', (.47, 0, .794), (.153, .13, .15), fur, 20),
        living_blob('dog_muzzle', (.619, 0, .746), (.119, .085, .067), cream),
        living_blob('dog_nose', (.722, 0, .761), (.034, .049, .031), nose),
        living_link('dog_mouth', (.663, -.075, .722), (.714, -.030, .722), .006, dark, sides=8),
        living_link('dog_mouth', (.663, .075, .722), (.714, .030, .722), .006, dark, sides=8),
    ]
    for side in [-1, 1]:
        head.extend([
            living_blob('dog_ear', (.444, side * .112, .866), (.062, .043, .146), dark),
            living_blob('dog_ear_inside', (.482, side * .119, .881), (.021, .027, .085), cream),
            living_blob('dog_eye', (.548, side * .100, .806), (.022, .015, .024), nose, 12),
            living_blob('dog_eye_glint', (.562, side * .108, .814), (.006, .005, .007), cream, 10),
        ])
    living_part('dog_head', head, (.355, 0, .665))
    for tag, x, y in [('fl', .245, .12), ('fr', .245, -.12), ('rl', -.28, .115), ('rr', -.28, -.115)]:
        hip, knee = (x, y, .54), (x, y, .275)
        living_part('dog_leg_' + tag, [
            living_blob('dog_upper', (x, y, .433), (.068 if tag[0]=='f' else .090, .064, .138), fur),
            living_link('dog_upper_bone', hip, knee, .053, fur, .037),
        ], hip)
        living_part('dog_shin_' + tag, [living_link('dog_lower', knee, (x, y, .065), .036, fur, .026)], knee)
        paw = [living_blob('dog_paw', (x + .022, y, .045), (.064, .048, .037), cream)]
        for d in [-.02, .02]:
            paw.append(living_link('dog_toe', (x + .06, y + d, .046), (x + .081, y + d, .042), .004, dark, sides=6))
        living_part('dog_foot_' + tag, paw, (x, y, .065))
    tail = []
    points = [(-.415, 0, .568), (-.54, 0, .66), (-.64, 0, .76), (-.67, 0, .84), (-.645, 0, .89)]
    for i in range(len(points)-1):
        tail.append(living_link('dog_tail_section', points[i], points[i+1], .034-i*.006, fur if i < 2 else cream, .028-i*.006))
        tail.append(living_blob('dog_tail_joint', points[i+1], (.028-i*.005,)*3, fur if i < 2 else cream, 12))
    living_part('dog_tail', tail, points[0])
