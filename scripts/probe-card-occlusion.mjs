/**
 * Is anything standing in front of an answer card?
 *
 *   node scripts/probe-card-occlusion.mjs        (dev server on :5311)
 *
 * The cards float over the road and spread along the CAMERA's right, which
 * throws the outer one about nine metres to the side — out over the near
 * pavement, where the shop row is. `measure-cards.mjs` proves a card is inside
 * the frame; it cannot see that a building is drawn on top of it.
 *
 * This raycasts from the lens at the centre and all four corners of every card
 * and reports what the ray hits FIRST. Anything but the card's own face is a
 * frontage standing in the way, and the answer to that is a bigger setback in
 * `roadSystem.ts` or a shorter shop in `build_kit.py` — never a fade.
 */
import { chromium } from 'playwright'

const SCENES = [
  { name: 'scooter', url: 'phase=play&level=l1' },
  { name: 'gate', url: 'phase=play&level=l2' },
  { name: 'crossing', url: 'phase=patrols&patrol=busy' },
  { name: 'ambulance (rear rig)', url: 'phase=patrols&patrol=emergency' },
  { name: 'clinic', url: 'phase=play&level=l3&rules=two' },
]

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
const problems = []

for (const scene of SCENES) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  page.on('pageerror', (error) => problems.push(`${scene.name}: page error ${error.message}`))
  await page.bringToFront()
  await page.goto(`http://localhost:5311/?${scene.url}&cleared=1&go=1&noanim=1`)
  await page.waitForSelector('.hz-banner', { timeout: 150000 })
  await page.waitForTimeout(2400)

  const hits = await page.evaluate(() => {
    const stage = window.__stage
    const THREE_V3 = stage.scene.position.constructor
    const raycaster = stage.deck.raycaster
    const camera = stage.camera
    const from = new THREE_V3().setFromMatrixPosition(camera.matrixWorld)

    // Everything solid the ray could meet. Collected as a flat list of MESHES:
    // `intersectObjects(..., true)` recurses into sprites too, and a Sprite's
    // raycast needs `raycaster.camera` set or it throws on the first one it
    // meets — which is what the deck's own halos did.
    const targets = []
    stage.scene.traverse((node) => {
      if (!node.isMesh || !node.visible) return
      for (let parent = node; parent; parent = parent.parent) {
        if (parent === stage.deck.group) return
      }
      targets.push(node)
    })

    const out = []
    for (const [index, card] of stage.deck.cards.entries()) {
      if (!card.group.visible) continue
      const geometry = card.face.geometry.parameters
      // The true corners, not 90% of the way out: the margin this probe is
      // protecting is small, and sampling inside the card hides the case where
      // only its outer edge is behind something.
      const points = [[0, 0], [-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]
      for (const [u, v] of points) {
        const target = new THREE_V3(u * geometry.width, v * geometry.height, 0)
        card.face.localToWorld(target)
        const direction = target.clone().sub(from)
        const reach = direction.length()
        raycaster.set(from, direction.normalize())
        raycaster.far = reach - 0.05
        const blocked = raycaster.intersectObjects(targets, false)
        raycaster.far = Infinity
        if (blocked.length) {
          out.push({
            card: index + 1,
            at: u === 0 ? 'centre' : `${v > 0 ? 'top' : 'bottom'}-${u > 0 ? 'right' : 'left'}`,
            by: blocked[0].object.name || blocked[0].object.parent?.name || '(unnamed)',
            distance: Math.round(blocked[0].distance * 10) / 10,
            cardDistance: Math.round(reach * 10) / 10,
          })
        }
      }
    }
    return out
  })

  if (hits.length) {
    for (const hit of hits) {
      problems.push(`${scene.name}: card ${hit.card} ${hit.at} is behind "${hit.by}" (${hit.distance} m vs the card at ${hit.cardDistance} m)`)
    }
    console.log(` FAIL  ${scene.name}: ${hits.length} of 15 sample points occluded`)
  } else {
    console.log(`  ok   ${scene.name}: all three cards are unobstructed`)
  }
  await page.screenshot({ path: `scripts/tmp/occl-${scene.name.replace(/\W+/g, '-')}.png` })
  await page.close()
}

console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n - ${problems.join('\n - ')}` : '\nnothing stands between the lens and an answer card')
await browser.close()
process.exit(problems.length ? 1 : 0)
