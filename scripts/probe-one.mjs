/**
 * One card, watched second by second.
 *
 *   node scripts/probe-one.mjs "phase=play&level=l1" "speed up past it" [prior]
 *
 * The sweep in `probe-outcomes.mjs` says whether a choreography lands. This says
 * WHERE it stopped: it clicks the card and then prints the phase, the car, the
 * review and the deck once a second, which is how a hang gets diagnosed rather
 * than guessed at. `prior` optionally picks another card first, so a failure that
 * only happens on the second attempt can be reproduced.
 */
import { chromium } from 'playwright'

const [url, wanted, prior] = process.argv.slice(2)
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
page.on('console', (message) => {
  const text = message.text()
  if (message.type() === 'error' || text.startsWith('[pick') || text.startsWith('[done]') || text.startsWith('[send]') || text.startsWith('[cmd')) console.log('PAGE', text)
})

const cardPoint = (index) => page.evaluate((i) => {
  const stage = window.__stage
  const point = new (stage.scene.position.constructor)()
  stage.deck.cards[i].face.getWorldPosition(point)
  point.project(stage.camera)
  const rect = stage.renderer.domElement.getBoundingClientRect()
  return { x: rect.left + ((point.x + 1) / 2) * rect.width, y: rect.top + ((1 - point.y) / 2) * rect.height }
}, index)

const labels = () => page.locator('.hz-key').evaluateAll(
  (nodes) => nodes.map((node) => node.getAttribute('aria-label').replace(/^Card \d+: /, '')),
)

const snap = () => page.evaluate(() => {
  const stage = window.__stage
  const r = (n) => Math.round(n * 100) / 100
  return {
    phase: document.querySelector('.act-screen')?.getAttribute('data-phase'),
    review: stage.review ? r(stage.review.radius) : null,
    x: r(stage.car.x), z: r(stage.car.z), h: r(stage.car.heading), v: r(stage.car.speed),
    cruise: r(stage.drive.cruise), stopAt: stage.drive.stopAt === null ? null : r(stage.drive.stopAt),
    manual: stage.drive.manual === null || stage.drive.manual === undefined ? null : r(stage.drive.manual),
    waits: stage.waits.length,
    deck: Boolean(stage.deck?.visible),
    verdict: document.querySelector('.fv-tag')?.textContent ?? null,
  }
})

const pick = async (match) => {
  const table = await labels()
  const index = table.findIndex((label) => new RegExp(match, 'i').test(label))
  console.log('table', table, '-> picking', index, table[index])
  if (index < 0) throw new Error(`"${match}" not dealt`)
  if (process.env.VIA === 'key') {
    await page.locator('.hz-key').nth(index).click()
    return
  }
  const point = await cardPoint(index)
  // What the raycast itself thinks is under that point, before clicking it.
  const hit = await page.evaluate(({ x, y }) => {
    const stage = window.__stage
    const rect = stage.renderer.domElement.getBoundingClientRect()
    const ndc = new (stage.camera.position.constructor.prototype.constructor)()
    const V2 = stage.deck.raycaster.ray.origin.constructor
    void ndc; void V2
    const two = { x: ((x - rect.left) / rect.width) * 2 - 1, y: -((y - rect.top) / rect.height) * 2 + 1 }
    return stage.deck.at(two, stage.camera)
  }, point)
  console.log('raycast under the click point ->', hit)
  await page.mouse.click(point.x, point.y)
}

await page.bringToFront()
await page.goto(`http://localhost:5311/?${url}&cleared=1&go=1&noanim=1`)
await page.waitForSelector('.hz-banner', { timeout: 90000 })
await page.waitForTimeout(1300)

if (prior === 'sensor') {
  await pick('all the way round')
  await page.waitForTimeout(1800)
  console.log('after the sensor:', await snap())
} else if (prior) {
  await pick(prior)
  await page.waitForSelector('.fv-strip', { timeout: 45000 })
  await page.getByRole('button', { name: /try again/i }).click()
  await page.waitForSelector('.hz-banner', { timeout: 40000 })
  await page.waitForTimeout(1300)
}

await pick(wanted)
for (let second = 1; second <= 22; second += 1) {
  await page.waitForTimeout(1000)
  console.log(second, JSON.stringify(await snap()))
}
await page.screenshot({ path: 'scripts/tmp/probe-one.png' })
await browser.close()
