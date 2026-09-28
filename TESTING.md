# Testing — The Northline Run

## Suites

| suite | what it proves |
|---|---|
| `e2e/game.spec.ts` | shell, menus, every mission beat, the hand-built rule path, the priority lesson |
| `e2e/scene3d.spec.ts` | live WebGL, the fixed camera, crash → orbit → retry, all 8 patrols, priority reorder |
| `e2e/offline.spec.ts` | the SHIPPED 3D folder boots from `file://`, clicked in the way a classroom does it |
| `e2e/perf.spec.ts` | the busiest level holds a usable frame rate (last measured: 60 fps) |
| `e2e/polish.spec.ts` | fresh start on reload (no save), number keys inert behind the pause menu, pause-menu settings, policy undo/redo, printable teacher report |
| `e2e/flat.spec.ts` | the 2D edition on its own server: question → crash → retry → next stop, living hazards never driven into, wheels only roll forward, weather + ambulance-behind, the SHIPPED 2D folder boots from `file://` |

Full run: `npx playwright test` — 33 tests in two projects (`3d` on port 5210, `flat` on 5211 via `scripts/dev-flat.mjs`), ~7 minutes, one worker, headed. One project: `npx playwright test --project flat`.

## The fit audit

`scripts/probe-fit.mjs <port>` is the guard on the one promise the layout
makes: **nothing scrolls, nothing clips, nothing overlaps, at any size.** It
opens 10 screens at 13 viewport sizes — from 1920x1080 down to 360x640, plus
three portrait sizes — and reports:

| finding | what it means |
|---|---|
| `SCROLL` | a box whose content is bigger than itself and shows a bar |
| `CLIP` | the same, but with `overflow: hidden` — silent, so worse |
| `BLEED` | a painted rect outside the board, with no clipping ancestor |
| `OVERLAP` | two siblings in one list painting on top of each other |
| `DOCROLL` | the document itself can scroll |

Run it against both editions (`5311` and `5312` in the standard pipeline). The
expected output is `=== 0 findings ===`. The flat edition's parallax world is
deliberately many screens wide and is excluded by name.

`scripts/probe-type-floor.mjs` holds the other half: no element on the
board renders text under 24px, which is `--t-body` (1.5rem) in board pixels.

## Measurement harnesses

`scripts/probe-*.mjs` and `scripts/measure-*.mjs` prove the things a DOM suite
cannot see: no building in front of an answer card, all 24 wrong answers
crashing and landing, HUD fitting at five window sizes, the 2D car standing on
the road, gate clearance, route drivability. Each prints ok/FAIL lines and
exits non-zero on failure.

## Traps

- Headed only; park the window off-screen; `bringToFront()` — see
  DEVELOPMENT.md.
- Port map: 5210 (3D) and 5211 (flat) belong to Playwright's own webServers;
  the harnesses expect 5311 (3D) and 5312 (2D flat).
- `offline.spec` fails when the deliverable folder is stale — re-sync
  `The-Northline-Run-3D/` from `dist/` first.

## Last full result (2026-09-03, after the street pass)

33/33 e2e passed (5.9 m; 28 `3d`, 5 `flat`) · probes green · zips 3/4/32 MB.

## Previous (2026-08-31, after the one-journey flow)

27/27 e2e passed (5.0 m — a full minute faster than before the flow change,
which is the removed holds, measured) · routes 4/4 finish as "passed" with
0 marks behind the car under the no-stop-when-covered flow · keypad in the
bottom quarter at 5 window sizes · fault loop green (crash, orbit, retry,
policy write) · 2D car grounded at rest · flat edition plays the same game.
Earlier this weekend, unchanged since: card occlusion 5/5 scenes ·
24/24 wrong answers crash and land inside 5.5 s.
