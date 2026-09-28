"""Render the independent compact car and off-street lot without a full kit build."""
import pathlib,sys,math
import bpy
from mathutils import Vector
HERE=pathlib.Path(__file__).parent
sys.argv.append('--library')
source=HERE/'build_kit.py'
exec(compile(source.read_text(encoding='utf8'),str(source),'exec'))
OUT=HERE/'out'; OUT.mkdir(exist_ok=True)
clear_scene()
car=make_parked_car('parked_blue',srgb(0x4A79C4))
bpy.ops.export_scene.gltf(filepath=str(OUT/'compact-car.glb'),export_format='GLB',export_apply=True,export_animations=False)
floor=box('studio_floor',(90,90,.12),(0,0,-.065),mat('parking_preview_floor',srgb(0x82918D),roughness=.8))
world=bpy.data.worlds.new('parking_studio'); world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.35,.4,.46,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
scene=bpy.context.scene; scene.world=world
scene.render.engine='CYCLES'; scene.cycles.samples=24; scene.cycles.use_denoising=True
scene.render.resolution_x=1440; scene.render.resolution_y=900; scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'; scene.view_settings.look='AgX - Medium High Contrast'
for name,loc,power,size in [('key',(5,-6,8),2500,7),('fill',(-5,6,5),1700,6)]:
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.size=size
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj); obj.location=loc
    obj.rotation_euler=(-Vector(loc)).to_track_quat('-Z','Y').to_euler()
cd=bpy.data.cameras.new('preview_camera'); cd.lens=55
cam=bpy.data.objects.new('preview_camera',cd); bpy.context.collection.objects.link(cam); scene.camera=cam
def render(name,loc,target):
    cam.location=loc; cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(OUT/(name+'.png')); bpy.ops.render.render(write_still=True)
render('parking-compact-front',(6,-7,3.4),(0,0,.70))
render('parking-compact-rear',(-6,7,3.2),(0,0,.70))
car.location=(-5.1,2.15,.022); car.rotation_euler.z=-math.pi/2
second=make_parked_car('parked_yellow',srgb(0xDDB34E)); second.location=(.9,2.15,.022); second.rotation_euler.z=-math.pi/2
make_parking_lot()
# Soft large light makes the complete parking footprint readable.
data=bpy.data.lights.new('lot_key','AREA'); data.energy=4200; data.size=16
obj=bpy.data.objects.new('lot_key',data); bpy.context.collection.objects.link(obj); obj.location=(0,-2,12)
render('parking-lot-overview',(16,-20,19),(0,0,.2))
print('PARKING_PREVIEW_OK')
