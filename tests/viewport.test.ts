import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BOARD_H, BOARD_W, fitViewport } from '../src/viewport'

// [width, height, touch]
const SCREENS: Array<[number, number, boolean]> = [
  [1512, 780, false], [1920, 1080, false], [2560, 1080, false], [3440, 1440, false],
  [1024, 768, false], [800, 600, false], [1280, 1024, false], [1366, 768, false],
  [390, 844, true], [360, 640, true], [844, 390, true],
  [820, 1180, true], [768, 1024, true], [1024, 1366, true],
  [1080, 1920, false],
]

for (const [width, height, touch] of SCREENS) {
  test(`${width}×${height}${touch ? ' touch' : ''}: the board scales whole and the bleed covers the rest`, () => {
    const frame = fitViewport(width, height, touch)
    // the board itself never changes shape
    assert.equal(frame.width, BOARD_W)
    assert.equal(frame.height, BOARD_H)
    // board + bleed on both sides is EXACTLY the screen (in the board's frame)
    const along = frame.rotated ? height : width
    const across = frame.rotated ? width : height
    assert.ok(Math.abs((BOARD_W + 2 * frame.bleedX) * frame.scale - along) < 0.01, 'bleed-x closes the gap')
    assert.ok(Math.abs((BOARD_H + 2 * frame.bleedY) * frame.scale - across) < 0.01, 'bleed-y closes the gap')
    // it only ever bleeds on one axis: the board touches the other two edges
    assert.ok(frame.bleedX < 0.01 || frame.bleedY < 0.01)
    // and it is as large as it can be without leaving the screen
    assert.ok(BOARD_W * frame.scale <= along + 0.01 && BOARD_H * frame.scale <= across + 0.01)
  })
}

test('portrait phones and portrait tablets turn the board; a portrait monitor does not', () => {
  assert.equal(fitViewport(390, 844, true).rotated, true)
  assert.equal(fitViewport(820, 1180, true).rotated, true)
  assert.equal(fitViewport(1024, 1366, true).rotated, true)
  assert.equal(fitViewport(1080, 1920, false).rotated, false)
  assert.equal(fitViewport(1920, 1080, false).rotated, false)
  assert.equal(fitViewport(844, 390, true).rotated, false)
})

test('a turned iPad reads larger than a letterboxed one would', () => {
  const turned = fitViewport(820, 1180, true)
  const upright = Math.min(820 / BOARD_W, 1180 / BOARD_H)
  assert.ok(turned.scale > upright * 1.4, `${turned.scale} vs ${upright}`)
})
