# Asset attribution

All visual assets are first-party, made for this project:

- **3D kit** (`blender/out/kit.glb`): authored procedurally by
  `blender/build_kit.py` + `be6.py` + `ambulance.py` (Blender 5.2). No
  downloaded models.
- **Title / report / backdrop art and icons**: project-generated images in
  `src/assets/img/`.
- **Answer cards, sensor diagrams, glows**: drawn at runtime on canvas.

**Audio**: project-supplied mp3 clips in `src/assets/audio/` plus synthesised
cues (WebAudio, `src/sound.ts`). Narration uses the browser's own
`speechSynthesis` (prefers `en-IN`); every narrated line is also on screen, so
nothing depends on an installed voice.

**Fonts** (bundled for offline use): Inter and Chakra Petch — SIL Open Font
License 1.1.

**Libraries** (MIT): three.js, React, Zustand, framer-motion, Howler, @dnd-kit.
