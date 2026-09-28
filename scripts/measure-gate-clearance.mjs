/**
 * Does the car ever touch a barrier going through the roadworks gap?
 *
 *   node scripts/measure-gate-clearance.mjs        (dev server on :5311)
 *
 * Drives level 2, picks the right fault card, then samples the car's yaw-inflated
 * footprint against every NARROW prop's measured world box every 40 ms for the
 * whole pass. Reports the number of frames where the two actually overlap and the
 * worst LATERAL clearance while the car is alongside a barrier — which is the
 * number that matters; the longitudinal gap just says how far away it still is.
 *
 * Last run: 0 overlaps, worst lateral clearance 0.776 m.
 */
import { chromium } from 'playwright'
const OUT = 'C:/Users/sumit/AppData/Local/Temp/claude/C--Users-sumit-Downloads-Chrysalis/0b246599-1a5d-4f7f-93f4-98a16eb81621/scratchpad/shots'
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
const errs = []
page.on('pageerror', e => errs.push(e.message))
await page.goto('http://localhost:5311/?phase=play&level=l2&go=1&noanim=1')
await page.bringToFront()
await page.waitForSelector('.hz-banner', { timeout: 150000 })
await page.waitForTimeout(2400)
await page.screenshot({ path: `${OUT}/g1-gate.png` })
// The answers are cards in the street now; the HUD keypad is the route in that
// a harness can address by name.
const labels = await page.locator('.hz-key').evaluateAll(
  (nodes) => nodes.map((node) => node.getAttribute('aria-label') ?? ''),
)
const right = labels.findIndex((label) => /squeeze through/i.test(label))
if (right < 0) throw new Error(`the gap card was not dealt: ${labels.join(' | ')}`)
await page.locator('.hz-key').nth(right).click()

// Sample the car body against every barrier box, every 60 ms, for the whole pass.
const worst = await page.evaluate(() => new Promise((resolve) => {
  const s = window.__stage
  const CAR_HALF_X = 2.10, CAR_HALF_Z = 0.9165
  let lateral = { gap: 1e9, at: null, prop: null }   // z clearance while alongside
  let overlaps = 0
  let alongsideFrames = 0
  const t0 = performance.now()
  const tick = () => {
    const a = s.auditState()
    const car = a.car
    const c = Math.abs(Math.cos(car.heading)), sn = Math.abs(Math.sin(car.heading))
    const hx = CAR_HALF_X * c + CAR_HALF_Z * sn
    const hz = CAR_HALF_X * sn + CAR_HALF_Z * c
    for (const p of a.props) {
      if (p.trigger !== 'NARROW') continue
      const xOverlap = (car.x + hx) > p.minX && (car.x - hx) < p.maxX
      const zOverlap = (car.z + hz) > p.minZ && (car.z - hz) < p.maxZ
      if (xOverlap && zOverlap) overlaps += 1
      if (!xOverlap) continue
      alongsideFrames += 1
      const gap = Math.max(p.minZ - (car.z + hz), (car.z - hz) - p.maxZ)
      if (gap < lateral.gap) lateral = {
        gap: +gap.toFixed(3),
        at: { x: +car.x.toFixed(2), z: +car.z.toFixed(2), headingDeg: +(car.heading * 57.3).toFixed(1) },
        prop: { minZ: +p.minZ.toFixed(2), maxZ: +p.maxZ.toFixed(2) },
      }
    }
    if (performance.now() - t0 > 30000) resolve({ lateral, overlaps, alongsideFrames, carX: +a.car.x.toFixed(1) })
    else setTimeout(tick, 40)
  }
  tick()
}))
console.log('WORST', JSON.stringify(worst))
await page.screenshot({ path: `${OUT}/g2-through.png` })
console.log('errors:', errs.length ? errs.slice(0,3) : 'none')
await browser.close()
