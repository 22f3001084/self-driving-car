/**
 * Where does the closed-road manoeuvre spend its metres?
 *
 *   node scripts/probe-pass.mjs                 (dev server on :5311)
 *
 * The gate act was finishing 24 m past where it should, which put the next
 * hazard's stop mark behind the car. Estimating the cost of each step from the
 * bicycle model got the total wrong, so this samples the car every 100 ms for
 * the whole act and prints x, z and the drive inputs — the step that is eating
 * the road is then obvious rather than inferred.
 */
import { chromium } from 'playwright'

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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (error) => console.log('ERR', error.message))
await page.goto('http://localhost:5210/?phase=play&level=l2&rules=base&cleared=1&noanim=1')
await page.waitForFunction(() => document.querySelector('.act-screen')?.getAttribute('data-phase') === 'testing', null, { timeout: 90000 })

const trace = await page.evaluate(() => new Promise((resolve) => {
  const stage = window.__stage
  const rows = []
  const started = Date.now()
  const r = (n) => Math.round(n * 100) / 100
  const timer = setInterval(() => {
    const phase = document.querySelector('.act-screen')?.getAttribute('data-phase')
    rows.push({
      ms: Date.now() - started,
      x: r(stage.car.x),
      z: r(stage.car.z),
      h: r(stage.car.heading),
      v: r(stage.car.speed),
      cruise: r(stage.drive.cruise),
      lane: r(stage.drive.targetLane),
      stopAt: stage.drive.stopAt === null ? null : r(stage.drive.stopAt),
      agility: stage.drive.agility ?? 1,
      phase,
    })
    if (phase !== 'testing' && phase !== 'driving' || Date.now() - started > 25000) {
      clearInterval(timer)
      resolve(rows)
    }
  }, 100)
}))

// Print only where something changed, so the shape is readable.
let last = null
for (const row of trace) {
  const key = `${row.lane}|${row.cruise}|${row.stopAt}|${row.agility}|${row.phase}`
  if (key !== last) {
    console.log(`${String(row.ms).padStart(6)} ms  x ${String(row.x).padStart(6)}  z ${String(row.z).padStart(6)}  h ${String(row.h).padStart(5)}  v ${String(row.v).padStart(5)}  cruise ${String(row.cruise).padStart(5)}  lane ${String(row.lane).padStart(6)}  stopAt ${String(row.stopAt).padStart(6)}  ag ${row.agility}  ${row.phase}`)
    last = key
  }
}
const final = trace[trace.length - 1]
console.log(`\nthe act ended at x ${final.x}, z ${final.z}, over ${final.ms} ms`)
await browser.close()
