/**
 * The whole wrong-answer loop, driven with a real pointer.
 *
 *   node scripts/probe-fault-loop.mjs            (dev server on :5311)
 *
 * Pick a card by clicking the card ITSELF in the street — projected to pixels
 * and clicked, so the raycast path is what is being tested and not a DOM button
 * — then check every claim the design makes about what happens next:
 *
 *   the car carries the wrong answer out and hits the scooter
 *   the scooter is knocked over
 *   the camera is handed to the pointer, and turns further than one full circle
 *   the verdict names the consequence
 *   Try again puts the scooter back up and the car back on its mark
 *   the right card then runs the stop properly
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
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const problems = []
const check = (ok, what) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}`)
  if (!ok) problems.push(what)
}
page.on('pageerror', (error) => { problems.push(`page error: ${error.message}`); console.log('ERR', error.message) })

/** Where a card's centre is, in page pixels. */
const cardPoint = (index) => page.evaluate((i) => {
  const stage = window.__stage
  const card = stage.deck.cards[i]
  const Vector3 = stage.scene.position.constructor
  const point = new Vector3()
  card.face.getWorldPosition(point)
  point.project(stage.camera)
  const canvas = stage.renderer.domElement.getBoundingClientRect()
  return {
    x: canvas.left + ((point.x + 1) / 2) * canvas.width,
    y: canvas.top + ((1 - point.y) / 2) * canvas.height,
  }
}, index)

const state = () => page.evaluate(() => {
  const stage = window.__stage
  const entry = stage.props.get('SCOOTER')
  const round = (n) => Math.round(n * 1000) / 1000
  return {
    review: stage.review ? { yaw: round(stage.review.yaw), pitch: round(stage.review.pitch), radius: round(stage.review.radius) } : null,
    car: { x: round(stage.car.x), z: round(stage.car.z), speed: round(stage.car.speed) },
    camera: { x: round(stage.camera.position.x), y: round(stage.camera.position.y), z: round(stage.camera.position.z) },
    scooter: entry ? {
      rotZ: round(entry.actor.group.rotation.z),
      rotX: round(entry.actor.group.rotation.x),
      y: round(entry.actor.group.position.y),
      homeRotZ: round(entry.home[0].rot.z),
      homeRotX: round(entry.home[0].rot.x),
    } : null,
    deckVisible: Boolean(stage.deck?.visible),
  }
})

await page.bringToFront()
await page.goto('http://localhost:5311/?phase=play&level=l1&cleared=1&go=1&noanim=1')
await page.waitForSelector('.hz-banner', { timeout: 150000 })
// The cards RISE into place over about half a second and the camera is still
// easing onto its mark behind them, so a point projected the instant the banner
// appears is stale by the time the pointer gets there. Let the shot settle.
await page.waitForTimeout(2600)

// Which card is which: the keypad carries the labels, so the deal can be read
// without reaching into the component.
const labels = await page.locator('.hz-key').evaluateAll(
  (nodes) => nodes.map((node) => node.getAttribute('aria-label')),
)
console.log(labels)
const crashIndex = labels.findIndex((label) => /speed past it/i.test(label))
const rightIndex = labels.findIndex((label) => /slow down, go around/i.test(label))
check(crashIndex >= 0, 'the "speed up past it" card is on the table')
check(rightIndex >= 0, 'the right card is on the table')

const before = await state()
check(before.deckVisible, 'the deck is standing in the street')

// ---- hover, then click the card itself -----------------------------------
// Projected fresh, immediately before the pointer is moved there.
const point = await cardPoint(crashIndex)
await page.mouse.move(point.x, point.y)
await page.waitForTimeout(260)
const hovered = await page.evaluate(() => window.__stage.deck.hoverIndex)
check(hovered === crashIndex, `hovering the card raycasts to it (got ${hovered}, wanted ${crashIndex})`)
const keyHot = await page.locator('.hz-key').nth(crashIndex).evaluate((node) => node.classList.contains('is-hot'))
check(keyHot, 'the keypad echoes which card the pointer is over')

await page.mouse.click(point.x, point.y)
console.log('clicked the card; waiting for the car to carry it out')
await page.waitForSelector('.fv-strip', { timeout: 40000 })
// The lens is still swinging round to the replay angle when the strip lands, so
// give it time to arrive before judging the shot.
await page.waitForTimeout(2600)

await page.screenshot({ path: 'scripts/tmp/fault-crash-angle.png' })

const after = await state()
const verdict = {
  tag: await page.locator('.fv-tag').innerText(),
  lead: await page.locator('.fv-lead').innerText(),
  why: await page.locator('.fv-why').innerText(),
}
console.log(verdict)
check(/CRASH/i.test(verdict.tag), 'the verdict says it crashed')
check(verdict.why.length > 20, 'the verdict explains why the card fails')
check(after.review !== null, 'the camera has been handed to the pointer')
check(after.car.speed < 0.2, 'the car has stopped')
const toppled = after.scooter
  && (Math.abs(after.scooter.rotZ - after.scooter.homeRotZ) > 0.5
    || Math.abs(after.scooter.rotX - after.scooter.homeRotX) > 0.5)
check(Boolean(toppled), `the scooter is on its side (rot x ${after.scooter?.rotX}, z ${after.scooter?.rotZ}, home z ${after.scooter?.homeRotZ})`)
check(!after.deckVisible, 'the cards are gone')
check(await page.locator('.orbit-hint').isVisible(), 'the drag coaching line is up')

// ---- 720 degrees --------------------------------------------------------
const yaw0 = after.review.yaw
await page.mouse.move(800, 500)
await page.mouse.down()
for (let step = 0; step < 52; step += 1) {
  await page.mouse.move(800 + step * 40, 500)
}
await page.mouse.up()
const spun = await state()
const turned = Math.abs(spun.review.yaw - yaw0)
check(turned > Math.PI * 4, `the view turns past two full circles (turned ${(turned / Math.PI).toFixed(2)}pi)`)
const moved = Math.hypot(spun.camera.x - after.camera.x, spun.camera.z - after.camera.z)
check(moved > 1, `the lens actually moved (${moved.toFixed(2)} m)`)

// Pitch: down to the tarmac and up over the roof, and never past the pole.
await page.mouse.move(800, 500)
await page.mouse.down()
for (let step = 0; step < 30; step += 1) await page.mouse.move(800, 500 + step * 30)
await page.mouse.up()
const pitched = await state()
check(pitched.review.pitch <= 1.35 && pitched.review.pitch >= -0.18, `pitch stays inside its stops (${pitched.review.pitch})`)

// Zoom.
await page.mouse.move(800, 500)
await page.mouse.wheel(0, -600)
await page.waitForTimeout(200)
const zoomed = await state()
check(zoomed.review.radius < spun.review.radius, `the wheel zooms in (${spun.review.radius} -> ${zoomed.review.radius})`)

await page.screenshot({ path: 'scripts/tmp/fault-crash-review.png' })

// ---- another go ---------------------------------------------------------
await page.getByRole('button', { name: /try again/i }).click()
await page.waitForSelector('.hz-banner', { timeout: 60000 })
await page.waitForTimeout(2200)
const again = await state()
check(again.review === null, 'the camera is back on the rig')
const restored = again.scooter
  && Math.abs(again.scooter.rotZ - again.scooter.homeRotZ) < 0.02
  && Math.abs(again.scooter.rotX - again.scooter.homeRotX) < 0.02
  && Math.abs(again.scooter.y) < 0.02
check(Boolean(restored), `the scooter is standing again (rot x ${again.scooter?.rotX}, z ${again.scooter?.rotZ}, y ${again.scooter?.y})`)
check(Math.abs(again.car.x - before.car.x) < 0.6, `the car is back on its mark (${again.car.x} vs ${before.car.x})`)
check(Math.abs(again.car.z - before.car.z) < 0.3, 'the car is square in its lane')
check(again.deckVisible, 'the cards are back up')
const attempt = await page.locator('.hz-key').count()
check(attempt === 3, 'still three cards')

// ---- and now the right one ---------------------------------------------
const labels2 = await page.locator('.hz-key').evaluateAll(
  (nodes) => nodes.map((node) => node.getAttribute('aria-label')),
)
const right2 = labels2.findIndex((label) => /slow down, go around/i.test(label))
const point2 = await cardPoint(right2)
await page.mouse.click(point2.x, point2.y)
await page.waitForTimeout(3500)
const phase = await page.locator('.act-screen').getAttribute('data-phase')
console.log('phase after the right card:', phase)
check(['scanning', 'acting', 'driving', 'passed'].includes(phase), `the right card runs the stop (phase ${phase})`)
const rules = await page.evaluate(() => window.__game.getState().rules.length)
check(rules >= 1, `the right card was written into the policy (${rules} rules)`)

await page.screenshot({ path: 'scripts/tmp/fault-passed.png' })
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n - ${problems.join('\n - ')}` : '\nall checks passed')
await browser.close()
process.exit(problems.length ? 1 : 0)
