import * as THREE from 'three'
import { CameraGesture, dragOrbit, followPose } from './followCamera'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { PAL, glowTexture, matte, skyTexture } from './kit'
import { TILE, layClouds, layFrontages, layGround, layRoad, type RoadFeature, type RoadPiece } from './roadSystem'
import { loadKit } from './kitLoader'
import {
  makeCar, settledInLane, stepCar, stoppedAt,
  type CarState, type DriveInputs,
} from './driving'
import {
  makeAmbulance, makeBall, makeBarriers, makeChild, makeCone, makeCyclist, makeDog,
  makePerson, makeProp, makeRain, makeScooter, makeSign, makeVan,
  type Actor, type Van, type Walker,
} from './actors'
import { assemble, partOf, spawn } from './kitLoader'

/** A boom gate from the kit, arm raised: open for business. */
function assembleGate(): THREE.Group {
  const gate = assemble('gate_')
  const arm = partOf(gate, 'gate_arm')
  arm.rotation.z = -Math.PI / 2 + 0.12
  return gate
}

/** Lane geometry, matching the Blender road pieces. */
/**
 * The carriageway, in metres from the centreline to the kerb face.
 *
 * Four lanes of 4.6: the vehicle runs in the kerb-side lane on the near side,
 * which leaves it a whole lane of its own to move into when it has to go round
 * something without ever crossing to the far side.
 */
export const ROAD_HALF = 9.2
export const LANE_NEAR = 6.9
export const LANE_FAR = -6.9
/** The inner lane each side, used when the vehicle has to give way. */
export const LANE_INNER = 2.3
import { waypointsFor, type EventToken, type Scenario } from '../sim'
import { HoloDeck, type HoloOption } from './holocards'
import type { Outcome } from '../choices'

/**
 * The 3D stage.
 *
 * It owns the renderer, the camera rig and every actor, and exposes exactly the
 * four commands the act screen already speaks — drive, reveal, act, block — so
 * the game's logic (rules, priority scan, level flow) is untouched by the move
 * from flat art to a real scene.
 *
 * Nothing here decides anything. The vehicle moves only when a rule the child
 * wrote says it may; this file just makes that decision visible in three
 * dimensions.
 */

/** The street is measured in screen widths by the game, and in metres here. */
/**
 * The street's length, in screen widths.
 *
 * 6.0, not 4.4. The old street was 105.6 m and could not hold four hazards once
 * the closed-road manoeuvre was measured rather than estimated: that one hazard
 * needs about thirty-seven metres — twenty of run-up to cross four metres of
 * road and settle before its nose enters a one-car gap, sixteen to the barrier
 * wall, and the return. Level 4 asked for scooter, gate, crossing and clinic in
 * 105.6 m, and the crossing's stop mark landed twenty-seven metres BEHIND where
 * the gate manoeuvre finished. At 144 m every level's hazards are met from in
 * front with room to spare, which `scripts/probe-route.mjs` checks.
 */
export const WORLD = 6.0
export const M_PER_SW = 24
export const WORLD_M = WORLD * M_PER_SW
/**
 * How far short of a hazard the vehicle stops, in screen widths.
 *
 * This is the run-up every manoeuvre gets. Under the bicycle model a lateral
 * move costs roughly 2.2 m of forward travel per metre shifted, and that cost
 * is independent of speed — both the sideways and forward rates scale with it.
 * At 0.14 (3.4 m, of which the car's own nose takes 2.1) there was 1.3 m of
 * clear road to complete a move needing more than twice that, so the car was
 * still crossing as it drew level and clipped what it was passing. Slowing the
 * approach could not fix it; only distance can.
 */
export const STOP_GAP = 0.3

/**
 * Which road PIECE each hazard needs.
 *
 * Lifted out of `setScenario` because the stop marks need it too: a hazard that
 * owns a piece is placed at that TILE's centre rather than at its route
 * position, and a stop mark measured from the route position is therefore
 * measured from the wrong place — by up to half a tile.
 */
/** The scenarios that drive the mission's OWN street — the one with the
    scooter, the roadworks gate and the hospital on it. The advanced patrols
    are other streets entirely and get only their own hazard. */
const MISSION_STREET = new Set(['l1', 'l2', 'l3', 'l4', 'create', 'iterate', 'depot'])

export const PIECE_FOR: Partial<Record<string, RoadPiece>> = {
  MOVING: 'crossing',
  MANY_MOVING: 'crossing',
  ARRIVED: 'bay',
  DEAD_END: 'works',
  NARROW: 'works',
  ROAD_BLOCKED: 'works',
}

/**
 * How much road each hazard needs BEFORE it, in metres.
 *
 * The default is 7.2 m: enough that the hazard fills the frame from the rear
 * camera and the car has room to start a manoeuvre. The closed road is the one
 * exception, and it is negative-ish for a reason — its barrier wall stands 16 m
 * past the placement point, and the car needs 20 m of run-up to cross 4.2 m of
 * road and settle before its nose enters a one-car gap, so its mark is 4 m
 * BEFORE the placement point rather than after it.
 */
const RUN_UP: Record<string, number> = {
  NARROW: 4,
}
const RUN_UP_DEFAULT = 7.2

/**
 * Where the car pulls up for a hazard, in screen widths.
 *
 * Derived, not tabulated. It used to be a hand-written table of landmarks, and
 * nothing tied an entry to where the hazard actually ended up: reordering a
 * level's hazards, or changing how far past its placement point the closed
 * road's barriers stand, silently moved a stop mark to the wrong side of the
 * thing it was meant to stop for. On level 4 that put the crossing's mark 27 m
 * behind where the previous manoeuvre finished, so the car drove past the
 * crossing and the reveal played a hazard a hundred metres behind it.
 *
 * `scripts/probe-route.mjs` now counts those, and the count has to be zero.
 */
export function markFor(trigger: string, routeX: number): number {
  const runUp = RUN_UP[trigger] ?? RUN_UP_DEFAULT
  return clamp(placeFor(trigger, routeX) * M_PER_SW - runUp, 0, WORLD_M) / M_PER_SW
}

/**
 * Where the hazard itself STANDS, in screen widths.
 *
 * A hazard that owns a road piece is snapped to that tile's centre so the child
 * stands on the zebra and the van stops in the bay rather than near it. The flat
 * fallback scene needs the same answer, or its props sit somewhere the 3D
 * street's do not.
 */
export function placeFor(trigger: string, routeX: number): number {
  const raw = routeX * WORLD_M
  return (PIECE_FOR[trigger] ? Math.round(raw / TILE) * TILE : raw) / M_PER_SW
}

export type SceneMode = Scenario | 'depot'

export type SceneCommand =
  | { id: number; kind: 'drive'; to: number }
  | { id: number; kind: 'reveal'; trigger: EventToken }
  | { id: number; kind: 'act'; trigger: EventToken; actions: string[]; outcome?: Outcome }
  | { id: number; kind: 'block'; trigger: EventToken }
  /** Put the street back and the car on its mark, for another attempt. */
  | { id: number; kind: 'rewind'; to: number }
  /** Ease to a stop right here — a popup is up and the street stands still. */
  | { id: number; kind: 'hold' }

export type CameraView = 'lowchase' | 'chase' | 'side' | 'rear' | 'top'

export const CAMERA_VIEWS: { id: CameraView; label: string; hint: string }[] = [
  { id: 'lowchase', label: 'Drive', hint: 'Low behind the car, the way a racing game sits' },
  { id: 'chase', label: 'High', hint: 'Further back and higher — more road, smaller car' },
  { id: 'side', label: 'Side', hint: 'Tracking alongside' },
  { id: 'rear', label: 'Behind', hint: 'Looking back down the road the car has come' },
  { id: 'top', label: 'Top', hint: 'Straight down — best for lanes' },
]

/** Rig geometry per view: where the camera sits relative to the vehicle, and
 *  where it looks. Kept in one table so the angles are trivial to adjust. */
const RIG: Record<CameraView, { offset: THREE.Vector3; look: THREE.Vector3; fov: number }> = {
  // THE DEFAULT. Low and close, the way every driving game frames a car,
  // because that is the shot that makes a street feel driven rather than
  // watched. The boom is 8.4 m at 3.1 m up: the car fills the lower third, the
  // road opens out above it, and the lens is under the roofline of the
  // frontages so the buildings tower instead of flattening.
  lowchase: { offset: new THREE.Vector3(-10.8, 4.2, 0), look: new THREE.Vector3(15, 1.1, 0), fov: 58 },
  // The old default, kept as the wide option: further back and higher, which is
  // the better shot for reading lane position and for watching a long approach.
  chase: { offset: new THREE.Vector3(-15.5, 8.6, 1.5), look: new THREE.Vector3(15, -1.2, 0), fov: 56 },
  // z pulled in from 12.5: at 12.5 plus the car's own 6.9 the lens stood at
  // 19.4, which is 2.4 m INSIDE the shell of any built plot (frontage origins
  // are at 17.2). It only ever looked right because the occluder fade was
  // dissolving the wall in front of it.
  side: { offset: new THREE.Vector3(-1.5, 3.2, 6.6), look: new THREE.Vector3(1.5, 1.2, 0), fov: 46 },
  // Looking BACK down the road — the one framing the street never had, and the
  // only one that can show a child something closing from behind.
  //
  // The lens sits just AHEAD of the car and looks back over its own roof, so
  // the car's rear deck is in the bottom of the frame the whole time. That is
  // not decoration: standing behind the car instead put the car out of shot
  // entirely, and an ambulance filling an empty road reads as a head-on
  // collision, not as something overtaking you. You have to see your own car
  // being overtaken for the manoeuvre to mean anything.
  //
  // The exact numbers matter and were solved rather than guessed: with the lens
  // one metre ahead of the car the car's own roof projected to NDC y -0.66 and
  // its tail to -0.92 — drawn, but in the bottom 7% of the frame, underneath
  // the command bar. Three metres ahead and a little lower puts the roof at
  // -0.27 and the tail at -0.46, so the car sits across the lower third with
  // the ambulance filling the middle.
  rear: { offset: new THREE.Vector3(10.5, 7.2, 8.5), look: new THREE.Vector3(-7, 0.45, 0), fov: 52 },
  top: { offset: new THREE.Vector3(3, 32, 0.02), look: new THREE.Vector3(3, 0, 0), fov: 44 },
}


/**
 * Thrown through a choreography that has been called off.
 *
 * A manoeuvre is a chain of awaits — drive here, wait, steer, wait for contact —
 * and until now nothing could interrupt one. `rewind` resolved the pending wait
 * so the chain CONTINUED from wherever it had got to, on a street that had just
 * been put back and with a second manoeuvre already starting: two choreographies
 * writing to the same drive inputs, which showed up as a wrong answer that
 * simply never landed on the second attempt.
 *
 * Rejecting instead of resolving unwinds the whole chain at the next await, with
 * no per-step checks to forget.
 */
const CANCELLED = Symbol('cancelled')

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/** Half the vehicle's width and length, in metres. */
const CAR_HALF_Z = 0.93
const CAR_HALF_X = 2.10
/** Room a driver leaves when squeezing past something. */
const PASS_CLEARANCE = 0.55
/** Any swerve smaller than this reads as a wobble, so it is worth no less. */
const MIN_SWERVE = 1.0
/** The furthest over the car will go: its near flank still clears the centre. */
const IN_LANE_LIMIT = CAR_HALF_Z + 0.12
/** Swerving is a brisk manoeuvre, unlike an ordinary lane change. */
const SWERVE_AGILITY = 2.3
/** Held throughout a pass, so the whole manoeuvre is one continuous movement. */
const PASS_SPEED = 0.85

/**
 * `?quality=high` holds every graphics setting on, whatever the frame rate.
 *
 * Adaptive quality is right for a classroom machine, but it also means a
 * screenshot taken on a loaded computer shows a plainer street than the game
 * really has. This pins it for capture, and for anyone on hardware they know
 * is fast enough.
 */
/** The quality rung the LAST stage on this page settled on. A new level mounts
    a new stage, and re-measuring from scratch handed every child on a slow
    laptop a second of stutter per level before the same rungs dropped again.
    Per page-load, never persisted: the Graphics toggle stays the child's. */
let LEARNED_QUALITY = 0

const PIN_QUALITY = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('quality') === 'high'

// Scratch vectors for the per-frame occlusion test — allocating these inside
// the render loop would churn the heap sixty times a second.
const OCC_TARGET = new THREE.Vector3()
const OCC_AXIS = new THREE.Vector3()
const OCC_POS = new THREE.Vector3()
const OCC_REL = new THREE.Vector3()
const OCC_NEAR = new THREE.Vector3()

/**
 * How far sideways the camera may sit.
 *
 * The pavement runs from the kerb face at 9.2 out to 17.2, where the frontage
 * origins are and the shopfronts stand. 15.5 keeps the lens clear of the tree
 * line at 13.4 and short of the glass. (The old value of 12.6 was justified by
 * a comment that put the frontages at 12.6 — that is the bench line, mid
 * pavement — and it was tight enough that essentially every held hazard shot
 * was pinned on the clamp instead of settling at the angle it solved for.)
 */
/**
 * The angle a held hazard shot settles at, radians round the pair.
 *
 * Three-quarter front: far enough round to show the gap between the car and
 * the obstacle, near enough behind to keep the road ahead in frame.
 */
const easeOut = (x: number) => 1 - (1 - x) ** 3
const easeInOut = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2)

interface Tween {
  elapsed: number
  duration: number
  ease: (x: number) => number
  apply: (v: number) => void
  resolve: () => void
  /** Called instead of `resolve` when the manoeuvre is called off. */
  reject: (reason: unknown) => void
  done: boolean
}

/**
 * What the vehicle is doing right now, for the instrument cluster.
 *
 * Read straight off the driving model rather than inferred from the commands,
 * so the readout can never disagree with what the car is visibly doing — the
 * point of putting it on screen at all is that a child can watch the number
 * fall as the car brakes for something and connect the two.
 */
export interface Telemetry {
  /** Ground speed, m/s. */
  speed: number
  /** Fraction of the cruising speed, 0..1, for the bar. */
  throttle: number
  /** Which lane the car is settled in, or null mid-change. */
  lane: 'kerb' | 'inner' | null
  /** Signed steering angle, radians. */
  steer: number
  braking: boolean
  /** How far along the street, 0..1. */
  progress: number
  /** The camera is holding a hazard shot: something is in the way. */
  alert: boolean
}

export interface StageHooks {
  /** Fired when the vehicle's speed changes, for the engine-note synth. */
  onSpeed?: (metresPerSecond: number) => void
  /** Fired about ten times a second with the vehicle's live state. */
  onTelemetry?: (state: Telemetry) => void
  onSound?: (cue: string) => void
  /** The WebGL context died. The shell offers a reload. */
  onContextLost?: () => void
  /** The context came back on its own — the shell can take the slab down. */
  onContextRestored?: () => void
  /** Fired when a hazard shot starts or ends, so the UI can offer view arrows. */
  /** Fired when the stage drops a graphics setting to hold the frame rate. */
  onQuality?: (level: number) => void
  /** A holo-card in the street was clicked. */
  onCardPick?: (index: number) => void
  /** The pointer moved onto or off a card, so the cursor can change. */
  onCardHover?: (index: number | null) => void
  /** Changes only when the user leaves or restores the standard follow view. */
  onCameraOffset?: (active: boolean) => void
  /**
   * The free-look review opened or closed.
   *
   * It opens whenever the car has just done something and the child should be
   * able to walk round the result — a crash above all. While it is open the
   * camera belongs to the pointer, not to the follow rig.
   */
  onReview?: (open: boolean) => void
}

export class Stage {
  readonly scene = new THREE.Scene()
  private renderer: THREE.WebGLRenderer
  private camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.35, 900)
  private sun = new THREE.DirectionalLight(0xfff0da, 2.65)
  private hemi = new THREE.HemisphereLight(0xdcefff, 0x747b63, 0.85)
  /** Opposes the sun so the shaded row of frontages is not a black cliff. */
  private fill = new THREE.DirectionalLight(0xdfeeff, 0.65)
  private clock = new THREE.Clock()
  private tweens: Tween[] = []
  private raf = 0
  private disposed = false

  private van!: Van
  private built = false
  private road: THREE.Group | null = null
  private frontages: THREE.Group | null = null
  /** The vehicle's real state. Position is an OUTPUT of steering, never set
   *  directly — that is what stops it sliding sideways. */
  private car: CarState = makeCar(0, LANE_NEAR)
  private drive: DriveInputs = { targetLane: LANE_NEAR, stopAt: null, cruise: 0 }
  /** Conditions the command layer is waiting on, polled once per frame. */
  private waits: { done: () => boolean; resolve: () => void; reject: (reason: unknown) => void; expires: number }[] = []
  /** Pending `wait(ms)` timers, so they can be called off too. */
  private timers: { id: number; reject: (reason: unknown) => void }[] = []
  /** Base cruising speed, m/s. */
  private cruiseSpeed = 13
  /** Scene time of the last instrument-cluster update. */
  private lastTelemetry = 0
  /**
   * The simulation's own clock: the sum of the dt the physics was actually
   * stepped with.
   *
   * It is NOT the wall clock, and the difference is the whole point. `dt` is
   * clamped to 0.05 s so a stalled frame cannot teleport the car through a
   * barrier — which means that below 20 fps the world runs in slow motion. Every
   * manoeuvre's timeout used to be measured against `clock.elapsedTime`, which
   * is real time, so on a slow machine a swerve would be cut off a third of the
   * way through and the car would carry on into whatever it was avoiding. On a
   * classroom Chromebook that is not a hypothetical.
   */
  private simTime = 0

  /**
   * The hazard the camera is currently framing, if any.
   *
   * When something blocks the vehicle, the camera leaves its follow position and
   * takes a two-shot: van and blocker in one tight frame. `hold` keeps it there
   * while the hazard reveals and while the crew is stopped; once released, the
   * shot breaks by itself as soon as the vehicle has driven past.
   */
  /**
   * True from the moment a hazard shows itself until the rule is carried out.
   *
   * This is all that is left of the old two-shot: a flag the instrument cluster
   * reads. The camera used to swing off the car and orbit round to frame each
   * obstacle, on every hazard, twelve times a run — the same move over and over,
   * and it took the shot away from the child at the moment they were being asked
   * to look at the road. The view now stays where it is.
   */
  private alerted = false
  /**
   * How many times a leg has been asked to drive to a mark already behind the
   * car.
   *
   * Zero on a correctly laid-out route: every hazard's stop mark is further
   * along than where the previous manoeuvre finished. Any other number means a
   * level's hazards are too close together to drive, and the child will be shown
   * a hazard from the wrong side of it. Read by `scripts/probe-route.mjs`.
   */
  marksBehind = 0
  /** The drivable length in metres, for test harnesses. */
  readonly worldLength = WORLD_M
  /** The mark and where the car actually was, for each of those. */
  marksBehindLog: { to: number; at: number }[] = []
  /** Lerped so a change of framing is a move, not a cut. */

  private view: CameraView = 'lowchase'
  /**
   * A view the beat itself demands, overriding whatever the child picked.
   *
   * There is exactly one of these: something closing from BEHIND cannot be
   * staged from any forward-facing camera, and the two-shot solver makes it
   * worse — it frames car and hazard together, which for a 39 m gap means
   * standing in front of the ambulance and watching it drive away from the
   * lens. Growing-toward-you is the whole grammar of "it is coming"; this is
   * how that beat gets to use it.
   */
  private camPos = new THREE.Vector3()
  private camLook = new THREE.Vector3()
  private orbit = { yaw: 0, pitch: 0, zoom: 1 }
  private cameraOffset = false
  private followedHeading = 0
  private snapped = false

  /** The three cards, when a choice is on the street. */
  private deck: HoloDeck | null = null

  /**
   * Free-look review: the camera orbits one point and the pointer owns it.
   *
   * `yaw` is deliberately UNCLAMPED. The whole reason this mode exists is that
   * a child who has just crashed a car should be able to walk all the way round
   * the wreck and look at it from underneath if they want to, and every other
   * camera in this file is clamped to keep the lens out of the frontages.
   */
  private review: { point: THREE.Vector3; radius: number; yaw: number; pitch: number } | null = null

  /** Decaying impact shake, in metres of camera displacement. */
  private shake = 0
  /** Reduced motion: decorative movement suppressed. */
  private lowGfx = false

  /** Actors keyed by the event they belong to, so reveal/act can find them. */
  private props = new Map<EventToken, {
    actor: Actor; x: number; extras?: Record<string, Actor>
    /** Each piece's own span across the carriageway, for planning a pass. */
    spans?: { minZ: number; maxZ: number }[]
    /**
     * Where every piece started.
     *
     * A wrong answer is now DRIVEN, and some of them knock things over. Retry
     * has to put the street back exactly as it was, or the second attempt is at
     * a scooter that is already lying on its side.
     */
    home?: { object: THREE.Object3D; pos: THREE.Vector3; rot: THREE.Euler }[]
  }>()
  private ambient: { walker: Walker; speed: number; dir: number }[] = []
  /** State belongs to the actor instance, so replacing a route also retires its motion. */
  private actorMotion = new WeakMap<Actor, { kind: 'waiting' | 'riding' | 'oncoming'; originX: number; speed: number }>()
  private rain = makeRain()
  private lamps: THREE.Mesh[] = []
  /** Near-side street furniture that can stand between the camera and the car. */
  private occluders: { group: THREE.Object3D; materials: THREE.MeshStandardMaterial[]; fade: number; reach?: number }[] = []
  private dusk = false
  private hooks: StageHooks
  private mode: SceneMode = 'depot'
  private pmrem!: THREE.PMREMGenerator
  private env: THREE.Texture | null = null
  private composer!: EffectComposer
  private bloom!: UnrealBloomPass
  /** 0 = everything on. Steps down on slow hardware; never steps back up. */
  private quality = 0
  private qualityFrames = 0
  private qualityClock = 0
  /** Resolution multiplier the adaptive rungs apply on top of the DPR cap. */
  private resScale = 1
  /** Behind the editor/brief: the street is a backdrop, drawn at a quarter rate. */
  private backdrop = false
  private backdropFrame = 0
  private onLost = (event: Event) => {
    event.preventDefault()
    if (!this.disposed) this.hooks.onContextLost?.()
  }
  private onRestored = () => {
    if (this.disposed) return
    this.resize()
    this.hooks.onContextRestored?.()
  }

  constructor(canvas: HTMLCanvasElement, hooks: StageHooks = {}) {
    this.hooks = hooks
    // No MSAA on the default framebuffer: every frame goes through the
    // composer, whose render targets are not multisampled, so the flag bought
    // nothing in normal mode and taxed low-graphics mode (which renders direct).
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    // Capped device pixel ratio: a 4K classroom panel would otherwise render
    // four times the pixels for no visible gain and a third of the frame rate.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6))
    // A lost WebGL context (driver reset, too many tabs on a school machine)
    // otherwise leaves a frozen frame that reads as a crash. Tell the shell,
    // which shows a reload card — and take it down again if the driver comes
    // back on its own.
    canvas.addEventListener('webglcontextlost', this.onLost)
    canvas.addEventListener('webglcontextrestored', this.onRestored)
    // Start at the rung the previous level learned instead of stuttering
    // through the same measurements again.
    this.quality = LEARNED_QUALITY
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.02

    this.scene.background = skyTexture(0x5c9fd8, 0xbfe0f5)
    this.scene.fog = new THREE.Fog(0xcfe4f2, 100, 320)
    this.pmrem = new THREE.PMREMGenerator(this.renderer)
    this.setEnvironment(0x5c9fd8, 0xbfe0f5)

    this.sun.position.set(-28, 48, -34)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 220
    const shadowCam = this.sun.shadow.camera as THREE.OrthographicCamera
    shadowCam.left = -27; shadowCam.right = 27; shadowCam.top = 27; shadowCam.bottom = -27
    this.sun.shadow.bias = -0.00015
    this.sun.shadow.normalBias = 0.035
    this.scene.add(this.sun, this.sun.target, this.fill, this.fill.target, this.hemi)

    // A sun flare, so the sky is not a flat wash.
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), transparent: true, depthWrite: false, opacity: 0.3,
    }))
    flare.scale.set(90, 90, 1)
    flare.position.set(-180, 130, -240)
    this.scene.add(flare)


    // Bloom, thresholded high so only genuinely bright things glow: lamp heads,
    // headlights, the ambulance bar, the lit windows at dusk. This is what makes
    // light read as light rather than as a pale patch of paint.
    // Multisample the composer's own target, where the scene is actually drawn.
    // This cleans the car's LED strips, wheel spokes and window edges without
    // blurring the UI or paying for supersampling the whole display.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 })
    this.composer = new EffectComposer(this.renderer, target)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    // Threshold ABOVE pure white: at 0.92 the zebra crossing's white paint
    // bloomed into a blinding column from the top camera. Only genuinely
    // emissive things (lamps, lightbars, the sensor eye) may glow.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.45, 1.2)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())

    this.attachOrbit(canvas)
    this.resize()
  }

  /** A bright sky, soft clouds and darker ground give curved paint and glass
   * readable reflections. The HDR texture is generated locally; no network or
   * external environment download is needed by the offline activity. */
  private setEnvironment(top: number, bottom: number) {
    const width = 256, height = 128
    const data = new Float32Array(width * height * 4)
    const zenith = new THREE.Color(top)
    const horizon = new THREE.Color(bottom)
    const earth = new THREE.Color(0x646b55)
    const colour = new THREE.Color()
    for (let y = 0; y < height; y += 1) {
      const v = 1 - y / (height - 1)
      for (let x = 0; x < width; x += 1) {
        const u = x / (width - 1)
        if (v < 0.5) colour.copy(zenith).lerp(horizon, Math.pow(v * 2, 0.8))
        else colour.copy(horizon).lerp(earth, Math.min(1, (v - 0.5) * 15))
        const sun = Math.exp(-((u - 0.73) ** 2 + (v - 0.22) ** 2) / 0.00055) * 9
        const cloud = v < 0.43 ? Math.pow(Math.max(0, Math.sin(u * 18 + v * 4)), 6)
          * Math.exp(-((v - 0.28) ** 2) / 0.006) * 0.42 : 0
        const offset = (y * width + x) * 4
        data[offset] = colour.r + sun + cloud
        data[offset + 1] = colour.g + sun * 0.93 + cloud
        data[offset + 2] = colour.b + sun * 0.79 + cloud
        data[offset + 3] = 1
      }
    }
    const source = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType)
    source.colorSpace = THREE.LinearSRGBColorSpace
    source.mapping = THREE.EquirectangularReflectionMapping
    source.needsUpdate = true
    const target = this.pmrem.fromEquirectangular(source)
    this.env?.dispose()
    this.env = target.texture
    this.scene.environment = this.env
    this.scene.environmentIntensity = 0.8
    source.dispose()
  }

  /**
   * Parse the Blender kit, build the world, and start rendering.
   *
   * Separate from the constructor because the kit arrives as base64 and glTF
   * parsing is asynchronous. Nothing is drawn until the models exist, which is
   * a few milliseconds — there is no network involved.
   */
  async ready() {
    await loadKit()
    if (this.disposed) return

    this.deck = new HoloDeck(this.scene)
    this.scene.add(layGround(WORLD_M))
    this.scene.add(layClouds(WORLD_M))
    this.van = makeVan('NV-1')
    this.scene.add(this.van.group)
    this.van.setLidar(true)
    this.scene.add(this.rain.group)
    this.rain.setActive(false)
    this.built = true
    this.loop()
  }

  // ------------------------------------------------------------------ view --

  /**
   * The pointer: it clicks cards, and it owns the camera.
   *
   * Three jobs from one handler, because they cannot be separated — a press on a
   * card and the start of a drag are the same event, and only the release tells
   * you which it was. So: press records where; move past six pixels turns it
   * into a drag and the camera follows; release under six pixels on a card is a
   * click. Anything else is a drag that happened to start on a card.
   */
  private attachOrbit(canvas: HTMLCanvasElement) {
    let pointer: number | null = null
    const gesture = new CameraGesture()
    let pressedCard: number | null = null
    const ndc = new THREE.Vector2()
    const toNdc = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1)
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || pointer !== null) return
      pointer = event.pointerId
      gesture.begin(event.clientX, event.clientY)
      pressedCard = this.deck?.visible ? this.deck.at(toNdc(event), this.camera) : null
      canvas.setPointerCapture(event.pointerId)
      event.preventDefault()
    }
    const move = (event: PointerEvent) => {
      if (pointer === null) {
        if (this.deck?.visible && event.target === canvas) {
          const over = this.deck.at(toNdc(event), this.camera)
          if (over !== this.deck.hoverIndex) {
            this.deck.setHover(over)
            this.hooks.onCardHover?.(over)
          }
        }
        return
      }
      if (event.pointerId !== pointer) return
      const delta = gesture.move(event.clientX, event.clientY)
      if (!delta) return
      const [dx, dy] = delta
      // One control model in every activity state. Yaw and the look direction
      // rotate together, so the follow solver never fights the pointer.
      dragOrbit(this.orbit, dx, dy, canvas.getBoundingClientRect().height)
      this.notifyCameraOffset()
      canvas.style.cursor = 'grabbing'
    }
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointer) return
      pointer = null
      canvas.style.cursor = ''
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      if (gesture.dragging || event.type !== 'pointerup' || !this.deck?.visible) return
      const hit = this.deck.at(toNdc(event), this.camera)
      if (hit !== null && hit === pressedCard) this.hooks.onCardPick?.(hit)
    }
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 240 : 1)
      this.orbit.zoom = clamp(this.orbit.zoom * Math.exp(clamp(pixels, -240, 240) * 0.0015), 0.8, 1.8)
      this.notifyCameraOffset()
    }
    const doubleClick = () => this.resetOrbit()
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('lostpointercapture', up)
    canvas.addEventListener('wheel', wheel, { passive: false })
    canvas.addEventListener('dblclick', doubleClick)
    this.detachOrbit = () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('lostpointercapture', up)
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('dblclick', doubleClick)
    }
  }

  private detachOrbit: () => void = () => {}

  setView(view: CameraView) { this.view = view }

  private notifyCameraOffset() {
    const yaw = Math.atan2(Math.sin(this.orbit.yaw), Math.cos(this.orbit.yaw))
    const active = Math.abs(yaw) > 0.015 || Math.abs(this.orbit.pitch) > 0.01 || Math.abs(this.orbit.zoom - 1) > 0.01
    if (active === this.cameraOffset) return
    this.cameraOffset = active
    this.hooks.onCameraOffset?.(active)
  }

  resetOrbit() {
    // Pick the nearest equivalent turn so reset never performs a full spin.
    this.orbit.yaw = Math.round(this.orbit.yaw / (Math.PI * 2)) * Math.PI * 2
    this.orbit.pitch = 0
    this.orbit.zoom = 1
    this.notifyCameraOffset()
  }

  /**
   * The two machine settings the stage owns.
   *
   * LOW GRAPHICS is for the school laptop with integrated graphics: shadows
   * and bloom are the two most expensive things in the frame, and pixel ratio
   * is the multiplier on everything else. REDUCED MOTION zeroes the impact
   * shake — the one camera movement that is decorative rather than
   * informative; the follow damping itself stays, because a camera that
   * teleports is worse for a sensitive viewer, not better.
   */
  setQuality(low: boolean) {
    this.lowGfx = low
    this.renderer.shadowMap.enabled = !low
    this.bloom.enabled = !low
    // Materials compiled with shadows need a refresh when the map toggles.
    this.scene.traverse((node) => {
      const mesh = node as THREE.Mesh
      const material = mesh.material as THREE.Material | undefined
      if (material) material.needsUpdate = true
    })
    // Resolution is owned by resize() (one place, one cap); the adaptive rungs
    // this stage had already earned are re-applied, not wiped.
    if (!low && this.quality > 0) this.applyQuality()
    this.resize()
  }

  setReducedMotion(on: boolean) {
    if (this.deck) this.deck.calm = on
  }

  // ------------------------------------------------------- the choice, in 3D --

  /**
   * Put the three options on the street.
   *
   * No camera move. The cards rise in front of the car from wherever the lens
   * already is, which is the point: the child is looking at the hazard, and the
   * question arrives in the same shot rather than replacing it.
   */
  showChoices(options: HoloOption[]) {
    this.deck?.show(options)
  }

  hideChoices() {
    this.deck?.hide()
  }

  /** Flare the chosen card and drop the other two. */
  commitChoice(index: number) {
    this.deck?.commit(index)
  }

  // ------------------------------------------------------------- the review --

  /**
   * Hand the camera to the pointer, orbiting one point.
   *
   * Called after the car has carried out a choice — always after a failure, and
   * briefly after a success. The radius is solved from how big the thing being
   * looked at is, so a barrier wall and a dog both fill the same amount of frame.
   */
  enterReview(point: THREE.Vector3, radius = 9.5) {
    // Review changes the activity state, never the user's camera. The same
    // drag and zoom controls work before, during and after a decision.
    this.review = { point: point.clone(), radius, yaw: 0, pitch: 0 }
    this.hooks.onReview?.(true)
  }

  exitReview() {
    if (!this.review) return
    this.review = null
    this.hooks.onReview?.(false)
  }

  get inReview() { return this.review !== null }



  resize() {
    const canvas = this.renderer.domElement
    const parent = canvas.parentElement
    const width = parent?.clientWidth || canvas.clientWidth || 1280
    const height = parent?.clientHeight || canvas.clientHeight || 720

    // Render at the size the scene is actually SHOWN at, not the size it is
    // laid out at. The game is authored at a fixed 1920x1080 and scaled to the
    // window with a CSS transform, so on a smaller screen the street was being
    // drawn at 1920x1080 and then squeezed down — 2.25x the pixels for no
    // visible gain, and this screen is fill-rate bound. getBoundingClientRect
    // reports the transformed size; clientWidth reports the untransformed one.
    const shown = (parent ?? canvas).getBoundingClientRect()
    // Area gives the same display scale when portrait devices rotate the stage.
    const scale = shown.width > 0 && shown.height > 0
      ? Math.sqrt(shown.width * shown.height / (width * height)) : 1
    // THE one place the pixel ratio is decided: DPR x on-screen scale, capped
    // (1.0 on low graphics), times whatever the adaptive rungs have taken off.
    const cap = this.lowGfx ? 1 : 1.6
    const ratio = Math.max(0.5, clamp(window.devicePixelRatio * scale, 0.65, cap) * this.resScale)
    this.renderer.setPixelRatio(ratio)

    this.renderer.setSize(width, height, false)
    // EffectComposer multiplies setSize() by its OWN cached pixel ratio. It
    // used to be handed device pixels with a stale ratio of 1, so the post
    // passes ran at the wrong size in both directions — hand it CSS pixels and
    // keep its ratio in step with the renderer's.
    this.composer?.setPixelRatio(ratio)
    this.composer?.setSize(width, height)
    // Bloom is the most expensive pass here; running its blur chain at half
    // resolution is invisible on a soft glow and roughly halves its cost. Must
    // stay AFTER composer.setSize, which resizes the pass to full buffer size.
    const bufferW = Math.max(1, Math.round(width * ratio))
    const bufferH = Math.max(1, Math.round(height * ratio))
    this.bloom?.setSize(Math.round(bufferW / 2), Math.round(bufferH / 2))
    this.camera.aspect = width / Math.max(1, height)
    this.camera.updateProjectionMatrix()
  }

  // ----------------------------------------------------------------- scene --

  /** Build the props this scenario needs, at the positions its route names. */
  setScenario(mode: SceneMode, parkX = 0.06) {
    // Nothing to build until the kit is parsed; Scene3D calls again once it is.
    if (!this.built) { this.mode = mode; return }

    // The vehicle always goes back to the start line; the street is only
    // rebuilt when the scenario itself changes. Replaying the same patrol has
    // to reset the run without paying to lay the road again.
    const sameScene = this.mode === mode && this.road !== null
    this.mode = mode
    if (sameScene) {
      this.resetVehicle(parkX)
      return
    }

    for (const extra of this.extraProps) this.scene.remove(extra)
    this.extraProps = []
    for (const entry of this.props.values()) {
      this.scene.remove(entry.actor.group)
      for (const extra of Object.values(entry.extras ?? {})) this.scene.remove(extra.group)
    }
    this.props.clear()
    for (const item of this.ambient) this.scene.remove(item.walker.group)
    this.ambient = []

    // Weather and light per scenario.
    const wet = mode === 'rain'
    const foggy = mode === 'fog'
    this.rain.setActive(wet)
    const fog = this.scene.fog as THREE.Fog
    fog.color.setHex(foggy ? 0xc8d2da : wet ? 0xa9bccb : 0xcfe4f2)
    // 70 rather than 100 in clear air. With the frontages gone the verge runs
    // to the horizon, and starting the fade further out left a band of flat
    // olive with a hard edge on it where the haze began.
    fog.near = foggy ? 12 : wet ? 55 : 70
    fog.far = foggy ? 78 : wet ? 210 : 320
    // A richer blue overhead falling to a warm horizon: the pale wash it
    // replaced read as an overcast day over an already grey street.
    const skyTop = foggy ? 0x9fb0bd : wet ? 0x6f8598 : 0x3f96e8
    const skyBottom = foggy ? 0xc8d2da : wet ? 0xa9bccb : 0xd6f0ff
    ;(this.scene.background as THREE.Texture | null)?.dispose?.()
    this.scene.background = skyTexture(skyTop, skyBottom)
    this.setEnvironment(skyTop, skyBottom)
    this.sun.intensity = foggy ? 0.5 : wet ? 0.9 : 2.65
    // Fog and rain scatter light, so the glow spreads further and softer.
    this.bloom.strength = foggy ? 0.42 : wet ? 0.32 : 0.2
    this.bloom.radius = foggy ? 0.85 : 0.55
    this.hemi.intensity = foggy ? 1.2 : wet ? 1 : 0.85
    this.dusk = foggy || wet
    // Headlights only when the street is dark enough to need them — two live
    // spotlights at noon were pure cost.
    for (const beam of this.van.headlights ?? []) beam.visible = this.dusk
    this.applyLighting()

    this.resetVehicle(parkX)

    if (mode === 'depot') return

    // Ambient life: three people, far pavement only, well back from the kerb.
    //
    // Six of them walked both pavements at 11.1 m — a metre and a half outside
    // the kerb — so from the low driving camera there was usually somebody
    // crossing the foreground. Every hazard in this game is a person or animal
    // in the road, and background pedestrians that close to it make the child
    // look at the wrong thing. On the far pavement they are scenery.
    const shirts = [PAL.mint, PAL.orange, PAL.teal]
    for (let i = 0; i < 3; i += 1) {
      const walker = makePerson(shirts[i], i % 2 ? PAL.navy : 0x3c4450, 0.96 + (i % 3) * 0.05)
      const dir = i % 2 ? 1 : -1
      // Mid-pavement. The pavement narrowed from 8 m to 3.5 m, and at the old
      // offset the walkers were standing inside the railing posts.
      walker.group.position.set(14 + i * 26, 0.16, -(ROAD_HALF + 1.6 + (i % 2) * 0.7))
      walker.group.rotation.y = dir > 0 ? 0 : Math.PI
      this.scene.add(walker.group)
      this.ambient.push({ walker, speed: 1.1 + (i % 3) * 0.16, dir })
    }

    // ---- lay the street -------------------------------------------------
    // Which road PIECE each hazard needs. This is the whole road system in one
    // table: a crossing gets a zebra tile, the clinic gets the bay tile, a lane
    // closure gets the tapered works tile, everything else is plain straight.
    const waypoints = waypointsFor(mode as Scenario)

    /*
     * The chapters are one street, so the street LOOKS like one street.
     *
     * Each chapter used to build only its own hazard: chapter one was a scooter
     * on an empty road, chapter two a gate on an empty road, and the hospital
     * appeared from nowhere in chapter three. Driven back to back that read as
     * three different roads — the car passed the scooter and was suddenly
     * somewhere else. The three landmarks the mission is ABOUT now stand on the
     * road in every chapter of it. The ones this chapter does not ask about are
     * pure scenery: the car never reaches them and nothing plans around them,
     * but the child can see the whole journey, and the hospital the parcel is
     * going to is in sight from the very first stop.
     */
    const LANDMARKS: { trigger: EventToken; x: number }[] =
      MISSION_STREET.has(mode) ? [
        { trigger: 'SCOOTER' as EventToken, x: 0.17 },
        { trigger: 'NARROW' as EventToken, x: 0.41 },
        { trigger: 'ARRIVED' as EventToken, x: 0.89 },
      ] : []
    const scenery = LANDMARKS.filter((mark) => !waypoints.some((point) => point.trigger === mark.trigger))

    const features: RoadFeature[] = []
    for (const point of [...waypoints, ...scenery]) {
      const piece = PIECE_FOR[point.trigger]
      if (piece) features.push({ at: point.x * WORLD_M, piece })
    }

    if (this.road) this.scene.remove(this.road)
    if (this.frontages) this.scene.remove(this.frontages)
    const road = layRoad(WORLD_M, features)
    this.road = road.group
    // Keep the clinic's plot clear on routes that end at the bay.
    const arrived = [...waypoints, ...scenery].find((point) => point.trigger === 'ARRIVED')
    const keepClear = arrived ? { from: road.tileCentre(arrived.x * WORLD_M) - 6, to: road.tileCentre(arrived.x * WORLD_M) + 13 } : null
    this.frontages = layFrontages(WORLD_M, 2027, keepClear)
    this.scene.add(this.road, this.frontages)

    // Lamp heads come from the kit, so find them by material name. Without this
    // the fog and wet scenarios could not switch the street lighting on.
    this.lamps = []
    this.frontages.traverse((node) => {
      const mesh = node as THREE.Mesh
      const material = mesh.material as THREE.MeshStandardMaterial | undefined
      if (material?.isMeshStandardMaterial && material.name.startsWith('lampglow')) {
        // Each lamp owns its material so one can be lit without lighting all.
        const own = material.clone()
        mesh.material = own
        this.lamps.push(mesh)
      }
    })

    this.applyLighting()

    for (const point of waypoints) {
      // Hazards that own a road piece sit at that tile's centre, so the child
      // stands on the zebra and the van stops in the bay rather than near it.
      const raw = point.x * WORLD_M
      const x = PIECE_FOR[point.trigger] ? road.tileCentre(raw) : raw
      this.place(point.trigger, x)
    }
    // The landmarks this chapter does not ASK about, as scenery: built the
    // same way, then lifted straight back out of the hazard map so nothing
    // plans, reveals, measures or crashes against them.
    for (const mark of scenery) {
      const raw = mark.x * WORLD_M
      const x = PIECE_FOR[mark.trigger] ? road.tileCentre(raw) : raw
      this.place(mark.trigger, x)
      const entry = this.props.get(mark.trigger)
      if (entry) {
        for (const piece of [entry.actor, ...Object.values(entry.extras ?? {})]) this.extraProps.push(piece.group)
        this.props.delete(mark.trigger)
      }
    }

    // After everything is placed, not before: the destination building is a
    // placed prop, and being ten metres deep it swallowed the side camera
    // whole until it was registered here too.
    this.registerOccluders()

    // Shadow casting is the single most expensive thing on this screen: every
    // mesh in the street was a caster, so the whole scene was drawn a second
    // time into the shadow map each frame. The frontages are static scenery
    // standing behind the action — they still RECEIVE shadows, but nothing
    // reads their own shadow, so they no longer cast one.
    for (const item of this.frontages.children) {
      item.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (mesh.isMesh) mesh.castShadow = Boolean(item.userData.landscape)
      })
    }
  }

  /** Street lamps burn brighter when the air is bad. */
  private applyLighting() {
    for (const lamp of this.lamps) {
      (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = this.dusk ? 3.2 : 0.5
    }
  }

  private resetVehicle(parkX: number) {
    this.alerted = false
    this.exitReview()
    this.deck?.hide()
    this.shake = 0
    this.car = makeCar(parkX * M_PER_SW, LANE_NEAR)
    this.drive = { targetLane: LANE_NEAR, stopAt: null, cruise: 0 }
    this.cancelAll()
    this.van.group.position.set(this.car.x, 0, this.car.z)
    this.van.group.rotation.y = 0
    this.van.steer(0)
    this.van.setAlert(false)
    this.van.setIndicator('none')
    this.snapped = false
  }

  /** Scenery placed outside the props map; cleared on scenario change. */
  private extraProps: THREE.Object3D[] = []

  /** Follow the road surface and face actual travel, including stepping over a kerb. */
  private moveWalker(walker: Walker, x: number, z: number, speed: number) {
    const position = walker.group.position
    const dx = x - position.x
    const dz = z - position.z
    if (Math.hypot(dx, dz) > 0.0001) walker.group.rotation.y = Math.atan2(-dz, dx)
    position.set(x, 0.16 * THREE.MathUtils.smoothstep(Math.abs(z), ROAD_HALF - 0.10, ROAD_HALF + 0.40), z)
    walker.walk(speed, this.simTime)
  }

  private updateActorMotion(actor: Actor, dt: number, t: number) {
    const motion = this.actorMotion.get(actor)
    if (!motion || !actor.group.visible || this.review) return
    const walker = actor as Walker
    const position = actor.group.position
    if (motion.kind === 'waiting') {
      // Ride into the scene during the approach, then hold the teaching snapshot
      // while the crew reads. A stationary bicycle does not spin its wheels.
      if (this.alerted || this.car.speed < 0.2 || position.x - this.car.x > 38) return
      const remaining = motion.originX + 5 - position.x
      const speed = Math.min(2.8, Math.max(0, remaining) * 1.4)
      position.x += speed * dt
      walker.walk(speed, t)
      return
    }
    const direction = motion.kind === 'oncoming' ? -1 : 1
    position.x += motion.speed * dt * direction
    actor.group.rotation.y = direction > 0 ? 0 : Math.PI
    walker.walk(motion.speed, t)
    if (motion.kind === 'riding') {
      const gap = position.x - this.car.x
      if (gap > 0 && gap < 24 && Math.abs(position.z - this.car.z) < 1.8) {
        // Keep the taught following gap even after the answer animation ends.
        this.drive.cruise = Math.min(this.drive.cruise, Math.max(0, motion.speed + (gap - 9.5) * 0.7))
      }
    }
  }

  /** Put one hazard on the street, hidden until its reveal. */
  private place(trigger: EventToken, x: number) {
    const add = (actor: Actor, extras?: Record<string, Actor>) => {
      this.scene.add(actor.group)
      for (const extra of Object.values(extras ?? {})) this.scene.add(extra.group)
      // Measure how far across the road the hazard reaches — per PIECE, not as
      // one union. A single box round the roadworks swallowed the works sign
      // standing on the far pavement, so the span ran kerb to kerb and the car
      // swerved to the opposite kerb to avoid a sign it was never near.
      // Anything wholly off the carriageway is not an obstacle at all.
      const spans: { minZ: number; maxZ: number }[] = []
      for (const piece of [actor, ...Object.values(extras ?? {})]) {
        const box = new THREE.Box3().setFromObject(piece.group)
        const minZ = Math.max(box.min.z, -ROAD_HALF)
        const maxZ = Math.min(box.max.z, ROAD_HALF)
        if (minZ <= maxZ) spans.push({ minZ, maxZ })
      }
      const home = [actor, ...Object.values(extras ?? {})].map((piece) => ({
        object: piece.group,
        pos: piece.group.position.clone(),
        rot: piece.group.rotation.clone(),
      }))
      this.props.set(trigger, { actor, x, extras, spans, home })
    }

    switch (trigger) {
      case 'SCOOTER': {
        // Left half in the lane, exactly as the brief describes it.
        const scooter = makeScooter()
        scooter.group.position.set(x, 0, LANE_NEAR + 1.35)
        scooter.group.rotation.y = -0.28
        add(scooter)
        return
      }
      case 'NARROW': {
        // THE WHOLE ROAD IS CLOSED except one gap the car has to line up with.
        //
        // It used to be a three-panel fence across the kerb lane only, which
        // left 13.3 m of open road beside it — three lanes. The card said
        // "barriers leave one car width" over a picture of a car driving round
        // a fence with room to spare, and the manoeuvre it taught was the same
        // "go round it" the parked scooter had already taught.
        //
        // The arithmetic, all of it, because the one thing this must never do
        // is clip a barrier:
        //   road            z -9.2 .. +9.2
        //   far wall        5 panels, centre -4.00  ->  covers -8.60 .. +0.60
        //   THE GAP                                      +0.60 .. +4.20  (3.60 m)
        //   near wall       3 panels, centre  6.95  ->  covers +4.20 .. +9.70
        //   car half-width  0.9165, pass clearance 0.55
        //   passOffsetFor therefore solves 4.20 - 0.9165 - 0.55 = 2.7335
        //   car flanks at   1.817 .. 3.650
        //   clear of the far wall by 1.217 m, of the near wall by 0.550 m
        //
        // A panel is 1.8 m across with 1.85 m between centres, so n panels
        // cover (n-1) * 1.85 + 1.8.
        const NEAR_WALL_Z = 6.95
        const FAR_WALL_Z = -4.00
        // Sixteen metres past the stop line, not seven. The car has to cross
        // 4.17 m of road to line up with the gap and that costs about 2.6 m of
        // travel per metre shifted; at seven metres it would still be crossing
        // when it reached the panels.
        const wallX = x + 16
        const nearWall = makeBarriers(3)
        nearWall.group.position.set(wallX, 0, NEAR_WALL_Z)
        nearWall.group.rotation.y = Math.PI / 2
        const extras: Record<string, Actor> = {}
        const farWall = makeBarriers(5)
        farWall.group.position.set(wallX, 0, FAR_WALL_Z)
        farWall.group.rotation.y = Math.PI / 2
        extras.farWall = farWall
        // The 0.6 m sliver left at the far kerb, sealed so the closure reads as
        // kerb-to-kerb rather than as a wall with a hole at each end.
        const kerbCone = makeCone()
        kerbCone.group.position.set(wallX, 0.16, -(ROAD_HALF - 0.3))
        extras.kerbCone = kerbCone

        // Two cones marking the opening. They stand just INSIDE the walls'
        // own footprints, not in the gap: a cone at the gap edge is measured
        // by the pass planner like any other obstacle, and two of them took
        // 0.48 m off each side of a 3.6 m opening — enough that no line
        // through it satisfied the clearance test, so the planner gave up and
        // the car drove twelve metres and stopped in the middle of the road.
        for (const [tag, z] of [['gapNear', 4.55], ['gapFar', 0.25]] as const) {
          const cone = makeCone()
          cone.group.position.set(wallX - 1.3, 0, z)
          extras[tag] = cone
        }

        // The approach taper hugs the kerb and STOPS well short of the stop
        // mark. A cone level with where the car halts gave the tightest
        // clearance anywhere in the game (0.26 m) for a prop that is only
        // there to announce the works.
        for (let i = 0; i < 5; i += 1) {
          const cone = makeCone()
          cone.group.position.set(x - 26 + i * 3.2, 0, ROAD_HALF - 0.45)
          extras[`cone${i}`] = cone
        }
        extras.sign = makeSign('works')
        extras.sign.group.position.set(x - 28, 0.16, ROAD_HALF + 1.2)
        extras.sign.group.rotation.y = Math.PI
        add(nearWall, extras)
        return
      }
      case 'MOVING': {
        // Crossing furniture: a signal head on each kerb. Scenery with a
        // teaching job — paint alone reads as decoration, a signal says
        // "people cross here" from fifty metres.
        const child = makeChild()
        child.group.position.set(x + 1.2, 0.16, -(ROAD_HALF + 1.4))
        child.group.rotation.y = -Math.PI / 2
        const ball = makeBall()
        ball.group.position.set(x + 0.6, 0, LANE_FAR)
        ball.group.visible = false
        const signals: Record<string, Actor> = { ball }
        for (const [tag, side] of [['signalNear', 1], ['signalFar', -1]] as const) {
          const signal = makeProp('traffic_light')
          signal.group.position.set(x - 2.2, 0.16, side * (ROAD_HALF + 0.8))
          signal.group.rotation.y = side > 0 ? Math.PI : 0
          signals[tag] = signal
        }
        add(child, signals)
        return
      }
      case 'ARRIVED': {
        // The destination itself: the clinic building on the kerb, entrance
        // facing the bay. Like all near-side frontages it turns half a turn so
        // its face looks back at the road.
        const clinic = spawn('clinic')
        // Front face on the node origin, body running back from it.
        //
        // 8 m behind the kerb, not 3.4, and a fifth again as big. At 3.4 it
        // stood between the lens and the third answer card — five of the card's
        // fifteen sample points were behind it, measured by
        // `scripts/probe-card-occlusion.mjs`. Pushing it back alone would have
        // made it small and far, which is the failure the old comment here
        // warned about (at ROAD_HALF + 9.4 the destination read as paint on the
        // road), so it went back AND got bigger. It is the goal of the whole
        // mission; it has to be the biggest thing on the street.
        clinic.position.set(x + 3, 0.16, ROAD_HALF + 12)
        clinic.scale.setScalar(1.4)
        clinic.rotation.y = Math.PI
        this.scene.add(clinic)
        this.extraProps.push(clinic)

        // It has to READ as a hospital from the far end of the street: it is
        // where the parcel is going and the whole mission is named after it,
        // and the building alone said "another shop". A board on two posts,
        // white with the red cross and the word on it, says so at any distance.
        // BEHIND the bay, high and flat against the clinic's own frontage: a
        // board out on the kerb stood between the lens and the third answer
        // card (`scripts/probe-card-occlusion.mjs` is the guard for exactly
        // this), and the cards must never be blocked by scenery.
        const board = hospitalBoard()
        board.position.set(x + 3, 0, ROAD_HALF + 9.6)
        this.scene.add(board)
        this.extraProps.push(board)

        // The bay is gated: two boom gates standing open on the kerb line, so
        // arriving reads as entering somewhere rather than stopping anywhere.
        for (const gx of [x - 5.5, x + 5.5]) {
          const gate = assembleGate()
          gate.position.set(gx, 0, ROAD_HALF + 0.4)
          this.scene.add(gate)
          this.extraProps.push(gate)
        }
        const sign = makeSign('bay')
        sign.group.position.set(x, 0.16, ROAD_HALF + 1.3)
        sign.group.rotation.y = Math.PI
        const porter = makePerson(PAL.teal, PAL.navy)
        porter.group.position.set(x + 4, 0.16, ROAD_HALF + 1.6)
        porter.group.rotation.y = -Math.PI / 2
        add(sign, { porter })
        return
      }
      case 'MANY_MOVING': {
        const extras: Record<string, Actor> = {}
        const lead = makePerson(PAL.orange, PAL.navy)
        lead.group.position.set(x, 0, -3.2)
        lead.group.rotation.y = -Math.PI / 2
        for (let i = 0; i < 3; i += 1) {
          const person = makePerson([PAL.mint, PAL.red, 0x6d7cc4][i], 0x3c4450, 0.95 + i * 0.04)
          person.group.position.set(x - 1.4 + i * 1.3, 0, -4.0 - i * 0.55)
          person.group.rotation.y = -Math.PI / 2
          extras[`p${i}`] = person
        }
        add(lead, extras)
        return
      }
      case 'ROAD_WET': {
        const cyclist = makeCyclist()
        cyclist.group.position.set(x + 14, 0, LANE_FAR)
        cyclist.group.rotation.y = Math.PI
        this.actorMotion.set(cyclist, { kind: 'oncoming', originX: x + 14, speed: 3.1 })
        add(cyclist)
        return
      }
      case 'EMERGENCY_BEHIND': {
        // Parked well back in the car's OWN lane, facing the way the car is
        // facing, so when it closes it closes down the same strip of tarmac.
        const ambulance = makeAmbulance()
        ambulance.group.position.set(x - 70, 0, LANE_NEAR)
        ambulance.group.rotation.y = 0
        add(ambulance)
        return
      }
      case 'CYCLIST': {
        const cyclist = makeCyclist()
        // The bounded five-metre approach leaves an 11–16m decision gap:
        // enough safety space, while the bicycle remains easy to recognise.
        cyclist.group.position.set(x + 4, 0, LANE_NEAR - 0.5)
        this.actorMotion.set(cyclist, { kind: 'waiting', originX: x + 4, speed: 4.2 })
        add(cyclist)
        return
      }
      case 'DOG': {
        const dog = makeDog()
        dog.group.position.set(x + 2, 0.16, -(ROAD_HALF + 1))
        dog.group.rotation.y = -Math.PI / 2
        add(dog)
        return
      }
      case 'DEAD_END': {
        // A wall of works barriers right across the carriageway, with a cone
        // line in front: the street is sealed, wall to wall.
        // Panels centred on the carriageway, spanning kerb to kerb. Ten panels
        // at 1.85 m cover 16.65 m of an 18.4 m road; makeBarriers centres them
        // on the group, so the group sits on the CENTRELINE, not at a kerb.
        const wall = makeBarriers(10)
        wall.group.position.set(x + 7, 0, 0)
        wall.group.rotation.y = Math.PI / 2
        const extras: Record<string, Actor> = {}
        // Beyond the stop line, not on it: the car halts with its nose at
        // about x + 2.05 and the cones used to sit 15 cm in front of that.
        for (let i = 0; i < 5; i += 1) {
          const cone = makeCone()
          cone.group.position.set(x + 6, 0, -3.6 + i * 1.8)
          extras[`cone${i}`] = cone
        }
        extras.sign = makeSign('works')
        extras.sign.group.position.set(x - 6, 0.16, ROAD_HALF + 1.2)
        extras.sign.group.rotation.y = Math.PI
        add(wall, extras)
        return
      }
      case 'ROAD_BLOCKED': {
        // "Someone in the lane, back to the van" — so it IS someone. A barrier
        // wall across the lane forced a lane change the scene had no room for
        // and drove the car through its own cones. A person hears the horn and
        // steps aside: no manoeuvre, no collision, and it matches the card.
        const person = makePerson(PAL.red, 0x3c4450)
        person.group.position.set(x, 0, LANE_NEAR - 0.2)
        person.group.rotation.y = Math.PI
        add(person)
        return
      }
      case 'FOG': {
        // In fog the hazard is what you cannot see: a stopped van ahead.
        const stalled = makeScooter()
        stalled.group.position.set(x + 3, 0, LANE_NEAR + 0.9)
        stalled.group.rotation.y = 0.2
        const cone = makeCone()
        cone.group.position.set(x - 1, 0, LANE_NEAR + 1.35)
        add(stalled, { cone })
        return
      }
    }
  }

  // ----------------------------------------------------------------- tweens --

  private tween(duration: number, apply: (v: number) => void, ease = easeInOut) {
    return new Promise<void>((resolve, reject) => {
      if (this.disposed) { resolve(); return }
      const entry: Tween = { elapsed: 0, duration, ease, apply, resolve, reject, done: false }
      this.tweens.push(entry)
      // Safety net: a stalled render loop must not hang this promise for ever.
      // But a HIDDEN tab has no frames by design — the sim is paused, not
      // stuck — so the net re-arms while the tab is hidden instead of jumping
      // the animation to its end behind the child's back.
      const arm = () => {
        window.setTimeout(() => {
          if (entry.done) return
          if (document.hidden && !this.disposed) { arm(); return }
          entry.done = true
          apply(1)
          resolve()
        }, duration * 1000 + 600)
      }
      arm()
    })
  }

  private wait(ms: number) {
    return new Promise<void>((resolve, reject) => {
      if (this.disposed) { resolve(); return }
      const id = window.setTimeout(() => {
        this.timers = this.timers.filter((entry) => entry.id !== id)
        resolve()
      }, ms)
      this.timers.push({ id, reject })
    })
  }

  // --------------------------------------------------------------- commands --

  /**
   * Wait for a condition the driving loop will eventually satisfy.
   *
   * Motion is no longer a tween with a known duration — the vehicle drives, and
   * the command layer waits for it to arrive. The timeout is the same safety
   * net the tweens had: if the tab is backgrounded the loop stops, and nothing
   * should hang for ever on that.
   */
  private until(done: () => boolean, timeoutSeconds = 12) {
    return new Promise<void>((resolve, reject) => {
      if (this.disposed || done()) { resolve(); return }
      // Two safety nets, because they fail differently.
      //
      // `expires` is on SIM time, so a condition the driving model will never
      // satisfy gives up after the right number of simulated seconds. But sim
      // time only advances while the render loop runs, and a backgrounded tab
      // throttles requestAnimationFrame to a crawl — so a child who switches tab
      // mid-manoeuvre came back to an activity that had stopped and would never
      // start again. The wall-clock timer is the second net: generous, so it
      // never fires first in normal running, and absolute, so nothing can hang.
      const entry = { done, resolve, reject, expires: this.simTime + timeoutSeconds }
      this.waits.push(entry)
      const arm = () => {
        const id = window.setTimeout(() => {
          this.timers = this.timers.filter((t) => t.id !== id)
          if (!this.waits.includes(entry)) return
          // A hidden tab has no frames: the sim is PAUSED, not stuck. Resolving
          // here ran the phase machine ahead of a car that had not moved, so
          // the child came back to a question about a hazard still down the
          // road. Wait for the tab instead.
          if (document.hidden && !this.disposed) { arm(); return }
          this.waits = this.waits.filter((w) => w !== entry)
          resolve()
        }, timeoutSeconds * 1000 + 4000)
        this.timers.push({ id, reject })
      }
      arm()
    })
  }

  /**
   * Call off everything in flight.
   *
   * Every pending wait, timer and tween is rejected with `CANCELLED`, which
   * unwinds whatever manoeuvre was mid-chain at its next await. Called when the
   * street is put back for another go, and when the scenario changes.
   */
  private cancelAll() {
    const waits = this.waits
    const timers = this.timers
    const tweens = this.tweens
    this.waits = []
    this.timers = []
    this.tweens = []
    for (const wait of waits) wait.reject(CANCELLED)
    for (const timer of timers) { window.clearTimeout(timer.id); timer.reject(CANCELLED) }
    for (const tween of tweens) {
      if (tween.done) continue
      tween.done = true
      tween.reject(CANCELLED)
    }
  }

  /**
   * Drive to a point given in screen widths, and stop there.
   *
   * This is the COMMAND-level drive — "go to the next hazard" — and it always
   * asserts the vehicle's own lane. Without that, a manoeuvre's lane leaked
   * into the following leg: after passing the scooter the car drove the whole
   * way to the roadworks still sitting in the oncoming lane, and parked itself
   * on the cone line. Acts that deliberately hold a different lane use
   * `driveFor`, which leaves the lane alone.
   */
  async driveTo(toSW: number, speedFactor = 1) {
    try {
      await this.runDriveTo(toSW, speedFactor)
    } catch (error) {
      if (error !== CANCELLED) throw error
    }
  }

  private async runDriveTo(toSW: number, speedFactor = 1) {
    const to = clamp(toSW * M_PER_SW, 0, WORLD_M)
    if (to - this.car.x < 0.1) {
      // The mark is already behind. It must NOT return with the car rolling:
      // an act that finishes at pass speed leaves `cruise` set, and this used to
      // hand straight back with the car doing eleven metres a second and no
      // stopping mark, so it drove the whole street and off the end of the
      // world. Traced on level 4: the closed-road act ended at x 88, the next
      // mark was at 61, and the car was found at 166 with the crossing it was
      // supposed to stop at a hundred metres behind it.
      this.drive.stopAt = this.car.x
      this.drive.cruise = 0
      this.marksBehind += 1
      this.marksBehindLog.push({ to: Math.round(to * 10) / 10, at: Math.round(this.car.x * 10) / 10 })
      await this.until(() => this.car.speed < 0.06, 3)
      return
    }
    this.drive.targetLane = LANE_NEAR
    this.drive.stopAt = to
    this.drive.cruise = this.cruiseSpeed * speedFactor
    const distance = to - this.car.x
    await this.until(() => stoppedAt(this.car, to), clamp(distance / 2.2, 3, 20))
    this.drive.cruise = 0
  }

  /** Drive on for a distance, HOLDING the current lane (used inside acts). */
  private async driveFor(metres: number, speedFactor = 1) {
    const to = clamp(this.car.x + metres, 0, WORLD_M)
    if (to - this.car.x < 0.1) return
    this.drive.stopAt = to
    this.drive.cruise = this.cruiseSpeed * speedFactor
    await this.until(() => stoppedAt(this.car, to), clamp(metres / 2.2, 3, 20))
    this.drive.cruise = 0
  }

  /**
   * Change lane the way a car does: keep rolling, steer across, straighten up.
   *
   * There is no duration argument any more. How long it takes is decided by how
   * fast the vehicle is going and how hard it is allowed to steer — which is
   * the whole reason it stops looking like the body is being slid across.
   */
  private async changeLane(toZ: number, speedFactor = 0.62, budget = 9) {
    this.drive.targetLane = toZ
    // A lane change cannot happen at a standstill, so make sure it is rolling —
    // but it gets a DISTANCE budget, not just a clock. With only a 9 s timeout,
    // a slow-converging change kept driving at 5.6 m/s and covered fifty
    // metres in the oncoming lane, straight through the next hazard's cones.
    this.drive.stopAt = clamp(this.car.x + budget, 0, WORLD_M)
    this.drive.cruise = this.cruiseSpeed * speedFactor
    await this.until(() => settledInLane(this.car, toZ) || stoppedAt(this.car, this.drive.stopAt ?? 0), 9)
    this.drive.stopAt = null
  }

  /**
   * Drive the car onto a lane while travelling BACKWARDS along the road.
   *
   * Pure pursuit aims at a point ahead on +X, which is behind a car whose
   * heading is pi — so it cannot be used after a U-turn. This is the same idea
   * with the sign flipped: a proportional correction on lateral error, held
   * until the car is on the lane and pointing straight down -X.
   */
  private async settleReverseLane(lane: number) {
    await this.until(() => {
      const error = lane - this.car.z
      const facing = this.car.heading - Math.PI
      // Steer toward the lane, damped by how far the nose has already come
      // round, so it eases on rather than weaving across.
      const want = clamp(error * 0.16 - facing * 0.9, -0.5, 0.5)
      this.drive.manual = want
      return Math.abs(error) < 0.22 && Math.abs(facing) < 0.05
    }, 10)
    this.drive.manual = 0
  }

  /**
   * Finish a manoeuvre square in the driving lane.
   *
   * A pass that runs out of road ends mid-change, leaving the car parked
   * straddling the centre line. Roll on gently until it is genuinely on the
   * lane; if there is no road left to do it in, ease the last few centimetres
   * across so the vehicle never comes to rest across two lanes.
   */
  private async settleLane(lane: number) {
    // A quarter of a metre off the lane and three degrees of yaw is invisible,
    // and the next leg's pure pursuit centres it inside a car's length anyway.
    // At 0.12/0.04 this almost never took the early exit, so the end of every
    // pass ran on at pass speed for as far as its budget allowed — which is how
    // the closed-road act came to finish past the NEXT hazard's stop mark.
    if (Math.abs(this.car.z - lane) < 0.25 && Math.abs(this.car.heading) < 0.06) return
    this.drive.manual = null
    this.drive.targetLane = lane
    // Squared up ON THE MOVE: no mark, no braking, so this reads as the end of
    // the manoeuvre rather than as another stop.
    // Bounded by DISTANCE, not just by a clock. With only a five-second
    // timeout this squared the car up at pass speed for five seconds — forty
    // metres of road — which is how the closed-road act came to finish twenty
    // metres past the next hazard's stop mark.
    this.drive.stopAt = clamp(this.car.x + 6, 0, WORLD_M)
    this.drive.agility = SWERVE_AGILITY
    this.drive.cruise = this.cruiseSpeed * PASS_SPEED
    await this.until(
      () => settledInLane(this.car, lane) || stoppedAt(this.car, this.drive.stopAt ?? 0),
      5,
    )
    this.drive.stopAt = null
    this.drive.agility = 1
    // Only when the car has genuinely run out of road and stopped short of its
    // lane is the remainder eased across, rather than left parked over a line.
    const stranded = this.car.speed < 0.05
      && (Math.abs(this.car.z - lane) > 0.12 || Math.abs(this.car.heading) > 0.04)
    if (stranded) {
      const fromZ = this.car.z
      const fromH = this.car.heading
      const started = performance.now()
      await this.until(() => {
        const t = Math.min(1, (performance.now() - started) / 620)
        const ease = t * t * (3 - 2 * t)
        this.car.z = fromZ + (lane - fromZ) * ease
        this.car.heading = fromH * (1 - ease)
        return t >= 1
      }, 2)
      this.car.z = lane
      this.car.heading = 0
    }
  }

  /**
   * Where to sit while passing a hazard — or null to hold the lane.
   *
   * Returns a z far enough over to clear the obstacle and no further, kept
   * inside the vehicle's own lane wherever that is possible. A hazard that
   * does not reach into the lane at all returns null: the roadworks close the
   * far half of the carriageway, so there is nothing to steer around and the
   * car should simply drive past them.
   */
  private passOffsetFor(trigger: EventToken): number | null {
    const entry = this.props.get(trigger)
    if (!entry?.spans?.length) return null

    // The band the vehicle occupies, plus the room a driver would want.
    const lo = LANE_NEAR - CAR_HALF_Z - PASS_CLEARANCE
    const hi = LANE_NEAR + CAR_HALF_Z + PASS_CLEARANCE
    const blocking = entry.spans.filter((span) => span.maxZ >= lo && span.minZ <= hi)
    if (!blocking.length) return null // nothing of it is in our lane

    // Two candidate lines: inside all the blockage (toward the centre) or
    // outside it (toward the kerb). A candidate is only FEASIBLE if the car
    // actually fits there, clear of every blocking piece and inside its own
    // side of the road. The old heuristic — averaging the pieces' centres to
    // pick a side — aimed the car at the kerb when a fence and its cone taper
    // straddled the lane centre, and it drove straight into the fence.
    const kerbLimit = ROAD_HALF - CAR_HALF_Z - 0.15
    // Against EVERY piece, not just the ones in the car's current lane. With
    // the roadworks now closing the whole carriageway there is a wall on the
    // far side too, and it is not "blocking" by the lane test — it is nowhere
    // near the kerb lane — but the car is about to drive straight at it.
    //
    // The tolerance is not decoration: `inner` is DEFINED as minZ minus the
    // same two terms this test adds back, so the near-side comparison is an
    // exact floating-point equality. One bit the wrong way and the pass is
    // silently abandoned and the car drives into the panels at cruise speed.
    const EPS = 1e-6
    const allSpans = entry.spans ?? []
    const clearOfAll = (z: number) => allSpans.every(
      (span) => z + CAR_HALF_Z + PASS_CLEARANCE <= span.minZ + EPS
        || z - CAR_HALF_Z - PASS_CLEARANCE >= span.maxZ - EPS,
    )
    const candidates: number[] = []
    const inner = Math.min(...blocking.map((piece) => piece.minZ)) - CAR_HALF_Z - PASS_CLEARANCE
    const outer = Math.max(...blocking.map((piece) => piece.maxZ)) + CAR_HALF_Z + PASS_CLEARANCE
    for (let z of [inner, outer]) {
      // A pass has to be seen to happen: a four-centimetre shift reads as a
      // wobble, not as the car going round something.
      if (Math.abs(z - LANE_NEAR) < MIN_SWERVE) {
        z = LANE_NEAR + Math.sign(z - LANE_NEAR || -1) * MIN_SWERVE
      }
      if (z >= IN_LANE_LIMIT && z <= kerbLimit && clearOfAll(z)) candidates.push(z)
    }
    if (!candidates.length) return null // sealed: this is a stop, not a pass
    // The least deviation that genuinely clears everything.
    candidates.sort((a, b) => Math.abs(a - LANE_NEAR) - Math.abs(b - LANE_NEAR))
    return candidates[0]
  }

  /**
   * Move sideways to a mark, briskly.
   *
   * A lane change is meant to look unhurried; a swerve is not. This runs at
   * high agility so the wheels turn quickly and the arc is tight, and it is
   * bounded in distance so it cannot wander down the street.
   */
  private async swerve(toZ: number, speed = PASS_SPEED) {
    const shift = Math.abs(toZ - this.car.z)
    this.drive.targetLane = toZ
    this.drive.agility = SWERVE_AGILITY
    // NO stopping mark. A swerve is bounded by where the car is ACROSS the
    // road, not by a point along it, and setting a mark made the car brake
    // onto it — three marks in one overtake read as three little stops.
    this.drive.stopAt = null
    this.drive.cruise = this.cruiseSpeed * speed
    // The timeout is sized from the move, not fixed at four seconds. Under the
    // bicycle model a lateral metre costs about 2.6 m of road, and the road is
    // covered at the pass speed — so a 4.2 m shift taken slowly needs about
    // eight seconds and used to be cut off at four, leaving the car still
    // crossing when it drew level with what it was avoiding.
    const budget = clamp((2.6 * shift) / Math.max(0.6, this.cruiseSpeed * speed) + 1.4, 2, 14)
    await this.until(() => Math.abs(this.car.z - toZ) < 0.16, budget)
    this.drive.agility = 1
  }

  /** Roll on until the hazard is fully behind the rear bumper. */
  private async clearOf(trigger: EventToken) {
    const entry = this.props.get(trigger)
    // Held at the pass speed with no mark, so the car rolls past the obstacle
    // in one movement instead of easing down onto a point beyond it.
    this.drive.stopAt = null
    this.drive.cruise = this.cruiseSpeed * PASS_SPEED
    this.drive.agility = SWERVE_AGILITY
    // Measured from where the obstacle IS, not where it was placed: a cyclist
    // rides on while being overtaken, and turning back at the placement mark
    // put the car alongside them again mid-return.
    const position = new THREE.Vector3()
    const aheadOf = () => {
      const actor = entry?.actor
      if (!actor) return this.car.x + CAR_HALF_X + 0.6
      actor.group.getWorldPosition(position)
      return position.x + CAR_HALF_X + 1.2
    }
    await this.until(() => this.car.x >= aheadOf(), 8)
  }

  /** Come to a halt where the vehicle stands. */
  private async halt(strength = 1) {
    this.drive.stopAt = null
    this.drive.cruise = 0
    this.van.setBraking(true)
    await this.until(() => this.car.speed < 0.05, 4)
    await this.wait(160 * strength)
    this.van.setBraking(false)
  }

  private async brake(strength: number) {
    await this.halt(strength)
  }

  /** Bring a hazard to life so the crew can see what the vehicle is facing. */
  async reveal(trigger: EventToken) {
    try {
      await this.runReveal(trigger)
    } catch (error) {
      if (error !== CANCELLED) throw error
    }
  }

  private async runReveal(trigger: EventToken) {
    // The camera does not move for this. The hazard is already in shot: the car
    // stops seven metres short of it and the rear rig looks straight down the
    // road over the car's own roof, so what the child sees is what the car sees.
    this.alerted = true
    const entry = this.props.get(trigger)
    this.van.setBraking(true)
    if (!entry) { await this.wait(400); this.van.setBraking(false); return }

    if (trigger === 'MOVING') {
      // The ball rolls out first, then the child chases it: the classic case
      // where a rule about "something moving" has to already exist.
      const ball = entry.extras?.ball
      this.hooks.onSound?.('warn')
      if (ball) {
        ball.group.visible = true
        const fromZ = -(ROAD_HALF - 0.5)
        await this.tween(0.7, (v) => {
          ball.group.position.z = fromZ + (LANE_NEAR + 1.2 - fromZ) * easeOut(v)
        })
      }
      this.hooks.onSound?.('gasp')
      const child = entry.actor as Walker
      const fromZ = child.group.position.z
      await this.tween(Math.abs(LANE_FAR - fromZ) / 3.6, (v) => {
        this.moveWalker(child, child.group.position.x, fromZ + (LANE_FAR - fromZ) * v, 3.6)
      }, (v) => v)
      this.van.setBraking(false)
      return
    }

    if (trigger === 'EMERGENCY_BEHIND') {
      // Watched from the car's own tail, looking back. Every other hazard is
      // in front, so the two-shot works for them; this one is behind, and the
      // two-shot's answer to a 39 m gap was to stand in FRONT of the ambulance
      // and watch it drive away. A child saw a white shape flick past the lens
      // and shrink. Growing toward you is the entire grammar of "it is coming".
      this.hooks.onSound?.('sirenLoop')
      const ambulance = entry.actor
      const fromX = ambulance.group.position.x
      // Closes to two car lengths and then SITS there, filling the mirror.
      // Sixteen metres away and stationary reads as a vehicle that stopped of
      // its own accord and is waiting politely.
      const to = this.car.x - 10.0
      await this.tween(2.6, (v) => {
        ambulance.group.position.x = fromX + (to - fromX) * easeOut(v)
      }, (x) => x)
      this.van.setBraking(false)
      return
    }

    if (trigger === 'DOG') {
      this.hooks.onSound?.('warn')
      const dog = entry.actor as Walker
      const fromZ = dog.group.position.z
      const toZ = LANE_NEAR - 0.4
      await this.tween(Math.abs(toZ - fromZ) / 3.6, (v) => {
        this.moveWalker(dog, dog.group.position.x, fromZ + (toZ - fromZ) * v, 3.6)
      }, (v) => v)
      this.van.setBraking(false)
      return
    }

    if (trigger === 'MANY_MOVING') {
      this.hooks.onSound?.('warn')
      const all = [entry.actor as Walker, ...Object.values(entry.extras ?? {}) as Walker[]]
      const starts = all.map((person) => person.group.position.z)
      const targets = all.map((_, index) => LANE_NEAR - 2.5 + index * 0.35)
      const duration = Math.max(...targets.map((target, index) => Math.abs(target - starts[index]))) / 2.1
      await this.tween(duration, (v) => {
        for (const [index, person] of all.entries()) {
          this.moveWalker(person, person.group.position.x, starts[index] + (targets[index] - starts[index]) * v, 2.1)
        }
      }, (v) => v)
      this.van.setBraking(false)
      return
    }

    this.hooks.onSound?.('warn')
    await this.wait(520)
    this.van.setBraking(false)
  }

  /** No usable rule: hold position, amber ring, and wait for the crew. */
  async block(trigger: EventToken) {
    try {
      await this.runBlock(trigger)
    } catch (error) {
      if (error !== CANCELLED) throw error
    }
  }

  private async runBlock(_trigger: EventToken) {
    // The rear rig is already looking at it. The one exception is the hazard
    // that is BEHIND the car, and even that is only a change of rig, not a
    // move: the same lens, turned round.
    this.alerted = true
    this.van.setAlert(true)
    this.hooks.onSound?.('halt')
    await this.brake(0.9)
    this.hooks.onSound?.('deny')
    await this.wait(280)
  }

  // ------------------------------------------------ wrong answers, DRIVEN --

  /** The measured world box of a hazard's own actor, for aiming at it. */
  private hazardBox(trigger: EventToken): THREE.Box3 | null {
    const entry = this.props.get(trigger)
    if (!entry) return null
    const box = new THREE.Box3().setFromObject(entry.actor.group)
    return Number.isFinite(box.min.x) ? box : null
  }

  /**
   * Knock a prop over, so a crash leaves a mark on the street.
   *
   * Which way it falls is measured, not assumed. A scooter lies along the road
   * and has to tip sideways; a barrier wall lies across it and has to fall flat
   * down the road. Getting that backwards makes the panel spin on the spot.
   */
  private async topple(trigger: EventToken) {
    const entry = this.props.get(trigger)
    const box = this.hazardBox(trigger)
    if (!entry || !box) return
    const group = entry.actor.group
    const acrossRoad = (box.max.z - box.min.z) > (box.max.x - box.min.x)
    const axis = acrossRoad
      ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(1, 0, 0)
    // A right angle, so it ends flat on its side rather than leaning. And it
    // barely drops: 22 cm sank a scooter into the tarmac and it read as a
    // squashed lump instead of a fallen one.
    const total = acrossRoad ? Math.PI / 2 : Math.PI / 2
    const fromY = group.position.y
    let done = 0
    await this.tween(0.6, (v) => {
      const want = total * easeOut(v)
      group.rotateOnWorldAxis(axis, want - done)
      done = want
      group.position.y = fromY - 0.05 * Math.min(1, v * 1.6)
    }, (x) => x)
  }

  /**
   * Contact.
   *
   * Stops the car dead, shakes the lens, and hands the camera to the pointer at
   * the point of impact. `severity` scales the shake, because a barrier wall at
   * speed is not a dog at walking pace.
   */
  private async impact(point: THREE.Vector3, severity = 1, radius = 8.5) {
    this.drive.cruise = 0
    this.drive.stopAt = this.car.x
    this.drive.manual = null
    this.car.speed *= 0.1
    this.shake = 0.5 * severity
    this.van.setBraking(true)
    this.van.setAlert(true)
    this.hooks.onSound?.('thud')
    await this.until(() => this.car.speed < 0.06, 2)
    await this.wait(340)
    this.enterReview(point, radius)
  }

  /** Where the nose has to be for the car to be `gap` metres from the hazard. */
  private noseAt(trigger: EventToken, gap: number): number {
    const box = this.hazardBox(trigger)
    if (!box) return this.car.x + 8
    return box.min.x - CAR_HALF_X - gap
  }

  /**
   * The lane that puts the car's body over the hazard, for the crash paths.
   *
   * The hazard's NEAR EDGE, not its centre. Aiming at the centre of a scooter
   * parked half on the kerb drove the car half onto the pavement to reach it,
   * which read as the car leaving the road rather than as the car clipping
   * something in its lane. The edge is enough for contact, and the result is
   * clamped so the body always finishes on the carriageway.
   */
  private lineOf(trigger: EventToken): number {
    const box = this.hazardBox(trigger)
    if (!box) return LANE_NEAR
    const edge = Math.abs(box.min.z - LANE_NEAR) <= Math.abs(box.max.z - LANE_NEAR)
      ? box.min.z
      : box.max.z
    const limit = ROAD_HALF - CAR_HALF_Z - 0.15
    return clamp(edge, -limit, limit)
  }

  /**
   * What the car ends up hitting.
   *
   * Three endings cover every hazard in the game, and between them they need no
   * geometry that is not already on the street:
   *
   *   prop   the obstacle itself is a thing — a scooter, a barrier wall — so
   *          the car drives into it and knocks it over
   *   kerb   the obstacle is a PERSON or an animal. The car swerves at the last
   *          moment, mounts the kerb and hits that instead. A nine-year-old
   *          never watches a car drive into a child, and the lesson is not
   *          softened: the car still crashes, and it still crashed because the
   *          rule was wrong
   *   shunt  the ambulance beat. The car is not the one that hits something —
   *          the thing behind it runs into the back of it
   */
  private crashKind(trigger: EventToken): 'prop' | 'kerb' | 'shunt' {
    if (trigger === 'EMERGENCY_BEHIND') return 'shunt'
    if (trigger === 'SCOOTER' || trigger === 'NARROW' || trigger === 'FOG' || trigger === 'DEAD_END') return 'prop'
    return 'kerb'
  }

  /**
   * The lead-in: the car doing exactly what the card said, briefly.
   *
   * Every wrong answer ends in the same crash, so this is the part that has to
   * differ — it is how a child sees that THEIR answer is what did it, rather
   * than watching the same accident three times. Read off the action tokens, so
   * a card that says "sound the horn" sounds the horn.
   */
  private async leadIn(actions: string[]) {
    const has = (token: string) => actions.includes(token)
    this.drive.stopAt = null
    this.drive.targetLane = LANE_NEAR

    if (has('FULLSTOP') || has('WAIT_CLEAR')) {
      // It stops, and holds, and nothing changes — which IS the lesson for
      // these two cards. Then its broken rulebook runs out of ideas and it
      // creeps on anyway, which is what puts it into the crash.
      this.hooks.onSound?.('halt')
      await this.brake(1)
      await this.wait(1500)
      this.hooks.onSound?.('warn')
      this.drive.cruise = this.cruiseSpeed * 0.45
      return
    }
    if (has('HONK')) {
      this.hooks.onSound?.('horn')
      await this.wait(700)
      this.drive.cruise = this.cruiseSpeed * 0.6
      return
    }
    if (has('SPEEDUP') || has('RACE_AHEAD')) {
      this.hooks.onSound?.('warn')
      this.drive.cruise = this.cruiseSpeed
      return
    }
    if (has('SLOW') || has('SLOW_EARLY') || has('LEAVE_SPACE')) {
      this.hooks.onSound?.('ease')
      this.drive.cruise = this.cruiseSpeed * 0.6
      return
    }
    if (has('TURN')) {
      // It starts the U-turn — indicator, full lock, swings out across the
      // road — and never finishes it.
      this.hooks.onSound?.('signal')
      this.van.setIndicator('left')
      this.drive.cruise = this.cruiseSpeed * 0.5
      this.drive.manual = 0.9
      await this.wait(900)
      this.van.setIndicator('none')
      return
    }
    if (has('NORMAL_SPEED')) {
      this.drive.cruise = this.cruiseSpeed * 0.9
      return
    }
    // DELIVER, MOVE_ASIDE, STOP_SAFE and anything unrecognised: just roll on.
    this.hooks.onSound?.('ease')
    this.drive.cruise = this.cruiseSpeed * 0.7
    return
  }

  /**
   * Carry out a choice that does NOT work, all the way to the crash.
   *
   * The `Outcome` on the card does not reach here: every wrong answer ends the
   * same way, and which manoeuvre led there is read off the ACTION TOKENS, which
   * is the same thing the correct path reads. `Outcome` now only chooses the
   * verdict copy the child is shown afterwards.
   *
   * This is the half of the game that did not exist. Every card used to be
   * refused unless it was right, so a wrong answer cost a child nothing and
   * taught them nothing: they read a sentence and picked again. Now the car does
   * exactly what it was told, out in the street, it crashes, and the camera is
   * handed to them so they can walk round the result.
   *
   * EVERY wrong answer crashes. There is no "it just sat there" ending any more:
   * a consequence a child cannot see is not a consequence.
   */
  private async performOutcome(trigger: EventToken, actions: string[]) {
    const entry = this.props.get(trigger)
    const kind = this.crashKind(trigger)
    if (kind === 'shunt') { await this.shunt(entry?.actor); return }

    await this.leadIn(actions)

    if (kind === 'prop') {
      // Straight at it. The line comes from the obstacle's own measured box, so
      // the car ends up over it whatever it is.
      this.drive.manual = null
      this.drive.targetLane = this.lineOf(trigger)
      this.drive.stopAt = null
      if (this.drive.cruise < 4) this.drive.cruise = this.cruiseSpeed * 0.7
      const at = new THREE.Vector3()
      entry?.actor.group.getWorldPosition(at)
      const hit = this.noseAt(trigger, -0.2)
      await this.until(() => this.car.x >= hit, 9)
      // Orbit the PAIR, not the obstacle. Centred on a scooter the car sat
      // half out of frame six metres behind it; centred between them both are
      // in shot, which is the whole point of the replay.
      const between = new THREE.Vector3(
        (this.car.x + at.x) / 2, 1.0, (this.car.z + at.z) / 2,
      )
      await Promise.all([
        this.impact(between, 1.15, 8),
        this.topple(trigger),
      ])
      return
    }

    // ---- the kerb ---------------------------------------------------------
    // A late, hard swerve away from whatever is in the lane, straight onto the
    // kerb. Two and a half metres of lateral move, so it costs about five
    // metres of road: the crash happens where the child is looking.
    if (this.drive.cruise < 4) this.drive.cruise = this.cruiseSpeed * 0.6
    const swerveAt = this.noseAt(trigger, 4.5)
    if (swerveAt > this.car.x) await this.until(() => this.car.x >= swerveAt, 7)
    this.hooks.onSound?.('gasp')
    this.van.setAlert(true)
    this.van.setBraking(true)
    this.drive.manual = -0.42
    await this.until(() => this.car.z >= ROAD_HALF - 0.35, 4)
    await this.impact(new THREE.Vector3(this.car.x + 1.2, 1.0, ROAD_HALF + 0.6), 1, 8)
  }

  /**
   * Hit from behind.
   *
   * The one hazard the car cannot crash into, because it is the one behind it.
   * The ambulance closes at speed, runs into the back of it, and shoves it
   * forward — which is exactly the consequence of not getting out of the way.
   */
  private async shunt(ambulance?: Actor) {
    this.hooks.onSound?.('sirenLoop')
    await this.brake(1)
    if (ambulance) {
      const fromX = ambulance.group.position.x
      const to = this.car.x - 4.9
      await this.tween(1.1, (v) => {
        ambulance.group.position.x = fromX + (to - fromX) * v
      }, (x) => x)
    }
    this.hooks.onSound?.('sirenStop')
    // Shoved forward by the blow, not driven forward.
    this.hooks.onSound?.('thud')
    this.shake = 0.6
    this.van.setAlert(true)
    const fromX = this.car.x
    await this.tween(0.7, (v) => {
      this.car.x = fromX + 1.6 * easeOut(v)
      this.van.group.position.x = this.car.x
    }, (x) => x)
    await this.wait(420)
    this.enterReview(new THREE.Vector3(this.car.x - 3.2, 1.5, this.car.z), 11)
  }

  /**
   * Put the street back for another go.
   *
   * Every prop returns to the pose it was placed in and the car returns to its
   * stop mark, straight and stationary. Without this the second attempt starts
   * from a scooter already lying on its side, ten metres behind the car.
   */
  /**
   * Ease to a stop right here. A pass act deliberately finishes with `cruise`
   * still set so a chained drive flows on — but the star popup now holds the
   * screen between stops, and a car accelerating away under a popup reads as
   * the game driving itself. A short stopping mark keeps the brake natural
   * instead of a freeze-frame.
   */
  hold() {
    this.drive.cruise = 0
    const brake = clamp(this.car.speed * 0.55, 1, 5)
    if (this.drive.stopAt === null || this.drive.stopAt > this.car.x + brake) {
      this.drive.stopAt = this.car.x + brake
    }
  }

  rewind(toSW: number) {
    this.exitReview()
    // The deck is NOT touched here. Its visibility belongs to the `choices`
    // prop, and React shows it in the same commit that sends this command — a
    // hide here landed after that show and left the street empty on the second
    // attempt, with nothing to click and no way forward.
    this.shake = 0
    for (const entry of this.props.values()) {
      for (const piece of entry.home ?? []) {
        piece.object.position.copy(piece.pos)
        piece.object.rotation.copy(piece.rot)
      }
    }
    this.alerted = false
    this.car = makeCar(clamp(toSW * M_PER_SW, 0, WORLD_M), LANE_NEAR)
    this.drive = { targetLane: LANE_NEAR, stopAt: null, cruise: 0 }
    this.cancelAll()
    this.van.group.position.set(this.car.x, 0, this.car.z)
    this.van.group.rotation.y = 0
    this.van.steer(0)
    this.van.setAlert(false)
    this.van.setBraking(false)
    this.van.setIndicator('none')
  }

  /**
   * Carry out what the fired rule said to do.
   *
   * Cancellation is caught HERE rather than at every await inside: a manoeuvre
   * called off by a retry should end quietly, not surface as an unhandled
   * rejection in the console and a scene command that never acknowledges.
   */
  async act(trigger: EventToken, actions: string[], outcome: Outcome = 'pass') {
    try {
      await this.runAct(trigger, actions, outcome)
    } catch (error) {
      if (error !== CANCELLED) throw error
    }
  }

  private async runAct(trigger: EventToken, actions: string[], outcome: Outcome) {
    this.van.setAlert(false)
    if (outcome !== 'pass') {
      this.deck?.hide()
      await this.performOutcome(trigger, actions)
      return
    }
    // No camera move. The manoeuvre is carried out in the shot the child was
    // already watching, which is the whole point of a fixed rear rig: they see
    // the rule change what the car does, from the seat they have been in all
    // along.
    this.alerted = false
    await this.performAct(trigger, actions)
    // A manoeuvre that ends mid-lane-change leaves the vehicle rolling with no
    // stopping mark, so it would drive off into the distance. Whatever happened,
    // finish at rest — the next leg then starts from a known standstill.
    // No coasting stop here. This used to roll four metres and brake, then
    // settle the lane by braking AGAIN, so every hazard ended in two little
    // stops before the next leg had even been issued. The lane is squared up
    // while still rolling and the next drive command takes it from there.
    if (trigger !== 'DEAD_END') await this.settleLane(LANE_NEAR)
    this.van.setIndicator('none')
  }

  private async performAct(trigger: EventToken, actions: string[]) {
    const entry = this.props.get(trigger)

    switch (trigger) {
      case 'SCOOTER':
      case 'NARROW':
      case 'FOG': {
        // Round it, not into the other lane. How far over is measured from
        // the obstacle itself, and if it is not in this lane at all the car
        // holds its line and drives past.
        this.hooks.onSound?.('ease')
        if (trigger === 'FOG') this.hooks.onSound?.('horn')
        const offset = this.passOffsetFor(trigger)
        if (offset === null) {
          await this.driveFor(12, trigger === 'FOG' ? 0.55 : 0.8)
          return
        }
        const outward = offset < LANE_NEAR ? 'left' : 'right'
        const homeward = offset < LANE_NEAR ? 'right' : 'left'
        this.van.setIndicator(outward)
        // The move OUT is taken slowly, so the car is already across before it
        // draws level with the obstacle. Taken at pass speed it was still
        // sliding sideways while alongside, which measured as centimetres of
        // clearance even though it ended up a comfortable metre clear.
        // Paced by how far it has to go: one speed is right for a scooter and
        // wrong for a lane closure. Crossing three metres needs a far slower
        // approach than easing 80 cm aside.
        const shift = Math.abs(offset - LANE_NEAR)
        await this.swerve(offset, clamp(0.42 / Math.max(1, shift), 0.20, 0.42))
        this.van.setIndicator('none')
        // Square up BEFORE threading, not while threading.
        //
        // `swerve` finishes on lateral position alone — |z - target| < 0.16 —
        // and a car that has just arrived on a line is still turning onto it.
        // The planner leaves PASS_CLEARANCE (0.55 m) either side of the car's
        // FLANKS, but a car yawed 7.6 degrees sweeps a band 0.27 m wider than
        // its flanks, which measured as 0.32 m of clearance to a barrier
        // instead of 0.59 m. `settledInLane` wants position, heading AND steer
        // angle, which is the actual definition of "on the line".
        await this.until(() => settledInLane(this.car, offset), 3.5)
        await this.clearOf(trigger)
        // Straight back the moment it is behind: no dwell in the offset line —
        // and taken SLOWLY, at the same pace as the move out.
        //
        // A lateral move costs forward travel, and how much depends on the
        // speed it is taken at, because the pure-pursuit lookahead grows with
        // speed. Measured on the closed road: the 4.14 m move out at 2.6 m/s
        // cost 10.5 m of road; the identical move back at 10.5 m/s cost 18.5 m.
        // Those eight metres are what pushed the end of this act past the NEXT
        // hazard's stop mark on levels 3 and 4.
        this.van.setIndicator(homeward)
        await this.swerve(LANE_NEAR, 0.22)
        this.van.setIndicator('none')
        this.drive.cruise = 0
        return
      }
      case 'MOVING': {
        this.hooks.onSound?.('halt')
        this.van.setAlert(true)
        await this.brake(1.3)
        await this.wait(500)
        // The child gets clear, then the vehicle goes — in that order, visibly.
        const child = entry?.actor as Walker | undefined
        const ball = entry?.extras?.ball
        if (child) {
          const fromZ = child.group.position.z
          const toZ = ROAD_HALF + 1.6
          const ballFromZ = ball?.group.position.z ?? fromZ
          await this.tween(Math.abs(toZ - fromZ) / 3.6, (v) => {
            this.moveWalker(child, child.group.position.x, fromZ + (toZ - fromZ) * v, 3.6)
            if (ball) {
              const z = ballFromZ + (ROAD_HALF + 1.2 - ballFromZ) * v
              ball.group.position.set(ball.group.position.x, 0.16 * THREE.MathUtils.smoothstep(Math.abs(z), ROAD_HALF - 0.1, ROAD_HALF + 0.4), z)
            }
          }, (v) => v)
        }
        this.van.setAlert(false)
        this.hooks.onSound?.('ease')
        await this.driveFor(16, 0.8)
        return
      }
      case 'ARRIVED': {
        this.hooks.onSound?.('drop')
        await this.brake(0.6)
        // The porter comes out to the vehicle and takes the parcel.
        const porter = entry?.extras?.porter as Walker | undefined
        if (porter) {
          const from = porter.group.position.clone()
          const toX = this.car.x - 1
          const toZ = LANE_NEAR + 1.6
          // TURN TO FACE THE WALK. The porter was spawned facing the kerb and
          // then slid to the car without ever turning, so the one person a
          // child watches closely appeared to walk backwards to collect the
          // parcel. Yaw 0 is +x for these rigs, hence atan2(-dz, dx).
          porter.group.rotation.y = Math.atan2(-(toZ - from.z), toX - from.x)
          await this.tween(Math.hypot(toX - from.x, toZ - from.z) / 1.8, (v) => {
            this.moveWalker(porter, from.x + (toX - from.x) * v, from.z + (toZ - from.z) * v, 1.8)
          }, (v) => v)
          // And turn back to the building once the parcel is in hand.
          porter.group.rotation.y = Math.atan2(-(from.z - toZ), from.x - toX)
        }
        this.hooks.onSound?.('success')
        await this.wait(700)
        return
      }
      case 'MANY_MOVING': {
        this.hooks.onSound?.('waitClear')
        await this.brake(0.8)
        const all = [entry?.actor as Walker, ...Object.values(entry?.extras ?? {}) as Walker[]].filter(Boolean)
        const starts = all.map((person) => person.group.position.z)
        const toZ = ROAD_HALF + 2
        const duration = Math.max(...starts.map((from) => Math.abs(toZ - from))) / 2.1
        await this.tween(duration, (v) => {
          for (const [index, person] of all.entries()) {
            this.moveWalker(person, person.group.position.x, starts[index] + (toZ - starts[index]) * v, 2.1)
          }
        }, (v) => v)
        await this.driveFor(16, 0.8)
        return
      }
      case 'ROAD_WET': {
        // Leaves space and eases off; braking distance is the whole point.
        this.hooks.onSound?.('ease')
        await this.brake(0.7)
        await this.wait(actions.includes('LEAVE_SPACE') ? 420 : 180)
        await this.driveFor(16, 0.55)
        return
      }
      case 'EMERGENCY_BEHIND': {
        // MOVE_ASIDE then STOP_SAFE, staged so the child can see the second
        // half actually mattering: the car gets hard against the kerb AND
        // stops, and the ambulance then uses the lane it just gave up.
        this.hooks.onSound?.('signal')
        this.van.setIndicator('right')
        await this.brake(0.6)
        // 8.15 puts the near flank at 9.07 with the kerb face at 9.2 — as far
        // over as the car can physically get. The old move was 0.9 m, which
        // left it still in the lane, and it never stopped either: changeLane
        // clears the stop mark but not the cruise, so it was rolling at 8 m/s
        // through the whole "give up the lane" beat.
        // 22 m of budget, not the default 9. changeLane also finishes on its
        // distance mark, and at nine metres the car ran out of road with the
        // move only a third done — it ended at z 7.34 instead of 8.15, still
        // inside the lane it had just been told to give up.
        await this.changeLane(LANE_NEAR + 1.25, 0.62, 22)
        this.van.setIndicator('none')
        this.drive.cruise = 0
        this.drive.stopAt = this.car.x
        await this.brake(1.0)
        await this.until(() => this.car.speed < 0.05, 3)
        await this.wait(360)

        const ambulance = entry?.actor
        if (ambulance) {
          const fromX = ambulance.group.position.x
          const fromZ = ambulance.group.position.z
          // Past the STOPPED car, in the lane the car vacated. At z 4.6 its
          // flanks are 3.45..5.75 against the car's near flank at 7.23 — a
          // metre and a half of daylight, and visibly the space the rule just
          // created. It leaves the lane over the first third of the run rather
          // than teleporting 13.8 m sideways in one frame, and it YAWS into and
          // out of the move, which is what makes it read as a lane change at
          // all rather than as a sprite sliding across the road.
          const passZ = LANE_NEAR - 2.3
          const runTo = this.car.x + 62
          await this.tween(4.2, (v) => {
            const along = easeInOut(v)
            const prevX = ambulance.group.position.x
            ambulance.group.position.x = fromX + (runTo - fromX) * along
            const lateral = clamp(v / 0.34, 0, 1)
            const eased = easeInOut(lateral)
            const prevZ = ambulance.group.position.z
            ambulance.group.position.z = fromZ + (passZ - fromZ) * eased
            // Heading from the path it is actually taking, the same way the
            // hero car's bicycle model gets its yaw.
            const dx = ambulance.group.position.x - prevX
            const dz = ambulance.group.position.z - prevZ
            if (Math.abs(dx) > 1e-4) {
              const want = Math.atan2(-dz, dx)
              ambulance.group.rotation.y += (want - ambulance.group.rotation.y) * 0.25
            }
          }, (x) => x)
          // Gone. Left standing in the oncoming lane at the far end of the
          // street it kept flashing for the rest of the run.
          ambulance.group.visible = false
        }
        this.hooks.onSound?.('sirenStop')
            await this.wait(300)
        await this.changeLane(LANE_NEAR)
        await this.driveFor(15, 0.9)
        return
      }
      case 'CYCLIST': {
        // Holds back and follows at the cyclist's pace: no squeeze past.
        this.hooks.onSound?.('ease')
        await this.brake(0.7)
        const cyclist = entry?.actor as Walker | undefined
        if (cyclist) {
          // The bicycle travels straight along our lane at a steady 15 km/h.
          // Its motion continues after this manoeuvre, instead of freezing in
          // front of the car as soon as the answer animation has finished.
          this.actorMotion.set(cyclist, { kind: 'riding', originX: cyclist.group.position.x, speed: 4.2 })
          await this.tween(4.0, () => {
            const gap = cyclist.group.position.x - this.car.x
            this.drive.stopAt = null
            this.drive.cruise = clamp(4.2 + (gap - 9.5) * 0.7, 0, 5.2)
          }, (x) => x)
        }
        await this.driveFor(14, 0.7)
        return
      }
      case 'DOG': {
        this.hooks.onSound?.('halt')
        await this.brake(1.1)
        this.hooks.onSound?.('horn')
        const dog = entry?.actor as Walker | undefined
        if (dog) {
          const fromZ = dog.group.position.z
          const toZ = ROAD_HALF + 2
          await this.tween(Math.abs(toZ - fromZ) / 3.4, (v) => {
            this.moveWalker(dog, dog.group.position.x, fromZ + (toZ - fromZ) * v, 3.4)
          }, (v) => v)
        }
        await this.driveFor(15, 0.85)
        return
      }
      case 'DEAD_END': {
        // The taught manoeuvre: pull up, indicate, and drive a real U-turn —
        // full lock at walking pace until the nose points home, then straighten
        // up and roll clear. All of it through the driving model, so the arc is
        // the arc a 3.3 m wheelbase actually turns.
        this.hooks.onSound?.('halt')
        await this.brake(0.8)
        await this.wait(400)
        this.van.setIndicator('left')
        this.hooks.onSound?.('ease')
        this.drive.stopAt = null
        // FULL LOCK, and it has to be full. Turning radius is L / tan(steer):
        // at 0.5 rad that is 6.0 m, so the U-turn needs 12 m of width and the
        // carriageway is 9.2 — the car swung clean onto the far pavement. At
        // 0.85 rad the radius is 2.9 m and the whole turn fits inside the road.
        // Turn the wheel BEFORE moving. A car can steer at a standstill, and
        // reaching lock while already rolling added a straight entry that
        // widened the arc past the kerb (measured 5.03 m from the centreline
        // against a 4.6 m carriageway).
        this.drive.manual = 0.92
        this.drive.cruise = 0
        await this.until(() => this.car.steer > 0.9, 3)
        this.drive.cruise = 2.0
        await this.until(() => this.car.heading >= Math.PI - 0.12, 14)

        // Straighten, then settle into the lane that is correct for the NEW
        // direction of travel: heading pi means the far lane is now this car's
        // own side of the road.
        this.drive.manual = 0
        this.drive.cruise = 2.6
        this.van.setIndicator('none')
        await this.until(() => Math.abs(this.car.steer) < 0.05, 4)
        await this.settleReverseLane(LANE_FAR)
        this.drive.manual = 0
        this.drive.cruise = 3.0
        await this.wait(1800)
        this.drive.cruise = 0
        this.drive.manual = null
        await this.until(() => this.car.speed < 0.05, 4)
        return
      }
      case 'ROAD_BLOCKED': {
        this.hooks.onSound?.('horn')
        await this.brake(0.6)
        const walker = entry?.actor as Walker | undefined
        if (walker) {
          const fromZ = walker.group.position.z
          const toZ = ROAD_HALF + 2
          await this.tween(Math.abs(toZ - fromZ) / 1.9, (v) => {
            this.moveWalker(walker, walker.group.position.x, fromZ + (toZ - fromZ) * v, 1.9)
          }, (v) => v)
        }
        await this.driveFor(15, 0.8)
        return
      }
    }
  }

  /**
   * Collect everything on the camera's side of the street that could stand in
   * front of the lens — lamp columns, trees, the clinic — and give each its
   * own materials so one can be faded without fading its twins.
   */
  private registerOccluders() {
    this.occluders = []
    const candidates: THREE.Object3D[] = [
      ...(this.frontages ? this.frontages.children : []),
      ...this.extraProps,
    ]
    for (const child of candidates) {
      child.getWorldPosition(OCC_POS)
      if (OCC_POS.z < ROAD_HALF - 0.5) continue // far side: never in the way
      const materials: THREE.MeshStandardMaterial[] = []
      child.traverse((node) => {
        const mesh = node as THREE.Mesh
        const material = mesh.material as THREE.MeshStandardMaterial | undefined
        if (!material?.isMeshStandardMaterial) return
        // Cloned so one lamp can fade without fading its twins — but left
        // OPAQUE. Marking every near-side material transparent up front put
        // the whole street through sorted alpha blending and took the frame
        // rate from 60 to 13. `updateOcclusion` turns it on only while a
        // thing is actually in the way.
        const own = material.clone()
        mesh.material = own
        materials.push(own)
      })
      if (materials.length) this.occluders.push({ group: child, materials, fade: 1 })
    }
  }

  /**
   * Fade street furniture that stands between the camera and the vehicle.
   *
   * Measured from the camera to the car and tested as a corridor rather than a
   * ray: a lamp column is thin, so a single ray slips past it while the player
   * still cannot see round it. Fading, not hiding, keeps the street feeling
   * solid instead of making posts blink out.
   */
  private updateOcclusion(dt: number) {
    if (!this.occluders.length) return
    const from = this.camera.position
    // While a hazard shot is held, protect the line to the SUBJECT of the shot
    // — the midpoint of car and hazard — not just the car. A lamp column that
    // split the framed manoeuvre in two used to pass this test untouched.
    const to = OCC_TARGET.set(this.car.x, 0.9, this.car.z)
    const axis = OCC_AXIS.subVectors(to, from)
    const span = axis.length()
    if (span < 0.001) return
    axis.divideScalar(span)
    for (const item of this.occluders) {
      item.group.getWorldPosition(OCC_POS)
      const along = OCC_REL.subVectors(OCC_POS, from).dot(axis)
      let blocking = false
      // Anything essentially AT the lens fades too: the sensor camera rides on
      // the car's nose, and when the car stops beside a shopfront the awning
      // sat exactly on the camera — inside it, filling the whole frame teal —
      // while the between-camera-and-car corridor test looked straight past it.
      const camDx = OCC_POS.x - from.x
      const camDz = OCC_POS.z - from.z
      if (Math.hypot(camDx, camDz) < 4.2) blocking = true
      if (!blocking && along > 0.6 && along < span - 1.2) {
        // Distance from the furniture's axis to the camera-to-car line, taken
        // in plan: a lamp is tall, so height never decides this.
        OCC_NEAR.copy(axis).multiplyScalar(along).add(from)
        const dx = OCC_POS.x - OCC_NEAR.x
        const dz = OCC_POS.z - OCC_NEAR.z
        // Half-width of the thing itself, so a fourteen-metre facade is
        // tested as a facade and a lamp column as a column.
        if (!item.reach) {
          const bounds = new THREE.Box3().setFromObject(item.group)
          item.reach = Math.max(1.2, Math.min(9, (bounds.max.x - bounds.min.x) / 2))
        }
        blocking = Math.hypot(dx, dz) < item.reach
      }
      const want = blocking ? (item.reach && item.reach > 4 ? 0.34 : 0.14) : 1
      if (Math.abs(item.fade - want) < 0.002) continue
      item.fade += (want - item.fade) * Math.min(1, dt * 7)
      for (const material of item.materials) {
        material.opacity = item.fade
        // Opaque again once clear, so the street keeps writing depth normally.
        material.transparent = item.fade < 0.995
        material.depthWrite = item.fade > 0.6
      }
    }
  }

  /**
   * Hold a usable frame rate on weak hardware by giving up the expensive
   * flourishes, in order of how little they are missed.
   *
   * The street is fill-rate bound: bloom's blur chain and the shadow pass cost
   * far more than the geometry does. A classroom machine that cannot afford
   * them should still get a game that animates, so quality steps DOWN when the
   * measured rate is short of the target — and never back up, because a scene
   * that oscillates between settings is worse than one that is simply plainer.
   */
  private adaptQuality(dt: number) {
    if (PIN_QUALITY) return
    if (this.quality >= 3) return
    this.qualityClock += dt
    // Ignore the first second outright: it is shader compilation and the first
    // upload of every texture, never a fair reading.
    if (this.qualityClock < 1.0) return
    this.qualityFrames += 1
    if (this.qualityClock < 1.7) return
    const fps = this.qualityFrames / (this.qualityClock - 1.0)
    this.qualityFrames = 0
    this.qualityClock = 1.0
    if (fps >= 30) return

    // Well short of the target drops two settings at once. Creeping down one
    // step per window took longer than a child spends looking at the screen
    // before deciding the game is broken.
    this.quality += fps < 18 ? 2 : 1
    if (this.quality > 3) this.quality = 3
    LEARNED_QUALITY = Math.max(LEARNED_QUALITY, this.quality)
    this.applyQuality()
    this.hooks.onQuality?.(this.quality)
  }

  /** Apply the current rung. Idempotent, so a remount can start on it. */
  private applyQuality() {
    if (this.quality >= 1) {
      for (const target of [this.composer.renderTarget1, this.composer.renderTarget2]) {
        if (target.samples > 0) { target.samples = 0; target.dispose() }
      }
      // Cheaper shadow filtering first — the softness is the costly part.
      this.renderer.shadowMap.type = THREE.PCFShadowMap
      this.sun.shadow.mapSize.set(512, 512)
      // The coarser depth grid needs a wider bias. Reusing the 2048px bias
      // produces diagonal self-shadow stripes across broad, shallow surfaces.
      this.sun.shadow.bias = -0.0006
      this.sun.shadow.normalBias = 0.065
      this.sun.shadow.map?.dispose()
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget
      this.renderer.shadowMap.needsUpdate = true
    }
    if (this.quality >= 2) {
      // Then the glow.
      this.bloom.enabled = false
    }
    if (this.quality >= 3) {
      // Then shadows altogether, and render below display resolution — a fixed
      // factor, not a compounding multiply, so rung 3 is the same everywhere.
      this.renderer.shadowMap.enabled = false
      this.resScale = 0.75
      this.resize()
    }
  }

  /** Behind the editor or the brief the street is a backdrop: keep simulating,
      draw at a quarter of the rate once nothing is in flight. */
  setBackdrop(on: boolean) {
    this.backdrop = on
    this.backdropFrame = 0
  }

  // ------------------------------------------------------------------- loop --

  private loop = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    const wallDelta = this.clock.getDelta()
    const dt = Math.min(wallDelta, 0.05)
    this.simTime += dt
    const t = this.simTime
    this.updateOcclusion(dt)
    // Measuring the capped simulation step makes a ten-fps device look like
    // twenty fps and prevents the fast quality fallback from ever triggering.
    if (wallDelta < 1) this.adaptQuality(wallDelta)

    // Tweens.
    for (const tween of this.tweens) {
      if (tween.done) continue
      tween.elapsed += dt
      const progress = tween.duration <= 0 ? 1 : clamp(tween.elapsed / tween.duration, 0, 1)
      tween.apply(tween.ease(progress))
      if (progress >= 1) { tween.done = true; tween.resolve() }
    }
    if (this.tweens.length > 24) this.tweens = this.tweens.filter((tween) => !tween.done)

    // ---- Vehicle: one step of the driving model ---------------------------
    // Position and heading come OUT of this; nothing writes them directly, so
    // the van physically cannot slide sideways.
    const travelled = stepCar(this.car, this.drive, dt)
    this.van.group.position.set(this.car.x, 0, this.car.z)
    this.van.group.rotation.y = this.car.heading
    this.van.steer(this.car.steer)
    // The wheels roll on distance actually covered, so they can never scrub.
    this.van.drive(dt > 0 ? travelled / dt : 0, dt)
    this.van.update?.(t, dt)

    // Instrument cluster AND the engine note, at ten hertz. Every frame would
    // re-render React sixty times a second to move a number that changes by a
    // tenth of a km/h, and schedule ~180 AudioParam ramps a second on the synth.
    if (t - this.lastTelemetry > 0.1) {
      this.lastTelemetry = t
      this.hooks.onSpeed?.(this.car.speed)
      const lane = Math.abs(this.car.z - LANE_NEAR) < 0.5 ? 'kerb'
        : Math.abs(this.car.z - LANE_INNER) < 0.7 ? 'inner'
          : null
      this.hooks.onTelemetry?.({
        speed: this.car.speed,
        throttle: clamp(this.car.speed / this.cruiseSpeed, 0, 1),
        lane,
        steer: this.car.steer,
        braking: this.drive.stopAt !== null && this.car.speed > 0.05,
        progress: clamp(this.car.x / WORLD_M, 0, 1),
        alert: this.alerted,
      })
    }

    // Anything waiting on the vehicle arriving somewhere.
    if (this.waits.length) {
      const still = []
      for (const wait of this.waits) {
        if (wait.done() || t > wait.expires) wait.resolve()
        else still.push(wait)
      }
      this.waits = still
    }

    // Ambient walkers loop the length of the street.
    for (const item of this.ambient) {
      const position = item.walker.group.position
      position.x += item.speed * item.dir * dt
      if (position.x > WORLD_M + 12) position.x = -12
      if (position.x < -12) position.x = WORLD_M + 12
      item.walker.walk(item.speed, t)
    }

    for (const entry of this.props.values()) {
      this.updateActorMotion(entry.actor, dt, t)
      entry.actor.update?.(t, dt)
      const flashing = entry.actor as { flash?: (t: number) => void }
      flashing.flash?.(t)
      for (const extra of Object.values(entry.extras ?? {})) extra.update?.(t, dt)
    }
    this.rain.update?.(t, dt)
    this.rain.group.position.set(this.car.x, 0, 0)

    {
    }

    // The cards, if any are up. They follow the car and face the lens, so this
    // has to happen before the camera is solved for this frame — a card that
    // billboards to LAST frame's camera visibly lags when the car is moving.
    // A single rear follow rig. Hazards and review never change this view;
    // only vehicle heading and explicit mouse input control its orientation.
    const rig = RIG[this.view]
    const turn = Math.atan2(Math.sin(this.car.heading - this.followedHeading), Math.cos(this.car.heading - this.followedHeading))
    this.followedHeading += turn * (1 - Math.exp(-dt * 5))
    const pose = followPose(this.car.x, this.car.z, this.followedHeading, this.orbit)
    const wantPos = pose.position
    const wantLook = pose.target
    // User zoom remains a physical camera distance, keeping a consistent lens.
    this.camera.fov = rig.fov
    this.camera.updateProjectionMatrix()
    if (!this.snapped) {
      this.camPos.copy(wantPos); this.camLook.copy(wantLook); this.snapped = true
      this.followedHeading = this.car.heading
    }
    // Track translation exactly. Only vehicle heading is damped above; mouse
    // input is immediate, with no momentum or second solver after release.
    this.camPos.copy(wantPos)
    this.camLook.copy(wantLook)
    this.camera.position.copy(this.camPos)
    // Impact shake. Applied to the FINAL position rather than to the target, so
    // the smoothing does not eat it: lerping toward a shaken target damps the
    // shake to nothing, which is how the first version of this ended up
    // invisible.
    this.shake = 0 // Keep the follow view steady, including incorrect answers.
    if (this.shake > 0.0005) {
      this.shake *= Math.exp(-dt * 5.5)
      const k = this.shake
      this.camera.position.x += (Math.sin(t * 71.3) + Math.sin(t * 113.7)) * k * 0.5
      this.camera.position.y += (Math.sin(t * 97.1) + Math.sin(t * 131.3)) * k * 0.5
      this.camera.position.z += Math.sin(t * 83.9) * k
    } else {
      this.shake = 0
    }
    this.camera.lookAt(this.camLook)
    this.camera.updateMatrixWorld()
    // Face THIS frame's finished camera, so options do not lag behind its move.
    this.deck?.update(dt, this.camera, t)

    // Keep the shadow volume tight around the vehicle, or the map smears
    // across 100 m of street and contact shadows disappear.
    this.sun.position.set(this.car.x - 28, 48, -34)
    this.sun.target.position.set(this.car.x, 0, 0)
    this.fill.position.set(this.car.x + 26, 44, 46)
    this.fill.target.position.set(this.car.x, 2, 0)

    // Behind the editor the street is a blurred backdrop: once nothing is in
    // flight, draw every fourth frame. The sim, tweens and camera above still
    // step every frame, so the picture is merely late, never wrong.
    const settled = this.backdrop && this.waits.length === 0 && !this.tweens.some((tw) => !tw.done)
    if (settled) {
      this.backdropFrame = (this.backdropFrame + 1) % 4
      if (this.backdropFrame) return
    }
    // Low graphics skips the composer entirely: bloom is its only pass with a
    // cost, and rendering direct also saves the full-screen copy.
    if (this.lowGfx) this.renderer.render(this.scene, this.camera)
    else this.composer.render()
  }

  /** Test hook: car pose plus every prop's world position, for the audit. */
  auditState() {
    // Every prop reports its MEASURED world box, not just its origin. The
    // audit used to pair these positions with a hand-written table of
    // half-extents, which drifted the moment any geometry moved: the roadworks
    // wall is rotated a quarter turn, so the table's "5.4 m along x" was
    // really 3.7 m along z, and a car driving through the panels measured as
    // clean. Measuring the object cannot go stale.
    const box = new THREE.Box3()
    const props: {
      trigger: string; x: number; z: number
      minX: number; maxX: number; minZ: number; maxZ: number
    }[] = []
    const record = (trigger: string, group: THREE.Object3D, fallbackX: number) => {
      const at = new THREE.Vector3()
      group.getWorldPosition(at)
      box.setFromObject(group)
      const empty = !Number.isFinite(box.min.x)
      props.push({
        trigger,
        x: at.x || fallbackX,
        z: at.z,
        minX: empty ? at.x : box.min.x,
        maxX: empty ? at.x : box.max.x,
        minZ: empty ? at.z : box.min.z,
        maxZ: empty ? at.z : box.max.z,
      })
    }
    for (const [trigger, entry] of this.props) {
      record(trigger, entry.actor.group, entry.x)
      for (const [key, extra] of Object.entries(entry.extras ?? {})) {
        record(`${trigger}:${key}`, extra.group, entry.x)
      }
    }
    return { mode: this.mode, lane: this.drive.targetLane, car: { x: this.car.x, z: this.car.z, heading: this.car.heading }, props }
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.detachOrbit()
    // Everything in flight is CANCELLED — a manoeuvre mid-chain unwinds at its
    // next await instead of finishing on a dead stage and playing its sounds
    // over the next screen. Wall-clock timers go with it.
    this.cancelAll()
    // The deck holds a multi-megabyte canvas texture per card face.
    this.deck?.dispose()
    this.deck = null
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined
      for (const item of Array.isArray(material) ? material : material ? [material] : []) {
        ;(item as THREE.Material & { map?: THREE.Texture | null }).map?.dispose()
        item.dispose()
      }
    })
    ;(this.scene.background as THREE.Texture | null)?.dispose?.()
    this.scene.background = null
    this.env?.dispose()
    this.pmrem?.dispose()
    this.composer?.dispose()
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onLost)
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onRestored)
    this.renderer.dispose()
    // Release a detached canvas after React's commit. During a hot update the
    // same canvas is immediately reused; losing its context synchronously
    // makes the replacement renderer fail its precision check before drawing.
    const canvas = this.renderer.domElement
    queueMicrotask(() => {
      if (!canvas.isConnected) this.renderer.forceContextLoss()
    })
  }
}

/**
 * The hospital board: white face, the red cross, and the word.
 *
 * Drawn to a canvas rather than modelled, so it stays crisp at any distance
 * and needs no Blender rebuild — the same trick the answer cards use.
 */
function hospitalBoard(): THREE.Group {
  const group = new THREE.Group()
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 512, 256)
    ctx.strokeStyle = '#091c56'
    ctx.lineWidth = 12
    ctx.strokeRect(6, 6, 500, 244)
    // The cross, left. Universal, and readable long before any word is.
    ctx.fillStyle = '#e5342a'
    ctx.fillRect(44, 94, 108, 40)
    ctx.fillRect(78, 60, 40, 108)
    ctx.fillStyle = '#091c56'
    ctx.font = "700 74px 'Chakra Petch', 'Segoe UI Semibold', sans-serif"
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('CLINIC', 186, 118)
    ctx.font = "600 34px 'Inter', 'Segoe UI', sans-serif"
    ctx.fillText('Fenner Street', 188, 176)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 3.2),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  )
  // The face looks BACK down the road (the road is at lower z), and sits proud
  // of its backing on that side — behind it, the backing hid it completely.
  face.position.set(0, 6.6, -0.12)
  face.rotation.y = Math.PI
  group.add(face)

  const backing = new THREE.Mesh(new THREE.BoxGeometry(6.6, 3.4, 0.18), matte(0xe8eef5))
  backing.position.set(0, 6.6, 0)
  group.add(backing)
  for (const side of [-2.4, 2.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 5.1, 8), matte(0xb9bec7))
    post.position.set(side, 2.55, 0)
    group.add(post)
  }
  return group
}

/** Exported for the act screen's stop-position maths. */
export { matte }
