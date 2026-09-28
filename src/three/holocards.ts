import * as THREE from 'three'

/**
 * The choice, projected into the street.
 *
 * When NV-1 stops at something it has no rule for, three cards rise out of the
 * road ahead of it. They are real objects in the scene — lit by nothing, facing
 * the camera, standing on their own glowing footprints — not a panel over the
 * top of the picture.
 *
 * Why that matters enough to build: a modal dialogue stops the game to ask a
 * question. It covers the street, it takes the camera's job away from the
 * camera, and it tells a child that the interesting part has paused. Cards in
 * the world are part of the same shot as the car and the thing in its way, so
 * the camera never has to move and nothing is ever hidden behind a form.
 *
 * The faces are drawn on canvas rather than assembled from meshes, because text
 * is the whole payload here and a canvas gives real type at real size. One
 * texture per card, redrawn only when the copy changes.
 */

export interface HoloOption {
  label: string
  /**
   * Sensor coverage to draw on the face, for the rear-sensor card.
   *
   * "Rear sensor" is two words a nine-year-old has no picture for. A shaded
   * wedge behind a car is a picture — and it belongs ON the card, not in a
   * panel somewhere else on the screen describing the card.
   */
  art?: ('front' | 'side' | 'rear')[]
}

/**
 * Card geometry, in metres. Everything else is derived from these.
 *
 * SOLVED, not chosen — `scripts/solve-card-frame.mjs` replicates the placement
 * maths below against the live camera and sweeps these five numbers for the
 * largest cards that still leave the HUD strips clear. The camera at this
 * moment is always the hazard two-shot (the question arrives with the lens
 * already on the hazard and it does not move), so there is one framing to
 * satisfy rather than one per view. At 1600x900 this puts the row inside
 * x -0.88..0.86 and y -0.02..0.58 in NDC, with each face 446 px across.
 *
 * The previous values (4.5 / 2.75 / 5.0 / 5.4 / 3.45) put the leftmost card's
 * outer edge at -1.02 — off the side of the screen — and the whole row from
 * y 0.21 to 0.91, i.e. behind the top strip.
 */
// Preserve the original SKAI plates, with a smaller footprint and the same
// texture detail. The road and the BE6 remain visible below the options.
const CARD_W = 8.5
const CARD_H = 4.7
/** Distance between card centres. CARD_W plus a hair, so they read as three. */
const PITCH = 9.2
/**
 * How far in front of the LENS the row floats, and how high off the road.
 *
 * In front of the lens, not in front of the car. It used to be anchored to the
 * car's own heading, which is the same thing on every rig except the one that
 * matters: the ambulance beat watches the street from a camera three metres
 * ahead of the car looking BACK down the road, so a row eight metres ahead of
 * the car was eight metres behind the camera. The cards were built, lit and
 * visible in the scene graph, and pointing away into the distance behind the
 * viewer — the raycast found nothing under the pointer and the question could
 * not be answered at all.
 *
 * 16.4 m is where the row stood on the default rig, whose boom is 8.4 m: the
 * solved framing is preserved exactly, and every other rig now gets the same
 * framing instead of an accident.
 */
const LENS_DIST = 22
/** The field of view LENS_DIST was solved against. */
const REF_FOV = 62
/** ...and the window shape it was solved against: 16:9. */
const REF_ASPECT = 16 / 9
/** Upper-screen band: clear of both the top buttons and the road problem. */
const SCREEN_CENTRE_Y = 0.57
/**
 * Canvas pixels per metre.
 *
 * The cards are metres across now, not centimetres, so this is per-metre rather
 * than absolute: 130 gives a 1217 px face, which is the same texture budget the
 * old 4.5 m card had at 240 and is still over-sampled for a 450 px slot.
 */
const PX = 160

/**
 * Three cards, three colours, and they are LIGHT.
 *
 * The first version of these was a dark navy hologram with a thin cyan edge:
 * handsome, and wrong for the audience. Three dark slabs across the middle of
 * the frame put the brightest thing on the screen behind them, so the street
 * went gloomy at the exact moment a child is asked to look at it, and white
 * type on near-black at distance is the lowest-legibility combination there is.
 *
 * These are flash cards. Cream body, a fat coloured border, a coloured header
 * band with the number in a white disc, and the answer in deep navy at 150 px.
 * Dark ink on a light card is what every reading primer in the world uses.
 *
 * The colour is per POSITION, not per answer — card one is always blue, two
 * always orange, three always green. A class calls out "the orange one" before
 * anyone has finished reading it, and the numbers on the HUD keypad carry the
 * same three colours so the two controls are visibly the same thing.
 */
/* The card is the deck's plate (Figma 24:2249): one blue diagonal for all
   three, because a card's POSITION is what tells them apart, not its colour —
   three different colours read as three different kinds of answer, which they
   are not. The number disc carries the amber. */
const PLATE = {
  lit: '#2784dd',
  deep: '#154777',
  line: '#ffffff',
  amber: '#fca01b',
  amberLift: '#ffbf63',
  boltFace: '#d9d9d9',
  boltSlot: '#48515d',
  ink: '#2b1400',
  label: '#ffffff',
  shadow: 'rgba(4, 12, 32, 0.5)',
}

/*
 * Type sizes, in canvas pixels on a ~1217 px wide face.
 *
 * The card carries ONE line of copy now. It used to carry a label and a smaller
 * "what the car would actually do" line under it, and the second line was the
 * thing nobody at the back of a room could read — so it went, and the label got
 * the whole face. 150 px over a 1217 px card in a 450 px slot lands at about 55
 * screen pixels: bigger than any other type in the game, which is right,
 * because this is the one moment where a class reads three options at once.
 */
/* Upright, not italic: nothing else in the kit slants its display type, and
   the answer a room reads together should match the plates around it. */
const display = (size: number) =>
  `400 ${size}px 'Fredoka One', 'Chakra Petch', 'Segoe UI Semibold', sans-serif`

/**
 * The type ladder the label is fitted to.
 *
 * Biggest first: the answer is set at the largest size on this list that fits
 * the card in three lines. A fixed size cannot work — "Stop and wait" is two
 * words and "Slow right down and thread the gap" is seven, and at one size
 * either the short one is lost in white space or the long one runs off the
 * bottom of the card, which is exactly what 150 px did to "Slow down and go
 * around".
 */
const LABEL_SIZES = [176, 164, 150, 138, 126, 114, 104, 92, 84]
const FONT_BADGE = "700 88px 'Chakra Petch', 'Segoe UI Semibold', sans-serif"

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * A top-down car with its sensor coverage, nose up.
 *
 * Drawn in a 1x1 box from (x, y) at `size`, so the caller only has to decide
 * where it goes. The rear wedge is the one that matters, so it is the one that
 * gets the warmer colour when it is live.
 */
function drawSenseMap(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number,
  arcs: ('front' | 'side' | 'rear')[],
  colour: { deep: string; mid: string; pale: string },
) {
  const u = size / 120
  const at = (px: number, py: number): [number, number] => [x + px * u, y + py * u]
  const wedge = (points: number[][], on: boolean, warm = false) => {
    ctx.beginPath()
    const [sx, sy] = at(points[0][0], points[0][1])
    ctx.moveTo(sx, sy)
    for (const point of points.slice(1)) {
      const [px, py] = at(point[0], point[1])
      ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fillStyle = on
      ? (warm ? 'rgba(252, 160, 27, 0.55)' : colour.pale)
      : 'rgba(150, 160, 180, 0.16)'
    ctx.fill()
    ctx.strokeStyle = on
      ? (warm ? '#b96d00' : colour.mid)
      : 'rgba(120, 135, 160, 0.4)'
    ctx.lineWidth = 4
    ctx.stroke()
  }
  const has = (arc: 'front' | 'side' | 'rear') => arcs.includes(arc)
  wedge([[44, 24], [76, 24], [96, 0], [24, 0]], has('front'))
  wedge([[46, 34], [46, 58], [12, 66], [12, 26]], has('side'))
  wedge([[74, 34], [74, 58], [108, 66], [108, 26]], has('side'))
  wedge([[44, 70], [76, 70], [94, 96], [26, 96]], has('rear'), true)
  // The car.
  ctx.fillStyle = PLATE.ink
  const [cx, cy] = at(49, 24)
  ctx.fillRect(cx, cy, 22 * u, 46 * u)
  ctx.fillStyle = colour.pale
  const [gx, gy] = at(52, 31)
  ctx.fillRect(gx, gy, 16 * u, 11 * u)
}

/**
 * Paint one card face.
 *
 * The number is a badge in the corner rather than inline with the label,
 * because a child calling out "two!" across a classroom needs it findable
 * without reading the sentence first.
 */
function drawFace(canvas: HTMLCanvasElement, n: number, option: HoloOption) {
  const w = canvas.width
  const h = canvas.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)

  const colour = { deep: PLATE.deep, mid: PLATE.lit, pale: '#dbe6ff' }
  const pad = 30
  const radius = 52
  const bx = pad
  const by = pad
  const bw = w - pad * 2
  const bh = h - pad * 2

  // Drop shadow, painted into the texture: the card is an unlit plane in the
  // scene, so nothing else is going to give it one, and without it the row
  // floats like three stickers.
  ctx.save()
  ctx.shadowColor = PLATE.shadow
  ctx.shadowBlur = 44
  ctx.shadowOffsetY = 24
  roundRect(ctx, bx, by, bw, bh, radius)
  ctx.fillStyle = PLATE.deep
  ctx.fill()
  ctx.restore()

  // The plate itself: the g1 diagonal, corner to corner.
  const face = ctx.createLinearGradient(bx, by, bx + bw * 0.35, by + bh)
  face.addColorStop(0, PLATE.lit)
  face.addColorStop(1, PLATE.deep)
  roundRect(ctx, bx, by, bw, bh, radius)
  ctx.fillStyle = face
  ctx.fill()

  // One white outline. Every plate in the design has exactly this and nothing
  // else — no second border, no chamfer, no stripe.
  ctx.lineWidth = 9
  ctx.strokeStyle = PLATE.line
  roundRect(ctx, bx + 4.5, by + 4.5, bw - 9, bh - 9, radius - 4)
  ctx.stroke()

  // Four slotted screws, the design's "Volt" part: a light disc with a dark
  // slot, inset from each corner.
  const boltR = 17
  const inset = 46
  for (const [sx, sy] of [
    [bx + inset, by + inset], [bx + bw - inset, by + inset],
    [bx + inset, by + bh - inset], [bx + bw - inset, by + bh - inset],
  ]) {
    ctx.beginPath()
    ctx.arc(sx, sy, boltR, 0, Math.PI * 2)
    ctx.fillStyle = PLATE.boltFace
    ctx.fill()
    ctx.fillStyle = PLATE.boltSlot
    ctx.fillRect(sx - boltR * 0.11, sy - boltR * 0.62, boltR * 0.22, boltR * 1.24)
  }

  // The number: an amber disc with a white ring, top-left, clear of the screws.
  const discR = 62
  const cx = bx + 118
  const cy = by + 90
  const disc = ctx.createLinearGradient(cx, cy - discR, cx, cy + discR)
  disc.addColorStop(0, PLATE.amberLift)
  disc.addColorStop(1, PLATE.amber)
  ctx.beginPath()
  ctx.arc(cx, cy, discR, 0, Math.PI * 2)
  ctx.fillStyle = disc
  ctx.fill()
  ctx.lineWidth = 9
  ctx.strokeStyle = PLATE.line
  ctx.stroke()
  ctx.fillStyle = PLATE.ink
  ctx.font = FONT_BADGE
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(n), cx, cy + 4)

  // The label, set at the biggest size on the ladder that actually fits.
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  const inner = bw - 160
  const textTop = by + 170
  // A card with a diagram keeps the bottom 45% for it.
  const room = (bh - 218) * (option.art ? 0.55 : 1)
  const maxLines = option.art ? 2 : 3

  let size = LABEL_SIZES[LABEL_SIZES.length - 1]
  let lines: string[] = []
  for (const candidate of LABEL_SIZES) {
    ctx.font = display(candidate)
    const wrapped = wrap(ctx, option.label, inner)
    if (wrapped.length <= maxLines && wrapped.length * candidate * 1.1 <= room) {
      size = candidate
      lines = wrapped
      break
    }
  }
  if (!lines.length) {
    ctx.font = display(size)
    lines = wrap(ctx, option.label, inner).slice(0, maxLines)
  }
  ctx.font = display(size)
  const step = size * 1.1
  ctx.fillStyle = PLATE.label
  ctx.textAlign = 'center'
  let y = textTop + Math.max(0, (room - lines.length * step) / 2)
  for (const line of lines) {
    ctx.fillText(line, bx + bw / 2, y)
    y += step
  }
  ctx.textAlign = 'left'

  if (option.art) {
    const bottom = by + bh - 44
    const artSize = Math.min(bottom - (textTop + room), bw - 220)
    if (artSize > 60) drawSenseMap(ctx, bx + (bw - artSize) / 2, textTop + room, artSize, option.art, colour)
  }
}

/** A rounded rectangle path. Canvas 2D has `roundRect`, but not everywhere. */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const k = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + k, y)
  ctx.arcTo(x + w, y, x + w, y + h, k)
  ctx.arcTo(x + w, y + h, x, y + h, k)
  ctx.arcTo(x, y + h, x, y, k)
  ctx.arcTo(x, y, x + w, y, k)
  ctx.closePath()
}

/**
 * A soft white halo behind a card.
 *
 * It was cyan, to sell the hologram. The cards are flash cards now, so the glow
 * is a plain warm white — its job is to lift a light card off a light street,
 * not to tint it.
 */
function glowTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(255, 250, 238, 0.75)')
    gradient.addColorStop(0.45, 'rgba(255, 246, 224, 0.2)')
    gradient.addColorStop(1, 'rgba(255, 246, 224, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 128, 128)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** A soft dark ellipse: the shadow a card casts on the road under it. */
function shadowTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, 'rgba(10, 20, 44, 0.5)')
    gradient.addColorStop(0.55, 'rgba(10, 20, 44, 0.2)')
    gradient.addColorStop(1, 'rgba(10, 20, 44, 0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 128, 128)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

interface Card {
  group: THREE.Group
  face: THREE.Mesh
  halo: THREE.Sprite
  footprint: THREE.Mesh
  canvas: HTMLCanvasElement
  texture: THREE.CanvasTexture
  /** Eased 0..1: how raised and bright this card is. */
  heat: number
  /** Set once the child has committed to it. */
  chosen: boolean
  dismissed: boolean
}

export class HoloDeck {
  /** Reduced motion: the idle bob goes; everything informative stays. */
  calm = false
  readonly group = new THREE.Group()
  private cards: Card[] = []
  private glow = glowTexture()
  private shade = shadowTexture()
  private raycaster = new THREE.Raycaster()
  private hovered: number | null = null
  private shown = false
  /** Eased 0..1 for the whole deck, so it rises and sinks rather than blinking. */
  private presence = 0
  private committed: number | null = null
  private commitAge = 0

  constructor(private scene: THREE.Scene) {
    this.group.visible = false
    this.group.renderOrder = 20
    scene.add(this.group)
  }

  get visible() { return this.shown }
  /** Which card the pointer is over, for the cursor. */
  get hoverIndex() { return this.hovered }

  private build(count: number) {
    while (this.cards.length < count) {
      const group = new THREE.Group()

      const canvas = document.createElement('canvas')
      canvas.width = Math.round(CARD_W * PX)
      canvas.height = Math.round(CARD_H * PX)
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 4

      // Basic, not Standard: a hologram is not lit by the sun. depthWrite off so
      // three cards overlapping at the edges do not punch holes in each other.
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(CARD_W, CARD_H),
        new THREE.MeshBasicMaterial({
          map: texture, transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
        }),
      )
      face.renderOrder = 22
      group.add(face)

      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glow, transparent: true, depthWrite: false, depthTest: false, opacity: 0.42,
        blending: THREE.AdditiveBlending, toneMapped: false,
      }))
      halo.scale.set(CARD_W * 1.5, CARD_H * 1.9, 1)
      halo.renderOrder = 21
      group.add(halo)

      // A shadow on the tarmac under each card, so the row stands in the street
      // rather than being stuck on the lens. The cyan projector beam that used
      // to run from card to road went with the hologram look — it was a column
      // of light across the carriageway, and one more thing on the screen.
      const footprint = new THREE.Mesh(
        new THREE.PlaneGeometry(CARD_W * 0.8, CARD_W * 0.34),
        new THREE.MeshBasicMaterial({
          map: this.shade, transparent: true, opacity: 0.55, depthWrite: false,
          side: THREE.DoubleSide, toneMapped: false,
        }),
      )
      footprint.rotation.x = -Math.PI / 2
      footprint.renderOrder = 5

      this.group.add(group, footprint)
      this.cards.push({
        group, face, halo, footprint, canvas, texture,
        heat: 0, chosen: false, dismissed: false,
      })
    }
  }

  show(options: HoloOption[]) {
    this.build(options.length)
    for (const [i, card] of this.cards.entries()) {
      const option = options[i]
      const live = Boolean(option)
      card.group.visible = live
      card.footprint.visible = live
      card.heat = 0
      card.chosen = false
      card.dismissed = false
      if (option) {
        drawFace(card.canvas, i + 1, option)
        card.texture.needsUpdate = true
      }
    }
    this.hovered = null
    this.committed = null
    this.commitAge = 0
    this.shown = true
    this.group.visible = true
  }

  hide() {
    this.shown = false
    this.hovered = null
    this.committed = null
  }

  /** Flag the chosen card so it flares and the others fall away. */
  commit(index: number) {
    this.committed = index
    this.commitAge = 0
    for (const [i, card] of this.cards.entries()) {
      card.chosen = i === index
      card.dismissed = i !== index
    }
  }

  /**
   * Which card is under the pointer, if any.
   *
   * `ndc` is the pointer in normalised device coordinates. Raycasting the FACE
   * meshes rather than keeping separate hit planes: the face is exactly the
   * clickable area, and one mesh cannot drift out of step with the other.
   */
  at(ndc: THREE.Vector2, camera: THREE.Camera): number | null {
    if (!this.shown || this.committed !== null) return null
    this.raycaster.setFromCamera(ndc, camera)
    const live = this.cards.filter((card) => card.group.visible && !card.dismissed)
    const hits = this.raycaster.intersectObjects(live.map((card) => card.face), false)
    if (!hits.length) return null
    const face = hits[0].object
    return this.cards.findIndex((card) => card.face === face)
  }

  setHover(index: number | null) {
    this.hovered = index
  }

  /**
   * Float the row in front of the car and turn it to the camera.
   *
   * The spread runs along the CAMERA's right, not along the road, so the three
   * cards are always evenly placed on screen however the car is pointing and
   * wherever the lens happens to be.
   */
  update(dt: number, camera: THREE.Camera, _t: number) {
    const target = this.shown ? 1 : 0
    this.presence += (target - this.presence) * Math.min(1, dt * 6)
    if (this.presence < 0.002 && !this.shown) {
      this.group.visible = false
      return
    }
    this.group.visible = true
    if (this.committed !== null) this.commitAge += dt

    const basis = camera.matrixWorld
    const right = new THREE.Vector3().setFromMatrixColumn(basis, 0).normalize()
    const up = new THREE.Vector3().setFromMatrixColumn(basis, 1).normalize()
    const camPos = new THREE.Vector3().setFromMatrixPosition(basis)

    // Anchor in front of the LENS, flat on the horizontal: the row stands in
    // the street at a fixed distance from the camera, whichever way the camera
    // is pointing. A camera looks along its own -Z.
    const ahead = new THREE.Vector3().setFromMatrixColumn(basis, 2).normalize().negate()
    // Stand the row further off a narrower lens, so the cards are the same size
    // on screen whichever rig is live. The rear rig is 58 degrees against the
    // default 62, and at a fixed 16.4 m its cards grew by 8% — enough to push
    // the bottom of the third one under the question strip.
    const fov = (camera as THREE.PerspectiveCamera).fov ?? REF_FOV
    let reach = LENS_DIST * (Math.tan((REF_FOV * Math.PI) / 360) / Math.tan((fov * Math.PI) / 360))
    // ...and further off a NARROWER WINDOW. The framing was solved at 16:9, but
    // three.js fov is VERTICAL: on a 16:10 laptop or a squarer browser window
    // the horizontal angle shrinks, so the same row of cards spread wider and
    // wider until the outer two touched the edges of the screen and each other.
    // Standing the row back by the shortfall keeps the three cards the same
    // shape on every screen the classroom has.
    const aspect = (camera as THREE.PerspectiveCamera).aspect || REF_ASPECT
    if (aspect < REF_ASPECT) reach *= REF_ASPECT / aspect
    // Camera-relative elevation keeps the choices in a shallow upper band
    // even as an elevated camera looks down at a crossing or turns to show an
    // ambulance. The car, bicycle, animal and route remain visible below.
    const anchor = camPos.clone().add(ahead.multiplyScalar(reach))
      .add(up.clone().multiplyScalar(reach * Math.tan(fov * Math.PI / 360) * SCREEN_CENTRE_Y))
    const count = this.cards.filter((card) => card.group.visible).length || 1
    const mid = (count - 1) / 2

    for (const [i, card] of this.cards.entries()) {
      if (!card.group.visible) continue
      // No hover heat: a card that brightens and lifts as the pointer crosses
      // it is a moving target while a child is still reading the other two.
      // Only the CHOSEN card ever changes.
      const wantHeat = card.chosen ? 1.4 : card.dismissed ? 0 : 0.28
      card.heat += (wantHeat - card.heat) * Math.min(1, dt * 9)

      // Rise on show, and each card a beat after the one before it — with a
      // little overshoot at the top (easeOutBack), so the deck POPS out of the
      // road instead of drifting up. Calm mode keeps the plain cubic.
      // One card at a time, and visibly so: each waits until the one before
      // it has all but landed. The old 0.22 beat overlapped so much that the
      // three read as one block sliding up.
      const stagger = Math.min(1, Math.max(0, this.presence * 2.4 - i * 0.62))
      let rise: number
      if (this.calm) {
        rise = 1 - (1 - stagger) ** 3
      } else {
        const e = stagger - 1
        rise = 1 + e * e * (2.4 * e + 1.4)
      }
      // Chosen: flares once and goes. It used to FLY AT THE LENS while
      // dissolving, which dragged a half-transparent billboard across the
      // street for a second and a half — over the very manoeuvre it had just
      // asked about, which read as the game breaking. It now clears quickly,
      // in place, and the street is the only thing on screen while the car
      // carries the answer out.
      const commitLift = card.chosen ? Math.min(1, this.commitAge * 4.2) : 0
      const sink = card.dismissed ? Math.min(1, this.commitAge * 3.6) : 0

      const offset = right.clone().multiplyScalar((i - mid) * PITCH)
      const pos = anchor.clone().add(offset)
      pos.addScaledVector(up, card.heat * 0.08 - (1 - rise) * 0.6 - sink * 0.6)
      // A short lift as it is taken — not a flight into the lens.
      if (commitLift > 0) pos.addScaledVector(up, commitLift * 0.35)
      card.group.position.copy(pos)
      card.group.quaternion.copy(camera.quaternion)
      card.group.rotateX(-0.025)

      // Overshoot can push rise past 1 — the pop is positional only, never a
      // >1 opacity — and the scale carries a matching 6% breath.
      const alpha = Math.min(1, rise) * this.presence * (1 - sink) * (1 - commitLift)
      const material = card.face.material as THREE.MeshBasicMaterial
      material.opacity = alpha
      const haloMaterial = card.halo.material as THREE.SpriteMaterial
      haloMaterial.opacity = alpha * (0.16 + card.heat * 0.5)
      card.halo.scale.set(CARD_W * (1.45 + card.heat * 0.3), CARD_H * (1.85 + card.heat * 0.35), 1)
      const scale = (0.94 + 0.06 * Math.min(1, rise)) * (1 + card.heat * 0.045 + commitLift * 0.04)
      card.group.scale.setScalar(scale)

      // The card's shadow on the road, directly under it. It shrinks and
      // darkens as the card lifts on hover, which is the whole of the cue that
      // the card came toward you.
      card.footprint.position.set(pos.x, 0.03, pos.z)
      card.footprint.scale.setScalar(1 - card.heat * 0.16)
      ;(card.footprint.material as THREE.MeshBasicMaterial).opacity = alpha * (0.5 + card.heat * 0.18)
    }
  }

  dispose() {
    for (const card of this.cards) {
      card.texture.dispose()
      card.face.geometry.dispose()
      ;(card.face.material as THREE.Material).dispose()
      ;(card.halo.material as THREE.Material).dispose()
      card.footprint.geometry.dispose()
      ;(card.footprint.material as THREE.Material).dispose()
    }
    this.cards = []
    this.glow.dispose()
    this.shade.dispose()
    this.scene.remove(this.group)
  }
}
