import { test, expect, type Page } from '@playwright/test'
import { crashStop, solveStop, tryAgain, waitForSituation } from './cards'

/**
 * The 3D street, and the parts of the game the first spec does not reach:
 * the crash-and-orbit loop, every patrol solved end to end, and the scene's
 * own health (a live WebGL context, a rendering loop, no leaked contexts).
 */

const BASE = 'http://localhost:5210'

function watch(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
    // Leaked or lost GL contexts surface as WARNINGS — a leak that only warns
    // is still a leak.
    if (message.type() === 'warning' && /WebGL/i.test(message.text())) errors.push(`console: ${message.text()}`)
  })
  return errors
}

async function clean(page: Page, errors: string[]) {
  await expect(page.locator('.crash-screen')).toHaveCount(0)
  expect(errors, errors.join('\n')).toEqual([])
}

test.describe('a wrong answer in the street', () => {
  test('is driven, crashes, hands over the camera and can be retried', async ({ page }) => {
    test.setTimeout(240_000)
    const errors = watch(page)
    await page.goto(`${BASE}/?phase=play&level=l1&noanim=1`)

    await waitForSituation(page)
    await page.waitForTimeout(800)
    const before = await page.evaluate(() => {
      const stage = (window as unknown as { __stage?: { car: { x: number } } }).__stage
      return stage ? Math.round(stage.car.x * 100) / 100 : null
    })

    const verdict = await crashStop(page)
    expect(verdict.lead.length).toBeGreaterThan(10)

    // The crash is real out in the street: the car stopped, the scooter went
    // over, and the pointer owns the camera (review mode).
    const crashed = await page.evaluate(() => {
      const stage = (window as unknown as {
        __stage?: { review: unknown; car: { speed: number }; props: Map<string, { actor: { group: { rotation: { x: number } } } }> }
      }).__stage
      if (!stage) return null
      const scooter = stage.props.get('SCOOTER')
      return {
        inReview: stage.review !== null,
        stopped: stage.car.speed < 0.3,
        toppled: Math.abs(scooter?.actor.group.rotation.x ?? 0) > 0.5,
      }
    })
    expect(crashed).toMatchObject({ inReview: true, stopped: true, toppled: true })

    // TRY AGAIN puts the street back on the stop mark and re-deals.
    await tryAgain(page)
    const again = await page.evaluate(() => {
      const stage = (window as unknown as {
        __stage?: { review: unknown; car: { x: number }; props: Map<string, { actor: { group: { rotation: { x: number } } } }> }
      }).__stage
      if (!stage) return null
      return {
        inReview: stage.review !== null,
        carX: Math.round(stage.car.x * 100) / 100,
        toppled: Math.abs(stage.props.get('SCOOTER')?.actor.group.rotation.x ?? 0) > 0.5,
      }
    })
    expect(again!.inReview).toBe(false)
    expect(again!.toppled).toBe(false)
    if (before !== null) expect(Math.abs(again!.carX - before)).toBeLessThan(1)

    // And the right answer still works afterwards.
    await solveStop(page)
    await clean(page, errors)
  })
})

test.describe('the 3D scene', () => {
  test('renders with a live WebGL context and an advancing frame clock', async ({ page }) => {
    const errors = watch(page)
    await page.goto(`${BASE}/?phase=play&level=l4&rules=base`)

    const canvas = page.locator('.scene-canvas')
    await expect(canvas).toBeVisible()
    await expect(page.locator('.scene-fallback')).toHaveCount(0)

    const info = await canvas.evaluate((element) => {
      const node = element as HTMLCanvasElement
      const gl = node.getContext('webgl2') || node.getContext('webgl')
      return { hasGl: Boolean(gl), width: node.width, height: node.height }
    })
    expect(info.hasGl).toBe(true)
    expect(info.width).toBeGreaterThan(320)
    expect(info.height).toBeGreaterThan(180)

    const frames = await page.evaluate(() => new Promise<number>((resolve) => {
      let count = 0
      const started = performance.now()
      const tick = () => {
        count += 1
        if (performance.now() - started > 600) resolve(count)
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }))
    expect(frames).toBeGreaterThan(10)

    await clean(page, errors)
  })

  test('the view is a fixed low rear chase, with no switcher to lose', async ({ page }) => {
    const errors = watch(page)
    await page.goto(`${BASE}/?phase=play&level=l4&rules=base`)
    await expect(page.locator('.scene-canvas')).toBeVisible()
    await expect(page.locator('.cam-btn')).toHaveCount(0)

    const rig = await page.evaluate(() => {
      const stage = (window as unknown as { __stage?: { camera: { position: { x: number; y: number } }; car: { x: number } } }).__stage
      if (!stage) return null
      return { camX: stage.camera.position.x, camY: stage.camera.position.y, carX: stage.car.x }
    })
    expect(rig).not.toBeNull()
    expect(rig!.camX).toBeLessThan(rig!.carX)
    expect(rig!.camY).toBeLessThan(5)
    await clean(page, errors)
  })

  test('leaving a run disposes the renderer instead of leaking a context', async ({ page }) => {
    test.setTimeout(240_000)
    const errors = watch(page)
    // Enter and leave several runs through the pause menu: a leaked context
    // per visit would trip the browser's ~16 live context ceiling.
    for (let round = 0; round < 8; round += 1) {
      await page.goto(`${BASE}/?phase=play&level=l1&noanim=1`)
      await expect(page.locator('.scene-canvas')).toBeVisible({ timeout: 20_000 })
      await page.locator('button.hit-back').click()
      await page.getByRole('button', { name: 'Leave this run' }).click()
      await expect(page.locator('.journey-board')).toBeVisible()
    }
    await clean(page, errors)
  })
})

test.describe('every advanced patrol', () => {
  // Each patrol seeded directly; solving it chains to the NEXT patrol (or the
  // delivery run), which is the flow the classroom sees.
  const PATROLS: { id: string; name: string }[] = [
    { id: 'busy', name: 'Market crossing' },
    { id: 'cyclist', name: 'Cyclist in lane' },
    { id: 'dog', name: 'Dog on the road' },
    { id: 'horn', name: 'Blocked lane' },
    { id: 'rain', name: 'Wet surface' },
    { id: 'fog', name: 'Fog' },
    { id: 'uturn', name: 'No way through' },
    { id: 'emergency', name: 'Eyes in the back' },
  ]

  for (const patrol of PATROLS) {
    test(`patrol ${patrol.id} (${patrol.name}) is solvable and moves on`, async ({ page }) => {
      test.setTimeout(240_000)
      const errors = watch(page)
      await page.goto(`${BASE}/?phase=patrols&patrol=${patrol.id}&rules=base`)
      await expect(page.locator(`.act-screen[data-lesson="${patrol.id}"]`)).toBeVisible({ timeout: 30_000 })
      await solveStop(page)
      // The next challenge takes the screen — a different lesson id.
      await expect(page.locator(`.act-screen:not([data-lesson="${patrol.id}"])`)).toBeVisible({ timeout: 90_000 })
      await clean(page, errors)
    })
  }
})
