// Every player-facing string, tile and mission definition lives here.
//
// Copy rule for this mission: the SCREEN carries the short line, the NARRATOR
// carries the full one (SKAI templatization §7 — do not print what the voice
// already says). On-screen problem statements stay under about a dozen words so
// the type can be large enough to read from across a table.

import type { ChallengeId } from './sim'

export type TileKind = 'condition' | 'action'

export interface TileDef {
  token: string
  kind: TileKind
  label: string
  /** One-line gloss, shown only for the tile the player is touching. */
  gloss: string
  decoy?: boolean
  strong?: boolean
}

export const TILES: Record<string, TileDef> = {
  // --- Situations the vehicle can detect -----------------------------------
  SCOOTER: { token: 'SCOOTER', kind: 'condition', label: 'Scooter ahead', gloss: 'Parked, half in the lane.' },
  NARROW: { token: 'NARROW', kind: 'condition', label: 'Narrow gate ahead', gloss: 'Barriers leave one car width.' },
  ARRIVED: { token: 'ARRIVED', kind: 'condition', label: 'Destination reached', gloss: 'The car is at the delivery gate.' },
  MOVING: { token: 'MOVING', kind: 'condition', label: 'Something moving', gloss: 'Anything not standing still.' },
  CLEAR_SKY: { token: 'CLEAR_SKY', kind: 'condition', label: 'Sunny day', decoy: true, gloss: 'Weather. Nothing on the road changes.' },
  MANY_MOVING: { token: 'MANY_MOVING', kind: 'condition', label: 'Many things moving', gloss: 'A whole crossing in motion.' },
  ROAD_WET: { token: 'ROAD_WET', kind: 'condition', label: 'Wet road', gloss: 'Less grip. Braking takes longer.' },
  EMERGENCY_BEHIND: { token: 'EMERGENCY_BEHIND', kind: 'condition', label: 'Ambulance behind', gloss: 'It needs the lane.' },
  CYCLIST: { token: 'CYCLIST', kind: 'condition', label: 'Cyclist ahead', gloss: 'Riding in the same lane.' },
  DOG: { token: 'DOG', kind: 'condition', label: 'Dog in the road', gloss: 'An animal, standing in the lane.' },
  ROAD_BLOCKED: { token: 'ROAD_BLOCKED', kind: 'condition', label: 'Road blocked', gloss: 'Someone standing in the lane.' },
  DEAD_END: { token: 'DEAD_END', kind: 'condition', label: 'Road closed ahead', gloss: 'The whole street is sealed. No gap this time.' },
  FOG: { token: 'FOG', kind: 'condition', label: 'Fog', gloss: 'You can see about ten metres.' },

  // --- What the vehicle can do ---------------------------------------------
  SLOW: { token: 'SLOW', kind: 'action', label: 'Go slowly', gloss: 'Slow right down and pass with care.' },
  DELIVER: { token: 'DELIVER', kind: 'action', label: 'Stop and deliver', gloss: 'Stop at the gate and hand over the parcel.' },
  FULLSTOP: { token: 'FULLSTOP', kind: 'action', label: 'Stop the car', strong: true, gloss: 'Come to a full stop and wait for a safe way forward.' },
  TURN: { token: 'TURN', kind: 'action', label: 'Turn around', decoy: true, gloss: 'Leave this street and drive back the other way.' },
  SPEEDUP: { token: 'SPEEDUP', kind: 'action', label: 'Speed up', decoy: true, gloss: 'Go faster to get past it.' },
  WAIT_CLEAR: { token: 'WAIT_CLEAR', kind: 'action', label: 'Wait until clear', strong: true, gloss: 'Stay stopped until every single person is out of the road.' },
  SLOW_EARLY: { token: 'SLOW_EARLY', kind: 'action', label: 'Brake early', gloss: 'Start slowing down long before you reach it.' },
  LEAVE_SPACE: { token: 'LEAVE_SPACE', kind: 'action', label: 'Leave a big gap', gloss: 'Keep plenty of space in front of the car.' },
  MOVE_ASIDE: { token: 'MOVE_ASIDE', kind: 'action', label: 'Move aside', gloss: 'Pull over to the side of the road.' },
  STOP_SAFE: { token: 'STOP_SAFE', kind: 'action', label: 'Stop safely', strong: true, gloss: 'Stop where the car blocks nobody.' },
  HONK: { token: 'HONK', kind: 'action', label: 'Beep once', gloss: 'Give one short beep so they notice the car.' },
  NORMAL_SPEED: { token: 'NORMAL_SPEED', kind: 'action', label: 'Keep speed', decoy: true, gloss: 'Carry on at exactly the same speed.' },
  RACE_AHEAD: { token: 'RACE_AHEAD', kind: 'action', label: 'Race ahead', decoy: true, gloss: 'Speed up to stay in front of it.' },
}

export interface RuleShape {
  conditions: { token: string }[]
  actions: { token: string }[]
  elseActions?: { token: string }[]
}

/** Short human label for a saved rule, used in the mission report. */
export function ruleSentence(rule: RuleShape): string {
  const conditions = rule.conditions.filter((c) => c.token).map((c) => TILES[c.token]?.label ?? c.token)
  const actions = rule.actions.filter((a) => a.token).map((a) => TILES[a.token]?.label ?? a.token)
  const elses = (rule.elseActions ?? []).filter((a) => a.token).map((a) => TILES[a.token]?.label ?? a.token)
  const head = conditions.length ? conditions.join(' or ') : '…'
  const tail = actions.length ? actions.join(' and ') : '…'
  return `IF ${head} THEN ${tail}${elses.length ? ` ELSE ${elses.join(' and ')}` : ''}`
}

/* ---- Connectors ----------------------------------------------------------- */

export const CONNECTORS = {
  AND: { token: 'AND', label: 'AND', gloss: 'A second action. Both happen.' },
  OR: { token: 'OR', label: 'OR', gloss: 'A second situation. Either one fires the rule.' },
  ELSE: { token: 'ELSE', label: 'ELSE', gloss: 'What to do when no rule matches.' },
} as const

export type ConnectorToken = keyof typeof CONNECTORS

/* ---- Acts ----------------------------------------------------------------- */

/** The brief's three stages. Levels carry the first two. */
export type Stage = 'create' | 'iterate'

export interface Level {
  id: ChallengeId
  n: number
  /** Which stage of the mission brief this level belongs to. */
  stage: Stage
  /** Chapter label on the level's opening card. */
  chapter: string
  /** Card title on the level map. */
  name: string
  /** One line of "what is in the way", on the map and in the briefing. */
  brief: string
  /** The full sentence — narrated, never printed. */
  voice: string
  /** The same sentence addressed to ONE person doing everything. */
  soloVoice?: string
  /** What the crew has to do. */
  task: string
  /** Where the vehicle starts, in screen widths along the street. */
  startX: number
  /** Situations this level expects a rule for — drives the hint ladder. */
  required: string[]
  tray: string[]
  newTiles: string[]
  connectors: ConnectorToken[]
  runLabel: string
  success: string
  successDetail: string
  /** Which engineer's turn it is. The fourth level is the whole crew. */
  engineer?: number
}

/* The Create tray: three conditions, two actions, one decoy (Turn around).
   Sunny day used to sit here as a second decoy, but nothing in the engine ever
   produces a failure for it — the car could not explain what was wrong with it,
   so it was a trap with no lesson attached. The tile itself stays in TILES for
   the report. */
const BASE_TRAY = ['SCOOTER', 'NARROW', 'ARRIVED', 'SLOW', 'DELIVER', 'TURN']
/* Iterate adds the brief's three: Something moving, Full stop, and Speed up. */
const LIVE_TRAY = [...BASE_TRAY, 'MOVING', 'FULLSTOP', 'SPEEDUP']
/* AND only. A rule is written at the moment the car is halted in front of one
   named hazard, and at that moment OR (a second situation) and ELSE (a default)
   have nothing to attach to — the stage filters them out anyway. Offering them
   in the tray only advertised two connectors that are never usable where it
   counts. The CONNECTORS table keeps all three for the report. */
const AND_ONLY: ConnectorToken[] = ['AND']

export const LEVELS: Level[] = [
  {
    id: 'l1',
    n: 1,
    chapter: 'Learn the Road',
    stage: 'create',
    name: 'The parked scooter',
    brief: 'A scooter is parked half in the lane.',
    voice: 'Ten past six. This parcel has to reach the clinic by seven, and NV-1 left the depot with a corrupted rulebook. Fifty metres in, it has already stopped: a parked scooter.',
    soloVoice: 'Ten past six, and today NV-1 is yours alone. It left the depot with a corrupted rulebook, so fifty metres in it has already stopped dead: a parked scooter.',
    task: 'Pick what it should do.',
    startX: 0.05,
    required: ['SCOOTER'],
    tray: BASE_TRAY,
    newTiles: [],
    connectors: AND_ONLY,
    runLabel: 'Send the car',
    success: 'Past the scooter.',
    successDetail: 'One situation, one rule.',
    engineer: 1,
  },
  {
    id: 'l2',
    n: 2,
    chapter: 'Learn the Road',
    stage: 'create',
    name: 'The narrow gate',
    brief: 'Roadworks cut the lane to one car width.',
    voice: 'That answer is in the rulebook now, and no scooter will stop it again. Two streets on, roadworks have cut the lane to one car width. NV-1 stops again.',
    soloVoice: 'Your answer is in the rulebook now — no scooter will stop it again. Two streets on, roadworks have cut the lane to a single car width, and NV-1 stops again.',
    task: 'Pick the answer for the gate.',
    startX: 0.27,
    required: ['NARROW'],
    tray: BASE_TRAY,
    newTiles: [],
    connectors: AND_ONLY,
    runLabel: 'Send the car',
    success: 'Through the gate.',
    successDetail: 'The same action can fit two different situations.',
    engineer: 2,
  },
  {
    id: 'l3',
    n: 3,
    chapter: 'Learn the Road',
    stage: 'create',
    name: 'The closed-road test',
    brief: 'Drive the whole street. The clinic gate is last.',
    voice: 'Two answers in the book, and NV-1 can drive the whole street on them. One thing is still missing: it does not know what arriving at the clinic means.',
    soloVoice: 'Two of your answers, and NV-1 can drive the whole street on them. One gap is left: it still does not know what arriving at the clinic means.',
    task: 'Run the street, then pick the last answer.',
    startX: 0.05,
    required: ['ARRIVED'],
    tray: BASE_TRAY,
    newTiles: [],
    connectors: AND_ONLY,
    runLabel: 'Run the whole street',
    success: 'Parcel delivered.',
    successDetail: 'Three rules, three situations. The closed road is done.',
    engineer: 3,
  },
  {
    id: 'l4',
    n: 4,
    chapter: 'Busy Street',
    stage: 'iterate',
    name: 'The live road test',
    brief: 'The car has three rules. Can they handle a busy street?',
    voice: 'This game starts with rules for a parked scooter, a narrow gap and the clinic. Watch what happens when someone crosses. Find the missing rule, test your answer, and explain why it works.',
    soloVoice: 'Your closed road is signed off, but a closed road is not a street. Fenner Street has traffic on it now, and your three answers have to hold there alone. Watch closely.',
    task: 'Watch the car. Choose a rule when it needs help.',
    startX: 0.05,
    required: ['MOVING'],
    tray: LIVE_TRAY,
    newTiles: ['MOVING', 'FULLSTOP', 'SPEEDUP'],
    connectors: AND_ONLY,
    runLabel: 'Start the road test',
    success: 'The car stopped. The child crossed safely.',
    successDetail: 'A rule for things that stand still could never have covered this.',
  },
]

/* ---- Missions -------------------------------------------------------------

   Three jobs with three different purposes. Inside a mission the levels chain
   automatically; the board is only ever returned to when a whole mission is
   done, so it stops being a menu the crew has to keep coming back to.
   -------------------------------------------------------------------------- */

export type MissionId = 'closed' | 'live' | 'patrols'

export interface Mission {
  id: MissionId
  n: number
  name: string
  /** What this mission is FOR — the line that makes it a different job. */
  purpose: string
  stage: string
  minutes: number
  /** The levels it runs, in order. Empty for the patrol set. */
  levels: ChallengeId[]
  /** True for the patrol set, which is a grid of its own. */
  isPatrolSet?: boolean
}

export const MISSIONS: Mission[] = [
  {
    id: 'closed',
    n: 1,
    name: 'Learn the Road',
    purpose: 'Pass a scooter, cross a narrow gap and deliver a parcel.',
    stage: 'Build rules',
    minutes: 20,
    levels: ['l1', 'l2', 'l3'],
  },
  {
    id: 'live',
    n: 2,
    name: 'Busy Street',
    purpose: 'Watch for a child crossing. Test the rules and fix what is missing.',
    stage: 'Test and fix',
    minutes: 15,
    levels: ['l4'],
  },
  {
    id: 'patrols',
    n: 3,
    name: 'City Patrol',
    purpose: 'Help a cyclist, a dog and an ambulance. Try eight short challenges.',
    stage: 'Solve new problems',
    minutes: 0,
    levels: [],
    isPatrolSet: true,
  },
]

/**
 * The finale: one drive from the depot to the Fenner Street clinic on the
 * policy the crew has finished, steering itself between the marks.
 */
export const DELIVERY: Level = {
  id: 'delivery',
  n: 5,
  chapter: 'The delivery run',
  stage: 'iterate',
  name: 'The delivery run',
  brief: 'The rulebook is finished. Take the parcel to the clinic.',
  voice: 'Every rule is written and every street has been walked. NV-1 drives itself from here — depot to the Fenner Street clinic, one run, no stops for questions. Your policy is the only thing steering it.',
  task: 'The car reads the map and drives. Your rules decide what it does when the road surprises it.',
  startX: 0,
  required: [],
  tray: BASE_TRAY,
  newTiles: [],
  connectors: AND_ONLY,
  runLabel: 'Send it to the clinic',
  success: 'Delivered.',
  successDetail: 'Every rule the three of you wrote, on one street, in one run.',
}

export const levelMap = {
  heading: 'Northline Depot',
  brief: 'Choose any game. Take turns.',
  soloBrief: '',
  voice: 'Welcome to Northline Depot. Choose any of the three games. Take turns choosing an answer, and help each other explain why it works. Each game keeps its own rules.',
  soloVoice: 'Welcome to Northline Depot. Choose any of the three games. Each game keeps its own rules.',
  locked: 'Locked',
  done: 'Cleared',
  next: 'Advanced patrols',
}

/* ---- Advanced patrols (optional, after sign-off) --------------------------- */

export interface Patrol {
  id: ChallengeId
  title: string
  brief: string
  /** The spoken line. Never the printed brief read back — see the copy law at
      the top of this file: the screen carries the short line, the narrator the
      full one. */
  voice?: string
  task: string
  tray: string[]
  runLabel: string
  success: string
}

/** Grouped for the patrol board: people in the street first, then the road
    itself, then the one hazard the car cannot even see. The board renders
    these groups with headings; keep each group's patrols contiguous here. */
/** Whose turn each patrol is. Eight streets dealt round three engineers, so
 *  nobody sits out the half of the activity where the hard rules get written. */
export const PATROL_TURN: Record<string, number> = {
  busy: 1, cyclist: 2, dog: 3, horn: 1,
  rain: 2, fog: 3, uturn: 1, emergency: 2,
}

export const PATROL_GROUPS: { label: string; ids: ChallengeId[] }[] = [
  { label: 'People in the street', ids: ['busy', 'cyclist', 'dog', 'horn'] },
  { label: 'The road itself', ids: ['rain', 'fog', 'uturn'] },
  { label: 'Seeing behind', ids: ['emergency'] },
]

export const PATROLS: Patrol[] = [
  {
    id: 'busy',
    title: 'Market crossing',
    brief: 'People are still crossing the road.',
    voice: 'Market day. The crossing is full of people, and not one of them is standing still.',
    task: 'Choose when the car should move again.',
    tray: ['MANY_MOVING', 'MOVING', 'WAIT_CLEAR', 'FULLSTOP', 'SLOW', 'HONK'],
    runLabel: 'Run it',
    success: 'The car waited, then moved.',
  },
  {
    id: 'cyclist',
    title: 'Bicycle ahead',
    brief: 'There is no room to drive beside the bicycle.',
    voice: 'A bike ahead, and no way past it without crowding the rider off the road.',
    task: 'Keep a safe gap behind the bicycle.',
    tray: ['CYCLIST', 'SLOW', 'LEAVE_SPACE', 'HONK', 'SPEEDUP'],
    runLabel: 'Run it',
    success: 'The cyclist got the whole lane.',
  },
  {
    id: 'dog',
    title: 'Dog in the road',
    brief: 'The dog has not noticed the quiet car.',
    voice: 'A dog has wandered into the road, and an electric car makes almost no sound at all.',
    task: 'Stop first. Then make sure it knows.',
    tray: ['DOG', 'FULLSTOP', 'HONK', 'SLOW', 'TURN'],
    runLabel: 'Run it',
    success: 'Stopped, one horn, the dog moved.',
  },
  {
    id: 'horn',
    title: 'Person in the road',
    brief: 'A person is facing away from the car.',
    voice: 'A person standing in the road, facing away. They have no idea the car is behind them.',
    task: 'Waiting will not clear this.',
    tray: ['ROAD_BLOCKED', 'HONK', 'WAIT_CLEAR', 'SLOW', 'TURN'],
    runLabel: 'Run it',
    success: 'They stepped aside.',
  },
  {
    id: 'rain',
    title: 'Wet road',
    brief: 'The slippery road makes stopping harder.',
    voice: 'It has rained. Nothing is in the way this time — what changed is the road itself.',
    task: 'Change how it drives, not just what it stops for.',
    tray: ['ROAD_WET', 'SLOW_EARLY', 'LEAVE_SPACE', 'NORMAL_SPEED', 'SPEEDUP'],
    runLabel: 'Run it',
    success: 'Braked early, kept the gap.',
  },
  {
    id: 'fog',
    title: 'Foggy road',
    brief: 'The car cannot see far ahead.',
    voice: 'Thick fog. The car can see about ten metres, and nobody out there can see it coming.',
    task: 'They cannot see you. Buy yourself time.',
    tray: ['FOG', 'SLOW_EARLY', 'HONK', 'NORMAL_SPEED', 'SPEEDUP'],
    runLabel: 'Run it',
    success: 'Slow, audible, and in control.',
  },
  {
    id: 'uturn',
    title: 'Road closed',
    brief: 'Barriers block the whole road.',
    voice: 'Barriers right across the road, kerb to kerb. This time there is no gap to thread.',
    task: 'Sometimes the safe move is back the way you came.',
    tray: ['DEAD_END', 'TURN', 'WAIT_CLEAR', 'HONK', 'SLOW'],
    runLabel: 'Run it',
    success: 'Turned about, clean and clear.',
  },
  {
    id: 'emergency',
    title: 'Ambulance behind',
    brief: 'An ambulance needs to get past the car.',
    voice: 'A siren behind, and only one lane. This is the first thing on the whole street that is not in front of the car.',
    task: 'Give it something that can see behind — then give up the lane.',
    tray: ['EMERGENCY_BEHIND', 'MOVING', 'MOVE_ASIDE', 'STOP_SAFE', 'RACE_AHEAD', 'FULLSTOP'],
    runLabel: 'Run it',
    success: 'It saw it coming. Lane cleared, ambulance through.',
  },
]

/* ---- Coaching -------------------------------------------------------------- */

export const hints: Record<string, string> = {
  noRuleScooter: 'No rule matched the scooter.',
  noRuleNarrow: 'No rule matched the narrow gate.',
  noRuleArrived: 'No rule said what to do at the gate. The parcel is still on board.',
  failScooter: 'That does not get past a parked scooter.',
  failNarrow: 'That does not fit a gate one car wide.',
  failArrived: 'That leaves the parcel on board.',
  failMoving: 'Nothing matched something that moves.',
  movingSlowNotStop: 'Slowing is not stopping. A moving hazard needs a stronger rule.',
  decoySpeed: 'Speeding up gives {name} less time to react.',
  decoyTurn: 'Turning around abandons the delivery.',
  decoy: 'That does not make it safer.',
  ruleOrder: '{name} fires the first rule that fits. A broad rule caught this one first.',
  busyNoRule: 'No safe gap while the whole crossing moves.',
  busySlow: 'Slowing helps. The crossing is still full.',
  busyStop: 'Full stop is for one thing crossing. A crowd keeps coming — {name} has to hold until the crossing is empty.',
  broadCaught: '{name} used its rule for ONE moving thing. A whole crossing is a different situation — it needs its own rule, above that one.',
  busyHonk: 'A horn does not empty a crossing.',
  rainNoRule: '{name} drove the wet road like a dry one.',
  rainNormal: 'The surface changed. The driving did not.',
  emergencyNoRule: 'Priority vehicles need their own rule.',
  emergencyMiddle: 'Stopping here still blocks the lane.',
  emergencyMoveOnly: 'Moving aside is half of it.',
  emergencyRace: 'Racing an ambulance is never safe.',
  rearNoSensor: 'NV-1 has no sensor pointing backwards. It never saw the ambulance at all.',
  rearFixed: 'With a rear sensor it sees the ambulance while there is still time to move.',
  cyclistNoRule: 'Too close. Cut speed or give space.',
  dogNoRule: 'No rule matched the animal.',
  dogSlow: 'Slowing is not enough — it is in the lane.',
  dogHonk: 'Good stop. Now let it know you are there.',
  hornNoRule: 'Still blocked. Nothing told them you were coming.',
  deadEndWait: 'Waiting will not reopen a sealed road. The car has to go back.',
  deadEndNoRule: 'The street is closed and NV-1 has no instruction for it.',
  fogNoRule: '{name} entered the fog at full speed.',
  fogHonk: 'Braking early helps. Add something they can hear.',
  fogNormal: 'At this speed {name} sees a hazard too late.',
}

/* Keyed by the id the stage actually passes to coachingHint — the LEVEL or
   PATROL id. It used to be keyed 'create' and 'iterate', which are the
   whole-route evaluator's ids and never reach this function, so every escalation
   below was unreachable and a stuck child got the same one-liner on the first
   attempt and the tenth. Each ladder now ends in the answer, spelled out. */
const RETRY_LADDER: Partial<Record<ChallengeId, string[]>> = {
  l1: [
    'It is parked — it will not move on its own.',
    'The car has to get around it, and it has to leave its lane to do that.',
    'Choose "Go slowly around the scooter" — IF Scooter ahead THEN Go slowly.',
  ],
  l2: [
    'The gap is exactly one car wide. There is no room to get this wrong.',
    'There IS a way through, so turning back is not it. What speed fits a gap that tight?',
    'Choose "Go slowly through the gap" — IF Narrow gate ahead THEN Go slowly.',
  ],
  l3: [
    'Arriving is a situation like any other, and the rulebook has nothing for it.',
    'Slowing down outside the clinic still leaves the parcel on board.',
    'Pick "Stop and give the parcel" — IF Destination reached THEN Stop and deliver.',
  ],
  l4: [
    'Every answer in the book so far is for something that stands still. This one moves.',
    'Slowing is not stopping. Something that moves can move into the car.',
    'Choose "Stop and let the child cross" — IF Something moving THEN Stop the car.',
  ],
  busy: ['Passing needs a gap. There is none yet.', 'Which action holds until the path is empty?'],
  rain: ['The action has to change with the surface.', 'Brake early and leave space.'],
  emergency: ['This needs its own rule, above the others.', 'Two actions: leave the lane, then stop safely.'],
  cyclist: ['The bicycle needs space in front of the car.', 'Choose "Follow slowly, leaving a big gap".'],
  dog: ['Stopping is half the answer.', 'Choose "Stop, then beep once".'],
  horn: ['Waiting will not clear it.', 'One short horn.'],
  fog: ['Too fast to react.', 'Brake early AND horn.'],
  uturn: [
    'The barriers go kerb to kerb. There is no gap to thread this time.',
    'Waiting will not reopen it, and there is nobody there to hear a horn.',
    'Pick "Turn around and go back" — IF Road closed ahead THEN Turn around.',
  ],
}

export function coachingHint(
  challenge: ChallengeId,
  retryCount: number,
  hintKey: string | null,
  vehicleName: string,
): string {
  const name = vehicleName.trim() || 'The car'
  const ladder = RETRY_LADDER[challenge]
  const base = (hints[hintKey ?? 'decoy'] ?? hints.decoy).replace(/\{name\}/g, name)
  if (retryCount > 0 && ladder) return `${base} ${ladder[Math.min(retryCount - 1, ladder.length - 1)]}`
  return base
}

/* ---- Story ----------------------------------------------------------------- */

export const mission = {
  code: 'ROB-06',
  programme: 'SKAI Space',
  name: 'The Northline Run',
  subtitle: 'Create your own self-driving car',
  start: 'Start mission',
  budgetMinutes: 45,
}

export const character = {
  name: 'Maya Rao',
  role: 'Autonomy Safety Lead',
  /** On screen: short. */
  lines: [
    'I sign off every vehicle that leaves this depot.',
    'At 07:00 a medical parcel has to reach the clinic. The car goes alone.',
    'Its rulebook is corrupted. Where a rule is missing, it stops and asks you.',
  ],
  /** Narrated: the full version. */
  voice: [
    'I sign off every vehicle that leaves this depot. This morning I need three more signatures — yours.',
    'At seven o clock a medical parcel has to reach the delivery gate at the clinic on Fenner Street. Our driver is out, so the car goes alone.',
    'And its rulebook came out of the depot corrupted. Anything it has no rule for, it stops dead and asks you. Answer carefully.',
  ],
  next: 'Go on',
}

export const designCopy = {
  heading: 'Name your car',
  brief: 'Three players. One car. Take turns as Engineers 1, 2 and 3.',
  voice: 'Give the car a name, then choose its sensors. Sensors help it notice what is around it. Next, choose one of three games.',
  nameLabel: 'Car name',
  namePlaceholder: 'NV-1',
  sensorHeading: 'Sensors',
  options: [
    { id: 'front' as const, label: 'Front only', detail: 'Sees straight ahead.' },
    { id: 'frontSide' as const, label: 'Front and sides', detail: 'Sees ahead and beside the car.' },
  ],
  note: 'Sensors decide what it notices. Your rules decide what it does.',
  next: 'Choose a game',
}

export const reflectCopy = {
  heading: 'Sign-off review',
  brief: 'Agree as a crew.',
  soloBrief: 'Your call. Nobody to outvote.',
  next: 'Submit',
}

export interface ReflectOption {
  id: string
  label: string
  correct: boolean
  nudge?: string
}

export const reflect = {
  prompts: [
    {
      question: 'Why did Full stop fix it, when Slow and pass did not?',
      options: [
        { id: 'a1', correct: true, label: 'Something that moves can end up anywhere. Only stopping removes the risk.' },
        { id: 'a2', correct: false, label: 'The car was going too fast.', nudge: 'It obeyed every rule it had. None covered a moving hazard.' },
        { id: 'a3', correct: false, label: 'The gate was too narrow.', nudge: 'The gate was handled on the first test.' },
      ] as ReflectOption[],
      feedback: 'A rule for things that stand still cannot be reused for things that move.',
    },
    {
      question: 'Where else does a plan need a rule for the unplanned?',
      options: [
        { id: 'b1', correct: true, label: 'A fire drill — when one exit is blocked.' },
        { id: 'b2', correct: true, label: 'Crossing a road — look both ways on a green signal.' },
        { id: 'b3', correct: true, label: 'A train timetable — the day a line is shut.' },
      ] as ReflectOption[],
      feedback: 'All three. A plan is trustworthy once it has met something it was not built for.',
      anyCorrect: true,
    },
  ],
}

/* ---- Seating ---------------------------------------------------------------

   The same activity, two seatings. The brief is written for a crew of three
   taking one rule each; the pipeline document also asks for an individual
   variant on one machine. Only the address changes — the street, the rules and
   the edge cases are identical, because the thing being taught is identical.
   -------------------------------------------------------------------------- */

export const modeCopy = {
  heading: 'How are you playing?',
  brief: 'Same street either way. Only who writes the rules changes.',
  voice: 'Same street either way — only who writes the rules changes. Pick one seat, or three.',
  options: [
    {
      id: 'crew' as const,
      label: 'Crew of three',
      tag: 'Group mission',
      detail: 'One rule each, one screen. Be ready to explain yours.',
      seats: 3,
    },
    {
      id: 'solo' as const,
      label: 'Solo pilot',
      tag: 'Individual mission',
      detail: 'You write the whole policy and sign it off yourself.',
      seats: 1,
    },
  ],
  next: 'To the depot',
}

/** The info key's overlay: the two things the game does not already show.
    It used to say four times over, in four different wordings, that the car has
    nothing but the player's rules — before a single rule existed. The story
    says it, the empty policy panel shows it, and the car stopping dead proves
    it, so the overlay now only carries what is genuinely invisible. */
export const infoCopy = {
  heading: 'How the car reads its rulebook',
  brief: 'Test an answer. If it works, it becomes a rule.',
  rules: [
    'It reads from the top and does the FIRST rule that fits — order matters.',
    'A wrong answer is safe: the car shows what happens, then you pick again.',
  ],
}

export const reportCopy = {
  heading: 'Mission report',
  signOff: 'Policy approved.',
  again: 'Play again',
  patrols: 'City Patrol',
  patrolsBrief: 'Choose a challenge. Four basic rules are ready. Add the rule this street needs.',
  backToReport: 'Back',
}

export const ui = {
  back: 'Back',
  next: 'Next',
  locked: 'Finish this step',
  policy: 'Rules',
  priorityLaw: 'Read from the top. First match wins.',
  scanTitle: 'Checking the rules',
  scanMiss: 'No match',
  scanNoMatch: 'No rule for this — the car stops to ask.',
  policyEmpty: 'No rules yet.',
  saveRule: 'Add rule',
  updateRule: 'Update',
  clear: 'Clear',
  hint: 'Hint',
  situation: 'situation',
  action: 'action',
  fixRules: 'Fix the rules',
  clearAll: 'Delete all rules',
  clearAllConfirm: 'Delete all — sure?',
  watchAgain: 'Replay',
  turn: (name: string) => `${name}'s turn`,
  crewTurn: 'Whole crew',
  soloTurn: 'Your rule',
  ruleOf: (a: number, b: number) => `${a} of ${b}`,
  builderIdle: 'Pick a situation, then an action.',
}
