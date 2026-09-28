"""
Graft the speaker from the SKAI AI & Data layout into our two boards.

    python scripts/graft-speaker.py

Our boards (src/assets/skai/board/single.svg and multiplayer.svg) are the SKAI
Layout System export, which has no speaker. The newer layout set in
"Designn systumm/layouts" draws the same AI & Data chrome WITH one: an orange
hex left of the info hex, and an audio menu that drops from it. This copies
that vector in, path for path, rather than redrawing it.

  * The speaker lands at the same offset from the info hex the layout uses
    (84 design px to its left). The multiplayer board draws its top-right
    cluster about 1.2x larger, so the speaker is scaled with it.
  * It is wrapped twice: the OUTER <g data-part="sound"> is what the board
    choreography animates (its keyframes set `transform`), the INNER <g>
    carries the placement. One element holding both would lose its placement
    to the animation.
  * The four sound-wave paths are tagged .sound-wave, and a small cross,
    .sound-mute, is added in the same white stroke. board.css swaps them when
    sound is off, so the speaker itself says whether it is muted.
  * The white connector rule that runs off the top-right is moved left with the
    cluster, so it bends in before the speaker the way the layout draws it,
    instead of running underneath it.

Idempotent: a board that already has a speaker is re-grafted from scratch.
"""
import io
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAYOUT = ROOT.parent.parent / 'Designn systumm' / 'layouts' / 'ai-data.html'
BOARDS = ROOT / 'src' / 'assets' / 'skai' / 'board'

NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')

# ---- the source vector ---------------------------------------------------
html = io.open(LAYOUT, encoding='utf-8').read()
chrome = re.search(r'<svg class="chrome"[\s\S]*?</svg>', html).group(0)
src = ET.fromstring(chrome)
vb = [float(v) for v in src.get('viewBox').split()]
clip = next(c for c in src if c.tag == f'{{{NS}}}g' and c.get('clip-path'))
kids = list(clip)
# 75 hex, 76-77 the cone, 78-81 the waves (checked against the render: the
# hex's box is 1584,24 66x67 in board px, 84 px left of the info hex at 1668)
HEX, CONE, WAVES = kids[75], kids[76:78], kids[78:82]
assert HEX.get('fill') == '#F5A524' and HEX.get('stroke') == 'white', 'layout changed: re-check indices'
SRC_INFO = (1668.0, 24.0, 66.0)   # the layout's info hex: x, y, size

# The mute cross, drawn in the same space as the waves it replaces: just right
# of the cone, centred on it vertically. The speaker paths are in the export's
# RAW coordinates (the chrome's viewBox starts at 873,315), so the cross is
# written in board px and moved into that space.
def mute_cross():
    ox, oy = vb[0], vb[1]
    (x0, y0), (x1, y1) = (1624, 50), (1636, 63)
    return (f'M{x0 + ox:g} {y0 + oy:g}L{x1 + ox:g} {y1 + oy:g}'
            f'M{x1 + ox:g} {y0 + oy:g}L{x0 + ox:g} {y1 + oy:g}')


def speaker_group(info_x, info_y, info_size):
    """The speaker, placed relative to a board's own info hex."""
    k = info_size / SRC_INFO[2]
    # layout px -> board px (drop the export's viewBox origin), then scale about
    # the layout's info hex and land on this board's info hex
    tx = info_x - SRC_INFO[0] * k - vb[0] * k
    ty = info_y - SRC_INFO[1] * k - vb[1] * k
    outer = ET.Element(f'{{{NS}}}g', {'data-part': 'sound'})
    inner = ET.SubElement(outer, f'{{{NS}}}g', {
        'transform': f'translate({tx:.3f} {ty:.3f}) scale({k:.5f})',
    })
    for node in [HEX, *CONE]:
        inner.append(copy(node))
    for node in WAVES:
        wave = copy(node)
        wave.set('class', 'sound-wave')
        inner.append(wave)
    ET.SubElement(inner, f'{{{NS}}}path', {
        'class': 'sound-mute', 'd': mute_cross(), 'stroke': 'white', 'stroke-width': '3.4',
        'stroke-linecap': 'round', 'fill': 'none',
    })
    return outer


def copy(node):
    return ET.fromstring(ET.tostring(node))


# Each board's info hex, measured with getBBox in a browser (scripts/tmp/bbox.mjs)
# rather than read from path data: the hex path mixes H/V commands with curves,
# so pairing its numbers up as x,y is wrong.
INFO = {
    'single.svg': (1672.0, 34.0, 66.0),
    'multiplayer.svg': (1609.0, 27.0, 79.0),
}


def graft(name, deco_shift):
    path = BOARDS / name
    text = io.open(path, encoding='utf-8').read()
    tree = ET.ElementTree(ET.fromstring(text))
    root = tree.getroot()
    group = next(c for c in root if c.tag == f'{{{NS}}}g' and c.get('clip-path'))

    # start clean: drop an earlier graft and undo an earlier rule shift
    for old in [c for c in group if c.get('data-part') == 'sound']:
        group.remove(old)
    for g in [c for c in group if c.get('data-part') == 'deco-top' and c.tag == f'{{{NS}}}g' and c.get('data-grafted')]:
        inner = list(g)[0]
        inner.attrib.pop('transform', None)
        inner.set('data-part', 'deco-top')
        group.insert(list(group).index(g), inner)
        group.remove(g)

    ix, iy, iw = INFO[name]
    group.append(speaker_group(ix, iy, iw))

    # the connector rule off the top-right bends in before the speaker
    rule = next(c for c in group if c.get('data-part') == 'deco-top')
    at = list(group).index(rule)
    wrap = ET.Element(f'{{{NS}}}g', {'data-part': 'deco-top', 'data-grafted': 'speaker'})
    del rule.attrib['data-part']
    rule.set('transform', f'translate({deco_shift[0]} {deco_shift[1]})')
    wrap.append(rule)
    group.remove(rule)
    group.insert(at, wrap)

    out = ET.tostring(root, encoding='unicode')
    io.open(path, 'w', encoding='utf-8').write(out)
    print(f'{name}: speaker grafted beside the info hex at {ix:.0f},{iy:.0f} ({iw:.0f} px)')


# Rule shifts. The title board matches the layout exactly once its rule starts
# 174 px left of the info hex (ours started 71 px left). The multiplayer rule
# must NOT move: its far end sits just past the board edge, and pulling it left
# drags that end into view as a vertical stroke. Unmoved, it already lands in
# the gap between the new speaker and the info hex.
graft('single.svg', (-103, 4))
graft('multiplayer.svg', (0, 0))


# ---- the audio menu ------------------------------------------------------
# The layout's menu art, lifted from the same file. Its first four paths
# redraw the speaker glyph (the "pressed" look) at the speaker's own spot; our
# board already draws the speaker and swaps its waves for a cross when muted,
# so those four would paint the waves back over the cross. They are dropped,
# and the viewBox is cropped to start at the amber pointer.
menu_svg = re.search(r'<svg class="menu-art"[\s\S]*?</svg>', html).group(0)
menu = ET.fromstring(menu_svg)
body = next(c for c in menu if c.tag == f'{{{NS}}}g')
drawn = list(body)
assert drawn[4].tag == f'{{{NS}}}rect' and drawn[4].get('fill') == '#0A2D94', 'layout menu changed: re-check'
for node in drawn[:4]:
    body.remove(node)
MENU_TOP = 94.0      # the pointer's top, in the layout's board px
x, y, w, h = [float(v) for v in menu.get('viewBox').split()]
menu.set('viewBox', f'{x:.2f} {MENU_TOP:.2f} {w:.2f} {y + h - MENU_TOP:.2f}')
for attr in ('class', 'aria-hidden', 'preserveAspectRatio'):
    menu.attrib.pop(attr, None)
# The plate's stroke points at url(#paint0_linear_23_5), which is defined
# nowhere in the layout file: a dangling reference in the export itself, so the
# layout renders the plate with no rim. Drop the dead reference (identical
# render) rather than invent a rim the design does not draw.
plate = next(c for c in body if c.tag == f'{{{NS}}}rect')
if plate.get('stroke', '').startswith('url(#') and not any(
        e.get('id') == plate.get('stroke')[5:-1] for e in menu.iter()):
    plate.attrib.pop('stroke', None)
io.open(BOARDS / 'sound-menu.svg', 'w', encoding='utf-8').write(ET.tostring(menu, encoding='unicode'))
print(f'sound-menu.svg: {w:.1f} x {y + h - MENU_TOP:.1f}, top {MENU_TOP - SRC_INFO[1]:.0f} px below the speaker')
