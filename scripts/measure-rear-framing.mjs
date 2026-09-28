/**
 * Where do the car and the ambulance actually land in the rear-view frame?
 *
 *   node scripts/measure-rear-framing.mjs          (dev server on :5311)
 *
 * Opens the ambulance patrol, fits the rear sensor, and projects the car's roof
 * and tail and the ambulance's centre and top through the live camera. NDC y
 * runs +1 at the top of the frame to -1 at the bottom, so this is how the rear
 * rig's offset was solved rather than guessed: at one metre ahead of the car the
 * roof came out at -0.66 and the tail at -0.92, i.e. underneath the command bar.
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
page.on('pageerror', e => console.log('ERR', e.message))
await page.goto('http://localhost:5311/?phase=patrols&patrol=emergency&cleared=1&go=1&noanim=1')
await page.waitForSelector('.fault-layer.is-sensor', { timeout: 60000 })
await page.locator('.fault-card').nth(2).click(); await page.waitForTimeout(500)
await page.getByRole('button', { name: /fit the rear sensor/i }).click(); await page.waitForTimeout(900)
const d = await page.evaluate(() => {
  const s = window.__stage
  const V = s.scene.position.constructor
  const cam = s.camera
  const proj = (x, y, z) => { const v = new V(x, y, z); v.project(cam); return { x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) } }
  let amb = null
  s.scene.traverse(n => { if (n.name === 'ambulance_body') { const p = new V(); n.getWorldPosition(p); amb = p } })
  return {
    cam: { x: +cam.position.x.toFixed(2), y: +cam.position.y.toFixed(2), z: +cam.position.z.toFixed(2), fov: cam.fov },
    car: { x: +s.car.x.toFixed(2), z: +s.car.z.toFixed(2) },
    carRoofNDC: proj(s.car.x - 1.9, 1.5, s.car.z),
    carTailNDC: proj(s.car.x - 2.1, 0.9, s.car.z),
    ambNDC: amb ? proj(amb.x, 1.6, amb.z) : null,
    ambTopNDC: amb ? proj(amb.x, 3.1, amb.z) : null,
  }
})
console.log(JSON.stringify(d, null, 1))
await browser.close()
