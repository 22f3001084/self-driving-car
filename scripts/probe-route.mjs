/**
 * Does every hazard on a route actually get reached, in order, from in front?
 *
 *   node scripts/probe-route.mjs                (dev server on :5210)
 *
 * A route is a list of hazards at fractions along a 105.6 m street, and each
 * one's stop mark is a fixed run-up before it. `marksBehind` is the stage's own
 * count of legs asked to drive to a mark already behind the car — the exact
 * "the car restarted / drove somewhere else" failure.
 *
 * The flow is popup-driven now: a solving policy makes every stop auto-pass,
 * and each stop ends on the star popup, so this presses the board's key
 * whenever the popup is up and follows the run to the journey board.
 */
import { chromium } from 'playwright'

const RUNS = [
  // chapter 1 chains l1 → l2 → l3 on one street
  { name: 'chapter1', url: '?phase=play&level=l1&rules=base&noanim=1' },
  { name: 'l4', url: '?phase=play&level=l4&rules=full&cleared=1&noanim=1' },
  // The finale drives the whole street with seven hazards on it, so it is the
  // route most likely to place one mark behind the last act's finish.
  { name: 'delivery', url: '?phase=levels&cleared=all&rules=delivery&noanim=1', start: true },
]

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
    // the delivery run starts from the journey board's own key
    await page.waitForSelector('button.hit-cta', { timeout: 30000 })
    await page.locator('button.hit-cta').click()
  }
  await page.waitForFunction(() => Boolean(window.__stage), null, { timeout: 90000 })

  const started = Date.now()
  let done = null
  while (Date.now() - started < 240000) {
    const state = await page.evaluate(() => {
      const stage = window.__stage
      const act = document.querySelector('.act-screen')
      return {
        phase: act ? act.getAttribute('data-phase') : null,
        onBoard: Boolean(document.querySelector('.journey-board')),
        x: stage ? Math.round(stage.car.x * 10) / 10 : null,
        worldM: stage ? stage.worldLength : null,
        marksBehind: stage ? stage.marksBehind : null,
        log: stage ? stage.marksBehindLog : null,
      }
    })
    if (state.onBoard) { done = state; break }
    if (state.phase === 'choose') {
      problems.push(`${run.name}: a stop ASKED despite a solving policy — a rule stopped covering its hazard`)
      done = state
      break
    }
    if (state.phase === 'complete') {
      done = state // capture stage stats before the screen can hand over
      await page.locator('button.hit-cta').click().catch(() => null)
      await page.waitForTimeout(400)
      continue
    }
    await page.waitForTimeout(200)
  }

  if (!done) { problems.push(`${run.name}: never finished (timed out mid-route)`); await page.close(); continue }
  console.log(`${run.name}: reached ${done.onBoard ? 'the journey board' : `phase "${done.phase}"`} at x ${done.x}, ${done.marksBehind} mark(s) behind the car`)
  for (const row of done.log ?? []) console.log(`    mark ${row.to} but the car was at ${row.at}`)
  if (done.marksBehind > 0) {
    problems.push(`${run.name}: ${done.marksBehind} hazard(s) had a stop mark behind where the previous act finished`)
  }
  if (done.x !== null && done.worldM !== null && done.x > done.worldM + 0.5) {
    problems.push(`${run.name}: the car ended past the end of the ${done.worldM} m world at x ${done.x}`)
  }
  await page.close()
}

console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n - ${problems.join('\n - ')}` : '\nevery hazard on every route is met from in front')
await browser.close()
process.exit(problems.length ? 1 : 0)
