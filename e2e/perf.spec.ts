import { test, expect } from '@playwright/test'

/**
 * Frame rate on the heaviest screen (level 4: the whole street, every prop,
 * ten walking pedestrians, rain off, shadows on).
 *
 * A classroom Chromebook is the target, so this is a floor test, not a
 * benchmark: below about 24 fps the lane change stops reading as a manoeuvre.
 */
test('the busiest level holds a usable frame rate', async ({ page }) => {
  await page.goto('http://localhost:5210/?phase=play&level=l4&go=1&rules=full')
  await expect(page.locator('.scene-canvas')).toBeVisible()
  await page.waitForTimeout(1200)

  const fps = await page.evaluate(() => new Promise<number>((resolve) => {
    let frames = 0
    const started = performance.now()
    const tick = () => {
      frames += 1
      const elapsed = performance.now() - started
      if (elapsed >= 2000) resolve((frames * 1000) / elapsed)
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }))
  console.log(`measured ${fps.toFixed(1)} fps`)
  expect(fps).toBeGreaterThan(24)
})
