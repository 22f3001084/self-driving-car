import * as THREE from 'three'
import { PAL, box, cyl, gloss, matte } from '../three/kit'
import {
  makeAmbulance, makeBarriers, makeCone, makeCyclist, makeDog,
  makePerson, makeScooter, makeVan,
} from '../three/actors'

/**
 * Icon models.
 *
 * Every icon in this game is a photographed 3D object, not a drawing. The
 * subject icons are the ACTUAL models the street uses — the scooter icon is the
 * scooter the vehicle drives around — so the picture on the rule chip and the
 * thing on the road can never drift apart. The glyph icons (arrows, tick, lock)
 * are extruded and bevelled shapes, so even they catch a highlight.
 *
 * Each entry returns a group centred on the origin; the baker frames it, lights
 * it and renders it to a transparent PNG.
 */

export type Tint = 'dark' | 'light'

export interface IconSpec {
  /** Build the object. `tint` only matters for glyphs. */
  build: (tint: Tint) => THREE.Object3D
  /** Glyphs get a light variant for use on coloured buttons. */
  glyph?: boolean
  /** Camera framing: how far back, and the vertical look-at offset. */
  zoom?: number
}

const NAVY = 0x0d2360
const LIGHT = 0xffffff

function glyphMaterial(tint: Tint) {
  return tint === 'light'
    ? gloss(LIGHT, { roughness: 0.35, metalness: 0.05 })
    : gloss(NAVY, { roughness: 0.4, metalness: 0.1 })
}

/** Extrude a 2D path into a bevelled 3D glyph. */
function extrude(points: [number, number][], material: THREE.Material, depth = 0.3) {
  const shape = new THREE.Shape()
  shape.moveTo(points[0][0], points[0][1])
  for (const [x, y] of points.slice(1)) shape.lineTo(x, y)
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.06,
    bevelSegments: 3,
  })
  geometry.center()
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  return mesh
}

/** A rounded bar, the building block of most glyphs. */
function bar(w: number, h: number, material: THREE.Material, x = 0, y = 0, rotation = 0) {
  const mesh = box(w, h, 0.3, material, x, y, 0)
  mesh.rotation.z = rotation
  return mesh
}

function group(...items: THREE.Object3D[]) {
  const parent = new THREE.Group()
  parent.add(...items)
  return parent
}

/** Shrink a game model to icon size and turn it to a readable three-quarter. */
function subject(object: THREE.Object3D, scale: number, yaw = -0.5) {
  const holder = new THREE.Group()
  object.scale.setScalar(scale)
  holder.add(object)
  holder.rotation.y = yaw
  // Re-centre on the object's own bounds so the baker frames it tightly.
  const bounds = new THREE.Box3().setFromObject(holder)
  const centre = bounds.getCenter(new THREE.Vector3())
  const wrapper = new THREE.Group()
  holder.position.sub(centre)
  wrapper.add(holder)
  return wrapper
}

// ---------------------------------------------------------------- glyph parts

const arrow = (material: THREE.Material) => extrude([
  [0, 0.55], [0.5, 0.05], [0.2, 0.05], [0.2, -0.55], [-0.2, -0.55], [-0.2, 0.05], [-0.5, 0.05],
], material)

const chevron = (material: THREE.Material) => extrude([
  [0.15, 0.62], [0.52, 0.62], [0.05, 0], [0.52, -0.62], [0.15, -0.62], [-0.32, 0],
], material)

const tick = (material: THREE.Material) => extrude([
  [-0.62, 0.05], [-0.36, 0.32], [-0.12, 0.02], [0.46, 0.62], [0.66, 0.36], [-0.1, -0.5],
], material)

const triangle = (material: THREE.Material) => extrude([
  [-0.36, 0.6], [0.56, 0], [-0.36, -0.6],
], material)

// ------------------------------------------------------------------- the set

export const ICONS: Record<string, IconSpec> = {
  // ---- situations: the street's own models -------------------------------
  IconScooter: { build: () => subject(makeScooter().group, 1), zoom: 1.15 },
  IconNarrow: {
    build: () => {
      const barriers = makeBarriers(1).group
      const cone = makeCone().group
      cone.position.set(1.3, 0, 0.4)
      return subject(group(barriers, cone), 0.85, -0.7)
    },
  },
  IconDropoff: {
    build: () => {
      const parcel = box(0.9, 0.7, 0.9, matte(PAL.cream), 0, 0.35, 0)
      const tapeA = box(0.94, 0.1, 0.16, matte(PAL.orange), 0, 0.36, 0)
      const tapeB = box(0.16, 0.1, 0.94, matte(PAL.orange), 0, 0.36, 0)
      const pad = cyl(0.7, 0.08, matte(PAL.mint), 22)
      return subject(group(parcel, tapeA, tapeB, pad), 1, -0.6)
    },
  },
  IconMoving: { build: () => subject(makePerson(PAL.yellow, 0x2f57c4).group, 1, -0.5) },
  IconSunny: {
    build: () => {
      const sun = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), gloss(PAL.orange, { roughness: 0.3 }))
      const rays: THREE.Object3D[] = []
      for (let i = 0; i < 8; i += 1) {
        const ray = box(0.34, 0.11, 0.11, matte(PAL.darkOrange))
        const angle = (i / 8) * Math.PI * 2
        ray.position.set(Math.cos(angle) * 0.82, Math.sin(angle) * 0.82, 0)
        ray.rotation.z = angle
        rays.push(ray)
      }
      return group(sun, ...rays)
    },
  },
  IconCrowd: {
    build: () => {
      const people = [PAL.mint, PAL.orange, PAL.red].map((shirt, index) => {
        const person = makePerson(shirt, PAL.navy, 0.95 - index * 0.06).group
        person.position.set(index * 0.5 - 0.5, 0, -index * 0.42)
        return person
      })
      return subject(group(...people), 0.82, -0.55)
    },
  },
  IconRain: {
    build: () => {
      const cloud = new THREE.Group()
      for (const [x, y, r] of [[-0.32, 0.3, 0.4], [0.1, 0.42, 0.48], [0.42, 0.26, 0.34]] as const) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), matte(0x9fb2c4))
        puff.position.set(x, y, 0)
        cloud.add(puff)
      }
      const drops = [-0.34, 0.04, 0.4].map((x, index) => {
        const drop = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), gloss(0x4f9bd0))
        drop.scale.set(0.7, 1.5, 0.7)
        drop.position.set(x, -0.42 - (index % 2) * 0.22, 0)
        return drop
      })
      return group(cloud, ...drops)
    },
  },
  IconSiren: { build: () => subject(makeAmbulance().group, 0.34, -0.62), zoom: 1.05 },
  IconCyclist: { build: () => subject(makeCyclist().group, 0.95, -0.55) },
  IconDog: { build: () => subject(makeDog().group, 1.15, -0.6) },
  IconBlocked: { build: () => subject(makeBarriers(2).group, 0.7, -0.75) },
  IconFog: {
    build: () => {
      // A lamp swallowed by soft masses: the hazard in fog is what you cannot see.
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.26, 18, 12), matte(PAL.orange))
      glow.position.set(0.1, 0.1, -0.5)
      const puffs = [
        [-0.42, -0.1, 0.42], [0.06, 0.16, 0.5], [0.46, -0.04, 0.38],
        [-0.2, -0.42, 0.34], [0.3, -0.46, 0.3],
      ] as const
      const masses = puffs.map(([x, y, r], index) => {
        const puff = new THREE.Mesh(
          new THREE.SphereGeometry(r, 18, 12),
          matte(index % 2 ? 0xc4d1dc : 0xdde6ed),
        )
        puff.position.set(x, y, index * 0.06)
        return puff
      })
      return group(glow, ...masses)
    },
  },

  // ---- actions ----------------------------------------------------------
  IconSlowPass: {
    build: () => {
      const curve = extrude([
        [-0.7, -0.42], [-0.3, -0.42], [0.1, 0.1], [0.5, 0.1], [0.5, -0.16],
        [0.9, 0.24], [0.5, 0.62], [0.5, 0.38], [-0.02, 0.38], [-0.42, -0.16], [-0.7, -0.16],
      ], matte(PAL.mint))
      return group(curve)
    },
  },
  IconDeliver: {
    build: () => {
      const parcel = box(0.8, 0.62, 0.8, matte(PAL.cream), 0, 0.2, 0)
      const tape = box(0.84, 0.09, 0.14, matte(PAL.orange), 0, 0.21, 0)
      const hand = box(0.9, 0.16, 0.5, matte(PAL.skin), 0, -0.3, 0)
      return subject(group(parcel, tape, hand), 1, -0.5)
    },
  },
  IconFullStop: {
    build: () => {
      // A real octagonal sign, extruded.
      const points: [number, number][] = []
      for (let i = 0; i < 8; i += 1) {
        const angle = (i / 8) * Math.PI * 2 + Math.PI / 8
        points.push([Math.cos(angle) * 0.72, Math.sin(angle) * 0.72])
      }
      const sign = extrude(points, matte(PAL.red), 0.22)
      const face = box(0.62, 0.16, 0.06, matte(PAL.white), 0, 0, 0.16)
      return group(sign, face)
    },
  },
  IconTurnAround: {
    build: () => {
      const loop = new THREE.Mesh(
        new THREE.TorusGeometry(0.46, 0.13, 12, 26, Math.PI * 1.45),
        matte(PAL.orange),
      )
      const head = arrow(matte(PAL.orange))
      head.scale.setScalar(0.6)
      head.position.set(0.42, -0.36, 0)
      head.rotation.z = 2.5
      return group(loop, head)
    },
  },
  IconSpeedUp: {
    build: () => {
      const bars = [0, 1, 2].map((index) => {
        const b = box(0.62 - index * 0.14, 0.15, 0.3, matte(PAL.darkOrange), -index * 0.1, 0.4 - index * 0.4, 0)
        return b
      })
      const head = arrow(matte(PAL.orange))
      head.rotation.z = -Math.PI / 2
      head.position.set(0.52, 0, 0)
      return group(...bars, head)
    },
  },
  IconWait: {
    build: () => {
      const dial = cyl(0.62, 0.2, matte(PAL.white), 26)
      dial.rotation.x = Math.PI / 2
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.09, 10, 26), matte(PAL.navy))
      const hourHand = bar(0.06, 0.34, matte(PAL.navy), 0, 0.14)
      const minuteHand = bar(0.3, 0.06, matte(PAL.orange), 0.13, 0)
      return group(dial, rim, hourHand, minuteHand)
    },
  },
  IconGiveSpace: {
    build: () => {
      const left = chevron(matte(PAL.teal))
      left.scale.setScalar(0.7); left.position.x = -0.74
      const right = chevron(matte(PAL.teal))
      right.rotation.z = Math.PI; right.scale.setScalar(0.7); right.position.x = 0.74
      const post = bar(0.16, 1.05, matte(PAL.navy))
      const kerb = box(0.5, 0.16, 0.3, matte(PAL.kerb), 0, -0.62, 0)
      return group(left, right, post, kerb)
    },
  },
  IconEaseOff: {
    build: () => {
      const bars = [0, 1, 2].map((index) => box(0.2 + index * 0.16, 0.15, 0.3, matte(PAL.mint), 0, 0.4 - index * 0.4, 0))
      const head = arrow(matte(PAL.teal))
      head.rotation.z = Math.PI
      head.scale.setScalar(0.8)
      head.position.set(0.6, 0, 0)
      return group(...bars, head)
    },
  },
  IconMoveAside: {
    build: () => {
      const van = box(0.7, 0.42, 0.5, gloss(PAL.white), -0.24, -0.28, 0)
      const head = arrow(matte(PAL.orange))
      head.scale.setScalar(0.85)
      head.position.set(0.34, 0.3, 0)
      head.rotation.z = -0.7
      return group(van, head)
    },
  },
  IconStopSafe: {
    build: () => {
      const kerb = box(1.3, 0.18, 0.5, matte(PAL.kerb), 0, -0.5, 0)
      const van = box(0.8, 0.46, 0.52, gloss(PAL.white), -0.1, -0.16, 0)
      const tick2 = tick(matte(PAL.mint))
      tick2.scale.setScalar(0.6)
      tick2.position.set(0.42, 0.42, 0.1)
      return group(kerb, van, tick2)
    },
  },
  IconHonk: {
    build: () => {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.7, 18, 1, true), matte(PAL.orange))
      horn.rotation.z = -Math.PI / 2
      horn.position.x = -0.16
      const waves = [0.34, 0.56].map((r, index) => {
        const wave = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 8, 18, Math.PI * 0.7), matte(PAL.darkOrange))
        wave.rotation.z = -Math.PI * 0.35
        wave.position.x = 0.3 + index * 0.06
        return wave
      })
      return group(horn, ...waves)
    },
  },
  IconKeepSpeed: {
    build: () => {
      const dial = cyl(0.6, 0.18, matte(PAL.white), 26)
      dial.rotation.x = Math.PI / 2
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.09, 10, 26, Math.PI), matte(PAL.navy))
      const needle = bar(0.42, 0.08, matte(PAL.orange), 0.1, 0.1, 0.6)
      return group(dial, rim, needle)
    },
  },
  IconRace: {
    build: () => {
      const flagPole = bar(0.12, 1.0, matte(PAL.navy), -0.42, 0)
      const cloth = new THREE.Group()
      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          const dark = (row + col) % 2 === 0
          cloth.add(box(0.26, 0.26, 0.12, matte(dark ? PAL.navy : PAL.white), -0.2 + col * 0.26, 0.38 - row * 0.26, 0))
        }
      }
      return group(flagPole, cloth)
    },
  },

  // ---- interface glyphs -------------------------------------------------
  /** The vehicle itself — used for the browser tab icon. */
  IconVan: { build: () => subject(makeVan('NV-1').group, 0.3, -0.62), zoom: 1.02 },
  IconSoundOff: {
    glyph: true,
    build: (tint) => {
      const material = glyphMaterial(tint)
      const body = extrude([[-0.6, 0.24], [-0.24, 0.24], [0.16, 0.62], [0.16, -0.62], [-0.24, -0.24], [-0.6, -0.24]], material)
      // A struck-through speaker: two crossed bars, so "off" is unmistakable.
      const crossA = bar(0.62, 0.15, material, 0.46, 0, Math.PI / 4)
      const crossB = bar(0.62, 0.15, material, 0.46, 0, -Math.PI / 4)
      return group(body, crossA, crossB)
    },
  },
  IconSound: {
    glyph: true,
    build: (tint) => {
      const material = glyphMaterial(tint)
      const body = extrude([[-0.6, 0.24], [-0.24, 0.24], [0.16, 0.62], [0.16, -0.62], [-0.24, -0.24], [-0.6, -0.24]], material)
      const waves = [0.3, 0.5].map((r, index) => {
        const wave = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 8, 16, Math.PI * 0.8), material)
        wave.rotation.z = -Math.PI * 0.4
        wave.position.x = 0.3 + index * 0.1
        return wave
      })
      return group(body, ...waves)
    },
  },
  IconMenu: {
    glyph: true,
    build: (tint) => {
      const material = glyphMaterial(tint)
      return group(...[0.44, 0, -0.44].map((y) => bar(1.1, 0.2, material, 0, y)))
    },
  },
  IconRestart: {
    glyph: true,
    build: (tint) => {
      const material = glyphMaterial(tint)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.13, 12, 28, Math.PI * 1.5), material)
      const head = triangle(material)
      head.scale.setScalar(0.55)
      head.position.set(0.5, 0.36, 0)
      head.rotation.z = 1.1
      return group(ring, head)
    },
  },
  IconArrowLeft: { glyph: true, build: (tint) => group(chevron(glyphMaterial(tint))) },
  IconArrowRight: {
    glyph: true,
    build: (tint) => {
      const glyph = chevron(glyphMaterial(tint))
      glyph.rotation.z = Math.PI
      return group(glyph)
    },
  },
  IconPlay: { glyph: true, build: (tint) => group(triangle(glyphMaterial(tint))) },
  IconLock: {
    glyph: true,
    build: (tint) => {
      const material = glyphMaterial(tint)
      const body = box(0.9, 0.66, 0.34, material, 0, -0.22, 0)
      const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.1, 10, 20, Math.PI), material)
      shackle.position.y = 0.14
      return group(body, shackle)
    },
  },
  IconCheck: { glyph: true, build: (tint) => group(tick(glyphMaterial(tint))) },
  IconLightbulb: {
    build: () => {
      const glass = new THREE.Mesh(
        new THREE.SphereGeometry(0.44, 24, 16),
        new THREE.MeshStandardMaterial({
          color: PAL.yellow, emissive: new THREE.Color(PAL.orange), emissiveIntensity: 0.55,
          roughness: 0.18, metalness: 0.05,
        }),
      )
      glass.position.y = 0.2
      const filament = box(0.1, 0.22, 0.1, matte(0xfff0c0), 0, 0.16, 0)
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.26, 0.2, 18), matte(0x9aa3ad))
      neck.position.y = -0.22
      const cap = cyl(0.2, 0.22, gloss(0x8d949e), 18)
      cap.position.y = -0.42
      for (let i = 0; i < 3; i += 1) {
        const thread = cyl(0.215, 0.05, matte(0x757d87), 18)
        thread.position.y = -0.35 - i * 0.08
        cap.add(thread)
      }
      return group(glass, filament, neck, cap)
    },
  },
  IconSensor: {
    glyph: true,
    build: (tint) => {
      const material = glyphMaterial(tint)
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), material)
      dome.position.y = -0.2
      const base = cyl(0.36, 0.14, material, 20)
      base.position.y = -0.28
      const arcs = [0.5, 0.74].map((r) => {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 8, 20, Math.PI * 0.55), material)
        arc.rotation.z = Math.PI * 0.22
        arc.position.y = -0.2
        return arc
      })
      return group(dome, base, ...arcs)
    },
  },
  IconRoute: {
    glyph: true,
    build: (tint) => {
      const material = glyphMaterial(tint)
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.66, -0.5, 0), new THREE.Vector3(-0.1, -0.2, 0),
        new THREE.Vector3(0.1, 0.24, 0), new THREE.Vector3(0.62, 0.52, 0),
      ])
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.1, 10), material)
      const pin = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), material)
      pin.position.set(0.62, 0.52, 0)
      const start = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), material)
      start.position.set(-0.66, -0.5, 0)
      return group(tube, pin, start)
    },
  },
  IconTrash: {
    glyph: true,
    build: (tint) => {
      const material = glyphMaterial(tint)
      const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.27, 0.8, 18), material)
      bin.position.y = -0.14
      const lid = cyl(0.42, 0.12, material, 18)
      lid.position.y = 0.34
      const handle = box(0.28, 0.12, 0.2, material, 0, 0.48, 0)
      return group(bin, lid, handle)
    },
  },
  IconCamera: {
    glyph: true,
    build: (tint) => {
      const material = glyphMaterial(tint)
      const body = box(1.04, 0.66, 0.44, material, 0, -0.06, 0)
      const hump = box(0.32, 0.14, 0.34, material, -0.2, 0.36, 0)
      const barrel = cyl(0.27, 0.34, material, 22)
      barrel.rotation.x = Math.PI / 2
      barrel.position.set(0.04, -0.04, 0.36)
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.06, 10, 22), material)
      rim.position.set(0.04, -0.04, 0.53)
      const glass = cyl(0.17, 0.04, gloss(tint === 'light' ? 0x8fb4d8 : 0x4f7fb0), 20)
      glass.rotation.x = Math.PI / 2
      glass.position.set(0.04, -0.04, 0.55)
      return group(body, hump, barrel, rim, glass)
    },
  },
  SkaiMark: {
    glyph: true,
    build: (tint) => {
      const material = glyphMaterial(tint)
      const points: [number, number][] = []
      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * Math.PI * 2 + Math.PI / 6
        points.push([Math.cos(angle) * 0.7, Math.sin(angle) * 0.7])
      }
      return group(extrude(points, material, 0.26))
    },
  },
}
