"""Quantise the baked icon PNGs in place.

FASTOCTREE is the only Pillow quantiser that preserves the alpha channel, which
these icons need — they sit on coloured buttons and card surfaces.
"""
import io
import pathlib

from PIL import Image

ICONS = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'icons'

before = after = 0
for path in sorted(ICONS.glob('*.png')):
    before += path.stat().st_size
    image = Image.open(path).convert('RGBA')
    buffer = io.BytesIO()
    image.quantize(colors=128, method=Image.FASTOCTREE).save(buffer, 'PNG', optimize=True)
    if buffer.tell() < path.stat().st_size:
        path.write_bytes(buffer.getvalue())
    after += path.stat().st_size

print(f'icons {before // 1024} KB -> {after // 1024} KB')
