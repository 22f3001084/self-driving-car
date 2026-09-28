import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fitViewport } from '../src/viewport'

for (const [width, height] of [[1512, 780], [1920, 1080], [2560, 1080], [1024, 768], [800, 600], [390, 844], [900, 1200]]) {
  test(`scene fills ${width}×${height} without cropping the authored controls`, () => {
    const frame = fitViewport(width, height)
    const shownWidth = (frame.rotated ? frame.height : frame.width) * frame.scale
    const shownHeight = (frame.rotated ? frame.width : frame.height) * frame.scale
    assert.ok(Math.abs(shownWidth - width) < .001)
    assert.ok(Math.abs(shownHeight - height) < .001)
    assert.ok(frame.width >= 1920 - .001)
    assert.ok(frame.height >= 1080 - .001)
  })
}
