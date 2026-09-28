/**
 * Does the FLAT edition still play the same game?
 *
 *   VITE_SCENE_2D=1 npx vite --port 5312 --strictPort
 *   node scripts/probe-flat-edition.mjs
 *
 * The 2D edition is a real deliverable — it is what a school machine with 3D
 * switched off by policy gets — and it shares the whole game layer with the 3D
 * one. When the answers moved into the street as 3D cards, this edition had no
 * street to put them in, so it has to reach the same question through the HUD
 * keypad, crash on a wrong answer, and retry. Nothing else checks that.
 */
import { chromium } from 'playwright'

const BASE = 'http://localhost:5312'
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
page.on('console', (message) => {
  if (message.type() === 'error') { problems.push(`console: ${message.text()}`); console.log('CONSOLE', message.text()) }
})

await page.bringToFront()
await page.goto(`${BASE}/?phase=play&level=l1&cleared=1&go=1&noanim=1`)

// The flat scene, not the 3D one.
await page.waitForSelector('.scene-flat, .w2d, .scene', { timeout: 60000 })
check(await page.locator('.scene-canvas').count() === 0, 'the flat edition ships no WebGL canvas')

await page.waitForSelector('.hz-banner', { timeout: 90000 })
check(true, 'the question reaches the flat edition')
const keys = await page.locator('.hz-key').count()
check(keys === 3, `three keys on the keypad (got ${keys})`)
const labels = await page.locator('.hz-key').evaluateAll(
  (nodes) => nodes.map((node) => (node.getAttribute('aria-label') ?? '').replace(/^Card \d+: /, '')),
)
console.log('   ', labels)

// A wrong answer must crash here too.
const wrong = labels.findIndex((label) => !/slow down, go around/i.test(label))
await page.locator('.hz-key').nth(wrong).click()
await page.waitForSelector('.fv-strip', { timeout: 60000 })
const tag = (await page.locator('.fv-tag').innerText()).trim()
check(/CRASH/i.test(tag), `the verdict says it crashed (${tag})`)
check(await page.locator('.w2d-van.is-crashed').count() > 0, 'the car is drawn crashed, not sailing past')
await page.screenshot({ path: 'scripts/tmp/flat-crash.png' })

// And the retry brings the question back.
await page.locator('.fv-go').click()
await page.waitForSelector('.hz-banner', { timeout: 60000 })
await page.waitForTimeout(900)
check(await page.locator('.w2d-van.is-crashed').count() === 0, 'the retry un-crashes the car')
check(await page.locator('.hz-key').count() === 3, 'the three answers are back')

// The right answer still clears the stop.
const again = await page.locator('.hz-key').evaluateAll(
  (nodes) => nodes.map((node) => (node.getAttribute('aria-label') ?? '')),
)
const right = again.findIndex((label) => /slow down, go around/i.test(label))
await page.locator('.hz-key').nth(right).click()
// A right pick now flows straight into the manoeuvre and the level can
// ADVANCE within a couple of seconds — sample early, and treat a screen
// that has already moved on as the same success.
await page.waitForTimeout(1200)
const phase = await page.locator('.act-screen').getAttribute('data-phase', { timeout: 2000 }).catch(() => null)
check(phase === null || ['scanning', 'acting', 'driving', 'passed'].includes(phase), `the right answer runs the stop (phase ${phase ?? 'advanced past the act screen'})`)
await page.screenshot({ path: 'scripts/tmp/flat-passed.png' })

console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n - ${problems.join('\n - ')}` : '\nthe flat edition plays the same game')
await browser.close()
process.exit(problems.length ? 1 : 0)
