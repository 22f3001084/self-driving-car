"""Street compact cars and marked off-street parking modules.

Loaded after the vehicle helpers by build_kit.py. Cars face +X, stand on Z=0,
and remain one material-partitioned mesh so repeated scenery can be instanced.
The parking module uses 15.4 x 10.4 m, with no road or pedestrian paving in it.
"""


def compact_loft(name, stations, material):
    vs,faces=[],[]
    for x,w,z0,z1 in stations:
        ring=[(0,z1),(.70*w,z1-.013),(.96*w,z1-.095),(w,max(z0+.02,z1-.18)),
              (.98*w,z0),(.64*w,z0-.025),(.58*w,.22),(0,.22)]
        ring += [(-y,z) for y,z in ring[-2:0:-1]]
        vs.extend((x,y,z) for y,z in ring)
    n=14
    for i in range(len(stations)-1):
        for j in range(n): faces.append((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j))
    faces += [tuple(reversed(range(n))),tuple((len(stations)-1)*n+j for j in range(n))]
    obj=mesh_part(name,vs,faces,material)
    mod=obj.modifiers.new('Pressed compact radii','BEVEL'); mod.width=.018; mod.segments=2
    mod.limit_method='ANGLE'; mod.angle_limit=math.radians(40)
    return obj


def make_parked_car(name,colour):
    paint=mat(name+'_paint',colour,roughness=.30,metallic=.22)
    paint.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value=.24
    glass=mat('compact_glass',srgb(0x203745),roughness=.18,metallic=.3)
    dark=mat('compact_trim',srgb(0x252D34),roughness=.58)
    rubber=mat('compact_tyre',srgb(0x20242A),roughness=.85)
    alloy=mat('compact_alloy',srgb(0xA7B1B8),roughness=.28,metallic=.72)
    light=mat('compact_lamp',srgb(0xE3F1F4),roughness=.22)
    red=mat('compact_tail',srgb(0xA61F32),roughness=.25)
    xs=[-1.91,-1.85,-1.65,-1.49,-1.35,-1.16,-.97,-.83,-.67,-.45,0,.45,.67,.83,.97,1.16,1.35,1.49,1.65,1.85,1.91]
    stations=[]
    for x in xs:
        dist=min(abs(x-1.16),abs(x+1.16))
        floor=lerp_table([(0,.688),(.15,.67),(.25,.59),(.35,.43),(.405,.26),(.50,.26)],dist)
        width=lerp_table([(-1.91,.715),(-1.60,.79),(-1.16,.815),(0,.795),(1.16,.815),(1.65,.80),(1.91,.728)],x)
        top=lerp_table([(-1.91,.873),(-1.60,.974),(-.9,.967),(.67,.94),(1.30,.858),(1.91,.757)],x)
        stations.append((x,width,floor,top))
    parts=[compact_loft(name+'_body',stations,paint)]
    # A compact hatch with visibly raked windscreen and rear hatch, roof and
    # body-colour pillars. Glass never appears as a floating rectangular box.
    cs=[(-1.64,.70,.61,.945),(-1.32,.728,.60,1.262),(-1.05,.734,.60,1.402),
        (-.55,.733,.60,1.444),(.12,.726,.61,1.405),(.43,.722,.64,1.255),(.75,.71,.68,.95)]
    vertices,faces=[],[]
    for x,b,r,z in cs:
        vertices.extend([(x,-b,.916),(x,-r,z-.016),(x,0,z),(x,r,z-.016),(x,b,.916)])
    for i in range(len(cs)-1):
        for j in range(4): faces.append((i*5+j,i*5+j+1,(i+1)*5+j+1,(i+1)*5+j))
    parts.append(mesh_part(name+'_canopy',vertices,faces,glass))
    def surface(s,x,z):
        b=lerp_table([(x,b) for x,b,r,t in cs],x)
        r=lerp_table([(x,r) for x,b,r,t in cs],x)
        t=lerp_table([(x,t) for x,b,r,t in cs],x)
        return s*(b+(r-b)*max(0,min(1,(z-.916)/max(.02,t-.916))))+.008*s
    for s in [-1,1]:
        surf=lambda x,z,s=s:surface(s,x,z)
        dlo=[(.685,.97),(.35,1.246),(.045,1.364),(-.96,1.374),(-1.29,1.25),(-1.40,1.02),(-.82,.979)]
        parts.extend(band(name+'_windowseal'+str(s),dlo,.023,.016,dark,surf))
        parts.append(prism(name+'_apillar'+str(s),[(.765,.922),(.685,.968),(.35,1.247),(.17,1.356),(.25,1.35),(.45,1.248)],.025,paint,surface=surf))
        parts.append(prism(name+'_bpillar'+str(s),[(-.34,.95),(-.255,.95),(-.22,1.405),(-.305,1.417)],.019,dark,surface=surf))
        parts.append(prism(name+'_cpillar'+str(s),[(-1.64,.944),(-1.48,.961),(-1.32,1.25),(-1.02,1.402),(-1.12,1.39),(-1.4,1.23)],.032,paint,surface=surf))
        # Door joins sampled densely onto the body's actual section.
        for dx in [.66,-.32,-1.18]:
            ztop=lerp_table([(x,t) for x,w,b,t in stations],dx)-.035
            low=max(.29,lerp_table([(x,b) for x,w,b,t in stations],dx)+.025)
            width=lerp_table([(x,w) for x,w,b,t in stations],dx)
            pts=[]
            for i in range(13):
                z=low+(ztop-low)*i/12
                h=lerp_table([(low,width*.98),(ztop-.15,width),(ztop-.06,width*.96),(ztop+.035,width*.70)],z)
                pts.append((dx,s*(h+.005),z))
            parts.append(strip3(name+'_doorline',pts,.003,dark,4))
        for hx in [.25,-.80]:
            parts.append(box(name+'_handle',(.14,.021,.023),(hx,s*.793,.807),dark,bevel=.006))
        parts.append(box(name+'_mirror_stem',(.055,.12,.022),(.50,s*.762,1.001),dark))
        parts.append(box(name+'_mirror',(.142,.16,.075),(.47,s*.862,1.035),paint,bevel=.026))
        parts.append(box(name+'_mirror_glass',(.015,.105,.045),(.391,s*.866,1.035),glass,bevel=.011))
        parts.append(box(name+'_sill',(1.40,.052,.055),(0,s*.783,.266),dark,bevel=.015))
        for wx in [-1.16,1.16]:
            outline=[]
            for i in range(17):
                a=math.pi*i/16
                outline.append((wx-.396*math.cos(a),.285+.413*math.sin(a)))
            for i in range(16,-1,-1):
                a=math.pi*i/16
                outline.append((wx-.352*math.cos(a),.285+.360*math.sin(a)))
            parts.append(prism(name+'_arch',outline,.035,dark,offset=s*.819))
    # Roof panel rests on the canopy instead of being a separate block.
    rv,rf=[],[]
    for i in range(9):
        x=-1.025+1.175*i/8
        z=lerp_table([(x,t) for x,b,r,t in cs],x)
        for y,dz in [(-.608,-.012),(0,.012),(.608,-.012)]: rv.append((x,y,z+dz))
    for i in range(8):
        for j in range(2): rf.append((i*3+j,i*3+j+1,(i+1)*3+j+1,(i+1)*3+j))
    parts.append(mesh_part(name+'_roof',rv,rf,paint))
    parts.append(box(name+'_front_bumper',(.16,1.39,.125),(1.86,0,.337),dark,bevel=.045))
    parts.append(box(name+'_rear_bumper',(.14,1.39,.106),(-1.86,0,.324),dark,bevel=.043))
    parts.append(box(name+'_grille',(.028,.64,.095),(1.926,0,.543),dark,bevel=.018))
    parts.append(box(name+'_plate_f',(.02,.30,.068),(1.938,0,.398),light,bevel=.008))
    parts.append(box(name+'_plate_r',(.02,.30,.068),(-1.934,0,.469),light,bevel=.008))
    for s in [-1,1]:
        parts.append(box(name+'_headlamp',(.045,.275,.085),(1.91,s*.50,.662),light,bevel=.027))
        parts.append(box(name+'_taillamp',(.035,.208,.133),(-1.91,s*.51,.748),red,bevel=.028))
    # Four truly round hollow tyres, alloy faces, five spokes and central hubs.
    for wx in [-1.16,1.16]:
        for s in [-1,1]:
            hub=(wx,s*.759,.305)
            wheel=tube(name+'_tyre',.305,.215,.184,rubber,segments=32)
            wheel.location=hub
            bevel=wheel.modifiers.new('Tyre shoulder','BEVEL'); bevel.width=.018; bevel.segments=2
            parts.append(wheel)
            parts.append(torus(name+'_rim',.209,.014,(wx,s*.858,.305),alloy,rot=(math.pi/2,0,0),major_seg=24,minor_seg=4))
            parts.append(cylinder(name+'_brake',.183,.015,(wx,s*.79,.305),dark,verts=24,rot=(math.pi/2,0,0)))
            for i in range(5):
                a=i*math.tau/5
                parts.append(box(name+'_spoke',(.155,.026,.031),(wx+.123*math.cos(a),s*.849,.305+.123*math.sin(a)),alloy,bevel=.009,rot=(0,-a,0)))
            parts.append(cylinder(name+'_hub',.065,.032,(wx,s*.861,.305),alloy,verts=16,rot=(math.pi/2,0,0)))
    bake_modifiers(parts)
    obj=join(name,parts,origin=(0,0,0))
    smooth(obj,angle=42)
    return obj


def make_parking_lot():
    """Four marked bays behind a 4.7 m access aisle; one wider accessible bay.
    At runtime the front of the module is local +Z, toward the street on the
    far side. Blender +Y is the bay row, exported as local -Z.
    """
    asphalt=mat('parking_asphalt',srgb(0x58666B),roughness=.96)
    paint=mat('parking_white',srgb(0xE0E4DE),roughness=.95)
    blue=mat('parking_accessible',srgb(0x317E9B),roughness=.9)
    concrete=mat('parking_kerb',srgb(0xB6BEB8),roughness=.92)
    parts=[box('parking_surface',(15.4,10.4,.10),(0,0,-.03),asphalt)]
    # Bays extend from Y=-.5 to +4.8. Their aisle is Y=-5.2 to -.5.
    for x in [-6.6,-3.6,-.6,2.4,6.6]:
        parts.append(box('parking_line',(.075,5.30,.014),(x,2.15,.027),paint))
    parts.append(box('parking_backline',(13.2,.075,.014),(0,4.8,.027),paint))
    parts.append(box('parking_accessible_pad',(3.99,5.17,.012),(4.5,2.15,.026),blue))
    # The access aisle of the wider bay remains clear of a parked vehicle.
    for i in range(8):
        parts.append(box('parking_access_hatch',(.70,.062,.016),(5.94,-.12+i*.64,.043),paint,rot=(0,0,.55)))
    for x in [-5.1,-2.1,.9,3.95]:
        parts.append(box('parking_wheelstop',(1.55,.17,.12),(x,4.45,.08),concrete,bevel=.035))
    # Low kerbs only on the back and outer edges; the front remains accessible.
    parts.append(box('parking_rear_kerb',(15.4,.18,.14),(0,5.11,.075),concrete,bevel=.025))
    for s in [-1,1]: parts.append(box('parking_side_kerb',(.18,10.4,.14),(s*7.61,0,.075),concrete,bevel=.025))
    sign=mat('parking_sign_blue',srgb(0x225D83),roughness=.55)
    pole=mat('parking_sign_pole',srgb(0x747E82),roughness=.45,metallic=.55)
    parts.append(cylinder('parking_signpost',.04,2.35,(6.9,-4.65,1.175),pole,verts=10))
    parts.append(box('parking_sign',(.57,.06,.62),(6.9,-4.68,2.25),sign,bevel=.027))
    letter=bpy.data.curves.new('parking_P','FONT'); letter.body='P'; letter.size=.45
    letter.align_x='CENTER'; letter.align_y='CENTER'; letter.resolution_u=2
    ob=bpy.data.objects.new('parking_P',letter); bpy.context.collection.objects.link(ob)
    ob.location=(6.9,-4.716,2.25); ob.rotation_euler=(math.pi/2,0,0); ob.data.materials.append(paint)
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active=ob
    bpy.ops.object.convert(target='MESH'); parts.append(bpy.context.object)
    bake_modifiers(parts)
    obj=join('parking_lot',parts,origin=(0,0,0)); smooth(obj,angle=35)
    return obj
