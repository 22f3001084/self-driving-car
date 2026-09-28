import { create } from 'zustand'
import { conditionMatches, evaluateRun, normalizeRule, type ChallengeId, type EventToken, type Rule, type RunOutcome, type Scenario } from './sim'
import { MISSIONS, PATROLS, type MissionId } from './content'
import { canStartPart, driverAt, type TurnOwner } from './campaign'

export type Phase =
  | 'title'
  | 'mode'
  | 'design'
  | 'tutorial'
  | 'levels'
  | 'play'
  | 'reflect'
  | 'report'
  | 'patrols'

/** The fixed spine of the mission. Drives Back / Next and the progress bar.
 *  The programming activity is the SECOND thing the student sees — the brief,
 *  the character and the vehicle name all live inside Act 1's opening popup
 *  rather than on screens of their own. */
// The sign-off review ('reflect') is out of the mission flow — after the live
// road test the report comes straight up. The seating picker ('mode') is out
// too while solo is parked: Start goes title → design as a crew of three.
// Both phases stay valid for the dev query string.
// The tutorial sits between naming the crew/car and the journey board: one
// walk through the situation loop before the first situation arises.
export const PHASE_ORDER: Phase[] = ['title', 'design', 'tutorial', 'levels', 'report']



/** Four seats on the board's chip band — the crew array is always this long
 *  and `crewCount` says how many of them are playing. */
export const CREW_SIZE = 4

/** How many players a crew may have. Twelve deciding stops divide exactly by
 *  every one of them: 6 each, 4 each, 3 each. */
export const CREW_CHOICES = [2, 3, 4] as const

export interface Draft {
  id: string
  conditions: { token: string }[]
  actions: { token: string }[]
  elseActions: { token: string }[]
}

/**
 * What the car is allowed to see.
 *
 * `allRound` exists for one lesson: an ambulance comes up BEHIND the car, and a
 * vehicle that only looks forward cannot have a rule about it because it never
 * detects it. The child chooses the package, watches the front-only car miss the
 * ambulance entirely, and adds the rear sensor themselves.
 */
export type SensorPackage = 'front' | 'frontSide' | 'allRound'

/** Which hazards a package can actually detect. */
export const SENSES_BEHIND: Record<SensorPackage, boolean> = {
  front: false,
  frontSide: false,
  allRound: true,
}

/** How the mission is seated: one student, or a crew of three. */
export type Mode = 'solo' | 'crew'

interface MissionSession { rules: Rule[]; sensors: SensorPackage }

/** Supplied examples let a child choose any game without skipping its lesson. */
export function starterRules(missionId: MissionId): Rule[] {
  const examples = missionId === 'closed' ? [] : [
    ['SCOOTER', 'SLOW'], ['NARROW', 'SLOW'], ['ARRIVED', 'DELIVER'],
    ...(missionId === 'patrols' ? [['MOVING', 'FULLSTOP']] : []),
  ]
  return examples.map(([condition, action]) => ({
    id: `starter-${missionId}-${condition}`,
    conditions: [{ token: condition }], actions: [{ token: action }],
  }))
}

interface GameState {
  phase: Phase
  mode: Mode
  startedAt: number | null
  crew: string[]
  /** How many of the four seats are in play. The player picks this. */
  crewCount: number
  /** Which face each player picked for themselves: seat -> face index. */
  crewFaces: number[]
  vehicleName: string
  sensors: SensorPackage

  rules: Rule[]
  /**
   * Undo/redo over the POLICY only.
   *
   * Snapshots of `rules` taken before every mutation. Policy edits are the one
   * place a child can wreck ten minutes of work with one mis-tap (Delete all),
   * so they get a real undo — nothing else in the game does, because nothing
   * else is destructive.
   */
  rulesPast: Rule[][]
  rulesFuture: Rule[][]
  draft: Draft
  editingId: string | null
  savedPulse: number

  activeChallenge: ChallengeId
  runResult: RunOutcome | null
  retries: Partial<Record<ChallengeId, number>>
  passed: Partial<Record<ChallengeId, boolean>>
  highlightedRuleIds: string[]
  reflectAnswers: (string | null)[]

  /**
   * The turn rotation. `turnIndex` is whose turn is NEXT; `turnOwner` records
   * which player each stop actually claimed, so a stop the policy answers by
   * itself costs nobody a turn (see campaign.ts). `turnClosed` makes passing
   * the wheel idempotent — a repeated animation callback must not skip anyone.
   */
  turnIndex: number
  turnOwner: TurnOwner
  turnClosed: Partial<Record<ChallengeId, boolean>>

  patrolId: ChallengeId | null
  /** The level being played, when the phase is 'play'. */
  levelId: ChallengeId | null
  /** The mission the crew is inside, so its levels can chain themselves. */
  missionId: MissionId | null
  missionSessions: Partial<Record<MissionId, MissionSession>>
  /** True when the current level was reached by CHAINING from the one before:
      it auto-starts with no brief popup — the car just drives on. */
  chained: boolean
  muted: boolean
  narration: boolean

  setPhase: (phase: Phase) => void
  setMode: (mode: Mode) => void
  goNext: () => void
  goBack: () => void
  /** This stop is asking: lock it to whoever's turn it is. */
  claimTurn: (id: ChallengeId) => void
  /** This stop is solved: hand the wheel on, once. */
  passTurn: (id: ChallengeId) => void

  setCrew: (index: number, name: string) => void
  setCrewCount: (count: number) => void
  /** Pick a face. If a teammate already wears it, the two simply swap. */
  setCrewFace: (index: number, face: number) => void
  setVehicleName: (name: string) => void
  setSensors: (sensors: SensorPackage) => void

  newDraft: () => void
  editRule: (id: string) => void
  setDraftCondition: (index: number, token: string) => void
  setDraftAction: (index: number, token: string) => void
  setDraftElse: (token: string) => void
  clearDraftSlot: (slot: 'condition' | 'action' | 'else', index: number) => void
  addConnector: (token: 'AND' | 'OR' | 'ELSE') => void
  removeConnector: (token: 'AND' | 'OR' | 'ELSE') => void
  clearDraft: () => void
  saveDraft: () => boolean

  /** Write a finished rule straight into the policy — the fault cards' one job. */
  commitRule: (condition: string, actions: string[]) => string
  deleteRule: (id: string) => void
  moveRule: (id: string, direction: -1 | 1) => void
  undoRules: () => void
  redoRules: () => void

  setChallenge: (challenge: ChallengeId) => void
  runPolicy: (scenario: Scenario) => RunOutcome
  clearRun: () => void
  registerRetry: (challenge: ChallengeId) => void
  /** Flag the rule a stopped vehicle objected to, so the policy list shows it. */
  setHighlightedRules: (ruleIds: string[]) => void
  markPassed: (challenge: ChallengeId) => void
  setReflectAnswer: (index: number, id: string) => void
  openPatrol: (id: ChallengeId | null) => void
  openLevel: (id: ChallengeId) => void
  closeLevel: () => void
  openMission: (id: MissionId) => void
  /** A level is cleared: run the next one in the same mission, or leave it. */
  finishLevel: (id: ChallengeId) => void
  finishPatrol: (id: ChallengeId) => void
  clearRules: () => void

  toggleMute: () => void
  toggleNarration: () => void
  reset: () => void
}

let ruleSeq = 0
const emptyDraft = (): Draft => ({
  id: `r${++ruleSeq}`,
  conditions: [{ token: '' }],
  actions: [{ token: '' }],
  elseActions: [],
})

const draftIsComplete = (draft: Draft) =>
  Boolean(draft.conditions[0]?.token) &&
  Boolean(draft.actions[0]?.token) &&
  draft.conditions.every((c) => c.token) &&
  draft.actions.every((a) => a.token) &&
  draft.elseActions.every((a) => a.token)

export const useGame = create<GameState>((set, get) => ({
  phase: 'title',
  mode: 'crew',
  startedAt: null,
  crew: Array.from({ length: CREW_SIZE }, () => ''),
  crewCount: 3,
  crewFaces: Array.from({ length: CREW_SIZE }, (_, i) => i),
  vehicleName: 'NV-1',
  sensors: 'front',

  rules: [],
  rulesPast: [],
  rulesFuture: [],
  draft: emptyDraft(),
  editingId: null,
  savedPulse: 0,

  activeChallenge: 'create',
  runResult: null,
  retries: {},
  passed: {},
  highlightedRuleIds: [],
  reflectAnswers: [null, null],

  turnIndex: 0,
  turnOwner: {},
  turnClosed: {},

  patrolId: null,
  levelId: null,
  missionId: null,
  missionSessions: {},
  chained: false,
  muted: false,
  narration: true,

  claimTurn: (id) => set((state) => (
    state.turnOwner[id] !== undefined ? state : {
      turnOwner: { ...state.turnOwner, [id]: driverAt(state.turnIndex, state.crewCount) },
    }
  )),
  passTurn: (id) => set((state) => (
    // Nobody decided here (the rulebook answered it), or the wheel has
    // already moved on: either way the rotation stands still.
    state.turnOwner[id] === undefined || state.turnClosed[id] ? state : {
      turnIndex: state.turnIndex + 1,
      turnClosed: { ...state.turnClosed, [id]: true },
    }
  )),

  setMode: (mode) => set({
    mode,
    // A solo pilot writes every rule, so the roster collapses to one seat.
    crew: Array.from({ length: mode === 'solo' ? 1 : CREW_SIZE }, () => ''),
  }),
  setPhase: (phase) => set((state) => ({
    phase,
    runResult: null,
    highlightedRuleIds: [],
    startedAt: state.startedAt ?? (phase === 'title' ? null : Date.now()),
  })),
  goNext: () => {
    const { phase } = get()
    const index = PHASE_ORDER.indexOf(phase)
    if (index < 0 || index >= PHASE_ORDER.length - 1) return
    get().setPhase(PHASE_ORDER[index + 1])
  },
  goBack: () => {
    const { phase } = get()
    const index = PHASE_ORDER.indexOf(phase)
    if (index <= 0) return
    get().setPhase(PHASE_ORDER[index - 1])
  },

  setCrew: (index, name) => set((state) => ({
    crew: state.crew.map((current, i) => (i === index ? name.slice(0, 14) : current)),
  })),
  // Changing the crew size clears the seats that just left, so a name typed
  // into a seat nobody is sitting in can never reach the board.
  setCrewCount: (count) => set((state) => ({
    crewCount: Math.min(CREW_SIZE, Math.max(2, count)),
    crew: state.crew.map((name, i) => (i < count ? name : '')),
  })),
  setCrewFace: (index, face) => set((state) => {
    const faces = state.crewFaces.slice()
    const held = faces.indexOf(face)
    if (held === index) return state
    // A swap rather than a clash: two children never wear the same face, and
    // nobody loses the one they had already chosen.
    if (held >= 0) faces[held] = faces[index]
    faces[index] = face
    return { crewFaces: faces }
  }),
  setVehicleName: (name) => set({ vehicleName: name.slice(0, 12) }),
  setSensors: (sensors) => set({ sensors }),

  // ---- Rule builder --------------------------------------------------------
  newDraft: () => set({ draft: emptyDraft(), editingId: null, highlightedRuleIds: [] }),
  editRule: (id) => set((state) => {
    const found = state.rules.find((rule) => rule.id === id)
    if (!found) return state
    return {
      draft: {
        id: found.id,
        conditions: found.conditions.length ? found.conditions.map((c) => ({ token: c.token })) : [{ token: '' }],
        actions: found.actions.length ? found.actions.map((a) => ({ token: a.token })) : [{ token: '' }],
        elseActions: (found.elseActions ?? []).map((a) => ({ token: a.token })),
      },
      editingId: id,
      highlightedRuleIds: [id],
    }
  }),
  setDraftCondition: (index, token) => set((state) => {
    const conditions = state.draft.conditions.slice()
    while (conditions.length <= index) conditions.push({ token: '' })
    conditions[index] = { token }
    return { draft: { ...state.draft, conditions } }
  }),
  setDraftAction: (index, token) => set((state) => {
    const actions = state.draft.actions.slice()
    while (actions.length <= index) actions.push({ token: '' })
    actions[index] = { token }
    return { draft: { ...state.draft, actions } }
  }),
  setDraftElse: (token) => set((state) => ({ draft: { ...state.draft, elseActions: [{ token }] } })),
  clearDraftSlot: (slot, index) => set((state) => {
    const draft = { ...state.draft }
    if (slot === 'condition') {
      const conditions = draft.conditions.slice()
      if (index === 0 && conditions.length === 1) conditions[0] = { token: '' }
      else conditions.splice(index, 1)
      draft.conditions = conditions.length ? conditions : [{ token: '' }]
    } else if (slot === 'action') {
      const actions = draft.actions.slice()
      if (index === 0 && actions.length === 1) actions[0] = { token: '' }
      else actions.splice(index, 1)
      draft.actions = actions.length ? actions : [{ token: '' }]
    } else {
      draft.elseActions = []
    }
    return { draft }
  }),
  addConnector: (token) => set((state) => {
    const draft = { ...state.draft }
    if (token === 'OR' && draft.conditions.length < 2) draft.conditions = [...draft.conditions, { token: '' }]
    if (token === 'AND' && draft.actions.length < 2) draft.actions = [...draft.actions, { token: '' }]
    if (token === 'ELSE' && draft.elseActions.length === 0) draft.elseActions = [{ token: '' }]
    return { draft }
  }),
  removeConnector: (token) => set((state) => {
    const draft = { ...state.draft }
    if (token === 'OR') draft.conditions = draft.conditions.slice(0, 1)
    if (token === 'AND') draft.actions = draft.actions.slice(0, 1)
    if (token === 'ELSE') draft.elseActions = []
    return { draft }
  }),
  clearDraft: () => set((state) => ({
    draft: { ...emptyDraft(), id: state.draft.id },
  })),
  saveDraft: () => {
    const { draft, editingId } = get()
    if (!draftIsComplete(draft)) return false
    const rule = normalizeRule({
      id: draft.id,
      conditions: draft.conditions,
      actions: draft.actions,
      ...(draft.elseActions.length ? { elseActions: draft.elseActions } : {}),
    })
    set((state) => ({
      rules: editingId
        ? state.rules.map((existing) => (existing.id === editingId ? rule : existing))
        : [...state.rules, rule],
      rulesPast: [...state.rulesPast, state.rules].slice(-20),
      rulesFuture: [],
      draft: emptyDraft(),
      editingId: null,
      savedPulse: state.savedPulse + 1,
      highlightedRuleIds: [],
    }))
    return true
  },

  commitRule: (condition, actions) => {
    const before = get().rules
    const id = `r${++ruleSeq}`
    const rule: Rule = {
      id,
      conditions: [{ token: condition }],
      actions: actions.map((token, index) => ({ token, ...(index > 0 ? { join: 'AND' as const } : {}) })),
    }
    set((state) => {
      // Where the rule goes matters as much as what it says. MOVING is
      // deliberately broad — it also matches MANY_MOVING and EMERGENCY_BEHIND —
      // so a specific rule appended UNDER it can never fire, and the child gets
      // a rule-order failure for an answer that was correct. The exact rule goes
      // ABOVE the first broad rule that would swallow it, which is the same
      // thing a person would do, and the scan then shows it happening.
      const swallows = (broad: Rule) => broad.conditions.some((c) =>
        c.token !== condition && conditionMatches(c.token, condition as EventToken))
      // A card picked for a hazard that already has its own single-condition
      // rule REPLACES that rule instead of stacking a duplicate under it.
      const dupAt = state.rules.findIndex((r) =>
        r.conditions.length === 1 && r.conditions[0].token === condition && !r.elseActions?.length)
      const base = dupAt >= 0 ? state.rules.filter((_, i) => i !== dupAt) : state.rules
      const at = base.findIndex(swallows)
      const rules = base.slice()
      if (at >= 0) rules.splice(at, 0, rule)
      else rules.push(rule)
      return {
        rules,
        rulesPast: [...state.rulesPast, before].slice(-20),
        rulesFuture: [],
        savedPulse: state.savedPulse + 1,
        highlightedRuleIds: [id],
      }
    })
    return id
  },

  undoRules: () => set((state) => {
    const past = state.rulesPast
    if (!past.length) return state
    return {
      rules: past[past.length - 1],
      rulesPast: past.slice(0, -1),
      rulesFuture: [state.rules, ...state.rulesFuture].slice(0, 20),
      highlightedRuleIds: [],
    }
  }),
  redoRules: () => set((state) => {
    const future = state.rulesFuture
    if (!future.length) return state
    return {
      rules: future[0],
      rulesFuture: future.slice(1),
      rulesPast: [...state.rulesPast, state.rules].slice(-20),
      highlightedRuleIds: [],
    }
  }),

  deleteRule: (id) => set((state) => ({
    rulesPast: [...state.rulesPast, state.rules].slice(-20),
    rulesFuture: [],
    rules: state.rules.filter((rule) => rule.id !== id),
    highlightedRuleIds: state.highlightedRuleIds.filter((ruleId) => ruleId !== id),
    ...(state.editingId === id ? { draft: emptyDraft(), editingId: null } : {}),
  })),
  moveRule: (id, direction) => set((state) => {
    const from = state.rules.findIndex((rule) => rule.id === id)
    const to = from + direction
    if (from < 0 || to < 0 || to >= state.rules.length) return state
    const rules = state.rules.slice()
    ;[rules[from], rules[to]] = [rules[to], rules[from]]
    return {
      rules,
      rulesPast: [...state.rulesPast, state.rules].slice(-20),
      rulesFuture: [],
    }
  }),

  // ---- Runs ----------------------------------------------------------------
  setChallenge: (activeChallenge) => set({ activeChallenge, runResult: null, highlightedRuleIds: [] }),
  runPolicy: (scenario) => {
    const outcome = evaluateRun(get().rules, scenario)
    set({ runResult: outcome, highlightedRuleIds: outcome.highlightedRuleIds })
    return outcome
  },
  clearRun: () => set({ runResult: null }),
  registerRetry: (challenge) => set((state) => ({
    retries: { ...state.retries, [challenge]: (state.retries[challenge] ?? 0) + 1 },
  })),
  setHighlightedRules: (highlightedRuleIds) => set({ highlightedRuleIds }),
  markPassed: (challenge) => set((state) => ({ passed: { ...state.passed, [challenge]: true } })),
  setReflectAnswer: (index, id) => set((state) => ({
    reflectAnswers: state.reflectAnswers.map((answer, i) => (i === index ? id : answer)),
  })),
  openPatrol: (patrolId) => {
    if (patrolId === null) { set({ patrolId: null, phase: 'levels' }); return }
    const state = get()
    const next = PATROLS.find(p => !state.passed[p.id])?.id ?? 'delivery'
    if (canStartPart('patrols', state.passed) && patrolId === next) set({ patrolId, runResult: null, highlightedRuleIds: [] })
  },
  openLevel: (levelId) => set({ levelId, phase: 'play', runResult: null, highlightedRuleIds: [] }),
  closeLevel: () => set({ levelId: null, phase: 'levels', chained: false, runResult: null, highlightedRuleIds: [] }),
  openMission: (missionId) => {
    const mission = MISSIONS.find((item) => item.id === missionId)
    if (!mission) return
    const state = get()
    if (!canStartPart(missionId, state.passed)) return
    const passed = state.passed
    const common = {
      missionId,
      rulesPast: [], rulesFuture: [], draft: emptyDraft(), editingId: null,
      chained: false, runResult: null, highlightedRuleIds: [],
    }
    if (mission.isPatrolSet) {
      set({ ...common, phase: 'patrols', patrolId: PATROLS.find(p => !passed[p.id])?.id ?? 'delivery', levelId: null })
      return
    }
    const next = mission.levels.find((id) => !passed[id]) ?? mission.levels[0]
    set({ ...common, levelId: next, phase: 'play', patrolId: null })
  },
  finishLevel: (id) => {
    const state = get()
    // Ignore a duplicate animation callback or one delivered after leaving.
    if (state.phase !== 'play' || state.levelId !== id) return
    const mission = MISSIONS.find((item) => item.levels.includes(id))
    const passed = { ...state.passed, [id]: true }
    // Chain to the next stop of the SAME job without going back to the board —
    // and FLOW into it: no brief popup, the car just sets off again.
    const next = mission?.levels.find((levelId) => !passed[levelId])
    if (next) {
      set({ passed, levelId: next, phase: 'play', chained: true, runResult: null, highlightedRuleIds: [] })
      return
    }
    // Return to the three cards. Retain the policy owner for the next switch.
    set({
      passed,
      levelId: null,
      phase: 'levels',
      patrolId: null,
      chained: false,
      runResult: null,
      highlightedRuleIds: [],
    })
  },
  finishPatrol: (id) => {
    const state = get()
    if (state.phase !== 'patrols' || state.patrolId !== id) return
    const passed = { ...state.passed, [id]: true }
    const next = PATROLS.find(p => !passed[p.id])?.id ?? 'delivery'
    set({ passed, patrolId: id === 'delivery' ? null : next,
      phase: id === 'delivery' ? 'levels' : 'patrols', highlightedRuleIds: [], runResult: null })
  },
  clearRules: () => set((state) => ({
    rules: [],
    rulesPast: [...state.rulesPast, state.rules].slice(-20),
    rulesFuture: [],
    draft: emptyDraft(),
    editingId: null,
    highlightedRuleIds: [],
  })),

  toggleMute: () => set((state) => ({ muted: !state.muted })),
  toggleNarration: () => set((state) => ({ narration: !state.narration })),

  reset: () => {
    ruleSeq = 0
    set({
      phase: 'title',
      startedAt: null,
      crew: Array.from({ length: CREW_SIZE }, () => ''),
      crewCount: get().crewCount,
      crewFaces: Array.from({ length: CREW_SIZE }, (_, i) => i),
      vehicleName: 'NV-1',
      sensors: 'front',
      rules: [],
      rulesPast: [],
      rulesFuture: [],
      draft: emptyDraft(),
      editingId: null,
      savedPulse: 0,
      activeChallenge: 'create',
      runResult: null,
      retries: {},
      passed: {},
      highlightedRuleIds: [],
      reflectAnswers: [null, null],
      turnIndex: 0,
      turnOwner: {},
      turnClosed: {},
      patrolId: null,
      levelId: null,
      missionId: null,
      missionSessions: {},
      chained: false,
    })
  },
}))

export { draftIsComplete }
