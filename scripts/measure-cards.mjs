/**
 * Where do the three cards actually land on screen, and do they fit?
 *
 *   node scripts/measure-cards.mjs "phase=patrols&patrol=dog"   (dev server on :5311)
 *
 * The deck floats in the world, so its framing is a consequence of the card
 * geometry, the anchor distance and whatever camera the child left the view on
 * — not of a stylesheet. This projects all four corners of every card face
 * through the live camera and reports the NDC box. Anything outside -1..1 is off
 * the screen; anything overlapping the HUD strips (top 34vh, bottom 30vh, i.e.
 * NDC y above 0.32 or below -0.40) is behind the copy.
 */
import { chromium } from 'playwright'

const query = process.argv[2] ?? 'phase=play&level=l1'
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
  if (message.type() === 'error') console.log('CONSOLE', message.text())
})
await page.bringToFront()
await page.goto(`http://localhost:5311/?${query}&cleared=1&go=1&noanim=1`)
await page.waitForSelector('.hz-banner', { timeout: 90000 })
await page.waitForTimeout(1400)

const data = await page.evaluate(() => {
  const stage = window.__stage
  const camera = stage.camera
  const cards = stage.deck?.cards ?? []
  const Vector3 = stage.scene.position.constructor
  const round = (n) => Math.round(n * 100) / 100
  const boxes = cards
    .filter((card) => card.group.visible)
    .map((card, index) => {
      const face = card.face
      face.updateWorldMatrix(true, false)
      const geometry = face.geometry.parameters
      const corners = [
        [-geometry.width / 2, -geometry.height / 2],
        [geometry.width / 2, -geometry.height / 2],
        [-geometry.width / 2, geometry.height / 2],
        [geometry.width / 2, geometry.height / 2],
      ].map(([x, y]) => {
        const v = new Vector3(x, y, 0)
        face.localToWorld(v)
        v.project(camera)
        return v
      })
      return {
        card: index + 1,
        minX: round(Math.min(...corners.map((c) => c.x))),
        maxX: round(Math.max(...corners.map((c) => c.x))),
        minY: round(Math.min(...corners.map((c) => c.y))),
        maxY: round(Math.max(...corners.map((c) => c.y))),
        behind: corners.some((c) => c.z > 1),
      }
    })
  const world = new Vector3()
  if (cards[1]) cards[1].group.getWorldPosition(world)
  return {
    view: stage.view,
    car: { x: round(stage.car.x), z: round(stage.car.z) },
    camera: { x: round(camera.position.x), y: round(camera.position.y), z: round(camera.position.z), fov: round(camera.fov) },
    middleCard: { x: round(world.x), y: round(world.y), z: round(world.z) },
    boxes,
  }
})
console.log(JSON.stringify(data, null, 1))

const bad = data.boxes.filter((b) => b.minX < -1 || b.maxX > 1 || b.minY < -1 || b.maxY > 1 || b.behind)
console.log(bad.length ? `OFF SCREEN: ${bad.map((b) => b.card).join(', ')}` : 'all three cards are fully on screen')
// The HUD budget is not a guess either: read the strips' real boxes and turn
// them into the same NDC the cards were measured in.
const hud = await page.evaluate(() => {
  const box = (selector) => {
    const node = document.querySelector(selector)
    if (!node) return null
    const rect = node.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom }
  }
  return { h: window.innerHeight, banner: box('.hz-banner'), prompt: box('.hz-prompt') }
})
const toNdc = (pixels) => 1 - (pixels / hud.h) * 2
const topFloor = hud.banner ? toNdc(hud.banner.bottom) : 1
const bottomCeil = hud.prompt ? toNdc(hud.prompt.top) : -1
console.log(`HUD: top strip ends at NDC y ${topFloor.toFixed(2)}, bottom strip starts at ${bottomCeil.toFixed(2)}`)
const clash = data.boxes.filter((b) => b.maxY > topFloor || b.minY < bottomCeil)
console.log(clash.length ? `UNDER THE HUD: ${clash.map((b) => b.card).join(', ')}` : 'no card is under a HUD strip')

const tag = query.replace(/[^a-z0-9]+/gi, '-')
await page.screenshot({ path: `scripts/tmp/cards-${tag}.png` })
await browser.close()
