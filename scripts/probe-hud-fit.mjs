/**
 * Does the SKAI board's live layer stay in its lanes, at any window size?
 *
 *   node scripts/probe-hud-fit.mjs             (dev server on :5311)
 *
 * The layout law: the situation popup lives INSIDE the board's clear middle
 * window (x 90 → 1830, y 130 → 890 in design pixels) and never covers the
 * artwork's CTA plate; while the car is simply driving the chrome goes QUIET
 * (chips and names faded) so nothing competes with the road; and every hit
 * area sits exactly over its artwork. Checked at five window sizes, from a
 * classroom projector down to a small laptop.
 */
import { chromium } from 'playwright'

const SIZES = [
  { w: 1920, h: 1080, name: 'projector' },
  { w: 1600, h: 900, name: 'desktop' },
  { w: 1366, h: 768, name: 'laptop' },
  { w: 1280, h: 720, name: 'small laptop' },
  { w: 1024, h: 640, name: 'short window' },
]

const browser = await chromium.launch({
  headless: false,
  args: [
    // Off-screen, so no window flashes up while a probe runs. Headed because
    // headless falls back to SwiftShader and the street drops to ~2 fps.
    '--window-position=-2600,40',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ],
})
const problems = []

async function measure(page, label, size) {
  const found = await page.evaluate(() => {
    const stage = document.querySelector('.stage')
    const sr = stage.getBoundingClientRect()
    const scale = sr.width / 1960
    // A design-pixel rectangle of an on-screen box.
    const design = (r) => ({
      left: (r.left - sr.left) / scale, top: (r.top - sr.top) / scale,
      right: (r.right - sr.left) / scale, bottom: (r.bottom - sr.top) / scale,
    })
    const box = (s) => {
      const n = document.querySelector(s)
      if (!n) return null
      return design(n.getBoundingClientRect())
    }
    const opacity = (s) => {
      const n = document.querySelector(s)
      return n ? Number(getComputedStyle(n).opacity) : null
    }
    return {
      hud: stage.getAttribute('data-hud'),
      situation: box('.skai-situation'),
      status: box('.skai-status'),
      ctaHit: box('.hit-cta'),
      nameOpacity: opacity('.live-name'),
      timerOpacity: opacity('.live-timer'),
      decoOpacity: opacity('.skai-board [data-part="deco-bottom"]'),
      docScrollX: document.documentElement.scrollWidth - window.innerWidth,
      docScrollY: document.documentElement.scrollHeight - window.innerHeight,
    }
  })

  const at = `${size.name} ${size.w}x${size.h} [${label}]`
  if (found.docScrollX > 0 || found.docScrollY > 0) {
    problems.push(`${at}: the page scrolls by ${found.docScrollX}x${found.docScrollY}px`)
  }

  if (label === 'driving') {
    // Quiet chrome: names faded, connector rules gone, middle band clear of
    // everything but the slim status chip.
    if (found.hud !== 'quiet') problems.push(`${at}: expected data-hud="quiet", got ${found.hud}`)
    if (found.nameOpacity > 0.05) problems.push(`${at}: chip names still painted at opacity ${found.nameOpacity}`)
    if (found.timerOpacity > 0.05) problems.push(`${at}: the clock still painted at opacity ${found.timerOpacity} — no countdown pressure on the move`)
    if (found.decoOpacity > 0.05) problems.push(`${at}: connector rules still painted at opacity ${found.decoOpacity}`)
    if (found.status && found.status.bottom > 260) {
      problems.push(`${at}: the status chip reaches ${Math.round(found.status.bottom)}dp, below the top band`)
    }
    console.log(`  ${size.name.padEnd(13)} driving   quiet=${found.hud === 'quiet'}  names=${found.nameOpacity}  deco=${found.decoOpacity}`)
  }

  if (label === 'asking') {
    if (found.hud !== 'full') problems.push(`${at}: expected data-hud="full" behind the popup, got ${found.hud}`)
    if (!found.situation) { problems.push(`${at}: no situation popup on screen`); return }
    const s = found.situation
    // Inside the clear middle window, and never on the CTA plate.
    if (s.left < 88 || s.right > 1832) problems.push(`${at}: popup runs x ${Math.round(s.left)} → ${Math.round(s.right)}dp, outside 90 → 1830`)
    if (s.top < 128) problems.push(`${at}: popup rises to ${Math.round(s.top)}dp, into the chip band`)
    if (found.ctaHit && s.bottom > found.ctaHit.top - 4) {
      problems.push(`${at}: popup bottom ${Math.round(s.bottom)}dp covers the CTA plate at ${Math.round(found.ctaHit.top)}dp`)
    }
    console.log(`  ${size.name.padEnd(13)} asking    popup ${Math.round(s.top)}→${Math.round(s.bottom)}dp  cta at ${Math.round(found.ctaHit?.top ?? -1)}dp`)
  }
}

for (const size of SIZES) {
  const page = await browser.newPage({ viewport: { width: size.w, height: size.h } })
  page.on('pageerror', (error) => problems.push(`${size.name}: page error ${error.message}`))
  await page.bringToFront()

  await page.goto('http://localhost:5210/?phase=play&level=l1&noanim=1')
  // First the plain driving screen, once the entrance flourish has settled.
  await page.waitForFunction(
    () => document.querySelector('.act-screen')?.getAttribute('data-phase') === 'driving',
    null, { timeout: 60000 },
  )
  await page.waitForFunction(() => document.querySelector('.stage.is-settled'), null, { timeout: 20000 })
  await page.waitForTimeout(900)
  await measure(page, 'driving', size)

  // Then the situation popup.
  await page.waitForSelector('.skai-situation', { timeout: 60000 })
  await page.waitForTimeout(900)
  await measure(page, 'asking', size)
  await page.screenshot({ path: `scripts/tmp/hud-${size.w}x${size.h}.png` }).catch(() => null)
  await page.close()
}

console.log(problems.length
  ? `\n${problems.length} PROBLEM(S):\n - ${problems.join('\n - ')}`
  : '\nthe board fits at every size: quiet on the move, popup inside the window, CTA clear')
await browser.close()
process.exit(problems.length ? 1 : 0)
