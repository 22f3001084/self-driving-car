"""Editable parking diorama for asset inspection; does not rebuild the game kit."""
import pathlib,sys,math
import bpy
HERE=pathlib.Path(__file__).parent
sys.argv.append('--library')
source=HERE/'build_kit.py'
exec(compile(source.read_text(encoding='utf8'),str(source),'exec'))
clear_scene()
make_parking_lot()
for name,x,colour in [('parked_blue',-5.1,0x4A79C4),('parked_yellow',.9,0xDDB34E)]:
    car=make_parked_car(name,srgb(colour))
    car.location=(x,2.15,.022)
    car.rotation_euler.z=-math.pi/2
out=HERE/'out'
bpy.ops.wm.save_as_mainfile(filepath=str(out/'Northline-Parking-Diorama.blend'))
bpy.ops.export_scene.gltf(filepath=str(out/'Northline-Parking-Diorama.glb'),export_format='GLB',
    export_apply=True,export_animations=False,export_cameras=False,export_lights=False)
print('PARKING_EXPORT_OK')
