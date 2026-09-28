# Development guide — The Northline Run

## Stack

Vite + React 18 + TypeScript + Zustand + Three.js (r169) + framer-motion + Howler.
No server, no accounts, no network calls: the shipped game is a folder a teacher
double-clicks.

## Where things live

| area | files |
|---|---|
| game state | `src/store.ts` (Zustand), `src/persist.ts` (local save + device settings) |
| policy engine | `src/sim.ts` — `evaluateAt` is the single deterministic judge; the 3D scene never decides correctness |
| scenario data | `src/sim.ts` (routes/waypoints), `src/choices.ts` (answer cards, hints, verdicts, sensor deck), `src/content.ts` (levels, missions, UI copy) |
| screens | `src/components/*.tsx` — `ActStage` is the play screen's state machine |
| 3D | `src/three/stage.ts` (world, camera, choreographies), `holocards.ts` (in-street answer cards), `actors.ts`, `roadSystem.ts`, `driving.ts` (bicycle model), `kitLoader.ts` |
| 2D edition | `src/components/Scene2D.tsx`, selected at build time via the `@scene` alias in `vite.config.ts` |
| theme | `src/styles/house.css` (the one theme layer), `fault.css` (in-street question HUD). `asphalt.css` is retired — do not re-import |
| audio | `src/sound.ts` (Howler + synth cues + the 3-fader mixer), `src/narration.ts` |
| Blender kit | `blender/build_kit.py` (+ `be6.py`, `ambulance.py`) → `blender/out/kit.glb` → `npm run build:kit` inlines it into `src/three/kitData.ts` |

## Commands

```bash
npm run dev                                       # dev server
npm run build                                     # 3D edition -> dist/
VITE_SCENE_2D=1 npx vite build --outDir dist2d    # flat edition
npm run build:kit                                 # re-inline blender/out/kit.glb
npx playwright test                               # full e2e suite (headed by design)
```

Rebuilding the kit needs Blender 5.2:

```bash
blender.exe --background --factory-startup --enable-autoexec --python blender/build_kit.py -- --out blender/out/kit.glb
```

## The measurement harnesses (`scripts/*.mjs`)

Numbers, not opinions — see the README section "The measurement harnesses" for
the full table. Run them against `npx vite --port 5311` (3D) or `--port 5312`
with `VITE_SCENE_2D=1` (flat).

## Hard-won rules

- Playwright must run HEADED; headless falls back to SwiftShader (~2 fps).
  Probes park the window off-screen with `--window-position=-2600,40` plus the
  no-throttling flags.
- A backgrounded Chrome throttles rAF, which stalls sim time and looks exactly
  like a game hang. Call `page.bringToFront()` before driving anything.
- One browser per WebGL-heavy scenario in long sweeps; about twelve contexts
  in one process killed the browser.
- Persistence is INERT whenever a dev query string is present (`persist.ts`),
  so `?phase=…` tests stay deterministic. `?persist=1` opts back in.
- Framer-motion writes inline `transform`; centre floating panels with
  `inset-inline: 0; margin-inline: auto`, never `translateX(-50%)`.
- The kit inlines as ONE base64 line — splitting it into concatenated chunks
  took the dev server down on every rebuild.
