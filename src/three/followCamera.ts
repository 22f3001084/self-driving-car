import * as THREE from 'three'

export interface MouseOrbit { yaw: number; pitch: number; zoom: number }
const clamp = THREE.MathUtils.clamp

/** A drag starts from displacement, not accumulated hand jitter. */
export class CameraGesture {
  private startX = 0
  private startY = 0
  private lastX = 0
  private lastY = 0
  dragging = false
  begin(x: number, y: number) {
    this.startX = this.lastX = x
    this.startY = this.lastY = y
    this.dragging = false
  }
  move(x: number, y: number): [number, number] | null {
    if (!this.dragging && Math.hypot(x - this.startX, y - this.startY) <= 6) return null
    this.dragging = true
    const delta: [number, number] = [x - this.lastX, y - this.lastY]
    this.lastX = x
    this.lastY = y
    return delta
  }
}

/** Use displayed canvas size, so the same drag works in a window or fullscreen. */
export function dragOrbit(orbit: MouseOrbit, dx: number, dy: number, height: number) {
  const radians = Math.PI / Math.max(height, 1)
  orbit.yaw -= dx * radians
  orbit.pitch = clamp(orbit.pitch + dy * radians, -0.12, 0.8)
}

/** Orbit around the car, not a distant point on the road. */
export function followPose(x: number, z: number, heading: number, orbit: MouseOrbit) {
  const yaw = heading + orbit.yaw
  const pitch = clamp(0.29 + orbit.pitch, 0.17, 1.09)
  const distance = 10.8 * orbit.zoom
  const horizontal = Math.cos(pitch) * distance
  // Reduce the look-ahead as the mouse raises the camera, keeping the car in shot.
  const ahead = 3 * Math.cos(pitch) ** 3
  return {
    position: new THREE.Vector3(x - Math.cos(yaw) * horizontal,
      1.1 + Math.sin(pitch) * distance, z + Math.sin(yaw) * horizontal),
    target: new THREE.Vector3(x + Math.cos(yaw) * ahead, 1.1, z - Math.sin(yaw) * ahead),
  }
}
