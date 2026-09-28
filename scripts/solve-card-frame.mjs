/**
 * Solve the card geometry against the real camera, instead of guessing it.
 *
 *   node scripts/solve-card-frame.mjs            (dev server on :5311)
 *
 * The deck floats in the world, so how big the cards are on screen and where
 * they sit is decided by four numbers in `holocards.ts` — the card size, the
 * spacing, how far ahead of the car the row hangs and how high. This opens a
 * hazard on each of the two camera rigs a child can be on when the question
 * arrives, replicates the deck's own placement maths for candidate values, and
 * reports the largest cards that still fit inside the frame with the HUD strips
 * kept clear.
 *
 * The frame budget, in NDC (+1 top, -1 bottom):
 *   x   -0.90 .. 0.90   leaves a margin at both edges
 *   y   -0.34 .. 0.60   the top strip is 19vh and the bottom one 32vh
 */
import { chromium } from 'playwright'

const LIMIT = { x: 0.90, top: 0.60, bottom: -0.34 }

const browser = await chromium.launch({
  headless: false,
  args: [
    // Off-screen, so no window flashes up while a probe runs. Headed because
    // headless falls back to SwiftShader and the street drops to ~2 fps; the
    // extra flags stop Chrome throttling a window it decides is occluded.
    '--window-position=-2600,40',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('pageerror', (error) => console.log('ERR', error.message))
await page.goto('http://localhost:5311/?phase=play&level=l1&cleared=1&go=1&noanim=1')
await page.waitForSelector('.hz-banner', { timeout: 90000 })
await page.waitForTimeout(1200)

/** Measure one camera view: returns the best candidate for it. */
async function solve(view) {
  await page.evaluate((v) => window.__stage.setView(v), view)
  await page.waitForTimeout(1600)
  return page.evaluate(({ view, LIMIT }) => {
    const stage = window.__stage
    const camera = stage.camera
    const Vector3 = stage.scene.position.constructor
    const car = { x: stage.car.x, z: stage.car.z, heading: stage.car.heading }

    const basis = camera.matrixWorld
    const right = new Vector3().setFromMatrixColumn(basis, 0).setY(0).normalize()
    // The card's own up: the camera's up, because every card faces the lens.
    const camUp = new Vector3().setFromMatrixColumn(basis, 1)

    const box = (ahead, height, pitch, w, h) => {
      const forwardX = Math.cos(car.heading)
      const forwardZ = -Math.sin(car.heading)
      const anchor = new Vector3(car.x + forwardX * ahead, height, car.z + forwardZ * ahead)
      let minX = 9, maxX = -9, minY = 9, maxY = -9, minW = 9
      for (const i of [0, 1, 2]) {
        const pos = anchor.clone().add(right.clone().multiplyScalar((i - 1) * pitch))
        // Worst case: hovered, so lifted and 4.5% larger.
        pos.y += 0.055 + 0.16
        const sw = w * 1.045 / 2
        const sh = h * 1.045 / 2
        let cardMinX = 9, cardMaxX = -9
        for (const sx of [-1, 1]) {
          for (const sy of [-1, 1]) {
            const corner = pos.clone()
              .add(right.clone().multiplyScalar(sx * sw))
              .add(camUp.clone().multiplyScalar(sy * sh))
            corner.project(camera)
            minX = Math.min(minX, corner.x); maxX = Math.max(maxX, corner.x)
            minY = Math.min(minY, corner.y); maxY = Math.max(maxY, corner.y)
            cardMinX = Math.min(cardMinX, corner.x); cardMaxX = Math.max(cardMaxX, corner.x)
          }
        }
        minW = Math.min(minW, cardMaxX - cardMinX)
      }
      return { minX, maxX, minY, maxY, cardWidth: minW }
    }

    const results = []
    for (let ahead = 4.0; ahead <= 16.0; ahead += 0.5) {
      for (let height = 1.2; height <= 4.2; height += 0.1) {
        for (let scale = 0.6; scale <= 2.2; scale += 0.02) {
          const w = 4.5 * scale
          const h = 2.75 * scale
          const pitch = 5.0 * scale
          const b = box(ahead, height, pitch, w, h)
          if (b.minX < -LIMIT.x || b.maxX > LIMIT.x) continue
          if (b.maxY > LIMIT.top || b.minY < LIMIT.bottom) continue
          // The row must not be under the car's own bonnet line either.
          if (height - h / 2 < 0.25) continue
          results.push({ ahead: +ahead.toFixed(1), height: +height.toFixed(1), scale: +scale.toFixed(2), cardWidth: +b.cardWidth.toFixed(3), ...b })
        }
      }
    }
    results.sort((a, b) => b.cardWidth - a.cardWidth)
    const all = {}
    for (const r of results) all[`${r.ahead}|${r.height}|${r.scale}`] = r.cardWidth
    return { view, camera: { y: +camera.position.y.toFixed(2), fov: +camera.fov.toFixed(1) }, count: results.length, best: results.slice(0, 4), all }
  }, { view, LIMIT })
}

const report = {}
for (const view of ['lowchase']) {
  report[view] = await solve(view)
  console.log(view, JSON.stringify(report[view].best[0] ?? null))
}

const RIGS = ['lowchase']
const shared = Object.keys(report[RIGS[0]].all)
  .filter((key) => RIGS.every((view) => report[view].all[key] !== undefined))
  .map((key) => ({ key, worst: Math.min(...RIGS.map((view) => report[view].all[key])) }))
shared.sort((a, b) => b.worst - a.worst)
console.log(`
-- widest that fits ${RIGS.join(' + ')} (${shared.length} candidates) --`)
console.log(shared.slice(0, 8))

await browser.close()
