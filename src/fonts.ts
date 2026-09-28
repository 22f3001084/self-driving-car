// The typefaces the SKAI design system names, installed at boot.
//
// The deck's own frame (Figma 24:2153) sets its display copy in FREDOKA ONE
// — "LET'S INVESTIGATE", "35:00" — and its technical numerals in CHAKRA PETCH
// ("1/8", the info glyph); the page it lives on is called
// `font-pairing-fredoka-poppins`, so POPPINS is the body face. All three are
// bundled, because the game ships offline from a folder.
//
// These are declared here rather than in CSS on purpose. A bundled @font-face
// goes through the CSS asset pipeline, which emits `src: url(<resolved href>)`
// WITHOUT quotes; the packaged build then runs from a folder path that may
// contain characters CSS reads as syntax — a bracket is enough, and the game
// ships in a folder called "Self Driving Car (2)". One unquoted bracket voids
// the whole declaration and the game silently renders in a fallback face.
//
// Importing the files as modules gives their real hashed URLs, which are then
// quoted explicitly, so the path can contain anything.

import chakra400 from './assets/fonts/chakra-petch-400.woff2'
import chakra500 from './assets/fonts/chakra-petch-500.woff2'
import chakra600 from './assets/fonts/chakra-petch-600.woff2'
import chakra700 from './assets/fonts/chakra-petch-700.woff2'
import interVar from './assets/fonts/inter-var.woff2'
import fredoka from './assets/fonts/fredoka-one-400.woff2'
import poppins400 from './assets/fonts/poppins-400.woff2'
import poppins600 from './assets/fonts/poppins-600.woff2'
import poppins700 from './assets/fonts/poppins-700.woff2'

interface Face {
  family: string
  /** A single weight, or a variable range. */
  weight: string
  url: string
}

const FACES: Face[] = [
  { family: 'Chakra Petch', weight: '400', url: chakra400 },
  { family: 'Chakra Petch', weight: '500', url: chakra500 },
  { family: 'Chakra Petch', weight: '600', url: chakra600 },
  { family: 'Chakra Petch', weight: '700', url: chakra700 },
  // Fredoka One has one weight and that is the design's display voice.
  { family: 'Fredoka One', weight: '400', url: fredoka },
  { family: 'Poppins', weight: '400', url: poppins400 },
  { family: 'Poppins', weight: '600', url: poppins600 },
  { family: 'Poppins', weight: '700', url: poppins700 },
  // Inter stays as the last-resort fallback behind Poppins.
  { family: 'Inter', weight: '100 900', url: interVar },
]

export function installFonts() {
  const css = FACES.map((face) => [
    '@font-face{',
    `font-family:'${face.family}';`,
    'font-style:normal;',
    `font-weight:${face.weight};`,
    'font-display:block;',
    `src:url("${face.url}") format("woff2");`,
    '}',
  ].join('')).join('')

  const style = document.createElement('style')
  style.dataset.skaiFonts = 'true'
  style.textContent = css
  document.head.appendChild(style)
}
