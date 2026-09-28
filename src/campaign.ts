import { MISSIONS, PATROLS, type MissionId } from './content'
import type { ChallengeId } from './sim'

export const PARTS = [
  { id: 'closed', title: 'Build the brain', skill: 'Find a pattern', goal: 'Teach the car to pass a scooter, fit through a gap and deliver a parcel.', badge: 'Rule Builder', short: 'Build 3 rules' },
  { id: 'live', title: 'Test the rules', skill: 'Test and debug', goal: 'Try the same rules on a busy street. Add a rule to keep a crossing child safe.', badge: 'Problem Solver', short: 'Solve a new problem' },
  { id: 'patrols', title: 'Save the day', skill: 'Use what you learned', goal: 'Help people and animals, handle tricky roads, then complete the final delivery.', badge: 'Street Hero', short: 'Master the patrol' },
] as const
export type Progress = Partial<Record<ChallengeId, boolean>>
export function partStops(id: MissionId): ChallengeId[] {
  return id === 'patrols' ? [...PATROLS.map(p => p.id), 'delivery'] : MISSIONS.find(m => m.id === id)!.levels
}
export function activePart(passed: Progress) {
  return PARTS.findIndex(part => !partStops(part.id).every(id => passed[id]))
}
export function canStartPart(id: MissionId, passed: Progress) {
  return PARTS[activePart(passed)]?.id === id
}
export function playerFor(id: MissionId | null) {
  return Math.max(0, PARTS.findIndex(part => part.id === id))
}
export function playerName(crew: string[], index: number) {
  return crew[index]?.trim() || `Player ${index + 1}`
}

/** Which face a seat wears. Seats fall back to their own index, so a crew
 *  that never opened the picker still gets four different faces. */
export function faceFor(crewFaces: number[], index: number) {
  const face = crewFaces[index]
  return typeof face === 'number' ? face : Math.max(0, index)
}

/** Every stop of the whole run, in the order the crew meets them. */
export const STOP_ORDER: ChallengeId[] = [
  ...MISSIONS.filter(m => !m.isPatrolSet).flatMap(m => m.levels),
  ...PATROLS.map(p => p.id),
  'delivery',
]

/** Every stop that can ask the crew a question. The delivery finale is the
 *  whole team's, so it never belongs to one player. */
const RULE_STOPS: ChallengeId[] = STOP_ORDER.filter(id => id !== 'delivery')

/** How many turns at the wheel each player gets: the twelve deciding stops
 *  divide exactly by 2, 3 or 4, so the split is always clean. */
export function turnsEach(size: number) {
  return Math.floor(RULE_STOPS.length / Math.max(1, size))
}

/**
 * WHOSE TURN IT IS — a live rotation, not a fixed seating plan.
 *
 * The wheel used to be dealt by stop INDEX (stop 5 → player 2, always). That
 * silently skipped people: a stop the crew's own rulebook already answers
 * never asks, so its assigned player simply lost their turn and their counter
 * stuck one short for the rest of the game. The market crossing does exactly
 * that — the broad MOVING rule written on the live road test also matches a
 * crowd, which is the lesson working, not a fault.
 *
 * So a turn is spent by DECIDING, not by arriving: a stop claims the player
 * whose turn it is at the moment it actually asks (`turnOwner`), and the
 * rotation only advances once that stop is solved. A stop the policy answers
 * costs nobody their turn, a retry keeps the wheel with the player who has a
 * rule to fix, and every player therefore gets the same number of real
 * decisions — never differing by more than one mid-game.
 */
export type TurnOwner = Partial<Record<ChallengeId, number>>

/** Whose turn is next in the rotation. */
export function driverAt(turnIndex: number, size: number) {
  return ((turnIndex % size) + size) % size
}

/** Who owns a stop: the player it claimed, or whoever is up next. -1 means
 *  the whole crew (the delivery run). */
export function ownerOf(
  id: ChallengeId | null,
  turnOwner: TurnOwner,
  turnIndex: number,
  size: number,
): number {
  if (!id || id === 'delivery') return -1
  const claimed = turnOwner[id]
  return claimed === undefined ? driverAt(turnIndex, size) : claimed
}

/** Whose seat is hot right now, or -1 when the crew drives the finale. */
export function currentDriver(
  passed: Progress,
  turnOwner: TurnOwner,
  turnIndex: number,
  size: number,
): number {
  const next = STOP_ORDER.find(id => !passed[id]) ?? null
  return ownerOf(next, turnOwner, turnIndex, size)
}

/** What each player has actually done: decisions made, and stars earned. */
export function creditsPerPlayer(
  turnOwner: TurnOwner,
  passed: Progress,
  retries: Partial<Record<ChallengeId, number>>,
  size: number,
) {
  return Array.from({ length: size }, (_, player) => {
    const mine = RULE_STOPS.filter(id => turnOwner[id] === player && passed[id])
    return {
      solved: mine.length,
      stars: mine.reduce((sum, id) => sum + starsFor(retries, id), 0),
    }
  })
}

/** Stars per stop: solved first try → 3, one retry → 2, fought for → 1.
 *  Rewards thinking BEFORE testing — talk it over, then press the key. */
export function starsFor(retries: Partial<Record<ChallengeId, number>>, id: ChallengeId) {
  const extra = retries[id] ?? 0
  return extra === 0 ? 3 : extra === 1 ? 2 : 1
}
export function totalStars(
  passed: Progress,
  retries: Partial<Record<ChallengeId, number>>,
  ids: ChallengeId[] = RULE_STOPS,
) {
  return ids.filter(id => passed[id]).reduce((sum, id) => sum + starsFor(retries, id), 0)
}
export const RULE_STOP_IDS = RULE_STOPS
