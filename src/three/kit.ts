import * as THREE from 'three'

/**
 * Shared palette, procedural textures and material helpers.
 *
 * Every asset in this game is BUILT IN CODE — geometry from primitives, texture
 * from canvas. Nothing is loaded from a file. That is a deliberate constraint,
 * not a shortcut: the activity ships as a folder a teacher double-clicks, and a
 * `file://` page cannot fetch a .glb or a .ktx2 without a server. Procedural
 * assets also stay crisp at any resolution and cost about 40 KB of source
 * instead of 40 MB of binaries.
 */

/** CityRide, from the SKAI Space design system. */
export const PAL = {
  orange: 0xfca01b,
  darkOrange: 0xe07a00,
  navy: 0x091c56,
  mint: 0x45cdb5,
  teal: 0x0f8f87,
  sky: 0xd7eef9,
  white: 0xf7fbff,
  offWhite: 0xe8eef5,
  asphalt: 0x3b3f47,
  asphaltWet: 0x2a2e36,
  kerb: 0xb9bec7,
  pavement: 0xa8aeb8,
  brick: 0xa5523c,
  brickDark: 0x8a4231,
  concrete: 0xc2c6cd,
  cream: 0xded3bd,
  glass: 0x6f9fc0,
  steel: 0x8d949e,
  leaf: 0x4e8f52,
  trunk: 0x6b5138,
  skin: 0xb9825c,
  red: 0xd7263d,
  yellow: 0xf5c53d,
}

/** A tiny deterministic RNG. The city looks the same on every machine, which
 *  matters when a screenshot is the bug report. */
export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function canvas(w: number, h: number) {
  const el = document.createElement('canvas')
  el.width = w
  el.height = h
  const ctx = el.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  return { el, ctx }
}

function finish(el: HTMLCanvasElement, repeatX = 1, repeatY = 1) {
  const texture = new THREE.CanvasTexture(el)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeatX, repeatY)
  texture.anisotropy = 4
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function hex(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`
}

/**
 * Road surface. U runs ALONG the road, V across it, matching a ground plane
 * that is only rotated about X — so lane markings are horizontal bands here
 * and become lines running into the distance on screen.
 */
export function roadTexture(lengthTiles: number) {
  const { el, ctx } = canvas(512, 256)
  ctx.fillStyle = hex(PAL.asphalt)
  ctx.fillRect(0, 0, 512, 256)

  // Grain. Without it, a big flat plane reads as plastic under a directional light.
  const random = rng(7)
  for (let i = 0; i < 6400; i += 1) {
    const shade = 26 + random() * 34
    ctx.fillStyle = `rgba(${shade + 12},${shade + 14},${shade + 20},${0.16 + random() * 0.3})`
    ctx.fillRect(random() * 512, random() * 256, 1 + random() * 2, 1 + random() * 2)
  }
  // A faint darker band down each wheel track, as real tarmac polishes up.
  ctx.fillStyle = 'rgba(20,22,26,0.12)'
  ctx.fillRect(0, 46, 512, 26)
  ctx.fillRect(0, 184, 512, 26)

  // Kerbside edge lines: solid, full length.
  ctx.fillStyle = 'rgba(240,244,250,0.8)'
  ctx.fillRect(0, 8, 512, 5)
  ctx.fillRect(0, 243, 512, 5)
  // Centre dashes, repeating along the road.
  for (let x = 0; x < 512; x += 128) ctx.fillRect(x + 20, 125, 74, 6)

  return finish(el, lengthTiles, 1)
}

/** Pavement: slabs with a joint grid. */
export function pavementTexture(tiles: number) {
  const { el, ctx } = canvas(128, 128)
  ctx.fillStyle = hex(PAL.pavement)
  ctx.fillRect(0, 0, 128, 128)
  ctx.strokeStyle = 'rgba(90,96,105,0.55)'
  ctx.lineWidth = 2
  for (let i = 0; i <= 128; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke()
  }
  const random = rng(19)
  for (let i = 0; i < 900; i += 1) {
    const shade = 150 + random() * 40
    ctx.fillStyle = `rgba(${shade},${shade + 4},${shade + 10},0.2)`
    ctx.fillRect(random() * 128, random() * 128, 2, 2)
  }
  return finish(el, tiles, 2)
}

/**
 * A building facade: base colour, floor bands, and a grid of windows with a
 * few lit. `seed` varies the lit pattern so no two towers match.
 */
export function facadeTexture(base: number, floors: number, seed: number, brick = false) {
  const cols = 4
  const { el, ctx } = canvas(128, 32 * floors)
  const H = 32 * floors
  ctx.fillStyle = hex(base)
  ctx.fillRect(0, 0, 128, H)

  const random = rng(seed)
  if (brick) {
    // Courses, offset every other row. Reads as brick from any distance.
    ctx.fillStyle = 'rgba(0,0,0,0.10)'
    for (let y = 0; y < H; y += 6) {
      ctx.fillRect(0, y, 128, 1)
      const offset = (y / 6) % 2 === 0 ? 0 : 8
      for (let x = offset; x < 128; x += 16) ctx.fillRect(x, y, 1, 6)
    }
  } else {
    for (let i = 0; i < 1400; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${random() * 0.05})`
      ctx.fillRect(random() * 128, random() * H, 3, 3)
    }
  }

  // Windows.
  for (let floor = 0; floor < floors; floor += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = 12 + col * 28
      const y = floor * 32 + 9
      const lit = random() > 0.66
      ctx.fillStyle = lit ? 'rgba(255,214,140,0.95)' : 'rgba(52,72,96,0.92)'
      ctx.fillRect(x, y, 18, 15)
      // Frame + a highlight so glass catches the eye without a reflection pass.
      ctx.strokeStyle = 'rgba(20,28,44,0.55)'
      ctx.lineWidth = 1.5
      ctx.strokeRect(x, y, 18, 15)
      if (!lit) {
        ctx.fillStyle = 'rgba(180,214,240,0.35)'
        ctx.beginPath()
        ctx.moveTo(x + 1, y + 14); ctx.lineTo(x + 17, y + 1); ctx.lineTo(x + 17, y + 6)
        ctx.lineTo(x + 6, y + 14); ctx.closePath(); ctx.fill()
      }
    }
    // Floor band.
    ctx.fillStyle = 'rgba(0,0,0,0.13)'
    ctx.fillRect(0, floor * 32 + 28, 128, 3)
  }
  return finish(el)
}

/** Ground-floor shopfront strip, applied to the lowest 4 m of a building. */
export function shopTexture(seed: number) {
  const { el, ctx } = canvas(256, 128)
  const random = rng(seed)
  const awnings = [PAL.orange, PAL.mint, PAL.red, PAL.teal]
  ctx.fillStyle = hex(PAL.cream)
  ctx.fillRect(0, 0, 256, 128)

  for (let bay = 0; bay < 2; bay += 1) {
    const x = bay * 128
    // Glass.
    ctx.fillStyle = 'rgba(58,88,116,0.92)'
    ctx.fillRect(x + 12, 44, 104, 74)
    ctx.fillStyle = 'rgba(190,220,244,0.3)'
    ctx.beginPath(); ctx.moveTo(x + 14, 116); ctx.lineTo(x + 112, 46); ctx.lineTo(x + 112, 62)
    ctx.lineTo(x + 44, 116); ctx.closePath(); ctx.fill()
    // Awning.
    const colour = awnings[Math.floor(random() * awnings.length)]
    ctx.fillStyle = hex(colour)
    ctx.fillRect(x + 6, 26, 116, 18)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    for (let s = 0; s < 116; s += 16) ctx.fillRect(x + 6 + s, 26, 8, 18)
    // Sign band.
    ctx.fillStyle = hex(PAL.navy)
    ctx.fillRect(x + 6, 8, 116, 16)
  }
  return finish(el)
}

/** Vertical sky gradient used as the scene background. */
export function skyTexture(top: number, bottom: number) {
  const { el, ctx } = canvas(4, 256)
  const gradient = ctx.createLinearGradient(0, 0, 0, 256)
  gradient.addColorStop(0, hex(top))
  gradient.addColorStop(0.62, hex(bottom))
  gradient.addColorStop(1, '#ffffff')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 4, 256)
  const texture = new THREE.CanvasTexture(el)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** A soft round blob, used for headlight glow and the sun flare. */
export function glowTexture() {
  const { el, ctx } = canvas(64, 64)
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.35, 'rgba(255,240,200,0.55)')
  gradient.addColorStop(1, 'rgba(255,230,170,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)
  const texture = new THREE.CanvasTexture(el)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function matte(color: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.05, ...extra })
}

export function gloss(color: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.2, ...extra })
}

export function glowing(color: number, intensity = 1.6) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    roughness: 0.4,
  })
}

/** Box helper: dimensions in metres, positioned by its CENTRE. */
export function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

export function cyl(
  radius: number,
  height: number,
  material: THREE.Material,
  segments = 16,
) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}
