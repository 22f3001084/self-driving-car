import { create } from 'zustand'
import { useGame } from './store'
import type { Rule } from './sim'

/* ==========================================================================
   LOCAL SAVE — a classroom period rarely survives in one sitting.

   Everything a crew has earned — their names, the car's name, the sensors
   they fitted, every rule in the policy, every level and patrol cleared —
   is written to localStorage a moment after it changes, and offered back on
   the title screen as CONTINUE MISSION. Nothing leaves the machine: no
   account, no server, no network.

   Two hard rules keep this safe:

   VERSIONED. The blob carries a version number, and any blob that is not
   exactly the current version, or that fails shape-checking, is discarded
   whole. A corrupted save must never wedge the game — the worst outcome of
   bad data is a fresh start.

   INERT UNDER TEST. Dev query strings (?phase=…, ?rules=…) exist so the
   e2e suite and the measurement harnesses can open any screen in one step,
   pre-seeded. A save loading underneath one of those would make every test
   depend on the one before it — so when ANY query parameter is present the
   save neither loads nor writes, unless the parameter is `persist=1`, which
   is how the persistence spec opts back in.
   ========================================================================== */

const KEY = 'northline-save'
const VERSION = 1

interface SaveBlob {
  version: number
  mode: 'solo' | 'crew'
  crew: string[]
  vehicleName: string
  sensors: 'front' | 'frontSide' | 'allRound'
  rules: Rule[]
  passed: Record<string, boolean>
  retries: Record<string, number>
  reflectAnswers: (string | null)[]
  muted: boolean
  narration: boolean
}

/** True when dev/test query params should keep the save out of the way. */
function inertUnderQuery(): boolean {
  try {
    const query = new URLSearchParams(location.search)
    if (query.get('persist') === '1') return false
    return [...query.keys()].length > 0
  } catch {
    return false
  }
}

function readBlob(): SaveBlob | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const blob = JSON.parse(raw) as SaveBlob
    if (blob?.version !== VERSION) return null
    if (!Array.isArray(blob.rules) || !Array.isArray(blob.crew)) return null
    if (typeof blob.vehicleName !== 'string') return null
    // Every rule must have the shape the engine expects; one bad rule
    // discards the save rather than poisoning the policy.
    for (const rule of blob.rules) {
      if (typeof rule?.id !== 'string') return null
      if (!Array.isArray(rule.conditions) || !Array.isArray(rule.actions)) return null
    }
    return blob
  } catch {
    return null
  }
}

/** Is there a mission worth continuing? (Read-only; safe to call anywhere.) */
export function hasSave(): boolean {
  if (inertUnderQuery()) return false
  const blob = readBlob()
  if (!blob) return false
  return blob.rules.length > 0 || Object.values(blob.passed ?? {}).some(Boolean)
}

export function clearSave() {
  try { localStorage.removeItem(KEY) } catch { /* storage may be blocked */ }
}

/**
 * Load the save into the store (if allowed and present) and start writing
 * changes back. Call once, from main.tsx, before the first render.
 */
export function installPersistence() {
  if (inertUnderQuery()) return

  const blob = readBlob()
  if (blob) {
    useGame.setState({
      mode: blob.mode === 'solo' ? 'solo' : 'crew',
      crew: blob.crew.map((name) => String(name).slice(0, 14)),
      vehicleName: blob.vehicleName.slice(0, 12) || 'NV-1',
      sensors: ['front', 'frontSide', 'allRound'].includes(blob.sensors) ? blob.sensors : 'front',
      rules: blob.rules,
      passed: blob.passed ?? {},
      retries: blob.retries ?? {},
      reflectAnswers: Array.isArray(blob.reflectAnswers) ? blob.reflectAnswers : [null, null],
      muted: Boolean(blob.muted),
      narration: blob.narration !== false,
    })
  }

  // Debounced write-behind: the store changes many times per second while the
  // car drives (savedPulse, runResult…), and none of that belongs on disk.
  let timer = 0
  useGame.subscribe((state) => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      const save: SaveBlob = {
        version: VERSION,
        mode: state.mode,
        crew: state.crew,
        vehicleName: state.vehicleName,
        sensors: state.sensors,
        rules: state.rules,
        passed: state.passed as Record<string, boolean>,
        retries: state.retries as Record<string, number>,
        reflectAnswers: state.reflectAnswers,
        muted: state.muted,
        narration: state.narration,
      }
      try { localStorage.setItem(KEY, JSON.stringify(save)) } catch { /* full or blocked */ }
    }, 350)
  })
}

/* ==========================================================================
   SETTINGS — the machine's knobs, separate from the mission's progress.

   Volumes, reduced motion and the graphics tier belong to the DEVICE, not to
   the crew: a school laptop that needs low graphics needs it for every class
   that sits at it. So they live under their own key, survive "Restart the
   mission", and are read synchronously at import time so the first frame is
   already right.
   ========================================================================== */

const SETTINGS_KEY = 'northline-settings'

export interface AppSettings {
  /** 0..1 multipliers over the sound design's own levels. */
  volAmbience: number
  volVehicle: number
  volFx: number
  /** No camera shake, no card bob, no pulsing chrome. */
  reducedMotion: boolean
  /** Shadows and bloom off, pixel ratio capped at 1. */
  lowGfx: boolean
}

interface SettingsStore extends AppSettings {
  set: (patch: Partial<AppSettings>) => void
}

function readSettings(): AppSettings {
  const fallback: AppSettings = {
    volAmbience: 1, volVehicle: 1, volFx: 1,
    reducedMotion: typeof matchMedia !== 'undefined'
      && matchMedia('(prefers-reduced-motion: reduce)').matches,
    lowGfx: false,
  }
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return fallback
    const blob = JSON.parse(raw) as Partial<AppSettings>
    const clamp01 = (v: unknown, fb: number) =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fb
    return {
      volAmbience: clamp01(blob.volAmbience, fallback.volAmbience),
      volVehicle: clamp01(blob.volVehicle, fallback.volVehicle),
      volFx: clamp01(blob.volFx, fallback.volFx),
      reducedMotion: typeof blob.reducedMotion === 'boolean' ? blob.reducedMotion : fallback.reducedMotion,
      lowGfx: typeof blob.lowGfx === 'boolean' ? blob.lowGfx : fallback.lowGfx,
    }
  } catch {
    return fallback
  }
}

export const useSettings = create<SettingsStore>((set) => ({
  ...readSettings(),
  set: (patch) => set((state) => {
    const next = { ...state, ...patch }
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        volAmbience: next.volAmbience,
        volVehicle: next.volVehicle,
        volFx: next.volFx,
        reducedMotion: next.reducedMotion,
        lowGfx: next.lowGfx,
      }))
    } catch { /* storage may be blocked */ }
    return next
  }),
}))
