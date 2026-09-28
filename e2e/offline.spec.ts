import { cta, solveStop, waitForSituation, walkTutorial } from './cards'
import { test, expect } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * The packaged BE6 build, opened straight off the disk the way a teacher opens
 * it — no dev server, no query parameters, `file://`. The SKAI board vectors
 * are inlined into the bundle, so nothing needs a fetch.
 *
 * Run `npm run build && node scripts/publish-be6.mjs` first: this drives the
 * delivery folder, not `dist/`.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE = String(pathToFileURL(path.resolve(here, '..', '..', 'index.html')))

test('the offline package boots, renders the board and 3D, and plays a stop', async ({ page }) => {
  test.setTimeout(300_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })

  await page.goto(PACKAGE)

  // The SKAI board is up off the disk: artwork inlined, CTA live.
  await expect(page.getByText('THE NORTHLINE RUN')).toBeVisible()
  await expect(page.locator('.skai-board svg')).toBeVisible()
  await expect(cta(page)).toHaveAccessibleName(/start mission/i)
  await cta(page).click()

  // Crew, journey, first stop — all with no dev shortcuts.
  for (const [i, name] of ['Asha', 'Bilal', 'Chitra'].entries()) {
    await page.getByLabel(`Player ${i + 1} name`).fill(name)
  }
  await cta(page).click()
  // The tutorial rides the same key, however many slides it carries.
  await walkTutorial(page)
  await expect(page.locator('.journey-board')).toBeVisible()
  await cta(page).click()

  // The 3D street must be live off file:// — no fallback, real WebGL.
  await expect(page.locator('.scene-canvas')).toBeVisible()
  await expect(page.locator('.scene-fallback')).toHaveCount(0)
  const hasGl = await page.locator('.scene-canvas').evaluate((element) => {
    const node = element as HTMLCanvasElement
    return Boolean(node.getContext('webgl2') || node.getContext('webgl'))
  })
  expect(hasGl).toBe(true)

  // Fonts came from the JS-installed @font-face and actually LOADED off the
  // disk (`document.fonts` proves the file arrived).
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready
    return [...document.fonts].filter((face) => face.status === 'loaded').map((face) => face.family.replace(/["']/g, ''))
  })
  expect(loaded).toEqual(expect.arrayContaining([expect.stringMatching(/^Inter/), expect.stringMatching(/^Chakra Petch/)]))

  // Play the first stop; the next situation coming up is the proof the whole
  // loop works off the disk.
  await solveStop(page)
  await waitForSituation(page)

  await expect(page.locator('.crash-screen')).toHaveCount(0)
  expect(errors, errors.join('\n')).toEqual([])
})
