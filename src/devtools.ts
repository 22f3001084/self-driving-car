// Dev-only helpers. Never imported by the production bundle.
//
// `?phase=play&level=l2&rules=base` jumps straight to a screen with the crew,
// vehicle and policy already filled in, so a screen can be opened and inspected
// in one step instead of being clicked through every time.

import { MotionGlobalConfig } from 'framer-motion'
import { useGame, type Phase } from './store'
import type { ChallengeId, Rule } from './sim'

const rule = (id: string, conditions: string[], actions: string[]): Rule => ({
  id,
  conditions: conditions.map((token, index) => ({ token, ...(index > 0 ? { join: 'OR' as const } : {}) })),
  actions: actions.map((token, index) => ({ token, ...(index > 0 ? { join: 'AND' as const } : {}) })),
})

const PRESETS: Record<string, Rule[]> = {
  // A broad MOVING rule ABOVE the specific crossing rule: the order-problem
  // fixture the reorder spec needs.
  broadfirst: [
    rule('b1', ['MOVING'], ['FULLSTOP']),
    rule('b2', ['MANY_MOVING'], ['WAIT_CLEAR']),
  ],
  base: [
    rule('d1', ['SCOOTER'], ['SLOW']),
    rule('d2', ['NARROW'], ['SLOW']),
    rule('d3', ['ARRIVED'], ['DELIVER']),
  ],
  two: [
    rule('d1', ['SCOOTER'], ['SLOW']),
    rule('d2', ['NARROW'], ['SLOW']),
  ],
  // Solves all seven advanced patrols, so each one's whole run — including
  // the completion path back to the grid — can be exercised headlessly.
  patrol: [
    rule('p1', ['MANY_MOVING'], ['WAIT_CLEAR']),
    rule('p2', ['ROAD_WET'], ['SLOW_EARLY']),
    rule('p3', ['EMERGENCY_BEHIND'], ['MOVE_ASIDE', 'STOP_SAFE']),
    rule('p4', ['CYCLIST'], ['SLOW']),
    rule('p5', ['DOG'], ['FULLSTOP', 'HONK']),
    rule('p6', ['ROAD_BLOCKED'], ['HONK']),
    rule('p7', ['FOG'], ['SLOW_EARLY', 'HONK']),
  ],
  // Solves the whole delivery run: one rule per hazard on it.
  delivery: [
    rule('v1', ['SCOOTER'], ['SLOW']),
    rule('v2', ['MANY_MOVING'], ['WAIT_CLEAR']),
    rule('v3', ['NARROW'], ['SLOW']),
    rule('v7', ['ARRIVED'], ['DELIVER']),
  ],
  full: [
    rule('d1', ['SCOOTER'], ['SLOW']),
    rule('d2', ['NARROW'], ['SLOW']),
    rule('d3', ['ARRIVED'], ['DELIVER']),
    rule('d4', ['MOVING'], ['FULLSTOP']),
  ],
  // A deliberately overfull policy. A crew that works through the patrols ends
  // up with a dozen rules or more, and every list, scan panel and report that
  // shows them has to survive that — which is exactly what `?rules=many` is
  // for. Nothing else can reach this state in one click.
  many: [
    rule('m1', ['SCOOTER'], ['SLOW']),
    rule('m2', ['NARROW'], ['SLOW', 'LEAVE_SPACE']),
    rule('m3', ['MOVING'], ['FULLSTOP']),
    rule('m4', ['MANY_MOVING'], ['WAIT_CLEAR']),
    rule('m5', ['ROAD_WET'], ['SLOW_EARLY', 'LEAVE_SPACE']),
    rule('m6', ['EMERGENCY_BEHIND'], ['MOVE_ASIDE', 'STOP_SAFE']),
    rule('m7', ['CYCLIST'], ['SLOW', 'LEAVE_SPACE']),
    rule('m8', ['DOG'], ['FULLSTOP', 'HONK']),
    rule('m9', ['ROAD_BLOCKED'], ['HONK']),
    rule('m10', ['FOG'], ['SLOW_EARLY', 'HONK']),
    rule('m11', ['MOVING', 'MANY_MOVING'], ['WAIT_CLEAR', 'HONK']),
    rule('m12', ['DEAD_END'], ['TURN']),
    rule('m13', ['ARRIVED'], ['DELIVER']),
  ],
}

/** Dev-only: `?go=1` starts an act without waiting for its briefing. */
export function skipBriefing() {
  return import.meta.env.DEV && new URLSearchParams(location.search).has('go')
}

/** Dev-only: `?editor=1` opens the rule editor straight away, for screenshots. */
export function openEditorOnLoad() {
  return import.meta.env.DEV && new URLSearchParams(location.search).has('editor')
}

export function applyDevQuery() {
  const query = new URLSearchParams(location.search)
  // The store, for layout audits that need a state no query string describes.
  // Dev only: this whole module drops out of the production bundle.
  ;(window as unknown as { __game?: typeof useGame }).__game = useGame
  if (query.has('noanim')) MotionGlobalConfig.skipAnimations = true

  const phase = query.get('phase') as Phase | null
  if (!phase) return
  const level = query.get('level') as ChallengeId | null

  const preset = query.get('rules')
  useGame.setState({
    phase,
    startedAt: Date.now(),
    vehicleName: 'NV-1',
    sensors: query.get('sensors') === 'side' ? 'frontSide' : 'front',
    rules: preset ? PRESETS[preset] ?? [] : [],
    reflectAnswers: query.has('answered') ? ['a1', 'b1'] : [null, null],
    patrolId: (query.get('patrol') as ChallengeId | null) ?? null,
    mode: query.get('mode') === 'solo' ? 'solo' : 'crew',
    // `?crew=2` / `?crew=4` seed the crew SIZE as well as the names, so a dev
    // URL lands in exactly the state a crew of that size would be in.
    crew: query.get('mode') === 'solo' ? ['Aarav']
      : query.get('crew') === '4' ? ['Aarav', 'Diya', 'Kabir', 'Zara']
      : query.get('crew') === '2' ? ['Aarav', 'Diya', '', '']
      : ['Aarav', 'Diya', 'Kabir', ''],
    crewCount: query.get('crew') === '4' ? 4 : query.get('crew') === '2' ? 2 : 3,
    levelId: level ?? 'l1',
    // `?cleared=all` also walks every patrol, which is the only way to reach
    // the delivery run without playing the whole hour.
    passed: query.get('cleared') === 'all'
      ? { l1: true, l2: true, l3: true, l4: true,
          busy: true, rain: true, emergency: true, cyclist: true,
          dog: true, horn: true, fog: true, uturn: true }
      : query.has('cleared') ? { l1: true, l2: true, l3: true, l4: true } : {},
  })
}
