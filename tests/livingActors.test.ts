import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as THREE from 'three'
import { loadKit } from '../src/three/kitLoader'
import { makePerson, makeChild, makeDog, makeCyclist, type Walker } from '../src/three/actors'

// This test can use the full embedded kit, or the isolated GLB from preview_living.py.
await loadKit()

function rotations(actor: Walker) {
  const values: number[] = []
  actor.group.traverse((object) => {
    if (object.name.endsWith('_pivot')) values.push(object.rotation.x, object.rotation.y, object.rotation.z)
  })
  return values
}

function simulate(make: () => Walker, fps: number, seconds = 2) {
  const actor = make()
  actor.walk(1.5, 0)
  actor.update?.(0, 0)
  for (let i = 1; i <= seconds * fps; i++) {
    actor.group.position.x = i / fps * 1.5
    actor.walk(1.5, i / fps)
    actor.update?.(i / fps, 1 / fps)
  }
  actor.group.updateMatrixWorld(true)
  return actor
}

const makers = {
  person: () => makePerson(0x45cdb5, 0x091c56),
  child: makeChild,
  dog: makeDog,
  cyclist: makeCyclist,
}

for (const [name, make] of Object.entries(makers)) {
  test(`${name}: equal travel produces the same gait at 30 and 60 fps`, () => {
    const a = rotations(simulate(make, 30))
    const b = rotations(simulate(make, 60))
    assert.equal(a.length, b.length)
    a.forEach((angle, i) => assert.ok(Math.abs(angle - b[i]) < 1e-8, `${name} joint ${i}: ${angle} vs ${b[i]}`))
  })
}

for (const [name, make] of Object.entries(makers).filter(([name]) => name !== 'cyclist')) {
  test(`${name}: stance feet contact the ground and all joints stay attached`, () => {
    const actor = make()
    actor.walk(1.5, 0)
    const prefix = name + '_'
    const feet: THREE.Object3D[] = []
    actor.group.traverse((o) => { if (o.name.startsWith(prefix + 'foot_') && o.name.endsWith('_pivot')) feet.push(o) })
    assert.equal(feet.length, name === 'dog' ? 4 : 2)
    for (let frame = 1; frame <= 120; frame++) {
      actor.group.position.x = frame * 0.025
      actor.walk(1.5, frame / 60)
      actor.update?.(frame / 60, 1 / 60)
      actor.group.updateMatrixWorld(true)
      const minima = feet.map((foot) => new THREE.Box3().setFromObject(foot).min.y)
      assert.ok(Math.min(...minima) >= -0.003, `${name}: foot beneath ground: ${minima}`)
      assert.ok(Math.min(...minima) < 0.030, `${name}: no grounded foot: ${minima}`)
      for (const foot of feet) {
        const shin = foot.parent!
        const upper = shin.parent!
        const a = shin.getWorldPosition(new THREE.Vector3())
        const b = upper.getWorldPosition(new THREE.Vector3())
        const expected = name === 'dog' ? 0.265 : (name === 'child' ? 0.415 * 0.72 : 0.415)
        assert.ok(Math.abs(a.distanceTo(b) - expected) < 1e-5, `${name}: detached knee`)
      }
    }
  })
}
