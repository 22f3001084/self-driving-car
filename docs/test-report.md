# Test report — 2026-08-30 polish pass

Machine: Windows 11, headed Chromium (headless falls to SwiftShader and is not
representative). One worker.

## Automated e2e (`npx playwright test`)

27 tests across five specs — shell/menus/missions, 3D scene + all 8 patrols +
the crash loop, the shipped `file://` package, frame rate, and the polish spec
(save/Continue, settings, undo/redo, teacher report). Result recorded in
TESTING.md ("Last full result").

## Measurement harnesses (all green this pass)

| harness | result |
|---|---|
| `probe-route.mjs` | 4/4 levels drivable, 0 stop marks behind the car |
| `probe-card-occlusion.mjs` | 5/5 scenes, 15 sample points per scene, nothing in front of a card |
| `probe-hud-fit.mjs` | 5 window sizes (1920×1080 → 1024×640) × 3 states: nothing off-frame, no sideways scroll, middle third clear |
| `probe-flat-ground.mjs` | 2D tyres on the road band (672 in 624..800), level with props, shadow under tyres |
| `probe-flat-edition.mjs` | flat edition: question, crash, retry, clear — green |
| `probe-outcomes.mjs` | 24/24 wrong answers driven to a crash (previous pass; mechanics untouched since) |
| `measure-gate-clearance.mjs` | 0 overlaps, 0.775 m worst lateral clearance |
| `e2e/perf.spec.ts` | 60 fps on the busiest level |

## What the pass changed that needed new coverage

- Local save + Continue → `polish.spec.ts` test 1 (real front-door flow, reload).
- Pause-menu settings persistence → test 2.
- Policy undo/redo → test 3.
- Teacher report + print → test 4.

## Known limitations

- No full i18n file split: all copy is centralised in `content.ts`/`choices.ts`
  (one file each), which is the extraction point for future Hindi/Gujarati.
- Portrait phones get the landscape layout scaled, not a bespoke stacked one.
- Undo history is capped at 20 steps and covers the policy only (by design).
- Narration depends on the browser's installed voices; text always shown.
