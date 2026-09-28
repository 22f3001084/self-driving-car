# Parking and clinic forecourt

The old scenery cars were centered at street Z=-10.9 m on the pavement and turned across the pedestrian route. They are now placed only inside marked off-street parking lots. The original driving road remains unchanged.

- Pedestrian pavements occupy |Z|=9.54–13 m. Each lot starts at |Z|=13.3 m and ends at 23.7 m. Cars are centered at |Z|=20.65 m; their closest body edge is beyond 18.7 m. Car wheels sit at the lot's 0.022 m surface height.
- Lot footprint: 15.4 m along X, 10.4 m deep. It contains three 3 m standard bays, one wider blue accessible bay with an adjacent striped access zone, a 4.7 m clear aisle, wheel stops, perimeter kerbs and a parking sign. Two standard bays are occupied; the wider bay stays empty.
- Far-side lots start at X=30 m and repeat every 78 m. Trees, benches, bins and lamps avoid their footprint or driveway. Rail gaps and surfaced driveway crossings provide access while keeping the walking pavement continuous.
- If the delivery bay is at X=B, visitor parking is centered at (B-16.3,18.5), with footprint X=[B-24,B-8.6]. The existing clinic begins at X=B-6.8, leaving 1.8 m separation. Its entrance remains at (B+3,21.2).
- The clinic has a paved 16.5×8 m forecourt, a 3.6 m entrance walk, a 1.6 m parking connection, benches, planted edges and bollards outside the entrance path.

The new compact car has a shaped metal body, sloping glass cabin, body-colour pillars, clean wheel arches, four round hollow tyres with alloy spokes, headlights, rear lights, mirrors, door handles and bumpers. Three paint variants retain their existing `parked_blue`, `parked_yellow` and `parked_white` names. It faces +X and stands on the ground at Y=0 after glTF export. Cars and lots are instanced at runtime.

Sources: `parking_assets.py`, loaded by `build_kit.py`, and `src/three/roadSystem.ts`. Inspection helpers: `parking_preview.py` and `parking_export.py`. These do not rebuild the full game kit.

Verification: TypeScript build passes. All nine tests in `tests/parking-layout.test.ts` pass, including actual exported wheel-ground height, compact dimensions, bay clearance, pedestrian separation across five route lengths, deterministic layouts and clinic/building separation. Compact standalone: `out/compact-car.glb`, 416,800 bytes and 14,724 triangles. Front/rear compact renders and a complete lot render were inspected.

Run the geometry tests from the source folder:

```powershell
node node_modules/esbuild/bin/esbuild tests/parking-layout.test.ts --bundle --platform=node --format=cjs --outfile=tmp/tests/parking-layout.test.cjs
node --test tmp/tests/parking-layout.test.cjs
```
