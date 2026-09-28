import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PARKING_LOT, planParkingPlots } from '../src/three/roadSystem'

const FOOTPATH_INNER = 9.54
const FOOTPATH_OUTER = 13

function compactBounds() {
  const buffer = readFileSync('blender/out/compact-car.glb')
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF')
  const jsonLength = buffer.readUInt32LE(12)
  const gltf = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength))
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    const positions = gltf.accessors[primitive.attributes.POSITION]
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], positions.min[axis])
      max[axis] = Math.max(max[axis], positions.max[axis])
    }
  }
  return { min, max, gltf }
}

test('the actual exported compact stands on the ground and has correct proportions', () => {
  const { min, max, gltf } = compactBounds()
  assert.ok(Math.abs(min[1]) < .005, `wheel contact y=${min[1]}`)
  assert.ok(max[0] - min[0] > 3.75 && max[0] - min[0] < 4.1)
  assert.ok(max[2] - min[2] > 1.6 && max[2] - min[2] < 1.95)
  assert.ok(max[1] > 1.35 && max[1] < 1.50)
  assert.equal(gltf.nodes.length, 1)
  assert.equal(gltf.nodes[0].name, 'parked_blue')
})

for (const length of [30, 80, 160, 320, 640]) {
  test(`all parking and parked-car bounds avoid the footpaths on a ${length} m route`, () => {
    const { min, max } = compactBounds()
    const plots = planParkingPlots(length, length - 12)
    for (const plot of plots) {
      const nearestLotEdge = Math.abs(plot.z) - PARKING_LOT.depth / 2
      assert.ok(nearestLotEdge > FOOTPATH_OUTER, `lot edge ${nearestLotEdge}`)
      const rowZ = plot.z + plot.side * PARKING_LOT.carRow
      // Cars turn by ±90 degrees: their authored X extent becomes street Z.
      const nearestCarEdge = Math.abs(rowZ) - Math.max(Math.abs(min[0]), Math.abs(max[0]))
      assert.ok(nearestCarEdge > FOOTPATH_OUTER + 5, `car edge ${nearestCarEdge}`)
      assert.ok(nearestCarEdge > FOOTPATH_INNER)
      assert.ok(nearestCarEdge > nearestLotEdge + 4.7, 'the parking access aisle is clear')
      assert.ok(Math.abs(rowZ) + Math.max(Math.abs(min[0]), Math.abs(max[0])) < Math.abs(plot.z) + PARKING_LOT.depth / 2)
    }
  })
}

test('both occupied cars fit their 3 m marked standard bays', () => {
  const { min, max } = compactBounds()
  // Authored lateral Z becomes world X after parking orientation.
  assert.ok(max[2] - min[2] < 3.0 - .8, 'each side has a clear opening margin')
  for (const slot of [-5.1, .9]) {
    assert.ok(slot + min[2] > -PARKING_LOT.width / 2)
    assert.ok(slot + max[2] < PARKING_LOT.width / 2)
    assert.ok(slot + max[2] < 2.4, 'the accessible bay starts at x=2.4 and remains unoccupied')
  }
})

test('visitor parking stays separate from the clinic and its entrance walk', () => {
  const bayX = 288
  const visitor = planParkingPlots(320, bayX).find((plot) => plot.hospital)!
  const lotRight = visitor.x + PARKING_LOT.width / 2
  const clinicLeft = bayX + 3 - 14 * 1.4 / 2
  const walkLeft = bayX + 3 - 3.6 / 2
  assert.ok(clinicLeft - lotRight >= 1.79, 'at least 1.8 m between parking and building')
  assert.ok(lotRight < walkLeft)
  assert.ok(visitor.side === 1 && visitor.z > FOOTPATH_OUTER)
})

test('plots are deterministic, separated and never create near-side street parking', () => {
  const a = planParkingPlots(640)
  assert.deepEqual(a, planParkingPlots(640))
  assert.ok(a.every((plot) => plot.side === -1 && !plot.hospital))
  for (let i = 1; i < a.length; i++) assert.ok(a[i].x - a[i - 1].x > PARKING_LOT.width + 10)
})
