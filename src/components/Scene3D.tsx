import { useEffect, useRef, useState } from 'react'
import { SENSES_BEHIND, useGame } from '../store'
import { play, playHorn, setEngine } from '../sound'
import { waypointsFor, type Scenario } from '../sim'
import { TILES } from '../content'
import { useSettings } from '../persist'
import {
  Stage, WORLD, STOP_GAP, markFor, placeFor,
  type CameraView, type SceneCommand, type SceneMode, type Telemetry,
} from '../three/stage'
import type { HoloOption } from '../three/holocards'
import { reviewUi } from '../choices'
import { IconCamera } from '../icons'

const IDLE: Telemetry = {
  speed: 0, throttle: 0, lane: 'kerb', steer: 0, braking: false, progress: 0, alert: false,
}

export { WORLD, STOP_GAP, markFor, placeFor }
export type { SceneCommand, SceneMode }

interface Scene3DProps {
  scenario: SceneMode
  command?: SceneCommand | null
  onCommandDone?: (id: number) => void
  markers?: { at: number; label: string }[]
  parkX?: number
  dim?: boolean
  driving?: boolean
  autoPan?: boolean
  /**
   * The three options, as cards standing in the street.
   *
   * Null means no question is being asked. This is a PROP and not a command
   * because it is a state and not an event: the cards are up for as long as the
   * question stands, and a command would have to be un-sent.
   */
  choices?: HoloOption[] | null
  /** Index the child has committed to — flares it and drops the other two. */
  committed?: number | null
  onCardPick?: (index: number) => void
  onCardHover?: (index: number | null) => void
  /** True while the camera belongs to the pointer, after a choice was carried out. */
  onReview?: (open: boolean) => void
}

/** WebGL can be switched off by policy on a managed school device. Detect it
 *  once, up front, so the activity can say so instead of showing a black box. */
let WEBGL_OK: boolean | null = null
function webglOk() {
  // Probed ONCE per page: every level mount used to create a throwaway GL
  // context here and never release it, and a browser allows only a handful.
  if (WEBGL_OK !== null) return WEBGL_OK
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null
    WEBGL_OK = Boolean(window.WebGLRenderingContext && gl)
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    WEBGL_OK = false
  }
  return WEBGL_OK
}

/**
 * The street, in three dimensions.
 *
 * This component is a thin shell: it owns a canvas and a `Stage`, forwards the
 * four scene commands the act screen already speaks, and adds the camera
 * controls. All the geometry, animation and camera work lives in `src/three/`.
 */
export default function Scene3D({
  scenario,
  command = null,
  onCommandDone,
  parkX = 0.06,
  dim = false,
  choices = null,
  committed = null,
  onCardPick,
  onCardHover,
  onReview,
}: Scene3DProps) {
  const holder = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const stage = useRef<Stage | null>(null)
  /** Resolves once the Blender kit is parsed and the world exists. Commands
   *  await this, so one issued during start-up runs in order instead of being
   *  dropped or racing an empty scene. */
  const ready = useRef<Promise<Stage | null>>(Promise.resolve(null))
  /** Rear follow stays steady. Mouse input changes only the player's offset. */
  const [view] = useState<CameraView>('lowchase')
  const [tele, setTele] = useState<Telemetry>(IDLE)
  /** True while the pointer owns the camera. Shows the drag coaching line. */
  const [reviewing, setReviewing] = useState(false)
  const [cameraOffset, setCameraOffset] = useState(false)
  /** The WebGL context died — offer a reload instead of a frozen frame. */
  const [contextLost, setContextLost] = useState(false)
  /** The kit failed to load — say so, instead of a silent black street. */
  const [failed, setFailed] = useState(false)
  /**
   * The stage is built once and keeps its hooks for its whole life, so the
   * callbacks it fires have to be read through a box that this render can
   * refresh — otherwise a card click months into a session calls the handler
   * from the very first render.
   */
  const cb = useRef({ onCardPick, onCardHover, onReview })
  cb.current = { onCardPick, onCardHover, onReview }
  /** True while the camera is holding a hazard two-shot — the view arrows show. */
  const [supported] = useState(webglOk)

  // ---- engine ------------------------------------------------------------
  useEffect(() => {
    if (!supported || !canvas.current) return
    const instance = new Stage(canvas.current, {
      onSpeed: (speed) => setEngine(speed),
      onTelemetry: setTele,
      onSound: (cue) => { if (cue === 'horn') playHorn(); else play(cue as Parameters<typeof play>[0]) },
      onContextLost: () => setContextLost(true),
      onContextRestored: () => setContextLost(false),
      onCardPick: (index) => cb.current.onCardPick?.(index),
      onCardHover: (index) => cb.current.onCardHover?.(index),
      onReview: (open) => { setReviewing(open); cb.current.onReview?.(open) },
      onCameraOffset: setCameraOffset,
    })
    stage.current = instance
    // Test hook, dev builds only: the collision audit reads poses from here.
    if (import.meta.env.DEV) {
      (window as unknown as { __stage?: Stage }).__stage = instance
    }
    ready.current = instance.ready()
      .then(() => {
        instance.setScenario(scenario, parkX)
        instance.setView(view)
        return instance
      })
      .catch((error) => {
        console.error('[SKAI] the 3D kit failed to load', error)
        setFailed(true)
        return null
      })

    const onResize = () => instance.resize()
    window.addEventListener('resize', onResize)
    // The logical canvas is scaled by CSS transform, so a layout change does not
    // always fire a window resize. Watch the holder itself as well.
    const observer = new ResizeObserver(onResize)
    if (holder.current) observer.observe(holder.current)

    return () => {
      window.removeEventListener('resize', onResize)
      observer.disconnect()
      setEngine(0)
      instance.dispose()
      stage.current = null
    }
  }, [supported])

  useEffect(() => {
    void ready.current.then((instance) => instance?.setScenario(scenario, parkX))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario])

  useEffect(() => { void ready.current.then((instance) => instance?.setView(view)) }, [view])

  // Behind the editor or a brief the street is a backdrop: the stage keeps
  // simulating but draws at a quarter of the rate.
  useEffect(() => { void ready.current.then((instance) => instance?.setBackdrop(dim)) }, [dim])

  // The machine's knobs, applied to the live stage and re-applied on change.
  const lowGfx = useSettings((s) => s.lowGfx)
  const reducedMotion = useSettings((s) => s.reducedMotion)
  useEffect(() => {
    void ready.current.then((instance) => {
      instance?.setQuality(lowGfx)
      instance?.setReducedMotion(reducedMotion)
    })
  }, [lowGfx, reducedMotion])

  // ---- the cards ---------------------------------------------------------
  // Deliberately NOT awaited through a command: showing and hiding the deck is
  // instant and must never queue behind a manoeuvre that is still running.
  useEffect(() => {
    void ready.current.then((instance) => {
      if (!instance) return
      if (choices?.length) instance.showChoices(choices)
      else instance.hideChoices()
    })
    // The identity of the array changes every render in the parent, so compare
    // the copy that actually matters: what is written on the cards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choices ? choices.map((option) => option.label).join('|') : ''])

  useEffect(() => {
    if (committed === null) return
    void ready.current.then((instance) => instance?.commitChoice(committed))
  }, [committed])

  // ---- command execution -------------------------------------------------
  useEffect(() => {
    if (!command) return
    let cancelled = false
    void (async () => {
      try {
        // If the renderer never came up — WebGL blocked, or the kit failed to
        // parse — acknowledge at once so the lesson still advances rather than
        // waiting forever on an animation that cannot run.
        const instance = await ready.current
        if (instance) {
          if (command.kind === 'drive') await instance.driveTo(command.to)
          else if (command.kind === 'reveal') await instance.reveal(command.trigger)
          else if (command.kind === 'act') await instance.act(command.trigger, command.actions, command.outcome)
          else if (command.kind === 'block') await instance.block(command.trigger)
          else if (command.kind === 'rewind') instance.rewind(command.to)
          else if (command.kind === 'hold') instance.hold()
        }
      } catch (error) {
        console.error('[SKAI] scene command failed', error)
      } finally {
        if (!cancelled) onCommandDone?.(command.id)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.id])

  if (!supported) {
    return (
      <div className={`scene scene-flat ${dim ? 'is-backdrop' : ''}`}>
        <div className="scene-fallback">
          <strong>3D is switched off on this device</strong>
          <p>
            The mission still works: rules, the policy scan and every level run as
            normal — you just will not see the street. Ask for hardware
            acceleration to be enabled in the browser settings.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`scene scene-3d ${dim ? 'is-backdrop' : ''}`} ref={holder}>
      <canvas
        ref={canvas}
        className="scene-canvas"
        aria-label="3D road. Drag to look around the car. Scroll to zoom. Double-click to follow from behind."
      />

      {(contextLost || failed) && (
        <div className="scene-fallback" role="alert">
          <strong>{failed ? 'The 3D street could not load' : 'The 3D view stopped'}</strong>
          <p>
            {failed
              ? 'This device could not build the street. The mission still works from the keypad: rules, the policy scan and every level.'
              : 'The graphics driver reset — it happens on busy machines. Nothing is lost: your rules are still in the policy.'}
          </p>
          {!failed && <button className="btn primary" onClick={() => location.reload()}>Reload</button>}
        </div>
      )}

      {!dim && <Cluster tele={tele} scenario={scenario} />}

      {!dim && cameraOffset && (
        <button
          className="camera-reset"
          title="Return to the view from behind the car"
          onClick={() => { play('click'); stage.current?.resetOrbit() }}
        >
          <IconCamera light />Follow car
        </button>
      )}

      {/* The one thing a child cannot discover on their own: that the street is
          now theirs to turn. It appears only while it is true. */}
      {reviewing && (
        <p className="orbit-hint" role="status">
          <span className="orbit-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 12a8 4 0 1 0 16 0a8 4 0 1 0-16 0" /><path d="M12 4v5" /><path d="M9.5 6.5 12 4l2.5 2.5" /></svg>
          </span>
          {reviewUi.dragHint}
        </p>
      )}

    </div>
  )
}

/**
 * The instrument cluster.
 *
 * Everything on it is read live off the driving model, which is the point: a
 * child who writes "slow down for a scooter" can watch the number fall as the
 * car reaches one, and the rule they wrote stops being an abstraction. It is
 * also the screen's only continuously moving piece of chrome, which is what
 * makes the street feel driven rather than played back.
 */
function Cluster({ tele, scenario }: { tele: Telemetry; scenario: SceneMode }) {
  const sensors = useGame((s) => s.sensors)
  const kmh = Math.round(tele.speed * 3.6)
  const stops = scenario === 'depot' ? [] : waypointsFor(scenario as Scenario).map((point) => ({
    id: point.id,
    x: point.x,
    label: TILES[point.trigger]?.label ?? point.trigger,
  }))
  return (
    <div className={`cluster ${tele.alert ? 'is-alert' : ''}`} aria-hidden="true">
      {/* Three readouts, not eight.
          What went: the LIDAR and BRAKE chips (neither ever tells a child
          anything they cannot see on the car), the INNER/KERB lane pips and the
          steering bar (the street shows both, at size), and the throttle bar
          (the speed number already is the throttle). What stayed is what a
          child actually asks: how fast, how far to go, and whether the car can
          see behind itself yet. */}
      <div className="cluster-speed">
        <strong>{kmh}</strong>
        <span>km/h</span>
      </div>

      {/* REAR stays dark for most of the activity, lights when the child fits
          the rear sensor, and stays lit — the lesson has to leave a mark on the
          car, not just on the beat it was taught in. */}
      <span className={`cluster-rear ${SENSES_BEHIND[sensors] ? 'is-on' : ''}`}>REAR</span>

      {/* The route, with every hazard on it. "How far to the clinic" is the
          question they ask most. */}
      <div className="cluster-route">
        <i style={{ width: `${Math.round(tele.progress * 100)}%` }} />
        {stops.map((stop) => (
          <b
            key={stop.id}
            className={tele.progress > stop.x ? 'is-past' : ''}
            style={{ left: `${Math.round(stop.x * 100)}%` }}
            title={stop.label}
          />
        ))}
        <u style={{ left: `${Math.round(tele.progress * 100)}%` }} />
      </div>
    </div>
  )
}
