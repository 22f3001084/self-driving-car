/**
 * The SKAI Layout System board is EXACTLY 1960 × 1102 (16:9) — the delivered
 * Figma vector painted edge to edge. It scales as one piece
 * (`min(w/1960, h/1102)`), so every element grows and shrinks with the screen
 * and nothing inside it ever reflows or overlaps. A portrait phone under 820px
 * rotates the board rather than restacking it.
 *
 * What the board no longer does is leave dead bars. On any screen that is not
 * 16:9 there is space beside it — above and below on a 4:3 tablet, left and
 * right on an ultrawide — and `bleedX` / `bleedY` measure that space in BOARD
 * px (per side). The scene and each screen's backdrop spill into it, and the
 * chrome pins itself to the real screen corners; the mission content stays on
 * the board, exactly where it was designed and tested.
 */
export const BOARD_W = 1960
export const BOARD_H = 1102

/**
 * `touch` is whether the device's main pointer is coarse (a phone or tablet).
 * A portrait phone always turns the board. A portrait TABLET turns it too —
 * an iPad held upright is 820 px wide, which would letterbox the board at 42%
 * and set body text near 10 px — but a portrait desktop monitor does not: it
 * cannot be turned, so it keeps the board upright with the backdrop above and
 * below.
 */
export function fitViewport(width: number, height: number, touch = false) {
  width = Math.max(1, width)
  height = Math.max(1, height)
  const portrait = height > width * 1.05
  const rotated = portrait && (Math.min(width, height) < 820 || (touch && Math.min(width, height) < 1100))
  const availableWidth = rotated ? height : width
  const availableHeight = rotated ? width : height
  const scale = Math.min(availableWidth / BOARD_W, availableHeight / BOARD_H)
  return {
    width: BOARD_W,
    height: BOARD_H,
    scale,
    rotated,
    // one side's worth of the space beside the board, in board px
    bleedX: Math.max(0, (availableWidth / scale - BOARD_W) / 2),
    bleedY: Math.max(0, (availableHeight / scale - BOARD_H) / 2),
  }
}
