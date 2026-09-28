/**
 * Capture a run of the 3D street as a frame sequence.
 *
 * Drives level 3 with the first two rules already written, so the vehicle runs
 * a continuous stretch: reads its policy, fires rule 1, steers around the
 * scooter, fires rule 2, threads the roadworks gate, then pulls up at the
 * delivery gate it has no rule for. No clicks needed, so the capture is smooth.
 *
 * Frames land as PNGs; build-gif.py assembles them.
 */
import { chromium } from '@playwright/test'
import { mkdir, rm } from 'node:fs/promises'

const OUT = process.argv[2] ?? 'gif-frames'
const URL = process.argv[3] ?? 'http://localhost:5210/?phase=play&level=l3&go=1&rules=two'
const FRAMES = Number(process.argv[4] ?? 78)
const EVERY = Number(process.argv[5] ?? 165)

await rm(OUT, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })

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
page.on('pageerror', (error) => console.error('[page]', error.message))

await page.goto(URL)
// Let the city build and the first frames settle before recording.
await page.waitForSelector('.scene-canvas')
await page.waitForTimeout(900)

for (let i = 0; i < FRAMES; i += 1) {
  await page.screenshot({ path: `${OUT}/f${String(i).padStart(3, '0')}.png` })
  await page.waitForTimeout(EVERY)
}

console.log(`captured ${FRAMES} frames to ${OUT}`)
await browser.close()
