import type { SensorPackage } from './store'

/* ==========================================================================
   THE FAULT CARDS — the game's one interaction.

   NV-1 leaves the depot with a corrupted rulebook. Every time something is in
   its way it stops dead and asks, and the player answers by choosing one of
   three cards. The chosen card is written into the policy as a real rule, so
   the priority scan, the mission report and the whole teaching arc are
   unchanged — the child just never has to compose a rule out of chips to make
   progress.

   Why three, and why cards: composing IF/THEN from a tray of ten tokens is
   four decisions (which condition, which action, whether to join them, in what
   order) before anything at all happens. This is one decision, in type large
   enough to read from the back of a classroom, and the two wrong answers are
   the two mistakes children actually make — so a wrong pick teaches as much as
   a right one. The rule builder is still there for anyone who wants it; it is
   simply no longer the gate.

   `why` is shown on the card AFTER it is picked. It is the whole lesson, so it
   names the consequence rather than saying "wrong".

   A card is its label and nothing else. There used to be a `detail` sub-line
   per card and a `sub` line under every banner title; neither had been drawn
   anywhere for a while, and when they were they only restated the label, the
   title or the hint. One screen, one telling.
   ========================================================================== */

/**
 * What the car visibly DOES when this card is picked.
 *
 * Every card is carried out — that is the point. A wrong answer is not refused,
 * it is DRIVEN, and the child watches it go wrong from whatever angle they like.
 * The kind decides both the choreography and what the review camera ends up
 * looking at.
 *
 *   pass       the rule works; the car gets through
 *   crash      the car hits the thing in its way
 *   nearmiss   a PERSON or an animal is involved: the car locks up and stops
 *              centimetres short. Never a collision with a person on screen —
 *              "you missed them by luck, not by rule" lands without showing a
 *              nine-year-old a car hitting a child
 *   skid       nothing to hit: the car loses grip and slides across the road
 *   stuck      the car halts and waits for something that will never change
 *   overshoot  the car sails past the thing it should have stopped for
 *   abandon    the car turns round and leaves; the parcel never arrives
 *   blocked    the car is still in the way of something that needed the lane
 */
export type Outcome =
  | 'pass' | 'crash' | 'nearmiss' | 'skid' | 'stuck' | 'overshoot' | 'abandon' | 'blocked'

export interface Choice {
  /** Action tokens this card writes into the rule. */
  actions: string[]
  /** The big line on the card — the only line on the card. */
  label: string
  correct?: boolean
  /** What the car does when this is picked. Absent means 'pass'. */
  outcome?: Outcome
  /** Shown after the car has carried it out. For a wrong card, the consequence. */
  why: string
}

export const CHOICES: Record<string, Choice[]> = {
  SCOOTER: [
    {
      actions: ['SLOW'], correct: true,
      label: 'Go slowly around the scooter',
      why: 'The scooter is parked. The car checks the space and goes slowly around it.',
    },
    {
      actions: ['FULLSTOP'], outcome: 'stuck',
      label: 'Stop and wait',
      why: 'This scooter stays parked during the game. Waiting does not clear the road.',
    },
    {
      actions: ['SPEEDUP'], outcome: 'crash',
      label: 'Drive fast past the scooter',
      why: 'The car goes too fast to turn safely around the scooter.',
    },
  ],
  NARROW: [
    {
      actions: ['SLOW'], correct: true,
      label: 'Go slowly through the gap',
      why: 'The car lines up with the gap, then drives through slowly.',
    },
    {
      actions: ['SPEEDUP'], outcome: 'crash',
      label: 'Drive fast through the gap',
      why: 'The gap is small. At this speed, the car cannot steer through safely.',
    },
    {
      actions: ['TURN'], outcome: 'abandon',
      label: 'Turn around and leave',
      why: 'The car fits through the gap. Turning away leaves the delivery unfinished.',
    },
  ],
  ARRIVED: [
    {
      actions: ['DELIVER'], correct: true,
      label: 'Stop and give the parcel',
      why: 'The car needs a rule that tells it to stop and give the parcel at the clinic.',
    },
    {
      actions: ['SLOW'], outcome: 'overshoot',
      label: 'Keep driving past the clinic',
      why: 'The car drives past with the parcel still inside. It needs to stop here.',
    },
    {
      actions: ['TURN'], outcome: 'abandon',
      label: 'Go home instead',
      why: 'The clinic needs the parcel. Going home leaves the job unfinished.',
    },
  ],
  MOVING: [
    {
      actions: ['FULLSTOP'], correct: true,
      label: 'Stop and let the child cross',
      why: 'The car stops before the child, waits for them to cross, then drives on.',
    },
    {
      actions: ['SLOW'], outcome: 'nearmiss',
      label: 'Drive slowly past the child',
      why: 'The child is still crossing. The car must wait for the road to clear.',
    },
    {
      actions: ['HONK'], outcome: 'nearmiss',
      label: 'Beep and keep going',
      why: 'Beeping does not keep the child out of the way. The car needs to stop.',
    },
  ],
  MANY_MOVING: [
    {
      actions: ['WAIT_CLEAR'], correct: true,
      label: 'Wait for everyone to cross',
      why: 'The car waits until every person has crossed before it moves again.',
    },
    {
      actions: ['SLOW'], outcome: 'nearmiss',
      label: 'Drive between the people',
      why: 'People are still crossing. Driving between them leaves too little space.',
    },
    {
      actions: ['HONK'], outcome: 'stuck',
      label: 'Beep instead of waiting',
      why: 'The people need time to cross. Beeping does not clear the road.',
    },
  ],
  ROAD_WET: [
    {
      actions: ['SLOW_EARLY', 'LEAVE_SPACE'], correct: true,
      label: 'Slow early and leave a gap',
      why: 'The wet road is slippery. The car slows earlier and leaves more space to stop.',
    },
    {
      actions: ['NORMAL_SPEED'], outcome: 'skid',
      label: 'Keep the same speed',
      why: 'The wet road needs more stopping space. The old speed does not leave enough.',
    },
    {
      actions: ['SPEEDUP'], outcome: 'skid',
      label: 'Drive faster on the wet road',
      why: 'The wheels can slip on the wet road. Going faster makes stopping harder.',
    },
  ],
  EMERGENCY_BEHIND: [
    {
      actions: ['MOVE_ASIDE', 'STOP_SAFE'], correct: true,
      label: 'Pull to the side, then stop',
      why: 'The car does two things in order: moves out of the lane, then stops safely.',
    },
    {
      actions: ['FULLSTOP'], outcome: 'blocked',
      label: 'Stop in this lane',
      why: 'The car stops in the lane, so the ambulance still cannot get past.',
    },
    {
      actions: ['RACE_AHEAD'], outcome: 'blocked',
      label: 'Drive faster in front of it',
      why: 'The car stays in the ambulance’s way. It needs to make space instead.',
    },
  ],
  CYCLIST: [
    {
      actions: ['SLOW', 'LEAVE_SPACE'], correct: true,
      label: 'Follow slowly, leaving a big gap',
      why: 'The car stays behind the bicycle with a safe gap. There is no room to pass here.',
    },
    {
      actions: ['HONK'], outcome: 'nearmiss',
      label: 'Beep and drive past the bicycle',
      why: 'Beeping does not make the lane wider. There is still no room to pass.',
    },
    {
      actions: ['SPEEDUP'], outcome: 'nearmiss',
      label: 'Drive fast past the bicycle',
      why: 'The car gets too close to the bicycle. It needs to stay behind.',
    },
  ],
  DOG: [
    {
      actions: ['FULLSTOP', 'HONK'], correct: true,
      label: 'Stop, then beep once',
      why: 'The car stops first. In this game, one beep gets the dog’s attention. The car waits until it moves away.',
    },
    {
      actions: ['FULLSTOP'], outcome: 'stuck',
      label: 'Stop and wait',
      why: 'Stopping protects the dog. In this scene, the dog also needs a sound to notice the car.',
    },
    {
      actions: ['SLOW'], outcome: 'nearmiss',
      label: 'Drive around the dog',
      why: 'The dog could step into the car’s path. The car needs to stop first.',
    },
  ],
  ROAD_BLOCKED: [
    {
      actions: ['HONK'], correct: true,
      label: 'Beep once, then wait',
      why: 'The person hears the beep and steps aside. The car waits until the lane is clear.',
    },
    {
      actions: ['WAIT_CLEAR'], outcome: 'stuck',
      label: 'Wait for them to move',
      why: 'In this scene, the person has not noticed the quiet car. Waiting alone does not get their attention.',
    },
    {
      actions: ['TURN'], outcome: 'abandon',
      label: 'Turn back',
      why: 'There is a way forward once the person moves. Turning back leaves the delivery unfinished.',
    },
  ],
  FOG: [
    {
      actions: ['SLOW_EARLY', 'HONK'], correct: true,
      label: 'Slow down and beep',
      why: 'The car slows because it cannot see far ahead. A short beep lets the person hear it.',
    },
    {
      actions: ['NORMAL_SPEED'], outcome: 'crash',
      label: 'Keep the same speed',
      why: 'The fog hides the road ahead. At this speed the car sees the obstacle too late.',
    },
    {
      actions: ['SPEEDUP'], outcome: 'crash',
      label: 'Drive faster through the fog',
      why: 'The car cannot see what is ahead. Driving faster gives it less time to stop.',
    },
  ],
  DEAD_END: [
    {
      actions: ['TURN'], correct: true,
      label: 'Turn around and go back',
      why: 'The barriers block the whole road. The car turns back to find another route.',
    },
    {
      actions: ['WAIT_CLEAR'], outcome: 'stuck',
      label: 'Wait for it to open',
      why: 'These barriers stay in place during the game. Waiting does not open the road.',
    },
    {
      actions: ['HONK'], outcome: 'stuck',
      label: 'Beep at the barrier',
      why: 'The barriers cannot hear a horn or move out of the way.',
    },
  ],
}

/** The headline over the three cards, per hazard. One line — the street shows
    the scene and the hint carries the reasoning, so there is no sub-line. */
export const faultCopy: Record<string, { title: string }> = {
  SCOOTER: { title: 'A scooter is parked half in the lane' },
  NARROW: { title: 'The road is closed except one gap' },
  ARRIVED: { title: 'This is the clinic' },
  MOVING: { title: 'Someone is crossing' },
  MANY_MOVING: { title: 'People are using the crossing' },
  ROAD_WET: { title: 'The road is wet' },
  EMERGENCY_BEHIND: { title: 'An ambulance is coming from behind' },
  CYCLIST: { title: 'A bicycle is ahead in our lane' },
  DOG: { title: 'A dog is standing in the road' },
  ROAD_BLOCKED: { title: 'Someone is standing in the lane' },
  FOG: { title: 'The fog makes it hard to see' },
  DEAD_END: { title: 'Barriers block the whole road' },
}

/**
 * The HUD's own words.
 *
 * `wrongLead`, `rightLead`, `again`, `proceed` and `writeYourOwn` are gone with
 * the dialogue box they belonged to: a card no longer turns over to say it was
 * wrong (the car goes and crashes instead, which is `outcomeCopy`), there is no
 * confirm step, and the rule builder is reached from the street's dock rather
 * than from under the question.
 */
export const faultUi = {
  eyebrow: 'A new problem',
  question: (name: string) => `What should ${name} do?`,
  prompt: 'Choose what the car should do.',
}

/**
 * Deterministic shuffle.
 *
 * The right answer must not always be first, but it must also not move while
 * the child is looking at it — so the order is a pure function of the hazard
 * and how many times they have tried, never of render count.
 */
export function shuffled<T>(items: readonly T[], seed: string): T[] {
  let state = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    state ^= seed.charCodeAt(i)
    state = Math.imul(state, 16777619) >>> 0
  }
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const j = state % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * The hint: what the child is being asked to work out, in one line.
 *
 * On screen the whole time the cards are up, not behind a button. A hint that
 * has to be asked for is a hint most children never see, and the thing this
 * game teaches is not "guess" — it is the reasoning. The hint names the
 * CONSTRAINT and never the answer.
 */
export const hazardHint: Record<string, string> = {
  SCOOTER: 'The scooter is parked. Look for space around it.',
  NARROW: 'The car fits, but there is very little space on either side.',
  ARRIVED: 'The parcel must be given to this clinic.',
  MOVING: 'The child is crossing the car’s path.',
  MANY_MOVING: 'More people are still crossing the road.',
  ROAD_WET: 'The car takes longer to stop on a wet road.',
  EMERGENCY_BEHIND: 'The ambulance needs a clear lane to get past.',
  CYCLIST: 'There is no room beside the bicycle. Think about the gap behind it.',
  DOG: 'The dog has not noticed the quiet car.',
  ROAD_BLOCKED: 'The person is facing away and has not noticed the car.',
  FOG: 'An obstacle is hidden in the fog ahead.',
  DEAD_END: 'There is no gap between these barriers.',
}

/**
 * The line under the verdict when the car has just failed.
 *
 * Every wrong answer now ends in a crash, so the badge is always the same one
 * word: a child learns one red mark and knows instantly what happened. What
 * differs is the LEAD, which says how their particular answer got there — the
 * horn that nobody heard, the wait that changed nothing, the swerve that came
 * too late. Same ending, different route to it, and the route is the lesson.
 */
export const outcomeCopy: Record<string, { tag: string; lead: string }> = {
  crash: { tag: 'CRASHED', lead: 'NV-1 drove straight into it.' },
  nearmiss: { tag: 'CRASHED', lead: 'NV-1 swerved at the last second and hit the kerb.' },
  skid: { tag: 'CRASHED', lead: 'NV-1 had no grip left, slid, and hit the kerb.' },
  stuck: { tag: 'CRASHED', lead: 'NV-1 waited, nothing changed, so it edged forward anyway — and crashed.' },
  overshoot: { tag: 'CRASHED', lead: 'NV-1 went straight past and ran out of road.' },
  abandon: { tag: 'CRASHED', lead: 'NV-1 swung round across the street and hit the kerb.' },
  blocked: { tag: 'CRASHED', lead: 'The ambulance ran into the back of NV-1.' },
}

export const reviewUi = {
  dragHint: 'Drag to look around · pinch or scroll to zoom',
  retry: 'Try again',
}

/**
 * The rear-sensor question, as three cards.
 *
 * Every other hazard in this game is in front of the car, and a car that only
 * looks forward handles all of them. Then an ambulance comes up behind, and the
 * child meets the one problem no rule can solve: you cannot write a rule about
 * something the car never notices. So this deck comes BEFORE the rule cards,
 * once, on the ambulance beat.
 *
 * `arcs` is drawn on the face of the card itself — a shaded wedge behind a
 * top-down car is a picture of "rear sensor", and the words are not.
 */
export interface SensorChoice {
  id: SensorPackage
  label: string
  why: string
  correct?: boolean
  arcs: ('front' | 'side' | 'rear')[]
}

export const SENSOR_CHOICES: SensorChoice[] = [
  {
    id: 'front',
    label: 'Front only',
    arcs: ['front'],
    why: 'This is what the car has now. Nothing points backwards — so to the car, the ambulance does not exist.',
  },
  {
    id: 'frontSide',
    label: 'Front and sides',
    arcs: ['front', 'side'],
    why: 'No help here. The ambulance is directly behind — side sensors spot it too late.',
  },
  {
    id: 'allRound',
    label: 'Front, sides and back',
    correct: true,
    arcs: ['front', 'side', 'rear'],
    why: 'Right. Now the car can see behind it — and now a rule about it can work.',
  },
]

/** The headline over the sensor deck. */
export const sensorCopy = {
  eyebrow: 'The car needs to see behind',
  title: (name: string) => `The ambulance is right behind — and ${name} cannot see it`,
  question: (name: string) => `Which sensors should ${name} have?`,
  hint: 'The ambulance is behind the car. Which sensors can see it?',
}
