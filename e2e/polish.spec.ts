import { test, expect, type Page } from '@playwright/test'
import { cta, solveStop, waitForSituation, walkTutorial } from './cards'

/**
 * The polish pass: no memory between sessions, the pause menu's machine
 * knobs, keyboard safety behind modals.
 *
 * The fresh-start test deliberately drives the REAL flow with no dev query
 * strings, because persistence is inert under one (see persist.ts).
 */

const BASE = 'http://localhost:5210'

function watch(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  return errors
}

test.describe('no memory between sessions', () => {
  test('a reload starts the whole game from scratch — no Continue, no policy', async ({ page }) => {
    test.setTimeout(300_000)
    const errors = watch(page)
    await page.goto(BASE)

    // Through the front door: title → crew → journey → first stop.
    await cta(page).click()
    for (const [i, name] of ['Asha', 'Bilal', 'Chitra'].entries()) {
      await page.getByLabel(`Player ${i + 1} name`).fill(name)
    }
    await cta(page).click() // MEET YOUR MISSION
    await walkTutorial(page)
    await cta(page).click() // START CHAPTER
    await solveStop(page)

    // One rule earned. Now reload: everything must be gone — the game keeps
    // NO memory, and a refresh is a fresh start from the title.
    await page.waitForTimeout(1200)
    await page.reload()

    await expect(page.getByText('THE NORTHLINE RUN')).toBeVisible()
    await expect(cta(page)).toHaveAccessibleName(/start mission/i)
    const rules = await page.evaluate(() =>
      (window as unknown as { __game?: { getState: () => { rules: unknown[] } } }).__game?.getState().rules.length ?? -1)
    expect(rules).toBeLessThanOrEqual(0)
    expect(errors, errors.join('\n')).toEqual([])
  })
})

test.describe('settings and tools', () => {
  test('the number keys do nothing behind the pause menu', async ({ page }) => {
    test.setTimeout(240_000)
    const errors = watch(page)
    await page.goto(`${BASE}/?phase=play&level=l1`)
    await waitForSituation(page)
    await page.locator('button.hit-back').click()
    await expect(page.locator('.skai-modal')).toBeVisible()
    // "1" used to select a card through the dialog.
    await page.keyboard.press('1')
    await page.waitForTimeout(400)
    await expect(page.locator('.act-screen')).toHaveAttribute('data-phase', 'choose')
    await expect(page.locator('.skai-choice[aria-pressed="true"]')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.locator('.skai-modal')).toHaveCount(0)
    await expect(page.locator('.skai-situation')).toBeVisible()
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('the pause menu carries the machine knobs and they persist', async ({ page }) => {
    const errors = watch(page)
    await page.goto(`${BASE}/?phase=levels&noanim=1`)
    await page.locator('button.hit-back').click()

    await expect(page.locator('.panel-mixer input[type="range"]')).toHaveCount(3)
    const reduced = page.getByRole('button', { name: /reduced motion/i })
    await reduced.click()
    await expect(reduced).toContainText('On')
    await expect(page.locator('html.reduce-motion')).toHaveCount(1)

    const lowGfx = page.getByRole('button', { name: /low graphics/i })
    await lowGfx.click()
    await expect(lowGfx).toContainText('On')

    // Settings are device-level: they survive a reload even though the dev
    // query keeps the SAVE inert.
    await page.reload()
    await expect(page.locator('html.reduce-motion')).toHaveCount(1)

    // Put the machine back for the rest of the suite.
    await page.evaluate(() => localStorage.removeItem('northline-settings'))
    expect(errors, errors.join('\n')).toEqual([])
  })

  test('the keyboard selects cards while the situation is up', async ({ page }) => {
    test.setTimeout(240_000)
    const errors = watch(page)
    await page.goto(`${BASE}/?phase=play&level=l1`)
    await waitForSituation(page)
    await page.keyboard.press('2')
    await expect(page.locator('.skai-choice').nth(1)).toHaveAttribute('aria-pressed', 'true')
    await expect(cta(page)).toBeEnabled()
    expect(errors, errors.join('\n')).toEqual([])
  })
})
