import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { CameraGesture, dragOrbit, followPose } from '../src/three/followCamera'

test('small pointer jitter stays a click and a real drag keeps every movement', () => {
  const gesture = new CameraGesture()
  gesture.begin(100, 100)
  for (let i = 0; i < 20; i++) {
    assert.equal(gesture.move(102, 101), null)
    assert.equal(gesture.move(100, 100), null)
  }
  assert.equal(gesture.dragging, false)
  assert.deepEqual(gesture.move(110, 103), [10, 3])
  assert.deepEqual(gesture.move(100, 100), [-10, -3])
  assert.equal(gesture.dragging, true, 'dragging back to the start cannot choose a card')
  gesture.begin(200, 200)
  assert.equal(gesture.dragging, false)
})

test('default camera stays directly behind the car through turns', () => {
  for (const heading of [0, .5, Math.PI, -2]) {
    const pose = followPose(30, 6.9, heading, { yaw: 0, pitch: 0, zoom: 1 })
    const direction = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading))
    const offset = pose.position.clone().sub(new THREE.Vector3(30, 0, 6.9))
    assert.ok(offset.dot(direction) < -10)
    assert.ok(Math.abs(offset.x * direction.z - offset.z * direction.x) < 1e-8)
  }
})

test('equal proportional mouse drags match across screen sizes and reverse exactly', () => {
  const a = { yaw: 0, pitch: 0, zoom: 1 }, b = { ...a }
  dragOrbit(a, 100, 30, 720)
  dragOrbit(b, 200, 60, 1440)
  assert.deepEqual(a, b)
  assert.ok(a.yaw < 0, 'dragging right moves the scene right')
  dragOrbit(a, -100, -30, 720)
  assert.equal(a.yaw, 0)
  assert.equal(a.pitch, 0)
})

test('car remains on screen at every supported orbit, pitch and zoom', () => {
  const camera = new THREE.PerspectiveCamera(58, 16 / 9, .35, 900)
  for (const yaw of [0, 1, 2, 3, 4, 5, 6]) for (const pitch of [-.12, 0, .4, .8]) for (const zoom of [.8, 1, 1.8]) {
    const pose = followPose(0, 0, 0, { yaw, pitch, zoom })
    camera.position.copy(pose.position)
    camera.lookAt(pose.target)
    camera.updateMatrixWorld()
    for (const x of [-2.1, 2.1]) for (const y of [0, 1.7]) for (const z of [-.95, .95]) {
      const screen = new THREE.Vector3(x, y, z).project(camera)
      assert.ok(Math.abs(screen.x) < .95 && Math.abs(screen.y) < .95, JSON.stringify({ yaw, pitch, zoom, screen }))
    }
  }
})
