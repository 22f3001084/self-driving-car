import * as THREE from 'three'
import { spawn, has } from './kitLoader'

/**
 * The road system.
 *
 * A street is a row of 12-metre pieces butted end to end. Four pieces cover
 * every situation the activity needs, and each is a real Blender model rather
 * than geometry drawn in code:
 *
 *   straight  plain carriageway, kerbs, pavements, lane markings
 *   crossing  the same footprint plus a zebra and two beacons
 *   bay       the same footprint plus the clinic's hatched delivery bay
 *   works     the same footprint plus a lane-narrowing taper
 *
 * To lay a street you say how long it is and which pieces go where; anything
 * unspecified is straight. Adding a fifth piece to the Blender kit makes it
 * available here immediately — that is the whole point of building it this way.
 */

export const TILE = 12

export type RoadPiece = 'straight' | 'crossing' | 'bay' | 'works'

const PIECE_ASSET: Record<RoadPiece, string> = {
  straight: 'road_straight',
  crossing: 'road_crossing',
  bay: 'road_bay',
  works: 'road_works',
}

export interface RoadFeature {
  /** Distance along the street, in metres. Snapped to the nearest tile. */
  at: number
  piece: RoadPiece
}

export interface Road {
  group: THREE.Group
  /** How many tiles were laid. */
  tiles: number
  /** The centre of the tile covering a given distance — where a feature lands. */
  tileCentre: (metres: number) => number
}

/**
 * Lay a street.
 *
 * `lengthM` is the drivable length; the road is extended well past both ends so
 * the camera never sees where the world stops.
 */
export function layRoad(lengthM: number, features: RoadFeature[] = []): Road {
  const group = new THREE.Group()
  group.name = 'road'

  // Far enough past both ends to reach the fog. At three tiles the tarmac
  // stopped 36 m past the last landmark and everything beyond it was a flat
  // wash of sky — so arriving at the destination and looking ahead showed the
  // edge of the world. The fog reaches 240 m, so the road has to as well.
  const RUN_ON = 12 * TILE
  const first = Math.floor(-RUN_ON / TILE)
  const last = Math.ceil((lengthM + RUN_ON) / TILE)

  // Which tile index each feature claims. Two features in one tile would fight,
  // so the later one wins and that is worth knowing about while authoring.
  const claimed = new Map<number, RoadPiece>()
  for (const feature of features) {
    const index = Math.round(feature.at / TILE)
    if (claimed.has(index) && claimed.get(index) !== feature.piece) {
      console.warn(`[SKAI] two road pieces claim tile ${index}; using ${feature.piece}`)
    }
    claimed.set(index, feature.piece)
  }

  let tiles = 0
  for (let index = first; index <= last; index += 1) {
    const piece = claimed.get(index) ?? 'straight'
    const asset = PIECE_ASSET[piece]
    if (!has(asset)) {
      console.warn(`[SKAI] road piece "${asset}" missing from the kit; using straight`)
    }
    const tile = spawn(has(asset) ? asset : PIECE_ASSET.straight)
    tile.position.set(index * TILE, 0, 0)
    // The road and pavement are continuous receiver surfaces. Rendering their
    // own shallow slabs into the moving sun map adds a redundant second depth
    // grid and visible shadow acne on lower-precision classroom graphics.
    // Vehicles, pedestrians, trees and street furniture still cast onto them.
    tile.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (mesh.isMesh) { mesh.castShadow = false; mesh.receiveShadow = true }
    })
    group.add(tile)
    tiles += 1
  }

  return {
    group,
    tiles,
    tileCentre: (metres: number) => Math.round(metres / TILE) * TILE,
  }
}

/**
 * A sky with something in it.
 *
 * Puffy clouds: each one is three or four flattened spheres in a cluster,
 * fog-exempt so they stay white to the horizon, unlit so they are always the
 * brightest thing above the roofline. A dozen of them is what turns "a blue
 * gradient" into "a day".
 */
export function layClouds(lengthM: number, seed = 4021) {
  const group = new THREE.Group()
  group.name = 'clouds'
  const random = rng(seed)
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false })
  const puff = new THREE.SphereGeometry(1, 10, 8)

  for (let i = 0; i < 14; i += 1) {
    const cloud = new THREE.Group()
    const lumps = 3 + Math.floor(random() * 2)
    let reach = 0
    for (let j = 0; j < lumps; j += 1) {
      const lump = new THREE.Mesh(puff, material)
      const size = 4.5 + random() * 5
      lump.scale.set(size, size * 0.55, size * 0.8)
      lump.position.set(reach, (random() - 0.5) * 1.6, (random() - 0.5) * 3)
      lump.castShadow = false
      lump.receiveShadow = false
      cloud.add(lump)
      reach += size * 1.1
    }
    cloud.position.set(
      -40 + random() * (lengthM + 120),
      34 + random() * 26,
      (random() - 0.5) * 260,
    )
    group.add(cloud)
  }
  return group
}

/**
 * The verge either side: a wide plane under everything so no seam between road,
 * pavement and buildings can ever show sky through the floor.
 */
/**
 * GRASS, not olive-grey concrete.
 *
 * This plane is everything past the pavements, and with the pavements narrowed
 * to 3.5 m it is most of the frame's colour outside the road. Green is what a
 * child expects to see beside a street, and it is the single biggest lever on
 * the scene reading as a place rather than as a diagram.
 */
export function layGround(lengthM: number, colour = 0x74b25e) {
  // Big enough that its own edge is past the fog. At 460 m across, the far side
  // of the plane stopped inside the visible range and read as a hard green line
  // ruled across the sky; carried out to 2.4 km it dissolves into the fog
  // colour instead, which is what a horizon is.
  const surface = document.createElement('canvas')
  surface.width = 256; surface.height = 256
  const context = surface.getContext('2d')!
  context.fillStyle = '#d2d4bf'
  context.fillRect(0, 0, 256, 256)
  const random = rng(6107)
  for (let i = 0; i < 2300; i += 1) {
    context.fillStyle = i % 2 ? 'rgba(76,94,54,.08)' : 'rgba(255,249,202,.10)'
    context.fillRect(random() * 256, random() * 256, 1 + random() * 7, 1 + random() * 7)
  }
  const grass = new THREE.CanvasTexture(surface)
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping
  grass.repeat.set((lengthM + 2400) / 14, 2400 / 14)
  grass.colorSpace = THREE.SRGBColorSpace
  grass.anisotropy = 4
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(lengthM + 2400, 2400),
    new THREE.MeshStandardMaterial({ color: colour, map: grass, roughness: 0.98 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.set(lengthM / 2, -0.08, 0)
  ground.receiveShadow = true
  ground.name = 'ground'
  return ground
}

/** The outer edge of the pavement, where the guard rail stands. */
const PAVEMENT_EDGE = 13.0

// Every parked vehicle belongs to one of these real off-street footprints.
// Pavement is 9.54–13 m from the centreline; parking starts beyond 13.3 m.
export const PARKING_LOT = { width: 15.4, depth: 10.4, centreZ: 18.5, carRow: 2.15 } as const
export interface ParkingPlot { x: number; z: number; side: -1 | 1; hospital: boolean }

export function planParkingPlots(lengthM: number, clinicBay: number | null = null): ParkingPlot[] {
  const plots: ParkingPlot[] = []
  for (let x = 30; x < lengthM - 8; x += 78) {
    plots.push({ x, z: -PARKING_LOT.centreZ, side: -1, hospital: false })
  }
  if (clinicBay !== null) plots.push({ x: clinicBay - 16.3, z: PARKING_LOT.centreZ, side: 1, hospital: true })
  return plots
}

/**
 * The shop row, and how far back it stands.
 *
 * `SHOP_LINE` is the single most delicate number in this file. The three answer
 * cards float over the road ahead of the car and spread along the CAMERA's
 * right, which throws the outer card about nine metres to the side — out over
 * the near pavement. A frontage nearer the lens than that card is a frontage
 * that draws over it, which is exactly what the old five-storey plots at 17.2
 * did, and the occluder fade was quietly dissolving a wall in front of the lens
 * on every street to hide it.
 *
 * So the row stands back, and the shops are two or three storeys rather than
 * five. `scripts/probe-card-occlusion.mjs` raycasts the lens at all four corners
 * of all three cards and fails if the first thing it hits is not the card.
 */
const SHOP_LINE = 27
const SHOPS = [
  'shop_red', 'shop_sun', 'shop_mint', 'shop_sky', 'shop_plum', 'shop_cream',
]
/** Frontage widths, used only to space the row without overlaps. */
const SHOP_WIDTH: Record<string, number> = {
  shop_red: 8.5, shop_sun: 10.5, shop_mint: 9, shop_sky: 11.5, shop_plum: 8, shop_cream: 12,
}

/** Deterministic pseudo-random, so the same street builds identically twice. */
function instanceAsset(name: string, placements: THREE.Matrix4[], shadows: boolean) {
  const group = new THREE.Group()
  group.name = `${name}-instances`
  group.userData.landscape = shadows
  if (!placements.length) return group
  const source = spawn(name)
  source.updateWorldMatrix(true, true)
  source.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const instances = new THREE.InstancedMesh(mesh.geometry, mesh.material, placements.length)
    instances.name = `${name}-${mesh.name}`
    for (let i = 0; i < placements.length; i += 1) {
      // Preserve the GLB's complete nested transforms and modelling origins.
      instances.setMatrixAt(i, placements[i].clone().multiply(mesh.matrixWorld))
    }
    instances.instanceMatrix.needsUpdate = true
    instances.castShadow = shadows
    instances.receiveShadow = true
    instances.computeBoundingBox()
    instances.computeBoundingSphere()
    group.add(instances)
  })
  return group
}

function rng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

/**
 * Line both sides of the street: a row of shops, a guard rail and lamps.
 *
 * An empty street reads as unfinished, and a street of five-storey frontages at
 * 17.2 m drew over the third answer card. The answer to both is the same one:
 * SMALLER SHOPS, FURTHER BACK. Two or three storeys of flat bright colour at
 * `SHOP_LINE`, a guard rail along each pavement edge for scale, and lamps on the
 * far side, which are what the fog and dusk scenarios light. The clinic's plot
 * is left open so the destination has somewhere to stand.
 */
export function layFrontages(
  lengthM: number,
  seed = 2027,
  /** A stretch to leave open — the destination building owns its own plot. */
  keepClear: { from: number; to: number } | null = null,
) {
  const group = new THREE.Group()
  group.name = 'frontages'

  // The clinic's original plot contract is bayX-6 .. bayX+13. Reserve its
  // visitor parking too, with a walking connection beside the entrance.
  const clinicBay = keepClear ? keepClear.to - 13 : null
  const hospitalPlot = clinicBay !== null ? { from: clinicBay - 25, to: clinicBay + 14 } : null
  const parking = planParkingPlots(lengthM, clinicBay)
  const inParking = (x: number, side: number, margin = 0) => parking.some(
    (plot) => plot.side === side && Math.abs(x - plot.x) < PARKING_LOT.width / 2 + margin,
  )

  // ---- the shop row ------------------------------------------------------
  // Deterministic: the same street builds identically twice, so a screenshot
  // taken today matches the one in the storyboard.
  const random = rng(seed)
  for (const side of [1, -1] as const) {
    let x = -18
    while (x < lengthM + 26) {
      const name = SHOPS[Math.floor(random() * SHOPS.length)]
      const width = SHOP_WIDTH[name] ?? 10
      // A gap every so often, so the row reads as a street of separate shops
      // rather than one long wall, and daylight gets between them.
      if (random() < 0.22) { x += width * 0.7; continue }
      // The clinic owns its own plot on the near side.
      if (hospitalPlot && side === 1 && x + width > hospitalPlot.from && x < hospitalPlot.to) {
        x = hospitalPlot.to + 1
        continue
      }
      if (has(name)) {
        const shop = spawn(name)
        shop.position.set(x + width / 2, 0, side * SHOP_LINE)
        // The glTF exporter maps Blender +Y to -Z, so a shop modelled with its
        // body extending along +Y arrives extending along -Z — across the road.
        // The NEAR side is therefore the one that needs turning, not the far.
        shop.rotation.y = side > 0 ? Math.PI : 0
        group.add(shop)
      }
      x += width + 2.2 + random() * 3.5
    }
  }

  // One railing section per road tile, so the run butts up with no arithmetic.
  if (has('railing')) {
    for (let x = -TILE * 2; x < lengthM + TILE * 3; x += TILE) {
      for (const side of [1, -1] as const) {
        // The near side opens up for the clinic's forecourt.
        if (hospitalPlot && side === 1 && x + TILE / 2 > hospitalPlot.from && x - TILE / 2 < hospitalPlot.to) continue
        // A car park must have an entrance, not a guard rail across its aisle.
        if (inParking(x, side, TILE / 2)) continue
        const rail = spawn('railing')
        rail.position.set(x, 0.16, side * PAVEMENT_EDGE)
        group.add(rail)
      }
    }
  }

  // Lamps: far side only, and sparse. The camera lives on the near side and
  // sits low, so a near-side column stands in the shot for part of every street.
  for (let x = 12; x < lengthM; x += 36) {
    if (!has('lamp')) break
    if (parking.some((plot) => plot.side === -1 && Math.abs(plot.x - x) < 3.0)) continue
    const lamp = spawn('lamp')
    lamp.position.set(x, 0, -10.1)
    // The arm reaches OVER the carriageway, so it points back toward the
    // centreline from the side the column stands on.
    lamp.rotation.y = 0
    group.add(lamp)
  }

  // Marked off-street parking replaces the old vehicles placed across the
  // walking pavement. Repeated car and lot geometry is GPU-instanced.
  const PARKED = ['parked_blue', 'parked_yellow', 'parked_white']
  const parkingMatrices = new Map<string, THREE.Matrix4[]>()
  const parkingPose = new THREE.Object3D()
  const rememberParking = (name: string) => {
    parkingPose.updateMatrix()
    const matrices = parkingMatrices.get(name) ?? []
    matrices.push(parkingPose.matrix.clone())
    parkingMatrices.set(name, matrices)
  }
  const drivewayMaterial = new THREE.MeshStandardMaterial({ color: 0x99a5a2, roughness: 0.96 })
  for (const [index, plot] of parking.entries()) {
    if (has('parking_lot')) {
      parkingPose.position.set(plot.x, 0, plot.z)
      parkingPose.rotation.set(0, plot.side > 0 ? Math.PI : 0, 0)
      rememberParking('parking_lot')
    }
    // Two occupied standard bays; the wider blue bay and its striped access
    // space remain clear. +X-authored cars point towards the access aisle.
    for (const [carIndex, slotX] of [-5.1, 0.9].entries()) {
      const name = PARKED[(index + carIndex) % PARKED.length]
      if (!has(name)) continue
      parkingPose.position.set(
        plot.x + (plot.side > 0 ? -slotX : slotX),
        0.022,
        plot.z + plot.side * PARKING_LOT.carRow,
      )
      parkingPose.rotation.set(0, plot.side * Math.PI / 2, 0)
      rememberParking(name)
    }
    // A paved entrance crosses the still-continuous pedestrian route; parked
    // car bounds begin over 5 m beyond the pavement's outer edge.
    const driveway = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.12), drivewayMaterial)
    driveway.rotation.x = -Math.PI / 2
    driveway.position.set(plot.x, 0.163, plot.side * 11.54)
    driveway.receiveShadow = true
    driveway.name = plot.hospital ? 'hospital-parking-entrance' : 'parking-entrance'
    group.add(driveway)
  }
  for (const [name, matrices] of parkingMatrices) {
    group.add(instanceAsset(name, matrices, name !== 'parking_lot'))
  }

  // A welcoming clinic forecourt: clear walking axis to the glazed entrance,
  // a connection from visitor parking, planted edges, seating and bollards.
  if (clinicBay !== null) {
    const forecourt = new THREE.Group()
    forecourt.name = 'hospital-forecourt'
    const paving = new THREE.MeshStandardMaterial({ color: 0xcbd0c5, roughness: 0.95 })
    const pathMat = new THREE.MeshStandardMaterial({ color: 0xe3e1d4, roughness: 0.94 })
    const slab = (name: string, width: number, depth: number, x: number, z: number, material: THREE.Material) => {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material)
      plane.rotation.x = -Math.PI / 2
      plane.position.set(x, name === 'hospital-courtyard' ? 0.166 : 0.172, z)
      plane.receiveShadow = true
      plane.name = name
      forecourt.add(plane)
    }
    slab('hospital-courtyard', 16.5, 8.0, clinicBay + 3, 17.1, paving)
    slab('hospital-entrance-walk', 3.6, 8.2, clinicBay + 3, 17.1, pathMat)
    slab('hospital-parking-walk', 12.0, 1.6, clinicBay - 2.0, 14.9, pathMat)
    for (const s of [-1, 1]) {
      if (has('planting_bed')) {
        const bed = spawn('planting_bed')
        bed.position.set(clinicBay + 3 + s * 6.4, 0.166, 17.3)
        bed.scale.set(1.0, 1.0, 1.4)
        forecourt.add(bed)
      }
      if (has('bench')) {
        const bench = spawn('bench')
        bench.position.set(clinicBay + 3 + s * 5.1, 0.166, 19.8)
        bench.rotation.y = Math.PI
        forecourt.add(bench)
      }
      for (const offset of [3.0, 4.2, 5.4]) {
        const bollard = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.11, 0.82, 10),
          new THREE.MeshStandardMaterial({ color: 0x456a68, roughness: 0.5, metalness: 0.25 }),
        )
        bollard.position.set(clinicBay + 3 + s * offset, 0.576, 13.8)
        bollard.castShadow = true
        bollard.receiveShadow = true
        forecourt.add(bollard)
      }
    }
    group.add(forecourt)
  }

  // Plant a boulevard outside the walking path. Trees stand behind the
  // camera's lateral clamp and outside the cards, keeping every hazard clear.
  // Their spacing is authored in metres and seeded, so revisiting a street
  // preserves landmarks rather than randomly changing the environment.
  const placements = new Map<string, THREE.Matrix4[]>()
  if (has('tree')) {
    const pose = new THREE.Object3D()
    const remember = (name: string) => {
      pose.updateMatrix()
      const matrices = placements.get(name) ?? []
      matrices.push(pose.matrix.clone())
      placements.set(name, matrices)
    }
    for (const side of [-1, 1]) {
      for (let x = -26; x < lengthM + 44; x += 17 + random() * 6) {
        if (hospitalPlot && side === 1 && x > hospitalPlot.from - 3 && x < hospitalPlot.to + 3) continue
        if (inParking(x, side, 3.0)) continue
        const name = has('tree_tall') && random() > 0.64 ? 'tree_tall' : 'tree'
        const scale = 0.92 + random() * 0.25
        pose.scale.setScalar(scale)
        pose.position.set(x, 0, side * (19.4 + random() * 1.3))
        pose.rotation.y = random() * Math.PI * 2
        remember(name)
        if (has('planting_bed')) {
          pose.scale.setScalar(1.3)
          remember('planting_bed')
        }
      }
    }
  }

  for (const [name, matrices] of placements) {
    group.add(instanceAsset(name, matrices, name !== 'planting_bed'))
  }

  // Small places to pause make the otherwise empty verge a neighbourhood.
  // These stay on the far pavement, away from the driving and hazard paths.
  for (let x = 6; x < lengthM; x += 48) {
    if (inParking(x, -1, 2.5)) continue
    if (has('bench')) {
      const bench = spawn('bench')
      bench.position.set(x, 0.16, -12.0)
      bench.rotation.y = Math.PI
      group.add(bench)
    }
    if (has('bin')) {
      const bin = spawn('bin')
      bin.position.set(x + 2.1, 0.16, -12.05)
      group.add(bin)
    }
  }

  // One instanced draw for the paving joints provides human scale without
  // adding hundreds of objects or patterned lines across the driving surface.
  const count = Math.ceil((lengthM + 96) / 3)
  const joints = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.022, 3.4),
    new THREE.MeshStandardMaterial({ color: 0x858e88, roughness: 1 }),
    count * 2,
  )
  const pose = new THREE.Object3D()
  let instance = 0
  for (const side of [-1, 1]) {
    for (let i = 0; i < count; i += 1) {
      pose.position.set(-48 + i * 3, 0.162, side * 11.23)
      pose.rotation.x = -Math.PI / 2
      pose.updateMatrix()
      joints.setMatrixAt(instance++, pose.matrix)
    }
  }
  joints.receiveShadow = true
  joints.name = 'pavement-joints'
  group.add(joints)

  return group
}

/*
 * `layDistance` is gone.
 *
 * It drew two instanced bands past the end of the street — a "corridor" of
 * blocks continuing the frontages, and a wider "skyline" fading into haze — so
 * that the road ran into a city rather than into a flat panel of sky. With the
 * frontages themselves removed there is nothing for a corridor to continue, and
 * a skyline of ninety blocks behind a street with no buildings on it read as a
 * mistake. The fog closes the view instead, which is what it was always for:
 * the ground plane runs 2.4 km and dissolves into the fog colour, so the far end
 * of the street is haze, not an edge.
 */
