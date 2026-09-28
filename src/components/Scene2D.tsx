import { useEffect, useRef, useState } from 'react'
import { play, playHorn, setEngine } from '../sound'
import { waypointsFor, type EventToken, type Scenario } from '../sim'
import { WORLD, STOP_GAP, placeFor, markFor, type SceneCommand, type SceneMode } from '../three/stage'

// The SAME car the 3D street drives, rendered from the Blender kit in
// orthographic side view. The retired flat art was a delivery van, so the
// two editions showed different vehicles and the copy could only be right
// about one of them.
import vanStrip from '../assets/img/car-drive.png'
import scooterImg from '../assets/img/_retired-flat-art/scooter-parked.png'
// The narrow gate FACES the road: a front-on closure the car visibly goes
// around, instead of a row of barriers lying parallel to the carriageway.
import gateImg from '../assets/img/roadworks-gate.png'
import childImg from '../assets/img/_retired-flat-art/child-running.png'
import ballImg from '../assets/img/_retired-flat-art/football.png'
import cyclistImg from '../assets/img/_retired-flat-art/cyclist-side.png'
import dogImg from '../assets/img/_retired-flat-art/street-dog.png'
import personImg from '../assets/img/_retired-flat-art/street-person.png'
import ambulanceImg from '../assets/img/_retired-flat-art/ambulance-side.png'
import baySignImg from '../assets/img/_retired-flat-art/bay-sign.png'
import bgMid from '../assets/img/bg2d-mid.jpg'
import bgFar from '../assets/img/bg2d-far.jpg'

/**
 * The 2D classic edition.
 *
 * The original flat side-scroller's source was retired when the game went 3D,
 * but its SPRITES were kept. This scene rebuilds the 2D presentation on those
 * sprites while speaking the exact same four commands as the 3D stage — drive,
 * reveal, act, block — so the whole game (rules, scan, patrols, levels) runs
 * unchanged on either renderer. `Scene.tsx` picks which one at build time.
 */

interface Scene2DProps {
  scenario: SceneMode
  command?: SceneCommand | null
  /** Accepted and ignored: the flat fallback has no street to stand them in. */
  choices?: { label: string }[] | null
  committed?: number | null
  onCardPick?: (index: number) => void
  onCardHover?: (index: number | null) => void
  onReview?: (open: boolean) => void
  onCommandDone?: (id: number) => void
  markers?: { at: number; label: string }[]
  parkX?: number
  dim?: boolean
  driving?: boolean
  autoPan?: boolean
}

/** Sprite per trigger, with width as a fraction of one screen. */
const PROP: Partial<Record<EventToken, { src: string; width: number }>> = {
  SCOOTER: { src: scooterImg, width: 0.1 },
  NARROW: { src: gateImg, width: 0.62 },
  MOVING: { src: childImg, width: 0.055 },
  ARRIVED: { src: baySignImg, width: 0.035 },
  MANY_MOVING: { src: personImg, width: 0.045 },
  ROAD_WET: { src: cyclistImg, width: 0.1 },
  EMERGENCY_BEHIND: { src: ambulanceImg, width: 0.17 },
  CYCLIST: { src: cyclistImg, width: 0.1 },
  DOG: { src: dogImg, width: 0.07 },
  ROAD_BLOCKED: { src: personImg, width: 0.045 },
  FOG: { src: scooterImg, width: 0.1 },
  DEAD_END: { src: gateImg, width: 0.56 },
}

const VAN_W = 0.24

/**
 * How fast the car crosses the picture, in screen widths per second.
 *
 * The flat street is one screen wide, so these numbers are literally "how much
 * of the view the car covers each second" — and they are the whole of the
 * flat edition's sense of speed. One cruise speed for everything was too quick
 * to read at all, and worse, a rule that says SLOW DOWN looked exactly like a
 * rule that says drive on: the car did the same 0.8 either way, so the child
 * was told the answer worked but never shown it. Each manoeuvre now moves at
 * the speed its own action names.
 */
const SPEED = {
  /** Between hazards, with nothing to answer for. */
  cruise: 0.44,
  /** SLOW / SLOW_EARLY / LEAVE_SPACE: visibly, deliberately slower. */
  slow: 0.22,
  /** Threading the gap in a closed road — slower still. */
  crawl: 0.15,
  /** SPEED UP, and every wrong answer that says "go faster". */
  fast: 0.62,
}

/** The speed an answer's own action tokens ask for. */
const speedFor = (actions: string[] = [], trigger?: EventToken) => {
  if (actions.includes('SPEEDUP') || actions.includes('RACE_AHEAD')) return SPEED.fast
  if (trigger === 'NARROW' || trigger === 'FOG') return SPEED.crawl
  if (actions.some((token) => token === 'SLOW' || token === 'SLOW_EARLY' || token === 'LEAVE_SPACE')) return SPEED.slow
  return SPEED.cruise
}

/**
 * A closed road is a RUN of barriers, not one barricade.
 *
 * Side-on, a single gate sprite left most of the carriageway empty and read as
 * a sign by the kerb rather than as a road that is shut. These hazards repeat
 * their sprite along the street so the closure spans a real stretch of road,
 * and the car threads through at a crawl.
 */
const RUN_OF: Partial<Record<EventToken, number>> = { NARROW: 6, DEAD_END: 5 }

/**
 * How far UP the picture a closure stands, in percent of the viewport.
 *
 * Roadworks take the FAR side of the road and the car squeezes past on what is
 * left — that is what "the lane is cut to one car width" looks like from the
 * side. Drawn on the car's own ground line the barriers simply sat where the
 * car was about to be, and the car went through them; standing them on the far
 * lane puts the whole run behind the car, where a closure belongs.
 */
const FAR_LANE_LIFT = 5.6

/**
 * The panels a closure LEAVES OUT — the gap the car has to line up with.
 *
 * The narrow gate is a road cut to one car width, so the barriers have to have
 * a hole in them wide enough for the car and no wider; a solid run left the car
 * apparently driving straight through the barriers. A dead end has no gap at
 * all, which is the whole point of it.
 */
const GAP_SLOTS: Partial<Record<EventToken, number[]>> = {}

/** Hazards that are ALIVE: the car never drives INTO these. A wrong answer
    stops it nose-to-nose (and the verdict still says CRASHED), matching the
    3D street, which shunts the kerb rather than run a person down. */
const LIVING = new Set<EventToken>(['MOVING', 'MANY_MOVING', 'DOG', 'CYCLIST', 'ROAD_BLOCKED'])

/** Where a prop STANDS, in screen widths. The ambulance is the one hazard
    behind the car: it parks just behind the car's own stop mark, so the flat
    child sees a siren in the mirror, not a parked ambulance up the road. */
const propAt = (trigger: EventToken, x: number) => {
  const prop = PROP[trigger]
  if (trigger === 'EMERGENCY_BEHIND' && prop) return markFor(trigger, x) - (VAN_W + prop.width) / 2 - 0.06
  return placeFor(trigger, x)
}

/**
 * Where the ground is, as a percentage of the viewport height.
 *
 * ONE number, shared by the car, every prop and the contact shadows. It used to
 * be written out per prop — 16 for most, 15 for the ambulance, 15.5 for the car
 * — which is how the car came to be standing a little above everything else on
 * the street with a blurred drop-shadow under it and nothing touching the road.
 */
const GROUND = 16

/**
 * The transparent margin under the car sprite's tyres, as a fraction of the
 * sheet's height.
 *
 * Measured, not guessed: `scripts/probe-flat-ground.mjs` decodes the sheet and
 * scans up from the bottom for the first row that is not transparent. The sheet
 * is 900x451 with 64 rows of nothing below the wheels, so the CSS box bottom is
 * 14.2% of the box height BELOW where the car actually stands — and placing the
 * box on the ground line puts the car in the air by exactly that much.
 */
const VAN_TYRE_PAD = 0.142
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

export default function Scene2D({
  scenario,
  command = null,
  onCommandDone,
  parkX = 0.06,
  dim = false,
}: Scene2DProps) {
  const vanX = useRef(parkX)
  /** The car's live ground speed, in m/s, driving the wheel cycle. */
  const rollRate = useRef(0)
  const alive = useRef(true)
  const [, force] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [rolling, setRolling] = useState(false)
  // True while the moving car is crossing a prop: the side view has no second
  // lane of its own, so the pass is DRAWN — the car lifts to the far-lane row,
  // shrinks a little with the perspective, and slips behind the obstacle.
  // Without this it simply drove through every sprite it passed.
  const [passing, setPassing] = useState(false)
  const [alert, setAlert] = useState(false)
  const [revealed, setRevealed] = useState<EventToken | null>(null)
  const [cleared, setCleared] = useState(false)
  /**
   * True from the moment a wrong answer has been carried out.
   *
   * The flat edition cannot orbit a wreck, but it must not simply play the
   * SUCCESS animation for an answer that was wrong: the verdict strip would say
   * the car crashed over a picture of it sailing past. So it shunts the car into
   * whatever is in its way, tips it, and stops — the same story, told with the
   * one dimension this edition has.
   */
  const [crashed, setCrashed] = useState(false)
  /** Which hazard the wreck ran into, so that prop is knocked askew too. */
  const [hit, setHit] = useState<string | null>(null)
  /** Metres of road actually rolled — the wheel frames step from this. */
  const rolled = useRef(0)

  const route = waypointsFor((scenario === 'depot' ? 'l1' : scenario) as Scenario)

  useEffect(() => {
    vanX.current = parkX
    setFlipped(false)
    setRevealed(null)
    setCleared(false)
    setAlert(false)
    force((n) => n + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario])

  useEffect(() => () => { alive.current = false; clearSettle(); setEngine(0) }, [])

  /**
   * Cap a stop so the car never parks ON a prop.
   *
   * The stop mark is shared with the 3D stage, where it is a distance in
   * metres from the hazard. Here the hazard is a sprite whose width varies —
   * the roadworks barrier is four times the scooter — so a single gap left the
   * car overlapping the wide ones. Back off by the two half-widths instead.
   */
  const safeStop = (to: number, ignore?: EventToken) => {
    let capped = to
    for (const point of route) {
      if (point.trigger === ignore) continue // the hazard being PASSED
      if (point.trigger === 'EMERGENCY_BEHIND') continue // behind us by definition
      const prop = PROP[point.trigger]
      if (!prop) continue
      const propX = propAt(point.trigger, point.x)
      if (propX <= vanX.current) continue // already behind us
      const limit = propX - (VAN_W + prop.width) / 2 - 0.05
      if (to > limit && limit > vanX.current) capped = Math.min(capped, limit)
    }
    return capped
  }

  /** True when a van at x overlaps any visible prop, in screen widths. */
  const crossingProp = (atX: number) => {
    for (const point of route) {
      const prop = PROP[point.trigger]
      if (!prop) continue
      if (point.trigger === 'MOVING' && revealed !== 'MOVING') continue
      if (point.trigger === 'EMERGENCY_BEHIND') continue // behind us, never crossed
      // A closed road is threaded THROUGH its gap, not slipped past in the far
      // lane: lifting the car here read as driving over the barriers.
      if (RUN_OF[point.trigger]) continue
      const propX = propAt(point.trigger, point.x)
      if (Math.abs(propX - atX) < (VAN_W + prop.width) / 2 + 0.03) return true
    }
    return false
  }

  /**
   * The journey does not end at every command boundary.
   *
   * Each `drive` used to finish by killing the engine, the wheel cycle and the
   * pass pose — so a covered hazard (drive, then act, then the next drive) was
   * three dead stops with React round-trips between them, and the run read as
   * a car stalling its way down the street. Now a finished drive keeps its
   * momentum and arms a short settle timer instead: if another command arrives
   * (the normal case mid-journey) the timer is cancelled and the car simply
   * carries on; if nothing follows, THEN it comes to rest.
   */
  const settle = useRef<number | null>(null)
  const clearSettle = () => {
    if (settle.current !== null) { window.clearTimeout(settle.current); settle.current = null }
  }
  const halt = () => {
    clearSettle()
    setEngine(0)
    rollRate.current = 0
    setRolling(false)
    setPassing(false)
  }
  const armSettle = () => {
    clearSettle()
    settle.current = window.setTimeout(() => { settle.current = null; halt() }, 300)
  }

  /** Move the car to an x (in screen widths), frame by frame. Eases out on
      arrival instead of stopping dead, and leaves the momentum flags alone —
      see `armSettle` above. */
  const driveTo = async (to: number, speed = SPEED.cruise) => {
    clearSettle()
    setRolling(true)
    const started = performance.now()
    await new Promise<void>((resolve) => {
      let last = performance.now()
      const step = (now: number) => {
        if (!alive.current) { resolve(); return }
        const dt = Math.min((now - last) / 1000, 0.05)
        last = now
        const delta = to - vanX.current
        // Pull away gently and brake gently: full speed in the open, easing
        // over the last stretch — but never below HALF speed, because these
        // seams sit at every waypoint and a deep dip at each one read as the
        // car breaking its stride. A real stop is a hard halt() elsewhere.
        const rampUp = Math.min(1, (now - started) / 300 + 0.5)
        const arrive = Math.min(1, Math.abs(delta) / 0.3 + 0.42)
        const move = Math.sign(delta) * Math.min(Math.abs(delta), speed * rampUp * arrive * dt)
        vanX.current += move
        rolled.current += Math.abs(move) * 24
        const metresPerSecond = Math.abs(move) / Math.max(dt, 0.001) * 24
        setEngine(metresPerSecond)
        // The wheel cycle runs at the speed the car is ACTUALLY doing. A fixed
        // 0.36 s loop says "an animation is playing"; a loop that slows as the
        // car eases off and stops when it stops says "this thing is driving".
        rollRate.current = metresPerSecond
        setPassing(crossingProp(vanX.current))
        force((n) => n + 1)
        if (Math.abs(to - vanX.current) < 0.002) resolve()
        else requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })
    if (!alive.current) return
    armSettle()
  }

  useEffect(() => {
    if (!command) return
    let cancelled = false
    /** Still the scene this command was sent to? A command that outlives its
        scene must not keep playing sounds over the next screen. */
    const live = () => alive.current && !cancelled
    void (async () => {
      try {
        if (command.kind === 'drive') {
          await driveTo(safeStop(command.to))
        } else if (command.kind === 'reveal') {
          halt() // a hazard making its entrance is a real stop
          play('warn')
          setRevealed(command.trigger)
          // Short: the flat car has no reveal choreography, so a long hold
          // here is a car standing still for no visible reason.
          await sleep(400)
        } else if (command.kind === 'block') {
          halt() // the question is the one place the car truly stands
          play('halt')
          setAlert(true)
          await sleep(600)
        } else if (command.kind === 'hold') {
          halt() // the star popup is up: the street stands still under it
        } else if (command.kind === 'rewind') {
          // Another go: the car returns to its mark and the wreck is undone.
          halt()
          setCrashed(false)
          setHit(null)
          setCleared(false)
          setAlert(false)
          setFlipped(false)
          vanX.current = command.to
          force((n) => n + 1)
          await sleep(140)
        } else if (command.kind === 'act' && command.outcome && command.outcome !== 'pass') {
          // A WRONG answer, driven here too. The flat edition cannot orbit a
          // wreck, but it must not play the SUCCESS animation for an answer that
          // was wrong — the verdict strip would be telling a child the car
          // crashed over a picture of it sailing past. So it closes on whatever
          // is in front of it, hits it, and tips.
          setAlert(true)
          play('warn')
          await sleep(320)
          if (!live()) return
          const point = route.find((entry) => entry.trigger === command.trigger)
          const prop = PROP[command.trigger]
          if (command.trigger === 'EMERGENCY_BEHIND') {
            // The ambulance hits the car from BEHIND: no forward drive at all.
            halt()
            setHit('EMERGENCY_BEHIND')
            play('thud')
            setCrashed(true)
          } else if (point && prop && LIVING.has(command.trigger)) {
            // Something alive: stop nose-to-nose, never drive through it.
            const nose = propAt(command.trigger, point.x) - (VAN_W + prop.width) / 2
            await driveTo(Math.min(nose - 0.02, WORLD - 0.2), speedFor(command.actions, command.trigger))
            if (!live()) return
            halt()
            play('halt')
            setCrashed(true)
          } else {
            const into = point && prop ? propAt(command.trigger, point.x) - (VAN_W + prop.width) / 2 + 0.03 : vanX.current + 0.4
            await driveTo(Math.min(into, WORLD - 0.2), speedFor(command.actions, command.trigger))
            if (!live()) return
            halt() // a wreck does not idle
            play('thud')
            setCrashed(true)
            setHit(command.trigger) // the struck prop is knocked askew too
          }
          await sleep(900)
        } else if (command.kind === 'act') {
          setCrashed(false)
          setHit(null)
          setAlert(false)
          const trigger = command.trigger
          if (trigger === 'DEAD_END') {
            // The 2D U-turn: stop, flip, drive back a stretch.
            await sleep(400)
            if (!live()) return
            playHorn()
            setFlipped(true)
            await sleep(500)
            if (!live()) return
            await driveTo(Math.max(0.2, vanX.current - 2.2))
          } else if (trigger === 'ARRIVED') {
            play('drop')
            setCleared(true)
            await sleep(900)
            if (!live()) return
            play('success')
          } else {
            play('ease')
            setCleared(true)
            // A moving hazard needs TIME, not room: the child is mid-lane when
            // the act begins, and driving on at once ran the car through them —
            // and for those the car must genuinely stand and wait.
            if (trigger === 'MOVING' || trigger === 'MANY_MOVING') {
              halt()
              await sleep(1500)
            } else {
              await sleep(60)
            }
            if (!live()) return
            // The pass has to actually PASS: drive to the far side of the
            // hazard just cleared (safeStop used to cap this drive short of
            // it, so on a one-hazard level the "go around" answer ended with
            // the car parked in front of the scooter it had supposedly
            // passed). Still capped before the NEXT hazard down the street.
            const point = route.find((entry) => entry.trigger === trigger)
            const prop = PROP[trigger]
            const beyond = point && prop && trigger !== 'EMERGENCY_BEHIND'
              ? propAt(trigger, point.x) + (VAN_W + prop.width) / 2 + 0.3
              : vanX.current + STOP_GAP + 0.5
            await driveTo(safeStop(Math.max(beyond, vanX.current + STOP_GAP + 0.5), trigger),
              speedFor(command.actions, trigger))
          }
        }
      } finally {
        if (!cancelled) onCommandDone?.(command.id)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.id])

  // Camera: keep the car about a third in from the left, clamped to the world.
  // The offset is in SCREEN WIDTHS, so 1.3 put the car a full screen and a
  // third past the right edge — it vanished the moment it had driven that far.
  const LEAD = 0.33
  const cam = Math.min(Math.max(vanX.current - LEAD, 0), WORLD - 1)

  return (
    <div className={`scene scene-2d ${dim ? 'is-backdrop' : ''}`}>
      <div className="w2d-viewport">
        {/* Parallax stack: sky (fixed) -> skyline (0.25x) -> shopfronts (0.6x).
            The road and everything on it live in the 1.0x world below. */}
        <div className="w2d-sky" />
        <div
          className="w2d-layer w2d-far"
          style={{ backgroundImage: `url('${bgFar}')`, transform: `translateX(${-cam * 0.25 * 14}%)` }}
        />
        <div
          className="w2d-layer w2d-mid"
          style={{ backgroundImage: `url('${bgMid}')`, transform: `translateX(${-cam * 0.6 * 14}%)` }}
        />
        <div className="w2d-world" style={{ width: `${WORLD * 100}%`, transform: `translateX(${-(cam / WORLD) * 100}%)` }}>
          <div className="w2d-road" />

          {route.map((point) => {
            const prop = PROP[point.trigger]
            if (!prop) return null
            const xSW = propAt(point.trigger, point.x)
            const hidden = point.trigger === 'MOVING' && revealed !== 'MOVING'
            const run = RUN_OF[point.trigger] ?? 1
            const classes = `w2d-prop ${revealed === point.trigger ? 'is-live' : ''} ${cleared ? 'is-cleared' : ''} ${hit === point.trigger ? 'is-hit' : ''}`
            // A closure is drawn as its own run of barriers across the stretch
            // of road it shuts, centred on the hazard's mark.
            const panel = prop.width / run
            const gap = GAP_SLOTS[point.trigger] ?? []
            return Array.from({ length: run }, (_, slot) => slot).filter((slot) => !gap.includes(slot)).map((slot) => (
              <img
                key={`${point.id}-${slot}`}
                src={prop.src}
                alt=""
                data-trigger={point.trigger}
                className={classes}
                style={{
                  left: `${((xSW - prop.width / 2 + panel * (slot + 0.5)) / WORLD) * 100}%`,
                  // A little smaller and a little further up the picture: the
                  // far lane, behind the car rather than under it.
                  width: `${(panel / WORLD) * 100 * (run > 1 ? 0.86 : 1)}%`,
                  bottom: `${GROUND + (run > 1 ? FAR_LANE_LIFT : 0)}%`,
                  opacity: hidden ? 0 : 1,
                }}
              />
            ))
          })}
          {revealed === 'MOVING' && (
            <img src={ballImg} alt="" className="w2d-prop is-live" style={{ left: `${((placeFor('MOVING', route.find((point) => point.trigger === 'MOVING')?.x ?? 0.65) + 0.1) / WORLD) * 100}%`, width: `${(0.02 / WORLD) * 100}%`, bottom: '15%' }} />
          )}

          {/* The contact shadow, drawn as its own element under the tyres.
              The car used to carry a big blurred drop-shadow filter, which
              spreads in every direction and reads as a glow — the one thing it
              cannot say is "this is standing on that". An ellipse on the ground
              line can — and it RIDES UP to the far lane during a pass, because
              a car hanging above its own shadow reads as airborne. 3.4 = the
              car's -13% lane lift converted to viewport height at 16:9. */}
          <div
            className={`w2d-shadow ${rolling ? 'is-rolling' : ''} ${passing ? 'is-passing' : ''}`}
            style={{
              left: `${(vanX.current / WORLD) * 100}%`,
              width: `${(VAN_W * 0.82 / WORLD) * 100}%`,
              bottom: `${GROUND - 0.6 + (passing ? 3.4 : 0)}%`,
            }}
          />
          <div
            // The wheel frame as a COUNTER, not a position: mod-4 sampling
            // cannot tell "back one frame" from "forward three", so the
            // invariant the spec guards (the sheet only ever advances) is
            // published here where it can be read unambiguously.
            data-roll={Math.floor(rolled.current / 0.55)}
            className={`w2d-van ${rolling ? 'is-rolling' : ''} ${alert ? 'is-alert' : ''} ${flipped ? 'is-flipped' : ''} ${passing ? 'is-passing' : ''} ${crashed ? 'is-crashed' : ''}`}
            style={{
              left: `${(vanX.current / WORLD) * 100}%`,
              width: `${(VAN_W / WORLD) * 100}%`,
              // Pushed DOWN by the sprite's own transparent margin, so the
              // tyres — not the bottom of the image — sit on the ground line.
              ['--tyre-pad' as string]: `${VAN_TYRE_PAD * 100}%`,
              // The four wheel frames step from DISTANCE rolled (one frame per
              // 0.55 m): the sheet only ever advances, so the wheels can never
              // appear to spin backwards as the car eases off.
              backgroundPosition: `${-100 * (Math.floor(rolled.current / 0.55) % 4)}% 0`,
              backgroundImage: `url('${vanStrip}')`,
            }}
          />
        </div>
        {(scenario === 'fog' || scenario === 'rain') && (
          <div className={`w2d-weather is-${scenario}`} aria-hidden="true" />
        )}
      </div>
    </div>
  )
}
