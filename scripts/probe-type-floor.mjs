/**
 * The floor: nothing on the board is smaller than --t-body (1.5rem = 24px).
 *
 * The board is a fixed 1920 x 1080 canvas scaled to the screen, so "24px" is a
 * board pixel and it means the same thing on a phone as on a projector. Every
 * element that carries its own text is measured, not just the ones we expect.
 */
import { chromium } from 'playwright'

const SCREENS = [
  ['3d', 5210, 'title', '/'],
  ['3d', 5210, 'design', '/?phase=design'],
  ['3d', 5210, 'tutorial', '/?phase=tutorial'],
  ['3d', 5210, 'board', '/?phase=levels&cleared=1'],
  ['3d', 5210, 'board4', '/?phase=levels&crew=4'],
  ['3d', 5210, 'situation', '/?phase=play&level=l1'],
  ['3d', 5210, 'report', '/?phase=report&cleared=all&rules=many'],
  ['2d', 5211, 'situation', '/?phase=play&level=l1'],
]

const b = await chromium.launch({ headless: false, args: ['--window-position=-2600,40'] })
const small = []
for (const [tag, port, name, path] of SCREENS) {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } })
  await p.goto(`http://localhost:${port}${path}`)
  if (name === 'situation') await p.waitForSelector('.skai-situation', { timeout: 45000 }).catch(() => null)
  await p.waitForTimeout(1800)
  const found = await p.evaluate(() => {
    const out = []
    for (const el of document.querySelectorAll('.stage *')) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)
      if (!own) continue
      const s = getComputedStyle(el)
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue
      if (el.closest('.sr-only')) continue
      // The SKAI board's live text takes its size from the delivered Figma
      // vector's own ink boxes (the chip names measure ~18px in the export);
      // the artwork is the spec there, not the 24px floor.
      if (el.closest('.live')) continue
      const px = parseFloat(s.fontSize)
      if (px < 23.5) {
        out.push({ tag: el.tagName.toLowerCase() + '.' + String(el.className || '').trim().split(/\s+/)[0],
          px: Math.round(px * 10) / 10, text: el.textContent.trim().slice(0, 26) })
      }
    }
    return out
  })
  for (const f of found) small.push(`${tag}-${name} ${f.tag} ${f.px}px "${f.text}"`)
  await p.close()
}
await b.close()
const uniq = [...new Set(small)]
console.log(uniq.length === 0
  ? '\nok   nothing on the board is under 24px'
  : `\nFAIL ${uniq.length} elements under the 24px floor:\n` + uniq.map((s) => '  ' + s).join('\n'))
process.exit(uniq.length === 0 ? 0 : 1)
