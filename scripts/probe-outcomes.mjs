/**
 * Every wrong answer in the game, driven.
 *
 *   node scripts/probe-outcomes.mjs            (dev server on :5210)
 *
 * Twelve hazards, two wrong cards each, and every wrong card is carried out in
 * the street and must end somewhere a child can look at. This picks each wrong
 * card in the situation popup, presses the board's TEST key, waits for the
 * fix-it popup, and checks that the car stopped ON the road, the camera was
 * handed over, and TRY AGAIN put the street back. It also times each one: a
 * consequence past ~13 seconds has stopped being a lesson and become a wait.
 */
import { chromium } from 'playwright'

/** Which URL opens each hazard with everything before it already solved. */
const HAZARDS = [
  { trigger: 'SCOOTER', url: 'phase=play&level=l1' },
  { trigger: 'NARROW', url: 'phase=play&level=l2' },
  { trigger: 'ARRIVED', url: 'phase=play&level=l3&rules=two' },
  { trigger: 'MOVING', url: 'phase=play&level=l4&rules=two' },
  { trigger: 'MANY_MOVING', url: 'phase=patrols&patrol=busy' },
  { trigger: 'ROAD_WET', url: 'phase=patrols&patrol=rain' },
  { trigger: 'EMERGENCY_BEHIND', url: 'phase=patrols&patrol=emergency', sensor: true },
  { trigger: 'CYCLIST', url: 'phase=patrols&patrol=cyclist' },
  { trigger: 'DOG', url: 'phase=patrols&patrol=dog' },
  { trigger: 'ROAD_BLOCKED', url: 'phase=patrols&patrol=horn' },
  { trigger: 'FOG', url: 'phase=patrols&patrol=fog' },
  { trigger: 'DEAD_END', url: 'phase=patrols&patrol=uturn' },
]

// A FRESH BROWSER PER HAZARD: twelve WebGL contexts in one process die around
// the eleventh, which looks exactly like a game bug and is not one.
const problems = []
let browser = null
let page = null

async function open(url) {
  if (browser) await browser.close().catch(() => {})
  browser = await chromium.launch({
    headless: false,
    args: [
      '--window-position=-2600,40',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
    ],
  })
  page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  page.on('pageerror', (error) => { problems.push(`page error: ${error.message}`); console.log('ERR', error.message) })
  await page.bringToFront()
  await page.goto(url)
}

/** The canonical action each card offers, straight off the card. */
const dealt = () => page.locator('.skai-choice').evaluateAll(
  (nodes) => nodes.map((node) => node.getAttribute('data-actions') ?? ''),
)

const waitForAsk = async (timeout = 150000) => {
  await page.waitForFunction(
    () => document.querySelector('.act-screen')?.getAttribute('data-phase') === 'choose',
    null, { timeout },
  )
  await page.waitForTimeout(600)
}

/** Which cards on the table are wrong, read from the game's own tables and
 *  named in the car's standard action vocabulary (what the card now shows). */
const wrongCards = (trigger) => page.evaluate(async (t) => {
  const choices = await import('/src/choices.ts')
  const content = await import('/src/content.ts')
  return choices.CHOICES[t]
    .filter((choice) => !choice.correct)
    .map((choice) => choice.actions.map((a) => content.TILES[a]?.label ?? a).join(' + '))
}, trigger)

const rows = []
for (const hazard of HAZARDS) {
  console.log(`-- ${hazard.trigger}`)
  await open(`http://localhost:5210/?${hazard.url}&cleared=1&noanim=1`)
  try {
    await waitForAsk()
  } catch {
    const phase = await page.locator('.act-screen').getAttribute('data-phase').catch(() => '(no screen)')
    problems.push(`${hazard.trigger}: the question never came up (phase "${phase}")`)
    continue
  }

  // The rear-sensor deck comes first on the ambulance beat. Fit the sensor and
  // the rule cards take its place, in the same popup.
  if (hazard.sensor) {
    const table = await dealt()
    const index = table.findIndex((label) => /front, sides and back/i.test(label))
    await page.locator('.skai-choice').nth(index).click()
    await page.locator('button.hit-cta').click()
    await page.waitForTimeout(900)
  }

  const wrong = await wrongCards(hazard.trigger)
  for (const want of wrong) {
    const table = await dealt()
    const index = table.findIndex((label) => label === want)
    if (index < 0) { problems.push(`${hazard.trigger}: "${want}" was not dealt`); continue }
    await page.bringToFront()
    await page.locator('.skai-choice').nth(index).click()
    const started = Date.now()
    await page.locator('button.hit-cta').click()
    let seconds = 0
    try {
      await page.waitForFunction(
        () => document.querySelector('.act-screen')?.getAttribute('data-phase') === 'review',
        null, { timeout: 45000 },
      )
      seconds = (Date.now() - started) / 1000
    } catch {
      problems.push(`${hazard.trigger} / "${want}": no verdict inside 45 s`)
      rows.push({ hazard: hazard.trigger, card: want, seconds: 45, ok: false })
      break
    }
    const settled = await page.evaluate(() => {
      const stage = window.__stage
      return {
        review: stage.review !== null,
        speed: Math.round(stage.car.speed * 100) / 100,
        onRoad: Math.abs(stage.car.z) < 9.3,
      }
    })
    if (!settled.review) problems.push(`${hazard.trigger} / "${want}": the camera was not handed over`)
    if (settled.speed > 0.3) problems.push(`${hazard.trigger} / "${want}": still rolling at ${settled.speed} m/s`)
    if (!settled.onRoad) problems.push(`${hazard.trigger} / "${want}": ended off the road`)
    if (seconds > 13) problems.push(`${hazard.trigger} / "${want}": took ${seconds.toFixed(1)} s`)
    rows.push({ hazard: hazard.trigger, card: want, seconds: +seconds.toFixed(1), ok: settled.review && settled.speed <= 0.3 })
    await page.screenshot({ path: `scripts/tmp/outcome-${hazard.trigger}-${want.slice(0, 12).replace(/\W+/g, '')}.png` }).catch(() => null)

    // TRY AGAIN on the board's key, so the next wrong card starts from the
    // same street.
    await page.locator('button.hit-cta').click()
    await waitForAsk(40000)
  }
}

if (browser) await browser.close().catch(() => {})
console.table(rows)
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n - ${problems.join('\n - ')}` : '\nevery wrong answer plays out and lands')
process.exit(problems.length ? 1 : 0)
