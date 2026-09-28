"""BE 6 game exterior, authored against Mahindra's official brochure.

The body uses hard-point sections and independent wheel cutouts. The greenhouse
has a real tapered cross-section rather than a second inflated body. All trim
is surface-bound; movable parts retain the van_* runtime contract.
"""

BE6_L = 4.20
BE6_HALF = 2.10
BE6_HW = 0.9165
BE6_AXLE = 1.3335
BE6_WHEEL_R = 0.361
BE6_WHEEL_W = 0.235


def mesh_part(name, vertices, faces, material):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(material)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()
    return ob


def strip3(name, points, radius, material, sides=6):
    """Small real seams / piping following a 3D surface, with no floating bars."""
    from mathutils import Vector
    vs, fs = [], []
    for i, p in enumerate(points):
        tangent = Vector(points[min(i + 1, len(points) - 1)]) - Vector(points[max(0, i - 1)])
        tangent.normalize()
        ref = Vector((0, 0, 1)) if abs(tangent.z) < .92 else Vector((0, 1, 0))
        a = tangent.cross(ref).normalized()
        b = tangent.cross(a).normalized()
        for j in range(sides):
            v = Vector(p) + radius * (math.cos(j * math.tau / sides) * a + math.sin(j * math.tau / sides) * b)
            vs.append(tuple(v))
    for i in range(len(points) - 1):
        for j in range(sides):
            k = i * sides + j
            fs.append((k, i * sides + (j + 1) % sides, (i + 1) * sides + (j + 1) % sides, k + sides))
    fs += [tuple(reversed(range(sides))), tuple((len(points) - 1) * sides + j for j in range(sides))]
    return mesh_part(name, vs, fs, material)


def body_hw(x):
    return lerp_table([(-2.10, .85), (-1.96, .886), (-1.50, .9165), (-.9, .909),
                       (0, .894), (.8, .902), (1.33, .9165), (1.85, .9), (2.10, .88)], x)


def body_top(x):
    return lerp_table([(-2.10, 1.10), (-1.75, 1.11), (-1.25, 1.135), (-.7, 1.116),
                       (.55, 1.09), (.90, 1.088), (1.25, 1.095), (1.70, 1.075), (2.1, 1.04)], x)


def arch_floor(x):
    # Polygonal openings are independent of the bonnet or shoulder section.
    d = min(abs(x - BE6_AXLE), abs(x + BE6_AXLE))
    return lerp_table([(0, .807), (.20, .807), (.32, .716), (.445, .520), (.474, .324), (.56, .324)], d)


def body_section(x):
    h,z,bottom=body_hw(x),body_top(x),arch_floor(x)
    hood=1.0 if x>=.99 else max(0,(x-.86)/.13)
    end=min(1,max(0,(abs(x)-1.85)/.25))
    return [(0,z-.012-hood*.06),(.46*h,z-.006-hood*.055),(.74*h,z),(.84*h,z-.065*(1-end)),
            (.984*h,z-.144+end*.069),(h,max(z-.26,bottom+.026)),(.986*h,bottom),
            (.66*h,bottom-.025),(.60*h,.30),(0,.30)]


def body_y(x, z):
    return lerp_table([(zc,y) for y,zc in body_section(x)[2:7]],z)


def body_shell(material):
    xs = sorted(set([-2.1, -2.07, -2.02, -1.96, -1.88, -1.75, -1.58, -1.5, -1.3335,
        -1.13, -.99, -.89, -.86, -.65, -.35, 0, .35, .65, .86, .89, .99, 1.13,
        1.3335, 1.5, 1.58, 1.75, 1.88, 1.96, 2.02, 2.07, 2.1]))
    vs, faces = [], []
    for x in xs:
        # Constant shoulder heights keep the wheel wells from deforming the bonnet.
        section=body_section(x)
        ring = section + [(-y, zc) for y, zc in section[-2:0:-1]]
        vs.extend((x, y, zc) for y, zc in ring)
    n = 18
    for i in range(len(xs) - 1):
        for j in range(n):
            faces.append((i*n+j, i*n+(j+1)%n, (i+1)*n+(j+1)%n, (i+1)*n+j))
    faces += [tuple(reversed(range(n))), tuple((len(xs)-1)*n+j for j in range(n))]
    ob = mesh_part('be6_pressed_body', vs, faces, material)
    bevel = ob.modifiers.new('Pressed edge radii', 'BEVEL')
    bevel.width = .012
    bevel.segments = 2
    bevel.limit_method = 'ANGLE'
    bevel.angle_limit = math.radians(34)
    return ob


# x, base width, roof width, top. Narrow roof over a planted shoulder.
CAB = [(-1.88, .65, .61, 1.11), (-1.68, .731, .645, 1.23), (-1.40, .782, .652, 1.385),
       (-1.12, .812, .661, 1.49), (-.80, .826, .661, 1.545), (-.40, .83, .658, 1.562),
       (.0, .828, .653, 1.556), (.32, .823, .665, 1.515), (.50, .818, .69, 1.44),
       (.72, .80, .71, 1.30), (.94, .774, .75, 1.125), (1.0, .75, .742, 1.085)]


def cab_top(x): return lerp_table([(a,d) for a,b,c,d in CAB], x)
def cab_y(x,z):
    base = lerp_table([(a,b) for a,b,c,d in CAB], x)
    roof = lerp_table([(a,c) for a,b,c,d in CAB], x)
    t = min(1,max(0,(z-1.075)/max(.025,cab_top(x)-1.075)))
    return base + (roof-base)*t


def greenhouse(material):
    vs,fs = [],[]
    for x,b,r,z in CAB:
        vs.extend([(x,-b,1.075),(x,-r,z-.018),(x,-r*.68,z+.002),(x,0,z+.01),
                   (x,r*.68,z+.002),(x,r,z-.018),(x,b,1.075)])
    n=7
    for i in range(len(CAB)-1):
        for j in range(n-1): fs.append((i*n+j,i*n+j+1,(i+1)*n+j+1,(i+1)*n+j))
    fs += [tuple(reversed(range(n))),tuple((len(CAB)-1)*n+j for j in range(n))]
    return mesh_part('be6_glazed_canopy',vs,fs,material)


def roof_panel(name,x0,x1,material,width=.96):
    vs,fs=[],[]
    for i in range(13):
        x=x0+(x1-x0)*i/12
        w=lerp_table([(a,c) for a,b,c,d in CAB],x)*width
        z=cab_top(x)
        for y,dz in [(-w,-.014),(-w*.65,.008),(0,.018),(w*.65,.008),(w,-.014)]:
            vs.append((x,y,z+dz))
    for i in range(12):
        for j in range(4): fs.append((i*5+j,i*5+j+1,(i+1)*5+j+1,(i+1)*5+j))
    return mesh_part(name,vs,fs,material)


def face_panel(name, points, x, material, front=True):
    # Nose and tail surfaces sweep back towards their corners.
    # They must remain beyond the body's capped end, including the corners.
    x = max(x, 2.122) if front else min(x, -2.122)
    return prism(name, points, .023, material, plane='yz',
                 surface=lambda y,z: x + (-1 if front else 1)*.012*(abs(y)/.85)**3)


def signature(name, side, x, material, front=True):
    # Tall C with an angled return, following the actual outer fender.
    if front:
        pts=[(.365,.918),(.780,.966),(.819,.932),(.832,.566),(.779,.497),(.582,.518),(.505,.67)]
    else:
        pts=[(.38,1.028),(.769,1.03),(.821,.984),(.829,.638),(.778,.59),(.559,.616)]
    return strip3(name,[(x+(-1 if front else 1)*.012*(y/.85)**3,side*y,z) for y,z in pts],.0135,material,sides=6)


def vehicle_badge(name,text,loc,size,material,rear=False):
    from mathutils import Matrix
    data=bpy.data.curves.new(name,'FONT')
    data.body=text; data.size=size; data.extrude=0; data.bevel_depth=0; data.resolution_u=2
    data.align_x='CENTER'; data.align_y='CENTER'; data.space_character=1.13
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj)
    # Local text x runs along the car's width; local y points upward.
    m=Matrix(((0,0,-1),(-1,0,0),(0,1,0))) if rear else Matrix(((0,0,1),(1,0,0),(0,1,0)))
    obj.rotation_euler=m.to_euler(); obj.location=loc; obj.data.materials.append(material)
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH')
    return bpy.context.object


def make_be6_car():
    paint=mat('be6_pearl',srgb(0xE2DDD0),roughness=.28,metallic=.30)
    paint.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value=.38
    paint.node_tree.nodes['Principled BSDF'].inputs['Coat Roughness'].default_value=.18
    black=mat('be6_obsidian',srgb(0x121A20),roughness=.29,metallic=.18)
    clad=mat('be6_arch_graphite',srgb(0x252C32),roughness=.62,metallic=.08)
    glass=mat('be6_tinted_glass',srgb(0x263A47),roughness=.13,metallic=.36)
    satin=mat('be6_satin_metal',srgb(0x687177),roughness=.30,metallic=.75)
    seam=mat('be6_panel_seam',srgb(0x465054),roughness=.67)
    badge=mat('be6_badge',srgb(0xD6DFDF),roughness=.25,metallic=.80)
    plate=mat('be6_registration',srgb(0x173E35),roughness=.50)
    led=mat('be6_drl',srgb(0xD7ECF5),roughness=.2,emission=srgb(0xDBF5FF),strength=1.6)
    tail=mat('be6_tail',srgb(0xC51C28),roughness=.21,emission=srgb(0xF71328),strength=1.25)
    body=[body_shell(paint),greenhouse(glass),roof_panel('be6_panorama_roof',-.94,.34,black)]
    body.append(box('be6_undertray',(3.42,1.34,.15),(0,0,.31),clad,bevel=.08))

    # Sculpted bonnet valley with a forward aero bridge / real dark intake slot.
    vs,fs=[],[]
    for i in range(10):
        x=.99+i*.102
        w=.45+.18*(x-.99)
        z=body_top(x)
        for y,dz in [(-w,.016),(-w*.82,-.023),(-w*.62,-.042),(0,-.048),(w*.62,-.042),(w*.82,-.023),(w,.016)]:
            vs.append((x,y,z+dz))
    for i in range(9):
        for j in range(6): fs.append((i*7+j,i*7+j+1,(i+1)*7+j+1,(i+1)*7+j))
    # This panel sinks into the body only at its valley; the outline creates a
    # visible crease without a thick slab standing above the bonnet.
    body.append(mesh_part('be6_bonnet_sculpt',vs,fs,paint))
    body.append(box('be6_aero_channel',(.055,1.11,.045),(1.94,0,1.013),black,bevel=.016))
    body.append(box('be6_aero_bridge',(.18,1.24,.046),(2.015,0,1.039),paint,bevel=.019,rot=(0,.08,0)))
    for s in (-1,1):
        body.append(strip3('be6_bonnet_shut'+str(s),[(x,s*(.45+.18*(x-.99)),body_top(x)+.019) for x in [.99,1.15,1.32,1.5,1.72,1.92]],.0045,seam))

    # Flush side glazing with body-colour pillars, a black B pillar, and a
    # broad sculpted rear sail. None uses an axis-aligned post.
    dlo=[(.89,1.117),(.46,1.435),(.25,1.488),(-.74,1.515),(-1.07,1.445),(-1.28,1.323),(-1.04,1.213),(.14,1.116)]
    for s in (-1,1):
        surf=lambda x,z,s=s:s*(cab_y(x,z)+.01)
        body.extend(band('be6_window_gasket'+str(s),dlo,.018,.014,black,surf))
        body.append(prism('be6_b_pillar'+str(s),[(-.07,1.134),(.025,1.131),(.055,1.495),(-.035,1.501)],.018,black,surface=surf))
        body.append(prism('be6_a_pillar'+str(s),[(.95,1.099),(.89,1.119),(.45,1.443),(.37,1.474),(.43,1.474),(.515,1.443)],.028,paint,surface=surf))
        sail=[(-.79,1.532),(-1.09,1.473),(-1.37,1.358),(-1.72,1.191),(-1.80,1.114),(-1.27,1.128),(-1.04,1.211),(-1.3,1.323),(-1.07,1.445),(-.74,1.515)]
        body.append(prism('be6_c_pillar'+str(s),sail,.022,paint,surface=surf))
        beltv,beltf=[],[]
        for i in range(49):
            x=-1.80+2.70*i/48
            top=lerp_table([(-1.80,1.114),(-1.04,1.213),(.14,1.116),(.90,1.10)],x)
            for z in [1.057,top]: beltv.append((x,s*(cab_y(x,z)+.019),z))
        for i in range(48): beltf.append((i*2,i*2+1,i*2+3,i*2+2))
        body.append(mesh_part('be6_lower_belt'+str(s),beltv,beltf,paint))
        # Roof side blade forms a crisp continuous roof-to-rear line.
        roofline=[(x,s*(lerp_table([(a,c) for a,b,c,d in CAB],x)+.004),cab_top(x)-.009) for x in [.36,.16,-.1,-.4,-.7,-.95,-1.14,-1.35,-1.56,-1.74]]
        body.append(strip3('be6_roof_blade'+str(s),roofline,.018,paint,6))
        # Body lines are tiny dark insets, with no projecting silver bars.
        for line in [[(.82,1.074),(.83,.99),(.72,.53),(.62,.44)],
                     [(-.05,1.106),(-.055,.98),(-.17,.47)],
                     [(-1.01,1.13),(-1.075,1.01),(-.83,.55),(-.68,.46)]]:
            samples=[]
            for (ax,az),(bx,bz) in zip(line,line[1:]):
                for j in range(12):
                    x,z=ax+(bx-ax)*j/12,az+(bz-az)*j/12
                    samples.append((x,s*(body_y(x,z)+.006),z))
            x,z=line[-1]; samples.append((x,s*(body_y(x,z)+.006),z))
            body.append(strip3('be6_door_seam'+str(s),samples,.0032,seam,4))
        for hx in (.45,-.67):
            z=.962 if hx>0 else .988
            body.append(prism('be6_flush_handle'+str(s),[(hx-.075,z),(hx+.08,z+.002),(hx+.08,z+.025),(hx-.075,z+.025)],.016,black,surface=lambda x,z,s=s:s*(body_y(x,z)+.013)))
        # Squared wheel arches with deliberate flats; the body already has the
        # matching openings, so cladding never becomes a saw-tooth overlay.
        for wx in (-BE6_AXLE,BE6_AXLE):
            out=[(-.484,.327),(-.473,.551),(-.34,.752),(-.213,.843),(.213,.843),(.34,.752),(.473,.551),(.484,.327)]
            inside=[(.422,.331),(.415,.532),(.294,.704),(.176,.782),(-.176,.782),(-.294,.704),(-.415,.532),(-.422,.331)]
            shape=[(wx+x,z) for x,z in out+inside]
            body.append(prism('be6_arch'+str(s)+str(wx),shape,.068,clad,offset=s*.919,bevel=.012))
            # Inboard liner hides the bright road behind the fender from low views.
            body.append(prism('be6_arch_liner'+str(s)+str(wx),shape,.10,black,offset=s*.83))
        body.append(prism('be6_sill'+str(s),[(-.862,.326),(.862,.326),(.83,.467),(.38,.43),(-.59,.45),(-.83,.475)],.08,clad,offset=s*.89,bevel=.018))
        body.append(prism('be6_sill_blade'+str(s),[(-.71,.345),(.72,.345),(.69,.365),(-.67,.375)],.028,satin,offset=s*.936))
        body.append(prism('be6_fender_vent'+str(s),[(1.85,.813),(1.67,.819),(1.60,.911),(1.82,.885)],.014,black,surface=lambda x,z,s=s:s*(body_y(x,z)+.018)))
        # Compact aero mirrors; rear-facing glass is on the -X side.
        body.append(box('be6_mirror_stalk'+str(s),(.10,.20,.027),(.74,s*.88,1.127),black,bevel=.011,rot=(0,0,s*.22)))
        body.append(box('be6_mirror_cap'+str(s),(.17,.22,.09),(.735,s*1.005,1.168),black,bevel=.038))
        body.append(box('be6_mirror_glass'+str(s),(.013,.166,.052),(.65,s*1.009,1.168),satin,bevel=.017))
    # Front: slim upper mask, body-colour lower face, corner lamp pockets.
    body.append(face_panel('be6_upper_mask',[(-.79,.866),(.79,.866),(.797,.946),(-.797,.946)],2.099,black))
    body.append(face_panel('be6_lower_face',[(-.49,.509),(.49,.509),(.575,.699),(.68,.850),(-.68,.850),(-.575,.699)],2.102,paint))
    for s in (-1,1):
        body.append(face_panel('be6_light_pocket'+str(s),[(s*y,z) for y,z in [(.35,.925),(.80,.963),(.861,.898),(.867,.55),(.803,.465),(.553,.496),(.459,.686)]],2.111,black))
        body.append(face_panel('be6_corner_inset'+str(s),[(s*y,z) for y,z in [(.514,.683),(.572,.541),(.769,.521),(.794,.578),(.786,.823),(.645,.823)]],2.116,satin))
        body.append(face_panel('be6_projector'+str(s),[(s*.525,.854),(s*.713,.873),(s*.713,.905),(s*.525,.892)],2.121,led))
    body.append(face_panel('be6_front_valance',[(-.80,.324),(.80,.324),(.869,.438),(.829,.489),(-.829,.489),(-.869,.438)],2.089,clad))
    body.append(face_panel('be6_front_skid',[(-.59,.351),(.59,.351),(.55,.409),(.46,.446),(-.46,.446),(-.55,.409)],2.119,satin))
    body.append(face_panel('be6_lower_intake',[(-.43,.362),(.43,.362),(.42,.391),(-.42,.391)],2.136,black))
    body.append(box('be6_plate_f',(.014,.355,.09),(2.135,0,.611),plate,bevel=.009))
    body.append(vehicle_badge('be6_nose_badge','BE',(2.131,0,.956),.047,badge))
    # Clean rear hatch with separated upper lamps and an angular lower return.
    body.append(face_panel('be6_tail_gloss',[(-.79,.954),(.79,.954),(.777,1.057),(-.777,1.057)],-2.086,black,False))
    body.append(face_panel('be6_tail_hatch',[(-.735,.651),(.735,.651),(.787,.928),(-.787,.928)],-2.1,paint,False))
    body.append(face_panel('be6_rear_valance',[(-.81,.344),(.81,.344),(.856,.534),(.79,.599),(-.79,.599),(-.856,.534)],-2.1,clad,False))
    body.append(face_panel('be6_rear_skid',[(-.51,.363),(.51,.363),(.54,.416),(.4,.46),(-.4,.46),(-.54,.416)],-2.128,satin,False))
    body.append(box('be6_plate_r',(.014,.35,.09),(-2.14,0,.491),plate,bevel=.009))
    body.append(vehicle_badge('be6_tail_badge','BE 6',(-2.139,.41,.708),.050,satin,True))
    body.append(vehicle_badge('be6_plate_label_f','NORTHLINE',(2.145,0,.611),.026,badge))
    body.append(vehicle_badge('be6_plate_label_r','NORTHLINE',(-2.15,0,.491),.026,badge,True))
    for y in [-.37,-.18,.18,.37]: body.append(box('be6_diffuser_fin',(.14,.021,.072),(-2.03,y,.35),black,bevel=.008))
    # Twin aerodynamic lips follow the fastback glazing and the tail edge.
    body.append(box('be6_roof_spoiler',(.23,1.33,.036),(-1.03,0,1.524),black,bevel=.016,rot=(0,-.14,0)))
    body.append(box('be6_boot_spoiler',(.20,1.52,.035),(-1.874,0,1.14),black,bevel=.016,rot=(0,-.16,0)))
    for s in (-1,1):
        body.append(prism('be6_wing_end'+str(s),[(-1.91,1.117),(-1.77,1.152),(-1.72,1.21),(-1.77,1.204)],.028,black,offset=s*.733,bevel=.008))
    body.append(prism('be6_shark_fin',[(-.90,1.555),(-1.11,1.529),(-1.05,1.624),(-.97,1.614)],.032,black,bevel=.012))
    # Calipers remain with the chassis while the wheel meshes roll about their hubs.
    caliper=mat('be6_caliper',srgb(0xC8102E),roughness=.4)
    for wx in [-BE6_AXLE,BE6_AXLE]:
        for sy in [-1,1]:
            body.append(box('be6_fixed_caliper',(.07,.045,.17),(wx-.16,sy*.79,.462),caliper,bevel=.014,rot=(0,-.58,0)))
    bake_modifiers(body)
    shell=join('van_body',body,origin=(0,0,0))
    smooth(shell,angle=38)
    lights=[signature('be6_drl'+str(s),s,2.14,led) for s in (-1,1)]
    brakes=[signature('be6_tail'+str(s),s,-2.141,tail,False) for s in (-1,1)]
    brakes.append(box('be6_hmsl',(.016,.34,.013),(-1.15,0,1.527),tail,bevel=.005))
    smooth(join('van_lights',lights,origin=(0,0,0)),angle=35)
    bake_modifiers(brakes)
    smooth(join('van_brakes',brakes,origin=(0,0,0)),angle=35)
    amber=mat('be6_indicator',PAL['orange'],roughness=.30,emission=PAL['orange'],strength=.4)
    for tag,x,y,z in [('fl',2.103,.66,.89),('fr',2.103,-.66,.89),('rl',-2.09,.63,1.014),('rr',-2.09,-.63,1.014)]:
        box('van_ind_'+tag,(.022,.155,.016),(x,y,z),amber,bevel=.007)
    px,pz=-.28,1.588
    pod=[cylinder('be6_lidar_base',.10,.028,(px,0,pz),satin,verts=24),
         cylinder('be6_lidar_lens',.089,.052,(px,0,pz+.04),black,verts=24),
         cylinder('be6_lidar_top',.097,.022,(px,0,pz+.075),clad,verts=24),
         box('be6_lidar_eye',(.018,.049,.019),(px+.09,0,pz+.04),led,bevel=.006)]
    bake_modifiers(pod)
    smooth(join('van_pod',pod,origin=(px,0,pz)),angle=40)
    for tag,x,y in [('fl',BE6_AXLE,.792),('fr',BE6_AXLE,-.792),('rl',-BE6_AXLE,.792),('rr',-BE6_AXLE,-.792)]:
        alloy_wheel('van_wheel_'+tag,BE6_WHEEL_R,BE6_WHEEL_W,(x,y,BE6_WHEEL_R),outward=1 if y>0 else -1)
    global CAR_RADIUS
    CAR_RADIUS=BE6_WHEEL_R
    return shell
