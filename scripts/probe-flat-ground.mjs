/**
 * Is the car in the flat edition actually ON the road?
 *
 *   VITE_SCENE_2D=1 npx vite --port 5312 --strictPort
 *   node scripts/probe-flat-ground.mjs
 *
 * "The car is moving into air" is a claim about pixels, so this measures pixels.
 * It reads the van's box and the road band's box out of the DOM, then reads the
 * van's own SPRITE to find where its tyres actually are — a sprite sheet with
 * transparent padding under the wheels puts the car in the air however carefully
 * the CSS box is placed, and the box alone cannot see that.
 *
 * Reports the gap between the lowest opaque pixel of the car and the top of the
 * road, in pixels and as a fraction of the car's own height.
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
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } })
page.on('pageerror', (error) => console.log('ERR', error.message))
await page.bringToFront()
// l1 with NO rules: the car drives to its mark and STOPS for the question,
// which is the one moment it is guaranteed to be at rest on the flat ground.
// (l3 with rules used to idle long enough to sample; now it flows straight
// past the scooter and a sample caught the drawn far-lane lift mid-pass.)
await page.goto('http://localhost:5312/?phase=play&level=l1&cleared=1&go=1&noanim=1')
await page.waitForSelector('.w2d-van', { timeout: 90000 })
await page.waitForSelector('.hz-banner', { timeout: 90000 })
await page.waitForTimeout(600)

const out = await page.evaluate(async () => {
  const box = (selector) => {
    const node = document.querySelector(selector)
    if (!node) return null
    const r = node.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height), w: Math.round(r.width) }
  }
  const van = document.querySelector('.w2d-van')
  const style = getComputedStyle(van)
  const url = style.backgroundImage.slice(5, -2)

  // Where do the car's own pixels stop? Draw the sprite and scan up from the
  // bottom for the first row that is not transparent.
  const image = new Image()
  image.src = url
  await image.decode()
  const frames = 4 // the sheet is 400% wide: four drive frames
  const fw = Math.floor(image.naturalWidth / frames)
  const canvas = document.createElement('canvas')
  canvas.width = fw
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  const data = ctx.getImageData(0, 0, fw, canvas.height).data
  let lastOpaqueRow = -1
  for (let y = canvas.height - 1; y >= 0; y -= 1) {
    let opaque = false
    for (let x = 0; x < fw; x += 2) {
      if (data[(y * fw + x) * 4 + 3] > 24) { opaque = true; break }
    }
    if (opaque) { lastOpaqueRow = y; break }
  }
  return {
    view: { w: innerWidth, h: innerHeight },
    van: box('.w2d-van'),
    road: box('.w2d-road'),
    mid: box('.w2d-mid'),
    prop: box('.w2d-prop'),
    shadow: box('.w2d-shadow'),
    sprite: { w: image.naturalWidth, h: image.naturalHeight, frameW: fw, lastOpaqueRow, padBelowPx: canvas.height - 1 - lastOpaqueRow },
  }
})

console.log(JSON.stringify(out, null, 1))

const problems = []
const padFraction = out.sprite.padBelowPx / out.sprite.h
const tyreY = out.van.bottom - padFraction * out.van.h
console.log(`sprite carries ${out.sprite.padBelowPx}px of transparent margin below the wheels (${(padFraction * 100).toFixed(1)}% of its height)`)
console.log(`tyres at y ${tyreY.toFixed(0)} | road band ${out.road.top}..${out.road.bottom} | props at y ${out.prop.bottom} | shadow at y ${out.shadow ? out.shadow.bottom : '(none)'}`)

// ON THE TARMAC: inside the road band, not above its top edge, which is kerb.
if (tyreY < out.road.top) {
  problems.push(`the car is IN THE AIR: its tyres are ${(out.road.top - tyreY).toFixed(0)}px above the road`)
}
if (tyreY > out.road.bottom) problems.push('the car is below the road entirely')

// And on the same line as everything else standing on the street.
// Six pixels, not zero: every prop is its own PNG with its own transparent
// margin, and chasing the last three pixels of a dozen sprites is not worth a
// measurement harness. What this catches is a prop family on a DIFFERENT ground
// line, which is what the per-prop `bottom` values used to produce.
const drift = Math.abs(tyreY - out.prop.bottom)
if (drift > 6) problems.push(`the car and the props are on different ground lines, ${drift.toFixed(0)}px apart`)

// The contact shadow has to be under the tyres.
if (!out.shadow) problems.push('there is no contact shadow under the car')
else if (Math.abs(out.shadow.bottom - tyreY) > 14) {
  problems.push(`the contact shadow is ${Math.abs(out.shadow.bottom - tyreY).toFixed(0)}px away from the tyres`)
}

for (const problem of problems) console.log(` FAIL  ${problem}`)
if (!problems.length) console.log('  ok   the car stands on the road, level with everything else on it')

await page.screenshot({ path: 'scripts/tmp/flat-ground.png' })
await browser.close()
process.exit(problems.length ? 1 : 0)
