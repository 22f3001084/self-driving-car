/**
 * The flow, measured: no teleports, no reversing, no running over obstacles,
 * and a car that stands STILL while a popup is up.
 *
 *   node scripts/probe-continuity.mjs           (dev server on :5210)
 *
 * Three default (green-policy) runs are driven end to end while the car is
 * sampled every 120 ms. A finding is one of:
 *   TELEPORT  the car moved further between two samples than any legal speed
 *             allows — the "it restarted / jumped somewhere else" failure
 *   REVERSE   the car rolled backwards on a run with no turn-around in it
 *   OVERLAP   the car's body occupied the same road space as a physical
 *             obstacle while passing on the default choreography
 *   ROLLING   the car was still moving while a situation/star popup was up
 */
import { chromium } from 'playwright'

const RUNS = [
  { name: 'chapter1', url: '?phase=play&level=l1&rules=base&noanim=1' },
  { name: 'l4', url: '?phase=play&level=l4&rules=full&cleared=1&noanim=1' },
  { name: 'delivery', url: '?phase=levels&cleared=all&rules=delivery&noanim=1', start: true },
]

// Physical bodies the car must never share road space with. Surface and
// weather triggers (ROAD_WET, FOG) have no body; ARRIVED is a bay the car is
// SUPPOSED to enter; EMERGENCY_BEHIND passes alongside deliberately and is
// checked by its own beat.
const SOLID = new Set(['SCOOTER', 'NARROW', 'MOVING', 'MANY_MOVING', 'CYCLIST', 'DOG', 'ROAD_BLOCKED', 'DEAD_END'])

const browser = await chromium.launch({
  headless: false,
  args: [
    '--window-position=-2600,40',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ],
})
const problems = []

for (const run of RUNS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  page.on('pageerror', (error) => problems.push(`${run.name}: page error ${error.message}`))
  await page.goto(`http://localhost:5210/${run.url}`)
  if (run.start) {
    await page.waitForSelector('button.hit-cta', { timeout: 30000 })
    await page.locator('button.hit-cta').click()
  }
  await page.waitForFunction(() => Boolean(window.__stage), null, { timeout: 90000 })

  // The recorder lives in the page so nothing is lost between node polls.
  await page.evaluate((solid) => {
    const stage = window.__stage
    window.__rec = []
    window.__recTimer = setInterval(() => {
      const act = document.querySelector('.act-screen')
      const props = []
      for (const [key, prop] of stage.props ?? []) {
        if (!solid.includes(key)) continue
        const p = prop.actor?.group?.position
        if (p) props.push({ key, x: p.x, z: p.z })
      }
      window.__rec.push({
        t: Date.now(),
        x: stage.car.x,
        z: stage.car.z,
        v: stage.car.speed,
        phase: act ? act.getAttribute('data-phase') : null,
        props,
      })
    }, 120)
  }, [...SOLID])

  const started = Date.now()
  let finished = false
  while (Date.now() - started < 240000) {
    const state = await page.evaluate(() => ({
      phase: document.querySelector('.act-screen')?.getAttribute('data-phase') ?? null,
      onBoard: Boolean(document.querySelector('.journey-board')),
    }))
    if (state.onBoard) { finished = true; break }
    if (state.phase === 'complete') {
      // hold past the braking beat so the popup-stillness rule really bites
      await page.waitForTimeout(1900)
      await page.locator('button.hit-cta').click().catch(() => null)
      await page.waitForTimeout(300)
      continue
    }
    if (state.phase === 'choose') { problems.push(`${run.name}: asked despite a solving policy`); break }
    await page.waitForTimeout(200)
  }
  if (!finished) problems.push(`${run.name}: never reached the journey board`)

  const rows = await page.evaluate(() => { clearInterval(window.__recTimer); return window.__rec })
  await page.close()

  // ---- analyse the trace -------------------------------------------------
  let worstJump = 0
  let phaseSince = rows.length ? rows[0].t : 0
  for (let i = 1; i < rows.length; i += 1) {
    const a = rows[i - 1]
    const b = rows[i]
    if (b.phase !== a.phase) phaseSince = b.t
    const dt = Math.max(0.05, (b.t - a.t) / 1000)
    const dx = b.x - a.x
    // legal ceiling: 12 m/s plus slack for a long GC'd frame
    if (Math.abs(dx) / dt > 14 && Math.abs(dx) > 3) {
      problems.push(`${run.name}: TELEPORT — the car jumped ${dx.toFixed(1)} m in ${(dt * 1000) | 0} ms at x ${a.x.toFixed(1)} (phase ${b.phase})`)
    }
    if (dx < -0.4 && b.phase !== 'review') {
      problems.push(`${run.name}: REVERSE — the car rolled back ${(-dx).toFixed(1)} m at x ${a.x.toFixed(1)} (phase ${b.phase})`)
    }
    worstJump = Math.max(worstJump, Math.abs(dx) / dt)
    // a popup that has been up past its braking beat means a parked car
    if ((b.phase === 'complete' || b.phase === 'choose' || b.phase === 'review')
      && b.t - phaseSince > 1200 && b.v > 0.6) {
      problems.push(`${run.name}: ROLLING — ${b.v.toFixed(1)} m/s while the "${b.phase}" popup was up at x ${b.x.toFixed(1)}`)
    }
    // body overlap with a solid obstacle: same few metres of road AND same lane
    for (const prop of b.props) {
      if (Math.abs(b.x - prop.x) < 2.1 && Math.abs(b.z - prop.z) < 0.9) {
        problems.push(`${run.name}: OVERLAP — the car passed THROUGH ${prop.key} at x ${b.x.toFixed(1)} (car z ${b.z.toFixed(2)}, prop z ${prop.z.toFixed(2)})`)
      }
    }
  }
  console.log(`${run.name}: ${rows.length} samples, worst frame speed ${worstJump.toFixed(1)} m/s`)
}

const uniq = [...new Set(problems)]
console.log(uniq.length ? `\n${uniq.length} PROBLEM(S):\n - ${uniq.join('\n - ')}` : '\nthe flow is continuous: no teleports, no reversing, no obstacle ever run over, still while asking')
await browser.close()
process.exit(uniq.length ? 1 : 0)
