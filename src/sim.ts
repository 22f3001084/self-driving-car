// Deterministic street simulation.
//
// The vehicle walks the route waypoint by waypoint. At every waypoint it reads
// the crew's policy from the top and fires the FIRST rule whose condition
// matches. If nothing matches it falls back to the first rule that carries an
// ELSE branch — that is the crew's default behaviour. If there is no default
// either, the vehicle has no instruction and the run stops there.

export type ChallengeId =
  /** The four levels of the mission. */
  | 'l1' | 'l2' | 'l3' | 'l4'
  /** Kept for the whole-route evaluator used by the report and the tests. */
  | 'create' | 'iterate'
  | 'busy' | 'rain' | 'emergency' | 'cyclist' | 'dog' | 'horn' | 'fog' | 'uturn'
  /** The finale: depot to the clinic in one go, on the finished policy. */
  | 'delivery'
export type Scenario = ChallengeId
export type ChallengeRating = 'safe' | 'safer' | 'best'

export type EventToken =
  | 'SCOOTER'
  | 'NARROW'
  | 'ARRIVED'
  | 'MOVING'
  | 'MANY_MOVING'
  | 'ROAD_WET'
  | 'EMERGENCY_BEHIND'
  | 'CYCLIST'
  | 'DOG'
  | 'ROAD_BLOCKED'
  | 'FOG'
  | 'DEAD_END'

export type Outcome =
  | 'success'
  | 'failScooter'
  | 'failNarrow'
  | 'failArrived'
  | 'failMoving'
  | 'failBusy'
  | 'failRain'
  | 'failEmergency'
  | 'failCyclist'
  | 'failDog'
  | 'failHorn'
  | 'failFog'
  | 'failDeadEnd'
  | 'failRuleOrder'

export interface RuleCondition {
  token: string
  join?: 'OR'
}

export interface RuleAction {
  token: string
  join?: 'AND'
}

export interface Rule {
  id: string
  conditions: RuleCondition[]
  actions: RuleAction[]
  elseActions?: RuleAction[]
}

export interface Waypoint {
  id: string
  trigger: EventToken
  x: number
}

export interface RunStep {
  trigger: EventToken
  actions: string[]
  x: number
  ruleId: string | null
  /** True when the step was handled by a rule's ELSE branch, not its condition. */
  viaElse?: boolean
  rating?: ChallengeRating
}

export interface RunOutcome {
  outcome: Outcome
  steps: RunStep[]
  hintKey: string | null
  failedAt: EventToken | null
  rating?: ChallengeRating
  highlightedRuleIds: string[]
}

const DECOY_ACTIONS = new Set(['TURN', 'SPEEDUP', 'HONK', 'NORMAL_SPEED', 'RACE_AHEAD'])

const ROUTES: Record<Scenario, Waypoint[]> = {
  // x is a fraction of the whole street, which spans several screens, so the
  // hazards sit far apart instead of crowding one frame. Each level drives a
  // short stretch of it; the last level drives the lot.
  l1: [{ id: 'l1-scooter', trigger: 'SCOOTER', x: 0.17 }],
  l2: [{ id: 'l2-narrow', trigger: 'NARROW', x: 0.41 }],
  // Level 3 is the Create-stage verification run: the brief asks the crew to
  // "test the plan once against the two known obstacles" before Iterate, so the
  // whole closed road is driven and only the delivery gate is new.
  l3: [
    { id: 'l3-scooter', trigger: 'SCOOTER', x: 0.17 },
    { id: 'l3-narrow', trigger: 'NARROW', x: 0.41 },
    { id: 'l3-arrived', trigger: 'ARRIVED', x: 0.89 },
  ],
  /*
   * The crossing comes BEFORE the closed road, not after it.
   *
   * It used to be scooter, closed road, crossing, clinic — and the crossing was
   * unreachable. The closed road's barrier wall stands sixteen metres past its
   * placement point and the manoeuvre through it needs a twenty-metre run-up, so
   * that one hazard owns nearly forty metres of a hundred-and-five metre street;
   * the crossing's stop mark landed twenty-seven metres BEHIND where the gate
   * manoeuvre finished. The car drove straight past the crossing, the reveal
   * played a child crossing the road a hundred metres behind it, and the run
   * ended with the car parked against the end of the world.
   *
   * Swapping them also happens to be the better lesson order: something that
   * MOVES is the harder idea, and it now comes before the precision one.
   * `scripts/probe-route.mjs` guards the arithmetic.
   */
  l4: [
    { id: 'l4-scooter', trigger: 'SCOOTER', x: 0.17 },
    { id: 'l4-moving', trigger: 'MOVING', x: 0.4 },
    { id: 'l4-narrow', trigger: 'NARROW', x: 0.62 },
    { id: 'l4-arrived', trigger: 'ARRIVED', x: 0.92 },
  ],
  create: [
    { id: 'c-scooter', trigger: 'SCOOTER', x: 0.17 },
    { id: 'c-narrow', trigger: 'NARROW', x: 0.4 },
    { id: 'c-arrived', trigger: 'ARRIVED', x: 0.9 },
  ],
  iterate: [
    { id: 'i-scooter', trigger: 'SCOOTER', x: 0.17 },
    { id: 'i-moving', trigger: 'MOVING', x: 0.4 },
    { id: 'i-narrow', trigger: 'NARROW', x: 0.62 },
    { id: 'i-arrived', trigger: 'ARRIVED', x: 0.92 },
  ],
  /* The seven advanced patrols are the edge cases a real autonomous vehicle
     has to survive, and each one gets its own place along Fenner Street.
     They all used to sit at 0.45, which made seven different problems look
     like one scene redressed seven times. */
  busy: [{ id: 'p-busy', trigger: 'MANY_MOVING', x: 0.22 }],
  rain: [{ id: 'p-rain', trigger: 'ROAD_WET', x: 0.34 }],
  emergency: [{ id: 'p-emg', trigger: 'EMERGENCY_BEHIND', x: 0.46 }],
  cyclist: [{ id: 'p-cyc', trigger: 'CYCLIST', x: 0.57 }],
  dog: [{ id: 'p-dog', trigger: 'DOG', x: 0.67 }],
  horn: [{ id: 'p-blk', trigger: 'ROAD_BLOCKED', x: 0.78 }],
  fog: [{ id: 'p-fog', trigger: 'FOG', x: 0.88 }],
  uturn: [{ id: 'p-deadend', trigger: 'DEAD_END', x: 0.5 }],
  /*
   * THE DELIVERY RUN — the whole street, every kind of trouble the crew has
   * written a rule for, in one drive.
   *
   * The spacing is the constraint, not the list. The closed road's gate
   * manoeuvre alone needs about a fifth of the street, so hazards cannot be
   * packed tighter than roughly 0.14 apart without the car reaching one mark
   * before it has finished the manoeuvre for the last — which the route probe
   * counts as a mark left behind. Seven stops at 0.14 is what the street will
   * carry, so the run takes one hazard from each family the crew has met:
   * something parked, a crowd, a squeeze, something moving, a rider, weather,
   * and the delivery itself.
   */
  delivery: [
    { id: 'd-scooter', trigger: 'SCOOTER', x: 0.06 },
    { id: 'd-crowd', trigger: 'MANY_MOVING', x: 0.32 },
    { id: 'd-narrow', trigger: 'NARROW', x: 0.6 },
    { id: 'd-arrived', trigger: 'ARRIVED', x: 0.94 },
  ],
}

export function waypointsFor(scenario: Scenario): Waypoint[] {
  return ROUTES[scenario]
}

/** Strip empty slots and re-derive the AND / OR joins from position. */
export function normalizeRule(rule: Rule): Rule {
  const conditions = rule.conditions
    .filter((item) => item.token)
    .map((item, index) => ({ token: item.token, ...(index > 0 ? { join: 'OR' as const } : {}) }))
  const actions = rule.actions
    .filter((item) => item.token)
    .map((item, index) => ({ token: item.token, ...(index > 0 ? { join: 'AND' as const } : {}) }))
  const elseActions = rule.elseActions?.filter((item) => item.token).map((item) => ({ token: item.token }))
  return {
    id: rule.id,
    conditions: conditions.length ? conditions : [{ token: '' }],
    actions,
    ...(elseActions?.length ? { elseActions } : {}),
  }
}

// MOVING is deliberately broad: a crowded crossing and an approaching emergency
// vehicle are both "something moving". A more specific rule has to sit above it,
// which is what makes rule ORDER visible in the advanced patrols.
export function conditionMatches(token: string, event: EventToken): boolean {
  if (!token) return false
  if (token === event) return true
  return token === 'MOVING' && (event === 'MANY_MOVING' || event === 'EMERGENCY_BEHIND')
}

function ruleMatches(rule: Rule, event: EventToken): boolean {
  return rule.conditions.some((condition) => conditionMatches(condition.token, event))
}

interface StepEvaluation {
  ok: boolean
  hintKey: string | null
  rating?: ChallengeRating
}

function evaluateActions(event: EventToken, actions: string[]): StepEvaluation {
  const has = (token: string) => actions.includes(token)
  // A horn is a real answer when the obstacle can hear it; everywhere else it is
  // noise, and noise is not a safety response.
  const honkIsValid = event === 'ROAD_BLOCKED' || event === 'FOG' || event === 'CYCLIST' || event === 'DOG'
  const turnIsValid = event === 'DEAD_END'
  const decoyPresent = actions.some((token) =>
    DECOY_ACTIONS.has(token)
    && !(token === 'HONK' && honkIsValid)
    && !(token === 'TURN' && turnIsValid))
  if (decoyPresent) {
    if (has('SPEEDUP')) return { ok: false, hintKey: 'decoySpeed' }
    if (has('TURN')) return { ok: false, hintKey: 'decoyTurn' }
    if (event === 'MANY_MOVING' && has('HONK')) return { ok: false, hintKey: 'busyHonk' }
    if (event === 'ROAD_WET' && has('NORMAL_SPEED')) return { ok: false, hintKey: 'rainNormal' }
    if (event === 'EMERGENCY_BEHIND' && has('RACE_AHEAD')) return { ok: false, hintKey: 'emergencyRace' }
    return { ok: false, hintKey: 'decoy' }
  }

  switch (event) {
    case 'SCOOTER':
      return { ok: has('SLOW'), hintKey: has('SLOW') ? null : 'failScooter' }
    case 'NARROW':
      return { ok: has('SLOW'), hintKey: has('SLOW') ? null : 'failNarrow' }
    case 'ARRIVED':
      return { ok: has('DELIVER'), hintKey: has('DELIVER') ? null : 'failArrived' }
    case 'MOVING':
      return { ok: has('FULLSTOP'), hintKey: has('SLOW') ? 'movingSlowNotStop' : 'failMoving' }
    case 'MANY_MOVING':
      return { ok: has('WAIT_CLEAR'), hintKey: has('FULLSTOP') ? 'busyStop' : has('SLOW') ? 'busySlow' : 'busyNoRule' }
    case 'ROAD_WET': {
      const safeCount = Number(has('SLOW_EARLY')) + Number(has('LEAVE_SPACE'))
      if (safeCount === 0) return { ok: false, hintKey: 'rainNoRule' }
      return { ok: true, hintKey: null, rating: safeCount === 2 ? 'best' : 'safer' }
    }
    case 'EMERGENCY_BEHIND':
      if (has('MOVE_ASIDE') && has('STOP_SAFE')) return { ok: true, hintKey: null }
      if (has('MOVE_ASIDE')) return { ok: false, hintKey: 'emergencyMoveOnly' }
      if (has('STOP_SAFE')) return { ok: false, hintKey: 'emergencyMiddle' }
      return { ok: false, hintKey: 'emergencyNoRule' }
    case 'CYCLIST':
      return { ok: has('SLOW') || has('LEAVE_SPACE'), hintKey: 'cyclistNoRule' }
    case 'DOG':
      if (has('FULLSTOP') && has('HONK')) return { ok: true, hintKey: null }
      if (has('FULLSTOP')) return { ok: false, hintKey: 'dogHonk' }
      if (has('SLOW')) return { ok: false, hintKey: 'dogSlow' }
      return { ok: false, hintKey: 'dogNoRule' }
    case 'ROAD_BLOCKED':
      return { ok: has('HONK'), hintKey: 'hornNoRule' }
    case 'FOG':
      if (has('SLOW_EARLY') && has('HONK')) return { ok: true, hintKey: null }
      if (has('SLOW_EARLY')) return { ok: false, hintKey: 'fogHonk' }
      return { ok: false, hintKey: 'fogNoRule' }
    case 'DEAD_END':
      if (has('TURN')) return { ok: true, hintKey: null }
      if (has('WAIT_CLEAR')) return { ok: false, hintKey: 'deadEndWait' }
      return { ok: false, hintKey: 'deadEndNoRule' }
  }
}

const MISSING_HINT: Record<EventToken, string> = {
  SCOOTER: 'noRuleScooter',
  NARROW: 'noRuleNarrow',
  ARRIVED: 'noRuleArrived',
  MOVING: 'failMoving',
  MANY_MOVING: 'busyNoRule',
  ROAD_WET: 'rainNoRule',
  EMERGENCY_BEHIND: 'emergencyNoRule',
  CYCLIST: 'cyclistNoRule',
  DOG: 'dogNoRule',
  ROAD_BLOCKED: 'hornNoRule',
  FOG: 'fogNoRule',
  DEAD_END: 'deadEndNoRule',
}

const FAILURE_FOR: Record<EventToken, Outcome> = {
  SCOOTER: 'failScooter',
  NARROW: 'failNarrow',
  ARRIVED: 'failArrived',
  MOVING: 'failMoving',
  MANY_MOVING: 'failBusy',
  ROAD_WET: 'failRain',
  EMERGENCY_BEHIND: 'failEmergency',
  CYCLIST: 'failCyclist',
  DOG: 'failDog',
  ROAD_BLOCKED: 'failHorn',
  FOG: 'failFog',
  DEAD_END: 'failDeadEnd',
}

export function evaluateRun(inputRules: readonly Rule[], scenario: Scenario): RunOutcome {
  const rules = inputRules.map(normalizeRule)
  const steps: RunStep[] = []

  for (const waypoint of waypointsFor(scenario)) {
    const matched = rules.find((rule) => ruleMatches(rule, waypoint.trigger))
    const fallback = matched ? undefined : rules.find((rule) => rule.elseActions?.length)
    const fired = matched ?? fallback
    const actions = (matched ? matched.actions : fallback?.elseActions ?? []).map((action) => action.token)

    if (!fired || actions.length === 0) {
      steps.push({ trigger: waypoint.trigger, actions: [], x: waypoint.x, ruleId: null })
      return {
        outcome: FAILURE_FOR[waypoint.trigger],
        steps,
        hintKey: MISSING_HINT[waypoint.trigger],
        failedAt: waypoint.trigger,
        highlightedRuleIds: [],
      }
    }

    // A broad rule caught an event that has its own, more specific rule further
    // down the list: the policy is right, the ORDER is wrong.
    const usedBroadRule = matched
      ? !matched.conditions.some((condition) => condition.token === waypoint.trigger)
      : false
    if (
      usedBroadRule &&
      rules.some((rule) => rule.conditions.some((condition) => condition.token === waypoint.trigger))
    ) {
      steps.push({ trigger: waypoint.trigger, actions, x: waypoint.x, ruleId: fired.id })
      return {
        outcome: 'failRuleOrder',
        steps,
        hintKey: 'ruleOrder',
        failedAt: waypoint.trigger,
        highlightedRuleIds: [fired.id],
      }
    }

    const evaluation = evaluateActions(waypoint.trigger, actions)
    steps.push({
      trigger: waypoint.trigger,
      actions,
      x: waypoint.x,
      ruleId: fired.id,
      ...(matched ? {} : { viaElse: true }),
      ...(evaluation.rating ? { rating: evaluation.rating } : {}),
    })

    if (!evaluation.ok) {
      return {
        outcome: FAILURE_FOR[waypoint.trigger],
        steps,
        hintKey: evaluation.hintKey,
        failedAt: waypoint.trigger,
        highlightedRuleIds: [fired.id],
      }
    }
  }

  const rating = steps.find((step) => step.rating)?.rating
  return {
    outcome: 'success',
    steps,
    hintKey: null,
    failedAt: null,
    ...(rating ? { rating } : {}),
    highlightedRuleIds: [],
  }
}

/* ---- One obstacle at a time -------------------------------------------------
   The run is not all-or-nothing any more: the vehicle drives to each hazard,
   stops, and the policy is judged for THAT hazard alone. `evaluateAt` is the
   single-waypoint version of `evaluateRun`, which is still used for the report
   and for the advanced patrols.
   -------------------------------------------------------------------------- */

/** What the top-down scan did to one rule. */
export type ScanStatus = 'miss' | 'fired' | 'else' | 'unreached'

export interface ScanRow {
  ruleId: string
  status: ScanStatus
}

export interface StepCheck {
  ok: boolean
  actions: string[]
  ruleId: string | null
  viaElse: boolean
  /** A broad rule intercepted a hazard that has its own, more specific rule. */
  orderProblem: boolean
  hintKey: string | null
  /** The scan, rule by rule in priority order — this is what the screen plays. */
  trace: ScanRow[]
}

export function evaluateAt(inputRules: readonly Rule[], trigger: EventToken): StepCheck {
  const rules = inputRules.map(normalizeRule)
  const matched = rules.find((rule) => ruleMatches(rule, trigger))
  const fallback = matched ? undefined : rules.find((rule) => rule.elseActions?.length)
  const fired = matched ?? fallback
  const actions = (matched ? matched.actions : fallback?.elseActions ?? []).map((action) => action.token)

  // The scan, exactly as the vehicle performed it: every rule above the one
  // that fired was tested and missed; everything below was never looked at.
  const firedIndex = fired ? rules.findIndex((rule) => rule.id === fired.id) : rules.length
  const trace: ScanRow[] = rules.map((rule, index) => ({
    ruleId: rule.id,
    status: index < firedIndex ? 'miss'
      : index > firedIndex ? 'unreached'
        : matched ? 'fired' : 'else',
  }))

  if (!fired || actions.length === 0) {
    return { ok: false, actions: [], ruleId: null, viaElse: false, orderProblem: false, hintKey: MISSING_HINT[trigger], trace }
  }

  const usedBroadRule = matched
    ? !matched.conditions.some((condition) => condition.token === trigger)
    : false
  if (usedBroadRule && rules.some((rule) => rule.conditions.some((condition) => condition.token === trigger))) {
    return { ok: false, actions, ruleId: fired.id, viaElse: false, orderProblem: true, hintKey: 'ruleOrder', trace }
  }

  const evaluation = evaluateActions(trigger, actions)
  return {
    ok: evaluation.ok,
    actions,
    ruleId: fired.id,
    viaElse: !matched,
    orderProblem: false,
    // A BROAD rule (MOVING) caught a specific situation (the crossing) and its
    // action was not enough: the lesson is that this situation needs its own
    // rule above it, not that the action was random.
    hintKey: usedBroadRule && !evaluation.ok ? 'broadCaught' : evaluation.hintKey,
    trace,
  }
}
