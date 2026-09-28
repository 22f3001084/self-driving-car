/**
 * Does the FLAT deliverable boot off the disk?
 *
 *   node scripts/probe-flat-package.mjs
 *
 * `e2e/offline.spec.ts` drives the 3D folder from `file://`, which is the one
 * that has to prove a `file://` page can carry an inlined .glb. The 2D folder is
 * shipped too and nothing checked it, so a broken flat package would have gone
 * out silently.
 */
import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const INDEX = path.resolve('../../The-Northline-Run-2D/index.html')
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
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
const problems = []
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(`console: ${message.text()}`)
})

await page.bringToFront()
// No dev query strings: `applyDevQuery` is stripped from a production bundle, so
// a packaged build has to be clicked into exactly the way a classroom does it.
await page.goto(pathToFileURL(INDEX).href)
await page.getByRole('button', { name: /start mission/i }).click()
await page.locator('.mode-card').nth(1).click()
await page.getByRole('button', { name: /to the depot/i }).click()
await page.locator('.mission-card').first().click()
await page.getByRole('button', { name: /send the car/i }).click()
await page.waitForSelector('.hz-banner', { timeout: 90000 })
console.log('  ok   the flat package boots from file:// and reaches the question')
const keys = await page.locator('.hz-key').count()
if (keys !== 3) problems.push(`three keys expected, got ${keys}`)
else console.log('  ok   three answers on the keypad')
if (await page.locator('.crash-screen').count()) problems.push('the crash-recovery card is showing')
if (await page.locator('.scene-canvas').count()) problems.push('the flat package is carrying a WebGL canvas')
else console.log('  ok   no WebGL canvas in the flat package')
await page.screenshot({ path: 'scripts/tmp/flat-package.png' })
console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n - ${problems.join('\n - ')}` : '\nthe flat deliverable is sound')
await browser.close()
process.exit(problems.length ? 1 : 0)
