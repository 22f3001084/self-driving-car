# Key the generated 2D prop sprites: flood the BACKGROUND to transparent from
# the image edges (so white paint inside a sprite — the ambulance body — is
# safe), then autocrop to the opaque pixels with a small pad.
import sys
from collections import deque
from PIL import Image

def key(src, dst, tol=26):
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    px = im.load()
    # The background colour is whatever the corners agree on.
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    br, bg_, bb = (sum(c[i] for c in corners) // 4 for i in range(3))
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        r, g, b, a = px[x, y]
        if abs(r - br) > tol or abs(g - bg_) > tol or abs(b - bb) > tol:
            continue
        px[x, y] = (r, g, b, 0)
        if x > 0: q.append((x - 1, y))
        if x < w - 1: q.append((x + 1, y))
        if y > 0: q.append((x, y - 1))
        if y < h - 1: q.append((x, y + 1))
    box = im.getbbox()
    pad = 6
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + pad), min(h, box[3] + pad))
    im = im.crop(box)
    # Working size: none of these needs to be 1024px wide in the bundle.
    if im.width > 560:
        im = im.resize((560, round(im.height * 560 / im.width)), Image.LANCZOS)
    im.save(dst, optimize=True)
    print(f'{dst}: {im.width}x{im.height}')

pairs = [
    ('art2d/cyclist-raw.png', 'src/assets/img/flat2d/cyclist.png'),
    ('art2d/scooter-raw.png', 'src/assets/img/flat2d/scooter.png'),
    ('art2d/gate-raw.png', 'src/assets/img/flat2d/gate.png'),
    ('art2d/child-raw.png', 'src/assets/img/flat2d/child.png'),
    ('art2d/dog-raw.png', 'src/assets/img/flat2d/dog.png'),
    ('art2d/person-raw.png', 'src/assets/img/flat2d/person.png'),
    ('art2d/ambulance-raw.png', 'src/assets/img/flat2d/ambulance.png'),
    ('art2d/baysign-raw.png', 'src/assets/img/flat2d/baysign.png'),
]
for src, dst in pairs:
    key(src, dst)
