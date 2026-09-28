// The design's own vector parts, installed as CSS custom properties at boot.
//
// These SVGs are cut verbatim out of the SKAI deck's Figma export (file
// iJdgDiZbq1olpbazhfncqZ, frame 24:2153) by scripts/tmp/extract-kit.py — the
// white twelve-tooth cogs around the round keys, the brand plate, and the
// amber timer sign hanging from its wire. None of them is a shape CSS can
// fake, so the game wears the real ones.
//
// They are declared HERE rather than as `url(...)` in a stylesheet for the
// same reason the typefaces are (see src/fonts.ts): Vite's CSS pipeline emits
// resolved asset URLs UNQUOTED, and this game ships from a folder called
// "Self Driving Car (2)" — one bracket in the path voids the declaration and
// the part silently vanishes. Importing the files as modules gives their real
// hashed URLs, which are then quoted explicitly.

import badgeBack from './assets/skai/badge-back.svg'
import badgeInfo from './assets/skai/badge-info.svg'
import badgeHint from './assets/skai/badge-hint.svg'
import plateBrand from './assets/skai/plate-brand.svg'
import plateTimer from './assets/skai/plate-timer.svg'
import rosette from './assets/skai/rosette.svg'

const PARTS: Record<string, string> = {
  '--badge-back': badgeBack,
  '--badge-info': badgeInfo,
  '--badge-hint': badgeHint,
  '--plate-brand': plateBrand,
  '--plate-timer': plateTimer,
  // The same cog with nothing in it, for keys that carry their own numeral.
  '--rosette': rosette,
}

export function installKit() {
  const root = document.documentElement
  for (const [name, url] of Object.entries(PARTS)) {
    root.style.setProperty(name, `url("${url}")`)
  }
}
