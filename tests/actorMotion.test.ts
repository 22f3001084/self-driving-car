import { Stage, ROAD_HALF } from '../src/three/stage'
import * as THREE from 'three'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadKit } from '../src/three/kitLoader'
import { makeBall } from '../src/three/actors'

function shell() {
  const stage = Object.create(Stage.prototype) as any
  stage.simTime = 0
  stage.actorMotion = new WeakMap()
  stage.car = { x: 0, z: 6.9, speed: 5 }
  stage.drive = { cruise: 7 }
  stage.review = null
  stage.alerted = false
  return stage
}
function actor() {
  const group = new THREE.Group()
  let walks = 0
  return { group, walk() { walks++ }, get walks() { return walks } }
}
test('crossing walkers face their actual direction and follow road/kerb height', () => {
  const stage = shell(), walker = actor()
  walker.group.position.set(12, .16, -(ROAD_HALF + 1.5))
  stage.moveWalker(walker,12,-8,1.8)
  assert.equal(walker.group.rotation.y,-Math.PI/2)
  assert.equal(walker.group.position.y,0)
  stage.moveWalker(walker,12,ROAD_HALF+1,1.8)
  assert.equal(walker.group.position.y,.16)
  assert.equal(walker.walks,2)
})
test('cyclist continues moving after choice without sideways sliding or overspeed', () => {
  const stage=shell(), cyclist=actor()
  cyclist.group.position.set(12,0,6.4)
  stage.actorMotion.set(cyclist,{kind:'riding',originX:12,speed:4.2})
  for(let i=0;i<600;i++) stage.updateActorMotion(cyclist,1/60,i/60)
  assert.ok(Math.abs(cyclist.group.position.x-54)<1e-8)
  assert.equal(cyclist.group.position.z,6.4)
  assert.equal(cyclist.group.rotation.y,0)
  assert.equal(cyclist.walks,600)
})
test('moving cyclist approach pauses at the child decision, without phantom wheel spinning', () => {
  const stage=shell(),cyclist=actor()
  cyclist.group.position.set(11,0,6.4)
  stage.actorMotion.set(cyclist,{kind:'waiting',originX:11,speed:4.2})
  stage.updateActorMotion(cyclist,1/60,0)
  assert.ok(cyclist.group.position.x>11)
  stage.alerted=true
  const x=cyclist.group.position.x, calls=cyclist.walks
  for(let i=0;i<60;i++)stage.updateActorMotion(cyclist,1/60,i/60)
  assert.equal(cyclist.group.position.x,x)
  assert.equal(cyclist.walks,calls)
})
test('ball rolls about its centre from distance and remains still when parked', async () => {
  await loadKit()
  const ball=makeBall()
  ball.update?.(0,0)
  const rolling=ball.group.children[0]
  const before=rolling.quaternion.clone()
  for(let i=0;i<60;i++)ball.update?.(i/60,1/60)
  assert.ok(rolling.quaternion.equals(before))
  for(let i=1;i<=120;i++) {
    ball.group.position.z=i*.01
    ball.update?.(i/60,1/60)
    ball.group.updateMatrixWorld(true)
    const bounds=new THREE.Box3().setFromObject(ball.group,true)
    assert.ok(bounds.min.y>=-.004 && bounds.min.y<=.006,`Ball ground contact: ${bounds.min.y}`)
    assert.ok(bounds.max.y>.23 && bounds.max.y<.25)
  }
  assert.ok(!rolling.quaternion.equals(before))
})
