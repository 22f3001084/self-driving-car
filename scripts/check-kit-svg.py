"""Every part in src/assets/skai must be well-formed XML.

A CSS background image is parsed as a standalone XML document; the HTML parser
is not involved and will not forgive a missing tag. An SVG that renders fine
inlined can therefore draw NOTHING as a background, silently. That happened
once (the cog rosette), so it is checked.
"""
import glob, sys, xml.dom.minidom

bad = 0
for f in sorted(glob.glob('src/assets/skai/*.svg')):
    try:
        xml.dom.minidom.parse(f)
    except Exception as e:
        bad += 1
        print('  FAIL', f, str(e)[:80])
print('ok   every kit part parses as XML' if not bad else f'FAIL {bad} malformed')
sys.exit(1 if bad else 0)
