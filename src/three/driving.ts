/**
 * How the vehicle actually drives.
 *
 * The old scene animated lateral position directly: to change lane it tweened
 * z while x was tweened somewhere else. That is a crab, not a car — the body
 * slid across the tarmac with the wheels pointing the wrong way, which is
 * exactly what "it looks like it's flying" describes.
 *
 * This is a KINEMATIC BICYCLE MODEL, the standard way a car's motion is
 * approximated. Its whole point is the constraint it enforces:
 *
 *     the vehicle can only ever move along its own heading.
 *
 * Sideways sliding is not damped or hidden — it is impossible to express. To
 * get across the road the vehicle must steer, and steering rotates the heading,
 * and the position follows the heading. That is the manner a real car moves in.
 *
 *     x' = v·cos ψ
 *     z' = −v·sin ψ
 *     ψ' = (v / L)·tan δ
 *
 * ψ is the heading (0 = straight down the road, +X), δ the front-wheel angle,
 * L the wheelbase. Note ψ' scales with v: at a standstill the wheels can turn
 * but the vehicle goes nowhere and rotates not at all, which is correct and is
 * why a lane change now has to be driven rather than played.
 *
 * Steering comes from PURE PURSUIT: aim at a point a little way ahead on the
 * lane you want, and turn as hard as needed to arc onto it. The lookahead grows
 * with speed, so fast changes are long and lazy and slow ones are tight — the
 * S-curve falls out of the geometry instead of being keyframed.
 */

/** Metres between front and rear axle. Sets how tightly the van can turn. */
export const WHEELBASE = 3.3
/** About 30° at the front wheels — a van, not a go-kart. */
export const MAX_STEER = 0.52
/** How fast the steering itself moves, rad/s. Stops instant wheel snaps. */
export const STEER_RATE = 3.0
/**
 * Braking and acceleration, m/s².
 *
 * These set the FEEL of the whole game: stop distances are derived from them
 * (v = sqrt(2ad)), so gentle values made every leg a slow glide up to a soft
 * stop. An EV's brisk pull-away and firm, confident braking read as a car
 * that knows what it is doing — which is the lesson.
 */
export const BRAKE_A = 5.2
export const ACCEL_A = 6.5

export interface CarState {
  x: number
  z: number
  /** Radians. 0 points down the road (+X); positive turns toward −Z. */
  heading: number
  speed: number
  steer: number
}

export function makeCar(x: number, z: number): CarState {
  return { x, z, heading: 0, speed: 0, steer: 0 }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

export interface DriveInputs {
  /** Lane centre to converge on, in world z. */
  targetLane: number
  /** Where to come to rest, in world x. Null cruises on. */
  stopAt: number | null
  /** Desired speed, m/s. Zero holds position. */
  cruise: number
  /**
   * Manual steering override, radians. When set, pure pursuit is bypassed and
   * the wheels are driven to this angle — the U-turn is a scripted manoeuvre,
   * not a lane the van converges on. Null/undefined returns control to pursuit.
   */
  manual?: number | null
  /**
   * How urgently to steer, 1 = normal.
   *
   * A lane change and a swerve round an obstacle are not the same manoeuvre.
   * The lane change is long and lazy on purpose; the swerve has to be out and
   * back in the space of the obstacle itself. Raising this shortens the
   * lookahead and quickens the wheels, which tightens the arc without
   * abandoning the bicycle model — the car still has to steer to move sideways.
   */
  agility?: number
}

/**
 * Advance the car one frame.
 *
 * Returns the distance travelled, which the caller uses to roll the wheels — so
 * the wheels can never turn at a speed the body is not actually doing.
 */
export function stepCar(car: CarState, input: DriveInputs, dt: number): number {
  // ---- longitudinal --------------------------------------------------------
  let want = Math.max(0, input.cruise)

  if (input.stopAt !== null && input.manual == null) {
    const remaining = input.stopAt - car.x
    if (remaining <= 0.04) {
      want = 0
    } else {
      // v = sqrt(2·a·d) is the fastest speed from which this distance can still
      // be stopped in comfortably. Taking the minimum makes the vehicle ease
      // down to a halt exactly on its mark rather than arriving and jerking.
      want = Math.min(want, Math.sqrt(2 * BRAKE_A * remaining))
    }
  }

  const rate = want > car.speed ? ACCEL_A : BRAKE_A * 1.7
  car.speed += clamp(want - car.speed, -rate * dt, rate * dt)
  if (car.speed < 0.02) car.speed = 0

  // ---- lateral: manual override -------------------------------------------
  if (input.manual != null) {
    car.steer += clamp(input.manual - car.steer, -STEER_RATE * dt, STEER_RATE * dt)
    car.heading += (car.speed / WHEELBASE) * Math.tan(car.steer) * dt
    const moved = car.speed * dt
    car.x += Math.cos(car.heading) * moved
    car.z -= Math.sin(car.heading) * moved
    return moved
  }

  // ---- lateral: pure pursuit ----------------------------------------------
  // Aim at a point on the target lane, a lookahead ahead down the road. Long
  // at speed, short when crawling, so the arc always suits the pace.
  // A longer lookahead flattens the arc. Tuned by watching the top-down view:
  // shorter than this and the van crosses at a visibly steep angle, like a taxi
  // cutting across, rather than easing over the way a van does.
  const agility = Math.max(0.4, input.agility ?? 1)
  const lookahead = clamp((6.5 + car.speed * 1.15) / agility, 3.2, 20)
  const dx = lookahead
  const dz = input.targetLane - car.z

  const cos = Math.cos(car.heading)
  const sin = Math.sin(car.heading)
  // Vehicle frame: forward is (cos, −sin), right is (sin, cos).
  const lateral = dx * sin + dz * cos
  const distSq = dx * dx + dz * dz
  const curvature = distSq > 0.01 ? (2 * lateral) / distSq : 0

  // A goal to the RIGHT (positive lateral) needs a right turn, and a right turn
  // is a negative heading change — hence the sign.
  const steerWant = clamp(-Math.atan(curvature * WHEELBASE), -MAX_STEER, MAX_STEER)
  const steerRate = STEER_RATE * agility
  car.steer += clamp(steerWant - car.steer, -steerRate * dt, steerRate * dt)

  // ---- integrate -----------------------------------------------------------
  // Heading only changes while the vehicle is rolling: this is the line that
  // makes a stationary car unable to pivot, and a moving one unable to slide.
  car.heading += (car.speed / WHEELBASE) * Math.tan(car.steer) * dt
  const travelled = car.speed * dt
  car.x += Math.cos(car.heading) * travelled
  car.z -= Math.sin(car.heading) * travelled

  // The last centimetres: pursuit converges asymptotically, which reads as a
  // wobble that never quite ends. Once essentially in lane and straight, ease
  // the residue away so the vehicle visibly SETTLES INTO the lane.
  const offLane = input.targetLane - car.z
  if (Math.abs(offLane) < 0.3 && Math.abs(car.heading) < 0.05) {
    car.z += offLane * Math.min(1, dt * 4 * agility)
    car.heading *= Math.max(0, 1 - dt * 5 * agility)
    if (Math.abs(input.targetLane - car.z) < 0.02) car.z = input.targetLane
  }
  return travelled
}

/** True once the car is sitting on its target lane and pointing straight. */
export function settledInLane(car: CarState, targetLane: number) {
  return Math.abs(car.z - targetLane) < 0.18
    && Math.abs(car.heading) < 0.035
    && Math.abs(car.steer) < 0.06
}

/** True once the car has stopped on its mark. */
export function stoppedAt(car: CarState, stopAt: number) {
  return car.speed < 0.05 && Math.abs(car.x - stopAt) < 0.6
}
