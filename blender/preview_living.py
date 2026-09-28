"""Build the living assets alone, export a QA kit, and render their silhouettes."""
import sys
import pathlib
import math
import bpy
from mathutils import Vector

sys.argv.append('--library')
_source = pathlib.Path(__file__).with_name('build_kit.py')
exec(compile(_source.read_text(encoding='utf8'), str(_source), 'exec'))
_living = pathlib.Path(__file__).with_name('living_assets.py')
exec(compile(_living.read_text(encoding='utf8'), str(_living), 'exec'))

OUT = pathlib.Path(sys.argv[sys.argv.index('--out') + 1]).resolve()
OUT.mkdir(parents=True, exist_ok=True)
clear_scene()
figure('person', PAL['mint'], PAL['navy'])
figure('child', PAL['yellow'], srgb(0x2F57C4), scale=.72, child=True)
make_cyclist()
make_dog()
actors = list(bpy.data.objects)
bpy.ops.export_scene.gltf(filepath=str(OUT / 'living-assets.glb'), export_format='GLB',
    export_apply=True, export_yup=True, export_skins=False, export_animations=False)
rows = [(obj.name, len(obj.data.polygons)) for obj in actors if obj.type == 'MESH']
(OUT / 'living-assets-report.txt').write_text('\n'.join(f'{name}: {faces}' for name, faces in rows), encoding='utf8')

def preview_hinge(obj):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    pivot = empty(obj.name + '_pivot', obj.location)
    obj.parent = pivot
    obj.location = (0, 0, 0)
    return pivot

def parent_keep(obj, parent):
    bpy.context.view_layer.update()
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world

def limb(upper, lower, x, z, length, bend=1):
    a = abs(lower.location.z)
    d = min(a + length - .0001, max(.015, math.hypot(x,z)))
    clamp = lambda x: max(-1,min(1,x))
    hip = math.atan2(x,-z) + math.acos(clamp((a*a+d*d-length*length)/(2*a*d))) * bend
    knee = -(math.pi-math.acos(clamp((a*a+length*length-d*d)/(2*a*length)))) * bend
    upper.rotation_euler.y = -hip
    lower.rotation_euler.y = -knee

def rig(prefix):
    root = empty(prefix + '_root')
    objects = [o for o in actors if o.name.startswith(prefix + '_')]
    for obj in objects: parent_keep(obj, root)
    body = preview_hinge(bpy.data.objects[prefix + '_body'])
    parent_keep(body, root)
    head = preview_hinge(bpy.data.objects[prefix + '_head'])
    parent_keep(head, body)
    arms, forearms, legs, shins = [], [], [], []
    for tag in ['l','r']:
        arm=preview_hinge(bpy.data.objects[prefix+'_arm_'+tag]); parent_keep(arm,body)
        forearm=preview_hinge(bpy.data.objects[prefix+'_forearm_'+tag]);parent_keep(forearm,arm)
        leg=preview_hinge(bpy.data.objects[prefix+'_leg_'+tag]);parent_keep(leg,root)
        shin=preview_hinge(bpy.data.objects[prefix+'_shin_'+tag]);parent_keep(shin,leg)
        foot=preview_hinge(bpy.data.objects[prefix+'_foot_'+tag]);parent_keep(foot,shin)
        arms.append(arm);forearms.append(forearm);legs.append(leg);shins.append(shin)
    return root,body,head,arms,forearms,legs,shins

adult=rig('person')
child=rig('child')
for subject,phase,scale in [(adult,.45,1),(child,3.7,.72)]:
    root,body,head,arms,forearms,legs,shins=subject
    stance_x=(1-2*(phase%math.pi)/math.pi)*.34*scale
    bob=.080*scale+math.sqrt((.826*scale)**2-stance_x**2)-.91*scale
    root.location.z=bob
    for i in range(2):
        angle=(phase+i*math.pi)%math.tau
        stance=angle<math.pi
        x=(1-2*angle/math.pi if stance else -math.cos(angle-math.pi))*.34*scale
        lift=0 if stance else math.sin(angle-math.pi)*.13*scale
        limb(legs[i],shins[i],x,.080*scale+lift-legs[i].location.z-bob,.415*scale)
        bpy.data.objects[('person' if scale==1 else 'child')+'_foot_'+('l' if i==0 else 'r')+'_pivot'].rotation_euler.y=-(legs[i].rotation_euler.y+shins[i].rotation_euler.y)
        arms[i].rotation_euler.y=math.cos(phase+i*math.pi)*(.56 if scale<1 else .35)
        forearms[i].rotation_euler.y=-.7 if scale<1 else -.2
adult[0].location.x=0;adult[0].location.y=1.85
child[0].location.x=.10;child[0].location.y=.75

rider=rig('rider')
root,body,head,arms,forearms,legs,shins=rider
root.location=(-.315,0,.155)
body.rotation_euler.y=.75
head.rotation_euler.y=-.53
for i in range(2):
    angle=.8+i*math.pi
    fx=-.08+math.sin(angle)*.17
    fz=.36+math.cos(angle)*.17
    limb(legs[i],shins[i],fx-root.location.x,fz+.070-root.location.z-legs[i].location.z,.415)
    bpy.data.objects['rider_foot_'+('l' if i==0 else 'r')+'_pivot'].rotation_euler.y=-(legs[i].rotation_euler.y+shins[i].rotation_euler.y)
    pedal=bpy.data.objects['cyclist_pedal_'+('l' if i==0 else 'r')]
    pedal.location.x=fx;pedal.location.z=fz
bpy.context.view_layer.update()
for i in range(2):
    target=body.matrix_world.inverted()@Vector((.49, .235 if i==0 else -.235, 1.17))
    target-=arms[i].location
    limb(arms[i],forearms[i],target.x,target.z,.246,-1)
cycle_root=empty('cycle_root')
parent_keep(root,cycle_root)
for obj in [o for o in actors if o.name.startswith('cyclist_')]:parent_keep(obj,cycle_root)
cycle_root.location=(.1,-2.0,0)

dogroot=empty('dog_root')
for obj in [o for o in actors if o.name.startswith('dog_')]:parent_keep(obj,dogroot)
for i,tag in enumerate(['fl','fr','rl','rr']):
    leg=preview_hinge(bpy.data.objects['dog_leg_'+tag]);parent_keep(leg,dogroot)
    shin=preview_hinge(bpy.data.objects['dog_shin_'+tag]);parent_keep(shin,leg)
    foot=preview_hinge(bpy.data.objects['dog_foot_'+tag]);parent_keep(foot,shin)
    angle=(.65+(0 if i in [0,3] else math.pi))%math.tau
    stance=angle<math.pi
    x=(1-2*angle/math.pi if stance else -math.cos(angle-math.pi))*.22
    lift=0 if stance else math.sin(angle-math.pi)*.085
    bob=.065+math.sqrt(.473**2-((1-2*(.65%math.pi)/math.pi)*.22)**2)-.54
    limb(leg,shin,x,.065+lift-leg.location.z-bob,.21,-1 if i<2 else 1)
    foot.rotation_euler.y=-(leg.rotation_euler.y+shin.rotation_euler.y)
dogroot.location=(.30,-.35,bob)

box('studio_floor',(200,200,.2),(0,0,-.1),mat('studio_floor',srgb(0xCBD5D8)))
world=bpy.data.worlds.new('Living asset studio')
world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.62,.72,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.65
bpy.context.scene.world=world
for name,loc,energy,size in [('key',(4,-3,7),1200,7),('fill',(1,6,5),700,6),('rim',(-4,-2,5),900,5)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size
    lamp=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(lamp)
    lamp.location=loc;lamp.rotation_euler=(-Vector(loc)).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=1500;scene.render.resolution_y=920;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
camera_data=bpy.data.cameras.new('camera');camera_data.type='ORTHO';camera_data.ortho_scale=5.5
camera=bpy.data.objects.new('camera',camera_data);bpy.context.collection.objects.link(camera)
scene.camera=camera
camera.location=(7,-5,3.5)
camera.rotation_euler=(Vector((0,-.15,.88))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(OUT/'living-assets.png')
bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'living-assets-preview.blend'))
print('LIVING_ASSETS_OK',sum(n for _,n in rows),'faces',len(rows),'objects')
