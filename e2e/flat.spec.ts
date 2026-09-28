import { test, expect, type Page } from '@playwright/test'
import { crashStop, solveStop, tryAgain, waitForSituation } from './cards'

/**
 * The flat (2D) edition, as its own game.
 *
 * Same store, same rules, same SKAI board and situation popup — a different
 * renderer. These run against the 2D dev server (see scripts/dev-flat.mjs).
 */

const BASE = 'http://localhost:5211'

function watch(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  return errors
}

/** The van's on-screen left edge, in CSS px. */
const leftOf = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((node) => node.getBoundingClientRect().left)

test.describe('the flat edition', () => {
  test('plays the first street: situation, crash, retry, right answer, next stop', async ({ page }) => {
    test.setTimeout(240_000)
    const errors = watch(page)
    await page.goto(`${BASE}/?phase=play&level=l1`)

    // No WebGL canvas anywhere; the situation deals three IF–THEN cards.
    await waitForSituation(page)
    await expect(page.locator('.scene-canvas')).toHaveCount(0)
    await expect(page.locator('.skai-choice')).toHaveCount(3)

    // A wrong pick is DRIVEN and the car is drawn crashed — the parked scooter
    // is a thing, so it is struck.
    await crashStop(page)
    await expect(page.locator('.w2d-van.is-crashed')).toHaveCount(1)
    await expect(page.locator('.w2d-prop.is-hit')).toHaveCount(1)

    // Retry puts the street back.
    await tryAgain(page)
    await expect(page.locator('.w2d-van.is-crashed')).toHaveCount(0)

    // The right pick writes the rule and the run flows to the next stop.
    await solveStop(page)
    await waitForSituation(page)
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('a living hazard is never driven into', async ({ page }) => {
    test.setTimeout(240_000)
    const errors = watch(page)
    // Base rules cover the street; the child running out is the only stop.
    await page.goto(`${BASE}/?phase=play&level=l4&rules=base`)
    await crashStop(page)
    // Nose-to-nose halt: crashed, but the child sprite is untouched.
    await expect(page.locator('.w2d-van.is-crashed')).toHaveCount(1)
    await expect(page.locator('.w2d-prop.is-hit')).toHaveCount(0)
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('the wheels only ever roll forward', async ({ page }) => {
    await page.goto(`${BASE}/?phase=play&level=l1`)
    const van = page.locator('.w2d-van')
    await expect(van).toBeVisible()
    const frames: number[] = []
    for (let i = 0; i < 60; i += 1) {
      frames.push(Number(await van.getAttribute('data-roll')))
      await page.waitForTimeout(50)
    }
    for (let i = 1; i < frames.length; i += 1) {
      expect(frames[i], `wheel counter went ${frames[i - 1]} → ${frames[i]} at sample ${i}`)
        .toBeGreaterThanOrEqual(frames[i - 1])
    }
    expect(frames[frames.length - 1]).toBeGreaterThan(frames[0])
  })

  test('the street carries the weather, and the ambulance is behind the car', async ({ page }) => {
    test.setTimeout(240_000)
    const errors = watch(page)
    await page.goto(`${BASE}/?phase=patrols&patrol=fog`)
    await expect(page.locator('.w2d-weather.is-fog')).toHaveCount(1, { timeout: 30_000 })

    await page.goto(`${BASE}/?phase=patrols&patrol=emergency`)
    await waitForSituation(page)
    const ambulance = await leftOf(page, '.w2d-prop[data-trigger="EMERGENCY_BEHIND"]')
    const van = await leftOf(page, '.w2d-van')
    expect(ambulance, 'the ambulance stands BEHIND the car').toBeLessThan(van)
    expect(errors, errors.join('\n')).toEqual([])
  })
})
