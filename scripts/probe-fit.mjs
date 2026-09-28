/**
 * Fit audit. Every screen, every size: what scrolls, what leaves the stage.
 *
 * Scrollbars and clipped content are the whole complaint, so this measures
 * them rather than looking for them. A finding is one of:
 *   SCROLL  an element whose content is taller/wider than its own box
 *   BLEED   an element whose painted rect leaves the stage rect
 *   DOCROLL the document itself can scroll
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
]

const PORT = process.argv[2] || '5210'
const ONLY = process.argv[3]

const AUDIT = () => {
  const out = []
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
    if (bleed.length) {
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
  return out
}

const browser = await chromium.launch({ headless: false, args: ['--window-position=-2600,40'] })
const rows = []
for (const [w, h] of SIZES) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  for (const [name, path] of SCREENS) {
    if (ONLY && name !== ONLY) continue
    try {
      await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1200)
      const extra = SCREENS.find((s) => s[0] === name)?.[2] ?? 0
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
