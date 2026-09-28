import { Howl, Howler } from 'howler'

import ambientCity from './assets/audio/ambient-city.mp3'
import busyStreet from './assets/audio/busy-street.mp3'
import click from './assets/audio/click.mp3'
import drive from './assets/audio/drive.mp3'
import drop from './assets/audio/drop.mp3'
import fullStop from './assets/audio/full-stop.mp3'
import gasp from './assets/audio/gasp.mp3'
import rainLoop from './assets/audio/rain-loop.mp3'
import sirenSoft from './assets/audio/siren-soft.mp3'
import success from './assets/audio/success.mp3'
import waitClear from './assets/audio/wait-clear.mp3'
import win from './assets/audio/win.mp3'

// ---------------------------------------------------------------------------
// Sound design note.
//
// The original set contained several broadband-noise clips — measured spectral
// flatness: slow 0.630, wet-brake 0.522, move-aside 0.425, screech 0.388,
// squeeze 0.160. Anything that noisy reads as a skid, a scrape or a crash, and
// `screech` fired on EVERY failed run even though nothing in this mission ever
// collides: a failed run means the vehicle had no matching rule, so it simply
// stops. Those five clips are gone.
//
// What replaces them is synthesised here, so the exact content is known: soft
// tonal cues with no noise component at all. Everything still bundled is tonal
// (flatness ≤ 0.053).
// ---------------------------------------------------------------------------

export type Sfx =
  | 'click'
  | 'drive'
  | 'drop'
  | 'fullStop'
  | 'gasp'
  | 'success'
  | 'waitClear'
  | 'sirenSoft'
  | 'win'
  /** Synthesised — see below. */
  | 'ease' | 'halt' | 'warn' | 'deny' | 'signal' | 'horn' | 'thud'
  /** The ambulance's siren, held for the whole beat rather than tapped once. */
  | 'sirenLoop' | 'sirenStop'

export type LoopSfx = 'busy' | 'rain'

// Force HTML5 Audio (not Web Audio + XHR) so the packaged build plays its mp3
// files even when index.html is opened straight from disk (file://), where XHR
// asset fetches are blocked by the browser.
/**
 * The mixer: three child-facing faders over the sound design's own levels.
 *
 * Every Howl remembers the volume it was DESIGNED at (`BASE`), and a fader is
 * a multiplier over that — so pulling "effects" to half never disturbs the
 * balance between a click and a horn, only their share of the room.
 */
const MIX = { ambience: 1, vehicle: 1, fx: 1 }
const BASE = new Map<Howl, number>()

const mk = (src: string, opts: { volume?: number; loop?: boolean } = {}) => {
  const howl = new Howl({ src: [src], html5: true, ...opts })
  BASE.set(howl, opts.volume ?? 1)
  return howl
}

const sfx: Record<Exclude<Sfx, 'ease' | 'halt' | 'warn' | 'deny' | 'signal' | 'horn' | 'thud' | 'sirenLoop' | 'sirenStop'>, Howl> = {
  click: mk(click, { volume: 0.45 }),
  drive: mk(drive, { volume: 0.4 }),
  drop: mk(drop, { volume: 0.6 }),
  fullStop: mk(fullStop, { volume: 0.55 }),
  gasp: mk(gasp, { volume: 0.6 }),
  success: mk(success, { volume: 0.75 }),
  waitClear: mk(waitClear, { volume: 0.6 }),
  sirenSoft: mk(sirenSoft, { volume: 0.38 }),
  win: mk(win, { volume: 0.85 }),
}

/**
 * The siren, looped.
 *
 * For a five-year-old the siren IS the ambulance — it names the vehicle before
 * a single pixel of it does. It used to be a one-shot at 38% volume, fired
 * exactly twice: once as the thing appeared and once as it left. Held for the
 * whole beat, and louder, it does the job the chevrons cannot do at distance.
 */
const siren = mk(sirenSoft, { loop: true, volume: 0.6 })
/** The fade-out's pending stop, so a restart can cancel it. */
let sirenTimer: number | null = null

const ambient = mk(ambientCity, { loop: true, volume: 0.3 })
const loops: Record<LoopSfx, Howl> = {
  busy: mk(busyStreet, { loop: true, volume: 0.22 }),
  rain: mk(rainLoop, { loop: true, volume: 0.24 }),
}

/* ---- Synthesised cues ----------------------------------------------------- */

let audioCtx: AudioContext | null = null
let isMuted = false

function ac(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    if (!audioCtx) audioCtx = new Ctor()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    return audioCtx
  } catch {
    return null
  }
}

interface ToneSpec {
  freq: number
  /** Glide to this frequency across the note. */
  to?: number
  start: number
  dur: number
  gain: number
  type?: OscillatorType
}

function tones(spec: ToneSpec[]) {
  if (isMuted) return
  const ctx = ac()
  if (!ctx) return
  try {
    const now = ctx.currentTime
    const master = ctx.createGain()
    master.gain.value = 0.9 * MIX.fx
    master.connect(ctx.destination)
    for (const note of spec) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = note.type ?? 'sine'
      osc.frequency.setValueAtTime(note.freq, now + note.start)
      if (note.to) osc.frequency.exponentialRampToValueAtTime(note.to, now + note.start + note.dur)
      // Soft attack and release: no clicks, no transient that could read as an impact.
      gain.gain.setValueAtTime(0.0001, now + note.start)
      gain.gain.exponentialRampToValueAtTime(note.gain, now + note.start + Math.min(0.06, note.dur * 0.35))
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.dur)
      osc.connect(gain)
      gain.connect(master)
      osc.start(now + note.start)
      osc.stop(now + note.start + note.dur + 0.02)
    }
  } catch {
    /* audio is an enhancement — never let it break the mission */
  }
}

/** Easing off the accelerator: a gentle downward glide. */
const ease = () => tones([
  { freq: 420, to: 260, start: 0, dur: 0.42, gain: 0.09 },
  { freq: 210, to: 130, start: 0, dur: 0.42, gain: 0.05 },
])

/** Coming to a complete stop: one low, settled note. */
const halt = () => tones([
  { freq: 240, to: 120, start: 0, dur: 0.34, gain: 0.13 },
  { freq: 120, to: 80, start: 0.05, dur: 0.34, gain: 0.08 },
])

/** Sensors have picked something up: two soft mid beeps. */
const warn = () => tones([
  { freq: 740, start: 0, dur: 0.13, gain: 0.09 },
  { freq: 740, start: 0.2, dur: 0.13, gain: 0.09 },
])

/** The policy did not cover this: a soft falling two-note. Not an alarm. */
const deny = () => tones([
  { freq: 392, start: 0, dur: 0.2, gain: 0.1 },
  { freq: 294, start: 0.16, dur: 0.34, gain: 0.1 },
])

/** Indicator, for moving aside. */
const signal = () => tones([
  { freq: 880, start: 0, dur: 0.09, gain: 0.07 },
  { freq: 660, start: 0.28, dur: 0.09, gain: 0.07 },
])

/** A short, warm two-tone horn. */
export function playHorn() {
  tones([
    { freq: 440, start: 0, dur: 0.18, gain: 0.08, type: 'triangle' },
    { freq: 554, start: 0, dur: 0.18, gain: 0.06, type: 'triangle' },
    { freq: 440, start: 0.24, dur: 0.2, gain: 0.08, type: 'triangle' },
    { freq: 554, start: 0.24, dur: 0.2, gain: 0.06, type: 'triangle' },
  ])
}

/**
 * Contact.
 *
 * The sound set was built with no broadband noise in it and that stands: this
 * is not a crash sample. It is a low tonal thump whose pitch falls an octave in
 * a fifth of a second, which reads as "the car hit something" without a
 * nine-year-old hearing breaking glass.
 */
const thud = () => tones([
  { freq: 148, to: 60, start: 0, dur: 0.26, gain: 0.2 },
  { freq: 96, to: 46, start: 0.02, dur: 0.32, gain: 0.14, type: 'triangle' },
  { freq: 300, to: 176, start: 0, dur: 0.1, gain: 0.06, type: 'triangle' },
])

const SYNTH: Partial<Record<Sfx, () => void>> = { ease, halt, warn, deny, signal, horn: playHorn, thud }

export function play(name: Sfx) {
  if (name === 'sirenLoop') {
    // A stop still fading must not silence the loop that just restarted.
    if (sirenTimer !== null) { window.clearTimeout(sirenTimer); sirenTimer = null; siren.volume((BASE.get(siren) ?? 0.6) * MIX.fx) }
    if (!siren.playing()) siren.play()
    return
  }
  if (name === 'sirenStop') {
    if (sirenTimer !== null) window.clearTimeout(sirenTimer)
    siren.fade(siren.volume(), 0, 700)
    sirenTimer = window.setTimeout(() => { sirenTimer = null; siren.stop(); siren.volume((BASE.get(siren) ?? 0.6) * MIX.fx) }, 760)
    return
  }
  const synth = SYNTH[name]
  if (synth) {
    synth()
    return
  }
  sfx[name as keyof typeof sfx]?.play()
}

/** Which fader each Howl sits under. Everything not listed is an effect. */
function categoryOf(howl: Howl): keyof typeof MIX {
  if (howl === ambient || howl === loops.busy || howl === loops.rain) return 'ambience'
  if (howl === siren) return 'fx'
  return 'fx'
}

/** Set the three faders (0..1 each) and apply them to every live sound. */
export function setMixer(mix: { ambience?: number; vehicle?: number; fx?: number }) {
  if (mix.ambience !== undefined) MIX.ambience = mix.ambience
  if (mix.vehicle !== undefined) MIX.vehicle = mix.vehicle
  if (mix.fx !== undefined) MIX.fx = mix.fx
  for (const [howl, base] of BASE) {
    howl.volume(base * MIX[categoryOf(howl)])
  }
}

/**
 * Autoplay policy: a context created outside a user gesture stays suspended
 * on Safari and, after a reload, on Chrome — so the engine, the warn and the
 * thud never sounded until something else happened to poke the context.
 * Called from every real entry gesture (Start, the dev-query boot listener).
 */
export function unlockAudio() {
  const ctx = ac()
  if (ctx && ctx.state === 'suspended') void ctx.resume()
  const howler = (Howler as unknown as { ctx?: AudioContext }).ctx
  if (howler && howler.state === 'suspended') void howler.resume()
}

export function startAmbient() {
  unlockAudio()
  if (!ambient.playing()) ambient.play()
}

export function playLoop(name: LoopSfx) {
  for (const [loopName, sound] of Object.entries(loops)) {
    if (loopName !== name) sound.stop()
  }
  if (!loops[name].playing()) loops[name].play()
}

export function stopLoops() {
  Object.values(loops).forEach((sound) => sound.stop())
  if (sirenTimer !== null) { window.clearTimeout(sirenTimer); sirenTimer = null }
  siren.stop()
  siren.volume((BASE.get(siren) ?? 0.6) * MIX.fx)
}

/** Hidden-tab silence, kept separate from the child's own mute so the two
    compose: coming back to the tab must not un-mute a game that was muted. */
let hiddenMute = false
function applyMute() {
  const muted = isMuted || hiddenMute
  Howler.mute(muted)
  // Howler.mute only covers Howl instances; the engine synth is ours.
  if (muted) setEngine(0)
}

export function setMuted(muted: boolean) {
  isMuted = muted
  applyMute()
}

/**
 * A backgrounded tab goes quiet.
 *
 * Without this the ambient bed, the busy-street loop and a mid-sentence
 * narrator carried on behind whatever the child switched to — in a classroom,
 * that is thirty tabs talking. Sound and speech stop the moment the tab hides
 * and the ambience comes back (at the same mute state) when it returns.
 */
export function installVisibilityGuard(onHidden?: () => void) {
  if (typeof document === 'undefined') return
  document.addEventListener('visibilitychange', () => {
    hiddenMute = document.hidden
    applyMute()
    if (document.hidden) onHidden?.()
  })
}

// ---------------------------------------------------------------------------
// The vehicle's own voice.
//
// A 3D street needs continuous sound, not just event cues: an electric drive
// unit whine, tyre roll, and a bed of city air. All three are synthesised and
// driven by the vehicle's ACTUAL speed each frame, so what you hear is what the
// van is doing — it winds up as it pulls away and falls silent when a rule
// stops it. Still strictly tonal plus filtered noise at low level; nothing here
// can read as a skid or an impact.
// ---------------------------------------------------------------------------

interface Engine {
  whine: OscillatorNode
  sub: OscillatorNode
  whineGain: GainNode
  subGain: GainNode
  rollGain: GainNode
  filter: BiquadFilterNode
}

let engine: Engine | null = null
let engineSpeed = 0

/** One second of soft pink-ish noise, reused as the tyre-roll source. */
function noiseBuffer(ctx: AudioContext) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < data.length; i += 1) {
    // A one-pole lowpass on white noise: no harsh high end, so it reads as
    // tyres on tarmac rather than static.
    const white = Math.random() * 2 - 1
    last = last * 0.92 + white * 0.08
    data[i] = last * 3.2
  }
  return buffer
}

function startEngine() {
  const ctx = ac()
  if (!ctx || engine) return
  try {
    const master = ctx.createGain()
    master.gain.value = 0.55
    master.connect(ctx.destination)

    // Drive-unit whine: two detuned saws an octave apart.
    const whine = ctx.createOscillator()
    whine.type = 'sawtooth'
    whine.frequency.value = 60
    const whineGain = ctx.createGain()
    whineGain.gain.value = 0
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 480
    filter.Q.value = 3
    whine.connect(whineGain); whineGain.connect(filter); filter.connect(master)

    const sub = ctx.createOscillator()
    sub.type = 'triangle'
    sub.frequency.value = 30
    const subGain = ctx.createGain()
    subGain.gain.value = 0
    sub.connect(subGain); subGain.connect(master)

    // Tyre roll.
    const roll = ctx.createBufferSource()
    roll.buffer = noiseBuffer(ctx)
    roll.loop = true
    const rollFilter = ctx.createBiquadFilter()
    rollFilter.type = 'bandpass'
    rollFilter.frequency.value = 320
    rollFilter.Q.value = 0.7
    const rollGain = ctx.createGain()
    rollGain.gain.value = 0
    roll.connect(rollFilter); rollFilter.connect(rollGain); rollGain.connect(master)

    whine.start(); sub.start(); roll.start()
    engine = { whine, sub, whineGain, subGain, rollGain, filter }
  } catch {
    /* audio is an enhancement */
  }
}

/**
 * Feed the synth the vehicle's speed in metres per second. Called every frame
 * by the 3D stage; safe to call with 0 to fall silent.
 */
export function setEngine(metresPerSecond: number) {
  // Fed at ten hertz by the stage; ignore changes the ear cannot hear rather
  // than schedule six ramps for them.
  if (engine && Math.abs(metresPerSecond - engineSpeed) < 0.05 && metresPerSecond > 0.01) return
  engineSpeed = metresPerSecond
  if (isMuted || hiddenMute) {
    if (engine) {
      engine.whineGain.gain.value = 0
      engine.subGain.gain.value = 0
      engine.rollGain.gain.value = 0
    }
    return
  }
  if (!engine) {
    if (metresPerSecond <= 0.01) return
    startEngine()
    if (!engine) return
  }
  const ctx = ac()
  if (!ctx) return
  const now = ctx.currentTime
  const speed = Math.min(metresPerSecond, 16)
  const norm = speed / 16
  // Short ramps rather than direct assignment: stepping a gain every frame
  // would click audibly.
  // Anchored ramps: a ramp with no start point is measured from the LAST
  // scheduled event, which after a cancel can be seconds old — an audible jump.
  const ramp = (param: AudioParam, value: number) => {
    const p = param as AudioParam & { cancelAndHoldAtTime?: (t: number) => void }
    if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now)
    else { const cur = param.value; param.cancelScheduledValues(now); param.setValueAtTime(cur, now) }
    param.linearRampToValueAtTime(value, now + 0.08)
  }
  ramp(engine.whine.frequency, 58 + norm * 210)
  ramp(engine.sub.frequency, 28 + norm * 42)
  ramp(engine.filter.frequency, 420 + norm * 1500)
  const v = MIX.vehicle
  ramp(engine.whineGain.gain, norm > 0.01 ? (0.012 + norm * 0.05) * v : 0)
  ramp(engine.subGain.gain, norm > 0.01 ? (0.02 + norm * 0.05) * v : 0)
  ramp(engine.rollGain.gain, norm > 0.02 ? (0.008 + norm * 0.05) * v : 0)
}

/** Current speed, exposed so the HUD can show it. */
export function engineSpeedNow() {
  return engineSpeed
}

