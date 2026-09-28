"""Repeatable car-only studio review and editable .blend delivery.
Run: blender -b --factory-startup --python blender/be6_preview.py
"""
import pathlib, sys, math
import bpy
from mathutils import Vector

HERE=pathlib.Path(__file__).parent
sys.argv.append('--library')
source=HERE/'build_kit.py'
exec(compile(source.read_text(encoding='utf8'),str(source),'exec'))
clear_scene()
make_be6_car()
OUT=HERE/'out'
OUT.mkdir(exist_ok=True)

# Save just the reusable authored vehicle before adding the studio.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Mahindra-BE6-Game-Asset.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'Mahindra-BE6-Game-Asset.glb'),export_format='GLB',
    export_apply=True,export_animations=False,export_skins=False,export_lights=False,export_cameras=False)
floor=box('studio_floor',(100,100,.2),(0,0,-.1),mat('studio_mat',srgb(0x8C969C),roughness=.6))
world=bpy.data.worlds.new('BE6 studio')
world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.25,.30,.36,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.75
bpy.context.scene.world=world
for name,loc,power,size in [('key',(5,-6,7),2200,7),('fill',(2,5,5),1600,8),('rim',(-5,-2,5),2000,5)]:
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.shape='DISK'; data.size=size
    lamp=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(lamp)
    lamp.location=loc; lamp.rotation_euler=(-Vector(loc)).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=1440
scene.render.resolution_y=900
scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
camd=bpy.data.cameras.new('studio_camera'); camd.lens=62
cam=bpy.data.objects.new('studio_camera',camd); bpy.context.collection.objects.link(cam); scene.camera=cam
for name,az,el,dist in [('front-threequarter',38,15,9.0),('rear-threequarter',218,18,9.0),('side',90,5,8.5),('front',0,9,8.2)]:
    a,e=math.radians(az),math.radians(el)
    cam.location=(dist*math.cos(a)*math.cos(e),dist*math.sin(a)*math.cos(e),.82+dist*math.sin(e))
    cam.rotation_euler=(Vector((0,0,.82))-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(OUT/('BE6-'+name+'.png'))
    bpy.ops.render.render(write_still=True)
    print('BE6_PREVIEW',scene.render.filepath)
objects=[o for o in bpy.data.objects if o.type=='MESH' and o!=floor]
print('BE6_FACES',sum(len(o.data.polygons) for o in objects))
print('BE6_OBJECTS',[(o.name,tuple(round(v,4) for v in o.location)) for o in objects])
