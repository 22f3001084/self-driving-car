import { waypointsFor, type ChallengeId } from './sim'

/** The three engineer turns share one loaded street and one vehicle. */
export function sceneForLesson(id: ChallengeId): ChallengeId {
  return id === 'l1' || id === 'l2' || id === 'l3' ? 'l3' : id
}

export function routeForLesson(id: ChallengeId, continuing: boolean) {
  const route = waypointsFor(id)
  // On the third handoff the scooter and gate are already behind the car.
  // A separately opened verification run can still test the whole route.
  return id === 'l3' && continuing
    ? route.filter((point) => point.trigger === 'ARRIVED')
    : route
}
