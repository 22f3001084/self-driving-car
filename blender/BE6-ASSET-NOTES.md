# BE 6 game asset

The duplicate edition uses an original Blender-authored, game-scale interpretation of the Mahindra BE 6. It was modeled from the [official exterior photographs and specification brochure](https://www.mahindraelectricsuv.com/on/demandware.static/-/Library-Sites-eSUVSharedLibrary/default/dw5781af15/MBE6/BE6_SPORTEQ_Brochure.pdf). The supplied educational lidar and Northline registration plates are game additions.

`be6.py` contains reusable construction helpers also used by the ambulance. It loads the new exterior from `be6_refined.py`. The finished car has a pearl body, tapering dark canopy, sculpted bonnet with an aero bridge, continuous polygonal wheel arches, flush door handles, integrated C-shaped front and rear light signatures, two rear aerodynamic lips, and separate wheels and sensor pod. The brake calipers stay with the body while the wheels rotate.

Run `blender --background --factory-startup --python blender/be6_preview.py` from this source folder to rebuild the car-only `.blend` and `.glb` and render four studio inspection views. The parent kit builder also loads this exterior automatically.

The final exports are `out/Mahindra-BE6-Game-Asset.blend` and `out/Mahindra-BE6-Game-Asset.glb`. The final inspection views are `out/BE6-front-threequarter.png`, `out/BE6-rear-threequarter.png`, `out/BE6-side.png`, and `out/BE6-front.png`.

Validation: Blender 5.2 built and exported the car successfully; front, side, and rear renders were inspected. The car-only GLB contains exactly the 12 expected runtime nodes, 23,339 triangles, and 17 materials, and is 834,464 bytes. It uses no external textures.

Coordinate contract: Blender is Z-up, forward is +X. Body length is 4.20 m, wheelbase 2.667 m, and nominal wheel radius is 0.361 m. Wheel centers are `(±1.3335, ±0.792, 0.361)` in Blender, converted to `(±1.3335, 0.361, ∓0.792)` in Three.js. Trim extends about 4 cm beyond the nominal body ends. The lidar origin is `(-0.28, 0, 1.588)` in Blender. All `van_body`, `van_pod`, `van_lights`, `van_brakes`, `van_wheel_*`, and `van_ind_*` names are preserved.
