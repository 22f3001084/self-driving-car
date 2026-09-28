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

export const BOARD_W = 1960
export const BOARD_H = 1102

export type SkaiScreen = 'single' | 'multiplayer'

/** [x, y, w, h] in board design pixels. */
export type Rect = [number, number, number, number]

export interface BoardEntry {
  art: string
  text: Partial<Record<'count' | 'timer' | 'cta' | 'info' | 'name0' | 'name1' | 'name2' | 'name3', Rect>>
}

/** A stripped rectangle is the glyph ink box (cap height). Chakra Petch caps
 *  measure ~0.72 em, so font-size = height / 0.72. */
export const CAP_RATIO = 0.72

/** Widen a name hole symmetrically so a typed 14-character name still centres
 *  on the chip instead of clipping at the Figma placeholder's width. */
const widen = (r: Rect, w: number): Rect => [r[0] + r[2] / 2 - w / 2, r[1], w, r[3]]

export const BOARDS: Record<SkaiScreen, BoardEntry> = {
  single: {
    art: singleArt,
    text: {
      count: [1880.23, 280.5, 71.41, 24.5],
      timer: [1794.99, 55.13, 91.43, 24.1],
      cta: [814.71, 975.7, 302.92, 23.8],
    },
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
      name0: widen([486.17, 35.15, 123.42, 12.85], 168),
      name1: widen([794.09, 42.15, 51.9, 12.85], 168),
      name2: widen([1051.09, 35.15, 82.61, 12.85], 168),
      name3: widen([1335.17, 35.4, 74.84, 16.42], 168),
    },
  },
}

/** The order the board assembles in, in milliseconds — plates first, the
 *  connector rules last so each rule slides out from behind its plate. */
export const BEAT: Record<string, number> = {
  board: 0, back: 0, logo: 40, chips: 70, info: 100,
  timer: 120, rail: 150, extra: 160, panel: 170, hint: 190,
  cta: 210, 'deco-top': 250, 'deco-bottom': 260,
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
    let bbox: DOMRect | { x: number; y: number; width: number; height: number } | null = null
    try {
      const b = node.getBBox?.()
      if (b && b.width) bbox = b
    } catch { /* not in the render tree yet */ }
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
