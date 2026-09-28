import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { loadKit, kitNames, assemble } from '../src/three/kitLoader'
import { makeVan, makePerson, makeChild, makeDog, makeCyclist } from '../src/three/actors'

const ready = loadKit()
test('Blender kit contains every required vehicle, scenery and articulated actor', async () => {
  await ready
  const names = kitNames()
  for (const n of ['van_body','van_brakes','van_lights','van_wheel_fl','van_wheel_fr','van_wheel_rl','van_wheel_rr','person_body','child_body','dog_body','dog_tail','cyclist_frame','tree','tree_tall','planting_bed','road_straight','road_crossing','road_works','road_bay','ambulance_body']) {
    assert.ok(names.includes(n), `Missing game asset: ${n}`)
  }
})
test('BE 6 dimensions and four tyre contact patches match the road simulation', async () => {
  await ready
  const model = assemble('van_')
  model.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  assert.ok(size.x > 4.05 && size.x < 4.5, `Car length: ${size.x}`)
  assert.ok(size.z > 1.75 && size.z < 2.3, `Car width: ${size.z}`)
  assert.ok(size.y > 1.4 && size.y < 1.95, `Car height: ${size.y}`)
  for (const tag of ['fl','fr','rl','rr']) {
    const wheel = model.getObjectByName(`van_wheel_${tag}`)!
    const b = new THREE.Box3().setFromObject(wheel)
    assert.ok(Math.abs(b.min.y) < 0.045, `${tag} wheel floats or penetrates ground: ${b.min.y}`)
    assert.ok(b.max.y - b.min.y > 0.68 && b.max.y - b.min.y < 0.82, `${tag} tyre diameter changed`)
  }
})
test('Wheels stop, steer together and roll from actual vehicle speed', async () => {
  await ready
  const car = makeVan('test')
  const roller = car.group.getObjectByName('van_wheel_fl_pivot')!
  const before = roller.rotation.z
  car.drive(0, 1)
  assert.equal(roller.rotation.z, before)
  car.drive(1, 0.2)
  assert.ok(Math.abs(roller.rotation.z - before) > 0.4)
  car.steer(0.25)
  assert.equal(car.group.getObjectByName('van_wheel_fl_pivot_pivot')!.rotation.y,0.25)
  assert.equal(car.group.getObjectByName('van_wheel_fr_pivot_pivot')!.rotation.y,0.25)
})
test('Every moving figure remains finite through walking, stopping and restarting', async () => {
  await ready
  const actors = [makePerson(0x227b89,0x243a55),makeChild(),makeDog(),makeCyclist()]
  for (const actor of actors) {
    for (let i=0;i<360;i++) {
      const speed = i<120 ? 1.4 : i<240 ? 0 : 2
      actor.group.position.x += speed/60
      actor.walk(speed, i/60)
      actor.update?.(i/60,1/60)
      actor.group.updateMatrixWorld(true)
      actor.group.traverse(o => assert.ok(o.matrixWorld.elements.every(Number.isFinite), `Invalid transform on ${o.name}`))
    }
    const b = new THREE.Box3().setFromObject(actor.group)
    assert.ok(b.min.y > -0.3, `${actor.group.name} feet too far below ground: ${b.min.y}`)
    assert.ok(b.max.y < 2.8, `${actor.group.name} anatomy broke: ${b.max.y}`)
  }
})
