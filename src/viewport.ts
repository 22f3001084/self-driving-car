/**
 * The SKAI Layout System board is EXACTLY 1960 × 1102 (16:9) — the delivered
 * Figma vector painted edge to edge. The stage no longer grows in the long
 * axis: the board scales as one piece (`min(w/1960, h/1102)`) and the app's
 * themed ground carries any space beside it, so nothing distorts and nothing
 * overlaps. A portrait phone under 820px rotates the board rather than
 * restacking it.
 */
export const BOARD_W = 1960
export const BOARD_H = 1102

export function fitViewport(width: number, height: number) {
  width = Math.max(1, width)
  height = Math.max(1, height)
  const rotated = height > width * 1.05 && Math.min(width, height) < 820
  const availableWidth = rotated ? height : width
  const availableHeight = rotated ? width : height
  const scale = Math.min(availableWidth / BOARD_W, availableHeight / BOARD_H)
  return {
    width: BOARD_W,
    height: BOARD_H,
    scale,
    rotated,
  }
}
