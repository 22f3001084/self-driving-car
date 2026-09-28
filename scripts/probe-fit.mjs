/**
 * Fit audit. Every screen, every size: what scrolls, what leaves the stage.
 *
 * Scrollbars and clipped content are the whole complaint, so this measures
 * them rather than looking for them. A finding is one of:
 *   SCROLL  an element whose content is taller/wider than its own box
 *   BLEED   a piece of CONTENT whose painted rect leaves the board
 *   OFFSCREEN a bleed layer or pinned chrome that leaves the SCREEN
 *   DOCROLL the document itself can scroll
 *
 * Two kinds of thing, two rules. Mission content lives on the 1960 x 1102
 * board and must stay there. The backdrop, the street, the scrims and the
 * chrome deliberately reach past the board on a screen that is not 16:9
 * (--bleed-x / --bleed-y, see viewport.ts) — they must stay on the screen.
 * Content overflow does not depend on the bleed, so it is measured with the
 * bleed zeroed; the bleed layers are then measured with it restored.
 */
import { chromium } from 'playwright'

const SIZES = [
  [1920, 1080], [1600, 900], [1440, 810], [1366, 768], [1280, 800],
  [1024, 768], [1024, 600], [900, 1440], [820, 1180], [768, 1024],
  [430, 932], [390, 844], [360, 640],
]

const SCREENS = [
  // [name, path, extraWaitMs] — the SKAI-board flow. `situation` needs the
  // car to actually drive to its first stop before the popup lands.
  ['title', '/', 0],
  ['design', '/?phase=design', 0],
  ['design4', '/?phase=design&crew=4', 0],
  ['tutorial', '/?phase=tutorial', 0],
  ['levels', '/?phase=levels&cleared=1', 0],
  ['levels4', '/?phase=levels&crew=4', 0],
  ['drive', '/?phase=play&level=l1', 0],
  ['situation', '/?phase=play&level=l1', 14000],
  ['report', '/?phase=report&cleared=all&rules=many', 0],
  // The report is four pages in one fixed panel; each is audited. The policy
  // page (13 rules + a note) overran the panel for weeks because only page 1
  // was ever opened here.
  ['report-policy', '/?phase=report&cleared=all&rules=many', 0, '.report-stepper button >> nth=1'],
  ['report-crew', '/?phase=report&cleared=all&rules=many&crew=4', 0, '.report-stepper button >> nth=2'],
  ['report-teacher', '/?phase=report&cleared=all&rules=many', 0, '.report-stepper button >> nth=3'],
]

const PORT = process.argv[2] || '5210'
const ONLY = process.argv[3]

const AUDIT = () => {
  const out = []
  const root = document.documentElement
  const bleed0 = [root.style.getPropertyValue('--bleed-x'), root.style.getPropertyValue('--bleed-y')]
  root.style.setProperty('--bleed-x', '0px')
  root.style.setProperty('--bleed-y', '0px')
  void root.offsetHeight
  const stage = document.querySelector('.stage')
  const sr = stage ? stage.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
  const name = (el) => {
    const c = (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || ''
    return el.tagName.toLowerCase() + (c ? '.' + String(c).trim().split(/\s+/).slice(0, 3).join('.') : '')
  }
  if (document.scrollingElement.scrollHeight > innerHeight + 1 || document.scrollingElement.scrollWidth > innerWidth + 1)
    out.push(['DOCROLL', 'document', document.scrollingElement.scrollWidth + 'x' + document.scrollingElement.scrollHeight])
  // The flat edition's world strip is deliberately many screens wide and
  // scrolls under a clipping frame. Wide is what it is for. The SKAI board's
  // live text is seated in the delivered vector's own ink boxes (cap-height
  // rectangles smaller than the type's em box), so its "overflow" IS the
  // design; the board SVG itself is thousands of paths that never reflow.
  const BY_DESIGN = new Set(['w2d-viewport', 'w2d-world', 'w2d-layer', 'live'])
  // Reach past the board on purpose; audited against the SCREEN below.
  const PINNED = '.act-scene, .screen-scrim, .title-scrim, .skai-scrim, .skai-situation-scrim, .live, .hud-hit, .skai-sound-menu'
  for (const el of document.querySelectorAll('.stage *')) {
    if (el.closest('.skai-board')) continue
    if ([...el.classList].some((c) => BY_DESIGN.has(c))) continue
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    // A scrollable box that overflows shows a bar; a hidden box that
    // overflows CLIPS, which is worse because it is silent. Both are faults.
    const dy = el.scrollHeight - el.clientHeight
    const dx = el.scrollWidth - el.clientWidth
    if (dy > 2 || dx > 2) {
      // scrollHeight tells the truth whatever `overflow` says, so a box with
      // VISIBLE overflow is measured too — that is the case a taller typeface
      // broke, and it is the worst of the three because the content simply
      // paints over whatever is next to it.
      const kind = /auto|scroll/.test(s.overflowY + s.overflowX) ? 'SCROLL'
        : (s.overflowY === 'hidden' || s.overflowX === 'hidden') ? 'CLIP'
        : 'SPILL'
      out.push([kind, name(el), `over by ${dx}x${dy}`])
    }
    // bleed: only report elements that are not deliberately clipped by a parent
    const bleed = []
    if (r.left < sr.left - 2) bleed.push('L' + Math.round(sr.left - r.left))
    if (r.top < sr.top - 2) bleed.push('T' + Math.round(sr.top - r.top))
    if (r.right > sr.right + 2) bleed.push('R' + Math.round(r.right - sr.right))
    if (r.bottom > sr.bottom + 2) bleed.push('B' + Math.round(r.bottom - sr.bottom))
    if (bleed.length && !el.closest(PINNED)) {
      // walk up: if any ancestor clips, the paint is contained -> not a bleed
      let clipped = false
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ps = getComputedStyle(p)
        if (ps.overflow !== 'visible') { clipped = true; break }
      }
      if (!clipped) out.push(['BLEED', name(el), bleed.join(' ')])
    }
  }
  // OVERLAP: two siblings in the same list painting on top of each other.
  // Clipping is silent; overlap is worse, because it looks like content.
  for (const list of document.querySelectorAll('.stage ol, .stage ul, .stage .patrol-groups, .stage .board-grid, .stage .mode-grid')) {
    const kids = [...list.children].filter((el) => {
      const s = getComputedStyle(el)
      return s.display !== 'none' && s.position !== 'absolute' && el.getBoundingClientRect().height > 2
    })
    for (let i = 0; i < kids.length; i += 1) {
      for (let j = i + 1; j < kids.length; j += 1) {
        const a = kids[i].getBoundingClientRect()
        const b = kids[j].getBoundingClientRect()
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (ox > 3 && oy > 3) { out.push(['OVERLAP', name(list), `${Math.round(ox)}x${Math.round(oy)} between ${i} and ${j}`]); i = kids.length; break }
      }
    }
  }
  // Restore the bleed: now the pinned layers are where they really sit, and
  // each must stay on the screen.
  root.style.setProperty('--bleed-x', bleed0[0])
  root.style.setProperty('--bleed-y', bleed0[1])
  void root.offsetHeight
  for (const el of document.querySelectorAll('.stage .live, .stage .hud-hit, .stage .skai-sound-menu.is-open, .skai-board [data-part]')) {
    // The connector rules are drawn running off the frame in the export
    // itself (to x 2016-2061); the screen edge clips them, as the frame did.
    if (el.dataset?.part === 'deco-top' || el.dataset?.part === 'deco-bottom') continue
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden') continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    // parts drawn deliberately flush with (or past) the frame edge, as the
    // export has them, are allowed their own few design px
    const slack = 12 * (+getComputedStyle(root).getPropertyValue('--stage-scale') || 1)
    const off = []
    if (r.left < -slack) off.push('L' + Math.round(-r.left))
    if (r.top < -slack) off.push('T' + Math.round(-r.top))
    if (r.right > innerWidth + slack) off.push('R' + Math.round(r.right - innerWidth))
    if (r.bottom > innerHeight + slack) off.push('B' + Math.round(r.bottom - innerHeight))
    if (off.length) out.push(['OFFSCREEN', name(el) + (el.dataset?.part ? `[${el.dataset.part}]` : ''), off.join(' ')])
  }
  return out
}

const browser = await chromium.launch({ headless: false, args: ['--window-position=-2600,40'] })
const rows = []
for (const [w, h] of SIZES) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  for (const [name, path] of SCREENS) {
    if (ONLY && !name.startsWith(ONLY)) continue
    try {
      await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1200)
      const extra = SCREENS.find((s) => s[0] === name)?.[2] ?? 0
      const click = SCREENS.find((s) => s[0] === name)?.[3]
      if (click) {
        await page.locator(click).click({ force: true, timeout: 15_000 })
        await page.waitForTimeout(500)
      }
      if (extra) {
        // Wait for the situation popup itself, not just the clock.
        await page.waitForSelector('.skai-situation', { timeout: extra + 30_000 }).catch(() => null)
        await page.waitForTimeout(600)
      }
      const found = await page.evaluate(AUDIT)
      for (const f of found) rows.push([`${w}x${h}`, name, ...f])
    } catch (e) { rows.push([`${w}x${h}`, name, 'ERROR', String(e).slice(0, 90), '']) }
  }
  await page.close()
}
await browser.close()

const byKind = {}
for (const r of rows) byKind[r[2]] = (byKind[r[2]] || 0) + 1
const seen = new Map()
for (const r of rows) {
  const k = `${r[2]} ${r[1]} ${r[3]}`
  if (!seen.has(k)) seen.set(k, [])
  seen.get(k).push(r[0] + ' ' + r[4])
}
console.log(`\n=== ${rows.length} findings ===`, JSON.stringify(byKind))
for (const [k, where] of [...seen.entries()].sort((a, b) => b[1].length - a[1].length))
  console.log(`${String(where.length).padStart(3)}x  ${k}   [${where.slice(0, 3).join(' | ')}${where.length > 3 ? ' …' : ''}]`)
process.exit(0)
