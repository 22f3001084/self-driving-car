/**
 * Render every icon to a PNG on disk.
 *
 * Opens the bake page in a real browser (WebGL needs one), asks it for the
 * frames, and writes them into src/assets/icons/ where Vite picks them up.
 */
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const BASE = process.argv[2] ?? 'http://localhost:5210'
const OUT = 'src/assets/icons'
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
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
page.on('pageerror', (error) => { console.error('[page]', error.message); process.exitCode = 1 })

await page.goto(`${BASE}/bake.html`)
await page.waitForFunction(() => typeof window.__bakeIcons === 'function', null, { timeout: 30_000 })
const icons = await page.evaluate(() => window.__bakeIcons())

const kebab = (value) => value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
let written = 0
for (const icon of icons) {
  const suffix = icon.tint === 'light' ? '-light' : ''
  const file = `${OUT}/${kebab(icon.name)}${suffix}.png`
  await writeFile(file, Buffer.from(icon.dataUrl.split(',')[1], 'base64'))
  written += 1
}
console.log(`wrote ${written} icon PNGs to ${OUT}`)
await browser.close()

// Flat-shaded renders quantise to a 128-colour palette with no visible loss and
// about a third of the bytes, which matters for a package a school downloads.
// Skipped silently if Python/Pillow is unavailable — the PNGs are still valid.
try {
  const { execFileSync } = await import('node:child_process')
  execFileSync('python', ['scripts/shrink-icons.py'], { stdio: 'inherit' })
} catch {
  console.warn('icon compression skipped (python/Pillow not available)')
}
