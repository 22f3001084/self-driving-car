import * as THREE from 'three'
import { assemble, hinge, partOf, spawn } from './kitLoader'

/**
 * Everything that moves, wired up from the Blender kit.
 *
 * The models come from `blender/build_kit.py`; this file only finds their named
 * parts and animates them. A figure's limbs are separate objects whose origins
 * Blender put exactly on the joint, so a leg swings about the hip and stays
 * attached to the body — the thing a flat sprite could never do.
 *
 * Every asset faces +X (the direction of travel), so a limb's forward swing and
 * a wheel's roll are both rotations about Z.
 */

export interface Actor {
  group: THREE.Group
  /** Called every frame with elapsed and delta seconds. */
  update?: (t: number, dt: number) => void
}

/** Set emissive strength on every material under an object. */
function glow(object: THREE.Object3D, strength: number) {
  object.traverse((node) => {
    const mesh = node as THREE.Mesh
    const material = mesh.material as THREE.MeshStandardMaterial | undefined
    if (!material?.isMeshStandardMaterial) return
    // Clone on first touch: kit materials are shared between clones, and
    // lighting one van's brake lamps must not light every van's.
    if (!material.userData.owned) {
      const own = material.clone()
      own.userData.owned = true
      mesh.material = own
    }
    ;(mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = strength
  })
}

/* ======================================================================== *
 *  The vehicle
 * ======================================================================== */

export interface Van extends Actor {
  /** Roll the wheels and settle the body for a ground speed in m/s. */
  drive: (speed: number, dt: number) => void
  /** Steer angle in radians, applied to the front wheels. */
  steer: (angle: number) => void
  setBraking: (on: boolean) => void
  setAlert: (on: boolean) => void
  setIndicator: (side: 'left' | 'right' | 'none') => void
  setLidar: (on: boolean) => void
  headlights: THREE.SpotLight[]
}

/** The ambulance's wheel radius, from blender/ambulance.py. */
const AMBULANCE_WHEEL_R = 0.44

// The car's wheel radius, as modelled in the kit. blender/be6.py prints this
// as `car_radius` into kit.glb.report.txt; the two must agree or the wheels
// scrub — spin too slowly and the car skates, too fast and it wheelspins on
// every metre.
const WHEEL_R = 0.361

export function makeVan(name: string): Van {
  const group = assemble('van_')
  group.name = name

  // Wheels: a rolling hinge, and for the front pair a steering hinge outside
  // it. Tolerant lookup: a vehicle model may ship its rear pair as one mesh.
  const rollers: THREE.Group[] = []
  const steerers: THREE.Group[] = []
  for (const tag of ['fl', 'fr', 'rl', 'rr'] as const) {
    const wheel = group.getObjectByName(`van_wheel_${tag}`)
    if (!wheel) continue
    const roll = hinge(wheel)
    rollers.push(roll)
    if (tag === 'fl' || tag === 'fr') steerers.push(hinge(roll))
  }

  const brakes = partOf(group, 'van_brakes')
  // The lidar pod: hinged so it can spin. This is the one always-on cue that
  // the car is a machine that LOOKS — the premise of the whole lesson.
  const podPart = group.getObjectByName('van_pod')
  const pod = podPart ? hinge(podPart) : null
  const indicators = {
    left: [partOf(group, 'van_ind_fl'), partOf(group, 'van_ind_rl')],
    right: [partOf(group, 'van_ind_fr'), partOf(group, 'van_ind_rr')],
  }

  // The status ring is the only part drawn in code: it is UI, not bodywork —
  // it says what the machine is thinking.
  //
  // The sensor sweep that used to sit with it is gone. It was a translucent
  // wedge floating 1.7 m above the roof, and from the fixed rear camera it was
  // a teal smear across the middle of the car for the whole run.
  //
  // The ring is also thinner and tighter than it was: at 1.95–2.5 m it was a
  // 5 m amber disc under a 4.2 m car, and when a hazard lit it up it was the
  // brightest thing on the screen at the exact moment the child is supposed to
  // be looking at the road.
  const status = new THREE.Mesh(
    new THREE.RingGeometry(2.15, 2.42, 40),
    new THREE.MeshBasicMaterial({ color: 0x45cdb5, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  )
  status.rotation.x = -Math.PI / 2
  status.position.y = 0.05
  group.add(status)

  const headlights: THREE.SpotLight[] = []
  for (const side of [1, -1]) {
    const beam = new THREE.SpotLight(0xfff0cf, 7, 36, 0.5, 0.6, 1.4)
    beam.position.set(2.0, 0.78, side * 0.55)
    beam.target.position.set(24, -0.6, side * 1.4)
    group.add(beam, beam.target)
    headlights.push(beam)
  }

  let braking = false
  let alert = false
  let lidarOn = false
  let blink: 'left' | 'right' | 'none' = 'none'
  let pitch = 0

  glow(brakes, 0.3)
  for (const lamp of [...indicators.left, ...indicators.right]) glow(lamp, 0.2)

  return {
    group,
    headlights,
    drive(speed, dt) {
      // omega = v / r. Real rolling, so a wheel can never scrub or float.
      const spin = (speed / WHEEL_R) * dt
      for (const roll of rollers) roll.rotation.z -= spin
      // Squat under power, dive under braking — a degree is plenty.
      const target = braking ? 0.018 : Math.min(speed * 0.0016, 0.008)
      pitch += (target - pitch) * Math.min(1, dt * 6)
      group.rotation.z = -pitch
    },
    steer(angle) {
      for (const pivot of steerers) pivot.rotation.y = angle
    },
    setBraking(on) {
      if (braking === on) return
      braking = on
      glow(brakes, on ? 3.2 : 0.3)
    },
    setAlert(on) {
      alert = on
      const ring = status.material as THREE.MeshBasicMaterial
      ring.color.setHex(on ? 0xfca01b : 0x45cdb5)
      ring.opacity = on ? 0.2 : 0.1
    },
    setIndicator(side) {
      if (blink === side) return
      blink = side
      for (const key of ['left', 'right'] as const) {
        if (key !== side) for (const lamp of indicators[key]) glow(lamp, 0.2)
      }
    },
    setLidar(on) { lidarOn = on },
    update(t) {
      // The pod turns continuously, faster while the sensors are shown live.
      if (pod) pod.rotation.y = lidarOn ? -t * 3.2 : -t * 0.9

      const on = Math.sin(t * 9) > 0
      if (blink !== 'none') {
        for (const lamp of indicators[blink]) glow(lamp, on ? 3.4 : 0.2)
      }
      if (alert) {
        (status.material as THREE.MeshBasicMaterial).opacity = 0.13 + Math.abs(Math.sin(t * 3)) * 0.1
      }
    },
  }
}

/* ======================================================================== *
 *  People and animals
 * ======================================================================== */

export interface Walker extends Actor {
  /** Advance the walk cycle at a speed in m/s. 0 stands still. */
  walk: (speed: number, t: number) => void
}

interface Rig {
  group: THREE.Group
  skeleton: THREE.Group
  body: THREE.Group
  head: THREE.Group | null
  arms: THREE.Group[]
  forearms: THREE.Group[]
  legs: THREE.Group[]
  shins: THREE.Group[]
  feet: THREE.Group[]
  scale: number
}

function figureRig(prefix: string): Rig {
  const skeleton = assemble(prefix)
  const group = new THREE.Group()
  group.add(skeleton)
  const body = hinge(partOf(skeleton, `${prefix}body`))
  const headPart = skeleton.getObjectByName(`${prefix}head`)
  const head = headPart ? hinge(headPart) : null
  const arms = ['l', 'r'].map((tag) => hinge(partOf(skeleton, `${prefix}arm_${tag}`)))
  const forearms = ['l', 'r'].map((tag) => hinge(partOf(skeleton, `${prefix}forearm_${tag}`)))
  const legs = ['l', 'r'].map((tag) => hinge(partOf(skeleton, `${prefix}leg_${tag}`)))
  const shins = ['l', 'r'].map((tag) => hinge(partOf(skeleton, `${prefix}shin_${tag}`)))
  const feet = ['l', 'r'].map((tag) => hinge(partOf(skeleton, `${prefix}foot_${tag}`)))
  skeleton.updateMatrixWorld(true)
  // Preserve the Blender joint locations when creating a true limb hierarchy.
  arms.forEach((arm, i) => { arm.attach(forearms[i]); body.attach(arm) })
  legs.forEach((leg, i) => { shins[i].attach(feet[i]); leg.attach(shins[i]) })
  if (head) body.attach(head)
  return { group, skeleton, body, head, arms, forearms, legs, shins, feet, scale: body.position.y / 0.91 }
}

/** Two linked bones, bending in the travel/vertical plane, toward an ankle or wrist. */
function placeLimb(upper: THREE.Group, lower: THREE.Group, x: number, y: number, lowerLength: number, bend = 1) {
  const upperLength = Math.abs(lower.position.y)
  const distance = Math.min(upperLength + lowerLength - 0.0001, Math.max(0.015, Math.hypot(x, y)))
  const cosine = THREE.MathUtils.clamp((upperLength * upperLength + distance * distance - lowerLength * lowerLength) / (2 * upperLength * distance), -1, 1)
  const knee = Math.acos(THREE.MathUtils.clamp((upperLength * upperLength + lowerLength * lowerLength - distance * distance) / (2 * upperLength * lowerLength), -1, 1))
  upper.rotation.z = Math.atan2(x, -y) + Math.acos(cosine) * bend
  lower.rotation.z = -(Math.PI - knee) * bend
}

/** Measure distance actually travelled. Teleports between road loops are ignored. */
function travelled(group: THREE.Group) {
  const previous = new THREE.Vector3()
  let initial = true
  return () => {
    const distance = initial ? 0 : Math.hypot(group.position.x - previous.x, group.position.z - previous.z)
    previous.copy(group.position)
    initial = false
    return distance < 2 ? distance : 0
  }
}

function walkerFrom(rig: Rig, cadence = 1.9): Walker {
  let phase = 0
  let activity = 0
  let stepped = false
  const distance = travelled(rig.group)
  const stride = (cadence > 2 ? 0.30 : 0.34) * rig.scale
  const pose = (amount: number) => {
    const stanceX = (1 - 2 * (phase % Math.PI) / Math.PI) * stride * amount
    const reach = 0.826 * rig.scale
    const bob = (0.080 * rig.scale + Math.sqrt(reach * reach - stanceX * stanceX) - 0.91 * rig.scale) * amount
    rig.skeleton.position.y = bob
    rig.legs.forEach((leg, i) => {
      const angle = (phase + i * Math.PI) % (Math.PI * 2)
      const stance = angle < Math.PI
      const x = (stance ? 1 - 2 * angle / Math.PI : -Math.cos(angle - Math.PI)) * stride * amount
      const lift = stance ? 0 : Math.sin(angle - Math.PI) * 0.13 * rig.scale * amount
      // During the stance half of the cycle the sole stays on the pavement.
      placeLimb(leg, rig.shins[i], x, 0.080 * rig.scale + lift - leg.position.y - bob, 0.415 * rig.scale)
      rig.feet[i].rotation.z = -(leg.rotation.z + rig.shins[i].rotation.z) + (stance ? 0 : Math.sin(angle - Math.PI) * 0.16 * amount)
      rig.arms[i].rotation.z = -Math.cos(phase + i * Math.PI) * (cadence > 2 ? 0.56 : 0.35) * amount
      rig.forearms[i].rotation.z = 0.13 + ((cadence > 2 ? 0.62 : 0.12) + Math.cos(phase + i * Math.PI) * 0.10) * amount
    })
    rig.body.rotation.x = Math.sin(phase) * 0.022 * amount
    rig.body.rotation.z = -(cadence > 2 ? 0.075 : 0.035) * amount
    if (rig.head) rig.head.rotation.z = 0.025 * amount
  }
  pose(0)
  return {
    group: rig.group,
    walk(speed, _t) {
      const moved = distance()
      phase = (phase + moved * Math.PI / (stride * 2 * rig.group.scale.x)) % (Math.PI * 2)
      activity = speed > 0 ? 1 : 0
      stepped = true
      pose(activity)
    },
    update(t, dt) {
      if (!stepped) {
        activity *= Math.exp(-dt * 13)
        pose(activity)
        if (rig.head && activity < 0.1) rig.head.rotation.y = Math.sin(t * 0.65) * 0.07
      }
      stepped = false
    },
  }
}

/** Retint a figure without disturbing skin, hair or shoes. */
function recolour(group: THREE.Object3D, colours: { shirt?: number; trousers?: number }) {
  group.traverse((node) => {
    const mesh = node as THREE.Mesh
    const material = mesh.material as THREE.MeshStandardMaterial | undefined
    if (!material?.isMeshStandardMaterial) return
    const target = material.name.startsWith('shirt') ? colours.shirt
      : material.name.startsWith('trs') ? colours.trousers
        : undefined
    if (target === undefined) return
    const own = material.clone()
    own.color.setHex(target)
    own.userData.owned = true
    mesh.material = own
  })
}

/**
 * A pedestrian. The colours are applied over the kit's own materials, so one
 * model dresses a whole street.
 */
export function makePerson(shirt: number, trousers: number, scale = 1): Walker {
  const rig = figureRig('person_')
  const walker = walkerFrom(rig)
  recolour(rig.group, { shirt, trousers })
  rig.group.scale.setScalar(scale)
  return walker
}

/** The child who runs into the road after the ball. */
export function makeChild(): Walker {
  return walkerFrom(figureRig('child_'), 2.4)
}

export function makeCyclist(): Walker {
  const group = new THREE.Group()
  const bike = assemble('cyclist_')
  group.add(bike)
  const rider = figureRig('rider_')
  rider.group.position.set(-0.315, 0.155, 0)
  // Hips rest on the saddle; torso leans from the hips, with hands on the grips.
  rider.body.rotation.z = -0.75
  if (rider.head) rider.head.rotation.z = 0.53
  group.add(rider.group)
  const wheels = [hinge(partOf(bike, 'cyclist_wheel_f')), hinge(partOf(bike, 'cyclist_wheel_r'))]
  const pedals = ['l', 'r'].map((tag) => partOf(bike, `cyclist_pedal_${tag}`))
  const crank = hinge(partOf(bike, 'cyclist_crank'))
  const distance = travelled(group)
  let phase = 0
  const pose = () => {
    crank.rotation.z = -phase
    rider.legs.forEach((leg, i) => {
      const angle = phase + i * Math.PI
      const footX = -0.08 + Math.sin(angle) * 0.17
      const footY = 0.36 + Math.cos(angle) * 0.17
      const pedal = pedals[i]
      pedal.position.x = footX
      pedal.position.y = footY
      placeLimb(leg, rider.shins[i], footX - rider.group.position.x, footY + 0.070 - rider.group.position.y - leg.position.y, 0.415)
      rider.feet[i].rotation.z = -(leg.rotation.z + rider.shins[i].rotation.z)
    })
    group.updateMatrixWorld(true)
    rider.arms.forEach((arm, i) => {
      const target = new THREE.Vector3(0.49, 1.17, i === 0 ? -0.235 : 0.235)
      bike.localToWorld(target)
      rider.body.worldToLocal(target)
      target.sub(arm.position)
      placeLimb(arm, rider.forearms[i], target.x, target.y, 0.246, -1)
    })
  }
  pose()
  return {
    group,
    walk(_speed, _t) {
      const moved = distance()
      for (const wheel of wheels) wheel.rotation.z -= moved / 0.365
      // A plausible city-bike gear: one crank revolution per 3.3 metres.
      phase = (phase + moved * Math.PI * 2 / 3.3) % (Math.PI * 2)
      pose()
    },
    update() {},
  }
}

export function makeDog(): Walker {
  const skeleton = assemble('dog_')
  const group = new THREE.Group()
  group.add(skeleton)
  const tail = hinge(partOf(skeleton, 'dog_tail'))
  const head = hinge(partOf(skeleton, 'dog_head'))
  const tags = ['fl', 'fr', 'rl', 'rr'] as const
  const legs = tags.map((tag) => hinge(partOf(skeleton, `dog_leg_${tag}`)))
  const shins = tags.map((tag) => hinge(partOf(skeleton, `dog_shin_${tag}`)))
  const feet = tags.map((tag) => hinge(partOf(skeleton, `dog_foot_${tag}`)))
  skeleton.updateMatrixWorld(true)
  legs.forEach((leg, i) => { shins[i].attach(feet[i]); leg.attach(shins[i]) })
  const distance = travelled(group)
  let phase = 0
  let activity = 0
  let stepped = false
  const pose = (t: number) => {
    const stanceX = (1 - 2 * (phase % Math.PI) / Math.PI) * 0.22 * activity
    const bob = (0.065 + Math.sqrt(0.473 * 0.473 - stanceX * stanceX) - 0.54) * activity
    skeleton.position.y = bob
    legs.forEach((leg, i) => {
      // Diagonal pairs alternate in a trot. Swing paws lift; stance paws stay grounded.
      const angle = (phase + (i === 0 || i === 3 ? 0 : Math.PI)) % (Math.PI * 2)
      const stance = angle < Math.PI
      const x = (stance ? 1 - 2 * angle / Math.PI : -Math.cos(angle - Math.PI)) * 0.22 * activity
      const lift = stance ? 0 : Math.sin(angle - Math.PI) * 0.085 * activity
      placeLimb(leg, shins[i], x, 0.065 + lift - leg.position.y - bob, 0.21, i < 2 ? -1 : 1)
      feet[i].rotation.z = -(leg.rotation.z + shins[i].rotation.z)
    })
    tail.rotation.y = Math.sin(t * 5.3 + phase) * (0.15 + activity * 0.15)
    head.rotation.z = Math.sin(phase * 2) * 0.018 * activity
    head.rotation.y = Math.sin(t * 0.7) * 0.08 * (1 - activity)
  }
  pose(0)
  return {
    group,
    walk(speed, t) {
      phase = (phase + distance() * Math.PI / 0.44) % (Math.PI * 2)
      activity = speed > 0 ? 1 : 0
      stepped = true
      pose(t)
    },
    update(t, dt) {
      if (!stepped) activity *= Math.exp(-dt * 14)
      pose(t)
      stepped = false
    },
  }
}

/* ======================================================================== *
 *  Props
 * ======================================================================== */

function prop(name: string): Actor {
  const group = new THREE.Group()
  group.add(spawn(name))
  return { group }
}

export function makeScooter(): Actor { return prop('scooter') }
/** Any named kit asset as a plain scenery actor. */
export function makeProp(name: string): Actor { return prop(name) }
export function makeCone(): Actor { return prop('cone') }

export function makeBall(): Actor {
  const group = new THREE.Group()
  const radius = 0.12
  const rolling = new THREE.Group()
  rolling.position.y = radius
  const ball = spawn('ball')
  // The kit's origin is on the ground. Roll around the ball's centre, otherwise
  // the mesh orbits that origin and visibly sinks into the road every turn.
  ball.position.y = -radius
  rolling.add(ball)
  group.add(rolling)
  const previous = new THREE.Vector3()
  const axis = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  let initialized = false
  return {
    group,
    update() {
      const dx = initialized ? group.position.x - previous.x : 0
      const dz = initialized ? group.position.z - previous.z : 0
      previous.copy(group.position)
      initialized = true
      const distance = Math.hypot(dx, dz)
      if (distance < 0.00001 || distance > 2) return
      axis.set(dz, 0, -dx).normalize()
      rotation.setFromAxisAngle(axis, distance / radius)
      rolling.quaternion.premultiply(rotation)
    },
  }
}

/** A run of roadworks panels, laid end to end. */
export const BARRIER_PITCH = 1.85

/**
 * A run of roadworks panels, CENTRED on the group's origin.
 *
 * The panels used to march outward from the origin, so a wall placed at the
 * far kerb actually reached from there right across the carriageway. Anything
 * reasoning about the group as a box centred on its position — the collision
 * audit did — was wrong by half the wall's width, which is how a car came to
 * drive through the third panel while the audit reported the run clean.
 */
export function makeBarriers(count = 3): Actor {
  const group = new THREE.Group()
  const span = (count - 1) * BARRIER_PITCH
  for (let i = 0; i < count; i += 1) {
    const panel = spawn('barrier')
    panel.position.x = i * BARRIER_PITCH - span / 2
    group.add(panel)
  }
  return { group }
}

export function makeSign(label: 'bay' | 'works'): Actor {
  return prop(label === 'bay' ? 'sign_bay' : 'sign_works')
}

export function makeAmbulance(): Actor & { flash: (t: number) => void } {
  const group = assemble('ambulance_')
  const wheels = (['fl', 'fr', 'rl', 'rr'] as const).map((tag) => hinge(partOf(group, `ambulance_wheel_${tag}`)))
  const blues = [partOf(group, 'ambulance_blue_l'), partOf(group, 'ambulance_blue_r')]
  for (const lamp of blues) glow(lamp, 0)

  // Coloured light thrown on the road is the emergency cue that survives any
  // distance, angle or weather, and the model had none: every lens was
  // emissive geometry and nothing lit the scene. Two cheap point lights on the
  // bar paint the tarmac, the frontages and the car in front.
  const beacons = [0, 1].map((side) => {
    const light = new THREE.PointLight(0x4c8bff, 0, 16, 2)
    light.position.set(-0.6, 3.0, side ? 0.66 : -0.66)
    group.add(light)
    return light
  })

  // Roll from distance actually covered, not from the clock. The wheels used
  // to spin at a fixed rate whatever the vehicle was doing, so a parked
  // ambulance sat there with its wheels turning.
  let lastX = group.position.x
  let lastZ = group.position.z

  return {
    group,
    flash(t) {
      // 4.4 Hz per side, alternating, and resting at zero so the contrast is
      // real. At the old resting value of 0.3 the blues never crossed the
      // bloom threshold at all while the bar's steady red sat above it, so the
      // bar read as continuously lit with a small blue tick.
      const left = Math.sin(t * 27.6) > 0
      glow(blues[0], left ? 6 : 0)
      glow(blues[1], left ? 0 : 6)
      beacons[0].intensity = left ? 26 : 0
      beacons[1].intensity = left ? 0 : 26
    },
    update(_t, dt) {
      const moved = Math.hypot(group.position.x - lastX, group.position.z - lastZ)
      lastX = group.position.x
      lastZ = group.position.z
      if (moved > 1e-4 && dt > 0) {
        const spin = moved / AMBULANCE_WHEEL_R
        for (const wheel of wheels) wheel.rotation.z -= spin
      }
    },
  }
}

/** Rain, as a drifting particle field kept around the vehicle. */
export function makeRain(): Actor & { setActive: (on: boolean) => void } {
  const COUNT = 1500
  const positions = new Float32Array(COUNT * 3)
  let seed = 41
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0x100000000
  }
  for (let i = 0; i < COUNT; i += 1) {
    positions[i * 3] = (random() - 0.5) * 96
    positions[i * 3 + 1] = random() * 24
    positions[i * 3 + 2] = (random() - 0.5) * 64
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0xc4dcef, size: 0.13, transparent: true, opacity: 0.7, depthWrite: false,
  }))
  const group = new THREE.Group()
  group.add(points)
  let active = false
  return {
    group,
    setActive(on) { active = on; group.visible = on },
    update(_t, dt) {
      if (!active) return
      const array = geometry.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < COUNT; i += 1) {
        let y = array.getY(i) - dt * 27
        if (y < 0) y += 24
        array.setY(i, y)
      }
      array.needsUpdate = true
      void _t
    },
  }
}
