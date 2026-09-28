/**
 * SKAI Layout System · AI & Data board — data + choreography.
 *
 * The artwork is the delivered Figma export (Skai Layouts/AI & Data), inlined
 * so each tagged part can animate on its own beat. The rectangles below are
 * lifted verbatim from the layout system's assets/boards.json — the exact ink
 * boxes the outlined HUD values occupied before build_boards.py stripped them.
 * Nothing here is redrawn or guessed; the vectors carry every shape.
 */
import singleArt from '../assets/skai/board/single.svg?raw'
import multiplayerArt from '../assets/skai/board/multiplayer.svg?raw'
import soundMenuArt from '../assets/skai/board/sound-menu.svg?raw'

/** The audio menu the speaker opens — the layout's own drawn plate. */
export const SOUND_MENU_ART = soundMenuArt

export const BOARD_W = 1960
export const BOARD_H = 1102

export type SkaiScreen = 'single' | 'multiplayer'

/** [x, y, w, h] in board design pixels. */
export type Rect = [number, number, number, number]

export interface BoardEntry {
  art: string
  text: Partial<Record<'count' | 'timer' | 'cta' | 'info', Rect>>
  /** Hit areas that differ per board: the multiplayer board draws its
   *  top-right cluster ~1.2x larger than the title board does. */
  hits: Record<'sound' | 'info', Rect>
  /** Where the audio menu hangs, just under the speaker. */
  menu: Rect
}

/** A stripped rectangle is the glyph ink box (cap height). Chakra Petch caps
 *  measure ~0.72 em, so font-size = height / 0.72. */
export const CAP_RATIO = 0.72

/**
 * The player band on the multiplayer board: four seats, each an orange tab
 * with an avatar square, a blue name plate and an underline running on to the
 * next seat (measured with getBBox, scripts/tmp/bbox.mjs).
 *
 * The export's name holes were CAP-HEIGHT boxes 12.85 px tall at the top of
 * each plate, which clipped every descender ("Diya" read "Diua") and set the
 * names at 18 px. Names now take the plate's whole height, centred, at the
 * 24 px floor.
 */
export const SEAT_TAB_X = [396, 679, 962, 1245] as const
export const SEAT_PITCH = SEAT_TAB_X[1] - SEAT_TAB_X[0]
/** The plate's text window: past the tab's overlap, short of the slanted end. */
export const seatName = (i: number): Rect => [SEAT_TAB_X[i] + 84, 25, 146, 49]
/** The avatar square inside the tab. */
export const seatFace = (i: number): Rect => [SEAT_TAB_X[i] + 3, 33, 51, 51]

/** Which seat a chip element belongs to, from its left edge. */
export function seatOf(x: number) {
  let seat = 0
  SEAT_TAB_X.forEach((tab, i) => { if (x >= tab - 8) seat = i })
  return seat
}

export const BOARDS: Record<SkaiScreen, BoardEntry> = {
  single: {
    art: singleArt,
    text: {
      count: [1880.23, 280.5, 71.41, 24.5],
      timer: [1794.99, 55.13, 91.43, 24.1],
      cta: [814.71, 975.7, 302.92, 23.8],
    },
    // speaker hex 1588,34 and info hex 1672,34, both 66 px (graft-speaker.py)
    hits: { sound: [1584, 30, 74, 75], info: [1668, 30, 74, 75] },
    // the layout hangs the menu 54.5 px left of the speaker and 70 px down
    menu: [1533.5, 104, 174, 166.5],
  },
  multiplayer: {
    art: multiplayerArt,
    text: {
      count: [1889.88, 280.5, 51.35, 24.5],
      info: [1643.42, 53.45, 8.1, 35.6],
      timer: [1756.0, 52.18, 109.33, 28.82],
      // The export's button read a baked "NEXT"; those glyphs are stripped from
      // our copy so the label is live, on the same baseline the single board uses.
      cta: [814.71, 975.7, 302.92, 23.8],
    },
    // this board's info hex is 1609,27 at 79 px, so the speaker is 1.197x:
    // 1508.5,27. (The old shared .hit-info box sat 59 px right of this hex.)
    hits: { sound: [1504, 23, 87, 87], info: [1605, 23, 87, 87] },
    menu: [1443.3, 110.8, 208.3, 199.3],
  },
}

/** The order the board assembles in, in milliseconds — plates first, the
 *  connector rules last so each rule slides out from behind its plate. */
export const BEAT: Record<string, number> = {
  board: 0, back: 0, logo: 40, chips: 70, sound: 90, info: 100,
  timer: 120, rail: 150, extra: 160, panel: 170, hint: 190,
  cta: 210, 'deco-top': 250, 'deco-bottom': 260,
}
/**
 * Which screen edge each part of the chrome is drawn against: -1 left/top,
 * 1 right/bottom, 0 centred on that axis. On a screen that is not 16:9 the
 * part is moved out by the space beside the board (--bleed-x / --bleed-y), so
 * the back tab stays in the corner and the rail stays on the right edge.
 *
 * By PART, not by each element's own position: the four player chips are one
 * band and must move as one, even though the fourth sits right of centre.
 */
export const PIN: Record<string, readonly [number, number]> = {
  back: [-1, -1], logo: [-1, -1],
  chips: [0, -1], panel: [0, -1],
  sound: [1, -1], info: [1, -1], timer: [1, -1], 'deco-top': [1, -1],
  rail: [1, 0],
  hint: [-1, 1],
  cta: [0, 1], 'deco-bottom': [0, 1], extra: [0, 1],
}

/** The same pin as CSS custom properties, for the HTML laid over the art. */
export function pinStyle(part: string): Record<string, number> {
  const [ax, ay] = PIN[part] ?? [0, 0]
  return { '--ax': ax, '--ay': ay }
}

export const LIVE_BEAT = 300
export const CONTENT_BEAT = 330
export const LAST_BEAT = 360

const TRAVEL = 130
const EDGE_X = 380
const EDGE_Y = 260
const BOARD_MID = BOARD_W / 2

/** Direction comes from position: each part slides in from the edge it lives
 *  nearest; anything mid-board settles in place. */
export function originOf(b: { x: number; y: number; width: number; height: number }) {
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  let tx = 0
  let ty = 0
  if (cx < EDGE_X) tx = -TRAVEL
  else if (BOARD_W - cx < EDGE_X) tx = TRAVEL
  if (cy < EDGE_Y) ty = -TRAVEL
  else if (BOARD_H - cy < EDGE_Y) ty = TRAVEL
  if (tx && ty) { tx *= 0.72; ty *= 0.72 }
  return { tx, ty, sc: tx || ty ? 1 : 0.94 }
}

/** Hand every tagged part its beat and entrance direction. Runs after the SVG
 *  is inlined and in the render tree (getBBox needs layout). */
export function choreograph(stage: HTMLElement) {
  const parts = stage.querySelectorAll<SVGGraphicsElement>('[data-part]')
  parts.forEach((node) => {
    const name = node.getAttribute('data-part') ?? ''
    node.style.setProperty('--d', `${BEAT[name] ?? 160}ms`)
    const [ax, ay] = PIN[name] ?? [0, 0]
    node.style.setProperty('--ax', String(ax))
    node.style.setProperty('--ay', String(ay))
    let bbox: DOMRect | { x: number; y: number; width: number; height: number } | null = null
    try {
      const b = node.getBBox?.()
      if (b && b.width) bbox = b
    } catch { /* not in the render tree yet */ }
    if (name === 'chips' && bbox) {
      node.setAttribute('data-seat', String(seatOf(bbox.x)))
      // the baked placeholder avatars (pattern fills) give way to the
      // players' own faces; the thin underlines run on to the next seat
      const fill = node.getAttribute('fill') ?? ''
      if (fill.startsWith('url(#pattern')) node.setAttribute('data-chip', 'avatar')
      else if (!fill && bbox.height < 32) node.setAttribute('data-chip', 'line')
    }
    if (name === 'deco-top' || name === 'deco-bottom') {
      // a rule left of centre grows leftwards, out from behind the button
      const rcx = bbox ? bbox.x + bbox.width / 2 : BOARD_MID
      node.style.transformOrigin = rcx < BOARD_MID ? '100% 50%' : '0% 50%'
      return
    }
    const from = originOf(bbox ?? { x: 0, y: 0, width: BOARD_W, height: BOARD_H })
    node.style.setProperty('--tx', String(from.tx))
    node.style.setProperty('--ty', String(from.ty))
    node.style.setProperty('--sc', String(from.sc))
  })
}

/** The rail's chevrons, bottom first — recoloured to show real progress along
 *  the mission instead of the export's static two-lit decoration. */
export function paintRail(stage: HTMLElement, done: number, total: number) {
  const chevrons = Array.from(
    stage.querySelectorAll<SVGPathElement>('.skai-board [data-part="rail"]'),
  ).filter((p) => {
    const fill = (p.getAttribute('fill') ?? '').toUpperCase()
    return fill === '#FCA01B' || fill === '#FBEBA8'
  })
  if (!chevrons.length) return
  chevrons.sort((a, b) => {
    try { return b.getBBox().y - a.getBBox().y } catch { return 0 }
  })
  const lit = Math.round((Math.max(0, Math.min(done, total)) / Math.max(1, total)) * chevrons.length)
  chevrons.forEach((p, i) => p.setAttribute('fill', i < lit ? '#FCA01B' : '#FBEBA8'))
}

export function mmss(totalSeconds: number) {
  const t = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(t / 60)
  const s = t % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
